/** [LAYER: INFRASTRUCTURE] */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MAX_PAGE_SIZE, MinHeap, SCHEMA_VERSION, STATES, TERMINAL_STATES, acquireQueueNamespace, assertQueueName, buildCancelledJobRecord, buildClaimedJobRecord, buildCompletedJobRecord, buildExpiredLeaseRecord, buildFailedJobRecord, buildNewJobRecord, buildRecentIds, buildReleasedJobRecord, buildRetryJobRecord, compactLeaseHeapForQueue, compactPendingHeapsForQueue, compactTerminalHeapForQueue, delayedHeap, emitQueueError, emptyCounts, ensureQueueInTable, idForIdempotencyKey, jsonCloneWithSize, leaseHeap, normalizeBulkAddItems, normalizeJobOptions, pruneTerminalJobsFromHeap, publicJob, queryJobsFromTable, readyHeap, releaseQueueNamespace, safeInteger, serializeError, validateQueueConstructorOptions } from './queue-helpers.mjs';
import { QueueWorker } from './queue-worker.mjs';
export class BroccoliQueue extends EventEmitter {
    namespace; db; defaultJobOptions;
    #jobs; #queues; #metadata;
    #workers = new Set(); #controllers = new Map(); #counts = new Map();
    #ready = new Map(); #delayed = new Map(); #leases = new Map();
    #terminal = new MinHeap((a, b) => a.finishedAt - b.finishedAt);
    #recentIds = []; #sequence = 0; #terminalCount = 0; #started = false;
    #maintenanceTimer; #flushTimer; #flushRunning = false; #flushWaiters = [];
    #flushBatchDelayMs; #retentionMs; #maxTerminalJobs; #startedAt = 0;
    #startPromise; #closePromise; #closing = false;
    #namespaceRegistryKey; #usesDatabaseRegistry = false;
    #lastPersistenceFailureAt; #maintenancePromise;
    #maxJobDataBytes; #maxJobResultBytes; #maxBulkItems; #maxBulkBytes;
    #maintenanceIntervalMs; #maintenanceBatchSize; #maintenanceMaxBatches;
    #dashboards = new Set(); #dashboardStarts = new Set();
    constructor(options) {
        super();
        const cfg = validateQueueConstructorOptions(options);
        this.db = options.db;
        this.namespace = cfg.namespace;
        this.defaultJobOptions = cfg.defaultJobOptions;
        this.#retentionMs = cfg.retentionMs;
        this.#maxTerminalJobs = cfg.maxTerminalJobs;
        this.#flushBatchDelayMs = cfg.flushBatchDelayMs;
        this.#maxJobDataBytes = cfg.maxJobDataBytes;
        this.#maxJobResultBytes = cfg.maxJobResultBytes;
        this.#maxBulkItems = cfg.maxBulkItems;
        this.#maxBulkBytes = cfg.maxBulkBytes;
        this.#maintenanceIntervalMs = cfg.maintenanceIntervalMs;
        this.#maintenanceBatchSize = cfg.maintenanceBatchSize;
        this.#maintenanceMaxBatches = cfg.maintenanceMaxBatches;
        this.#normalizeOptions('__defaults__', this.defaultJobOptions);
    }
    get isStarted() {
        return this.#started;
    }
    getHealth() {
        const status = this.#closing
            ? 'closing'
            : this.#lastPersistenceFailureAt !== undefined
                ? 'degraded'
                : !this.#started ? this.#startPromise ? 'starting' : 'stopped' : 'healthy';
        return {
            status,
            ...(this.#lastPersistenceFailureAt !== undefined ? { lastPersistenceFailureAt: this.#lastPersistenceFailureAt } : {})
        };
    }
    async start() {
        if (this.#closePromise)
            await this.#closePromise;
        if (this.#started)
            return this;
        if (this.#startPromise)
            return await this.#startPromise;
        const operation = this.#startInternal();
        this.#startPromise = operation;
        try {
            return await operation;
        }
        finally {
            if (this.#startPromise === operation)
                this.#startPromise = undefined;
        }
    }
    async #startInternal() {
        try {
            await this.db.start();
            await this.#acquireNamespace();
            this.#jobs = this.db.getTable(`${this.namespace}_jobs`);
            this.#queues = this.db.getTable(`${this.namespace}_queues`);
            this.#metadata = this.db.getTable(`${this.namespace}_meta`);
            this.#jobs.createIndex('state');
            this.#jobs.createCompositeIndex(['queueName', 'state']);
            const metadata = this.#metadata.get('schema');
            if (metadata && metadata.version !== SCHEMA_VERSION) {
                throw new Error(`BroccoliQueue table format ${metadata.version} is not supported by this version (expected ${SCHEMA_VERSION})`);
            }
            if (!metadata)
                this.#metadata.put('schema', { version: SCHEMA_VERSION, createdAt: Date.now() });
            this.#rebuildCounts();
            await this.#flushWrites();
            this.#started = true;
            this.#startedAt = Date.now();
            this.#maintenanceTimer = setInterval(() => { void this.#runMaintenance(); }, this.#maintenanceIntervalMs);
            this.#maintenanceTimer.unref?.();
            const startupMaintenance = setImmediate(() => { void this.#runMaintenance(); });
            startupMaintenance.unref?.();
            return this;
        }
        catch (error) {
            this.#releaseNamespace();
            throw error;
        }
    }
    /** Add one job. A successful return means the job's WAL frames were flushed. */
    async add(name, data, options = {}) {
        const [job] = await this.addBulk([{ name, data, options }]);
        return job;
    }
    /** Add a producer batch and flush its WAL frames once. */
    async addBulk(items) {
        this.#assertStarted();
        const normalized = normalizeBulkAddItems(items, this.#maxBulkItems, this.#maxJobDataBytes, this.#maxBulkBytes, (n, o) => this.#normalizeOptions(n, o));
        if (normalized.length === 0)
            return [];
        const result = [];
        const created = [];
        const touched = new Set();
        const now = Date.now();
        for (const item of normalized) {
            this.#ensureQueue(item.name);
            const id = item.options.idempotencyKey === undefined
                ? randomUUID()
                : this.#idForKey(item.name, item.options.idempotencyKey);
            const duplicate = this.#jobs.get(id);
            if (duplicate) {
                result.push(publicJob(duplicate));
                continue;
            }
            const job = buildNewJobRecord(id, item, now, ++this.#sequence);
            this.#writeJob(job);
            touched.add(item.name);
            const visible = publicJob(job);
            result.push(visible);
            created.push(visible);
        }
        await this.#flushWrites();
        for (const name of touched)
            this.#wakeWorkers(name);
        for (const job of created)
            this.#emitSafely('job', job);
        return result;
    }
    /** Create a queue or return its existing configuration. */
    async createQueue(name, options = {}) {
        this.#assertStarted();
        assert(options && typeof options === 'object' && !Array.isArray(options), 'queue options must be an object');
        assertQueueName(name);
        const record = this.#ensureQueue(name, options);
        // Even an idempotent create waits behind a concurrent create's WAL flush.
        await this.#flushWrites();
        return this.#summary(record);
    }
    /** Register a worker; call handle.start() to begin claiming jobs. */
    process(name, processor, options = {}) {
        this.#assertStarted();
        assertQueueName(name);
        assert(typeof processor === 'function', 'process() requires a job handler');
        assert(options && typeof options === 'object' && !Array.isArray(options), 'worker options must be an object');
        const worker = new QueueWorker(this, name, processor, options);
        this.registerWorker(worker);
        return worker;
    }
    getJob(id) {
        this.#assertStarted();
        const job = this.#jobs.get(id);
        return job ? publicJob(job) : null;
    }
    getJobs(query = {}) {
        this.#assertStarted();
        return queryJobsFromTable(this.#jobs, this.#recentIds, query);
    }
    getQueues() {
        this.#assertStarted();
        return this.#queues.getAll().map(queue => this.#summary(queue)).sort((a, b) => a.name.localeCompare(b.name));
    }
    getWorkers() {
        return [...this.#workers].map(worker => ({
            id: worker.id,
            queueName: worker.queueName,
            activeCount: worker.activeCount,
            concurrency: worker.concurrency,
            isRunning: worker.isRunning
        }));
    }
    getOverview() {
        this.#assertStarted();
        const queues = this.getQueues();
        const totals = emptyCounts();
        for (const queue of queues) {
            for (const state of STATES)
                totals[state] += queue.counts[state];
        }
        return {
            startedAt: this.#startedAt,
            health: this.getHealth(),
            queues,
            workers: this.getWorkers(),
            totals
        };
    }
    getQueue(name) {
        this.#assertStarted();
        assertQueueName(name);
        const queue = this.#queues.get(name);
        return queue ? this.#summary(queue) : null;
    }
    async pause(name) {
        return await this.#setPaused(name, true);
    }
    async resume(name) {
        const changed = await this.#setPaused(name, false);
        if (changed)
            this.#wakeWorkers(name);
        return changed;
    }
    async retry(id, options = {}) {
        this.#assertStarted();
        const delayMs = options.delayMs ?? 0;
        safeInteger(delayMs, 'delayMs', 0, Number.MAX_SAFE_INTEGER - Date.now());
        const current = this.#jobs.get(id);
        if (!current || current.state !== 'failed')
            return { retried: false, job: current ? publicJob(current) : null };
        const now = Date.now();
        const next = buildRetryJobRecord(current, now, delayMs);
        this.#writeJob(next, current);
        await this.#flushWrites();
        this.#wakeWorkers(current.queueName);
        this.#emitSafely('retrying', publicJob(next));
        return { retried: true, job: publicJob(next) };
    }
    async cancel(id) {
        return await this.#cancel(id, ['waiting', 'delayed', 'active']);
    }
    /** Cancel only work that has not been claimed by a worker. */
    async cancelWaiting(id) {
        return await this.#cancel(id, ['waiting', 'delayed']);
    }
    async #cancel(id, eligibleStates) {
        this.#assertStarted();
        const current = this.#jobs.get(id);
        if (!current || !eligibleStates.includes(current.state))
            return false;
        const next = buildCancelledJobRecord(current, Date.now());
        this.#writeJob(next, current);
        for (const controller of this.#controllers.get(id) ?? [])
            controller.abort(new Error('Job was cancelled'));
        await this.#flushWrites();
        this.#emitSafely('cancelled', publicJob(next));
        return true;
    }
    async delete(id) {
        this.#assertStarted();
        const job = this.#jobs.get(id);
        if (!job || job.state === 'active')
            return false;
        const visible = publicJob(job);
        const deleted = this.#jobs.delete(id);
        if (deleted) {
            this.#adjustCount(job.queueName, job.state, -1);
            if (TERMINAL_STATES.includes(job.state))
                this.#terminalCount--;
            this.#recentIds = this.#recentIds.filter(recentId => recentId !== job.id);
            if (job.state === 'waiting' || job.state === 'delayed')
                this.#compactQueueIndex(job.queueName);
            if (TERMINAL_STATES.includes(job.state))
                this.#compactTerminalIndex();
            await this.#flushWrites();
            this.#emitSafely('removed', visible);
        }
        return deleted;
    }
    /** Remove expired or over-cap terminal records in bounded batches. */
    async prune(options = {}) {
        this.#assertStarted();
        const removed = pruneTerminalJobsFromHeap(
            this.#jobs,
            this.#terminal,
            (q, s, a) => this.#adjustCount(q, s, a),
            () => this.#terminalCount,
            () => { this.#terminalCount--; },
            this.#maxTerminalJobs,
            this.#retentionMs,
            options
        );
        if (removed) {
            await this.#flushWrites();
            this.#emitSafely('pruned', removed);
        }
        return removed;
    }
    /** Start an authenticated, same-process monitoring and job-management dashboard. */
    async startDashboard(options = {}) {
        this.#assertStarted();
        const { createDashboardServer } = await import('./dashboard.mjs');
        this.#assertStarted();
        const startup = createDashboardServer(this, options);
        this.#dashboardStarts.add(startup);
        try {
            const handle = await startup;
            if (this.#closing || !this.#started) {
                await handle.close();
                throw new Error('BroccoliQueue is closing');
            }
            this.#dashboards.add(handle);
            handle.server.once('close', () => this.#dashboards.delete(handle));
            return handle;
        }
        finally {
            this.#dashboardStarts.delete(startup);
        }
    }
    async close(options = {}) {
        const drainTimeoutMs = options.drainTimeoutMs ?? 30_000;
        safeInteger(drainTimeoutMs, 'drainTimeoutMs', 0);
        if (this.#closePromise)
            return await this.#closePromise;
        const operation = this.#closeInternal({ drainTimeoutMs });
        this.#closePromise = operation;
        try {
            await operation;
        }
        finally {
            if (this.#closePromise === operation)
                this.#closePromise = undefined;
        }
    }
    async #closeInternal(options) {
        if (this.#startPromise)
            await this.#startPromise;
        if (!this.#started)
            return;
        this.#closing = true;
        if (this.#maintenanceTimer)
            clearInterval(this.#maintenanceTimer);
        this.#maintenanceTimer = undefined;
        try {
            await this.#maintenancePromise?.catch(error => this.#reportError(error));
            await Promise.allSettled([...this.#dashboardStarts]);
            const dashboardResults = await Promise.allSettled([...this.#dashboards].map(dashboard => dashboard.close()));
            for (const result of dashboardResults)
                if (result.status === 'rejected')
                    this.#reportError(result.reason);
            const workerResults = await Promise.allSettled([...this.#workers].map(worker => worker.stop(options)));
            for (const result of workerResults)
                if (result.status === 'rejected')
                    this.#reportError(result.reason);
            this.#workers.clear();
            await this.#flushWrites();
            this.#started = false;
            this.#releaseNamespace();
        }
        finally {
            this.#closing = false;
            if (this.#started && !this.#maintenanceTimer)
                this.#scheduleMaintenance();
        }
    }
    /** Internal worker boundary: persist a claim batch before starting handlers. */
    async flushWrites() {
        await this.#flushWrites();
    }
    // Worker coordination methods are public for the worker implementation and intentionally not
    // part of the documented application API.
    getWorkerOptions(name) {
        const queue = this.#queues.get(name);
        return { ...this.defaultJobOptions, ...(queue?.defaultJobOptions ?? {}) };
    }
    async ensureQueue(name) {
        this.#assertStarted();
        if (!this.#queues.get(name))
            this.#ensureQueue(name);
        // A previous creator may have installed the record in memory but still be
        // waiting for its WAL flush. Worker startup must wait behind that barrier.
        await this.#flushWrites();
    }
    isPaused(name) {
        return this.#queues.get(name)?.paused ?? false;
    }
    claimReady(name, workerId, limit, leaseDurationMs) {
        this.#assertStarted();
        safeInteger(limit, 'claim limit', 0, MAX_PAGE_SIZE);
        safeInteger(leaseDurationMs, 'leaseDurationMs', 1, 24 * 60 * 60 * 1_000);
        if (limit <= 0)
            return [];
        const now = Date.now();
        this.#promoteDue(name, now);
        if (this.isPaused(name))
            return [];
        const ready = this.#readyHeap(name);
        const claimed = [];
        while (claimed.length < limit && ready.size) {
            const entry = ready.pop();
            const current = this.#jobs.get(entry.id);
            // This synchronous read/modify/write contains no await. Within BroccoliDB's single Node.js
            // isolate, concurrent worker pumps cannot interleave between observing and claiming a row.
            const latest = current;
            if (!latest || latest.sequence !== entry.sequence || !['waiting', 'delayed'].includes(latest.state) || latest.availableAt > now)
                continue;
            const token = randomUUID();
            const next = buildClaimedJobRecord(latest, now, workerId, leaseDurationMs, token);
            this.#writeJob(next, latest);
            claimed.push({ job: next, token });
        }
        return claimed;
    }
    async promoteDue(name) {
        this.#assertStarted();
        assertQueueName(name);
        const promoted = this.#promoteDue(name, Date.now());
        if (promoted)
            await this.#flushWrites();
        return promoted;
    }
    async recoverExpired(name, limit) {
        this.#assertStarted();
        assertQueueName(name);
        safeInteger(limit, 'limit', 0, MAX_PAGE_SIZE);
        if (limit === 0)
            return 0;
        const now = Date.now();
        const leases = this.#leaseHeap(name);
        let recovered = 0;
        const recoveredJobs = [];
        let inspected = 0;
        const maxInspected = Math.max(64, limit * 8);
        while (recovered < limit && inspected < maxInspected && (leases.peek()?.expiresAt ?? Infinity) <= now) {
            inspected++;
            const entry = leases.pop();
            const latest = this.#jobs.get(entry.id);
            if (!latest || latest.state !== 'active' || latest.lockToken !== entry.token || latest.leaseExpiresAt !== entry.expiresAt)
                continue;
            const next = buildExpiredLeaseRecord(latest, now);
            this.#writeJob(next, latest);
            recoveredJobs.push(next);
            for (const controller of this.#controllers.get(latest.id) ?? []) {
                controller.abort(new Error('Job lease expired before acknowledgment'));
            }
            recovered++;
        }
        if (recovered) {
            await this.#flushWrites();
            this.#emitSafely('recovered', recovered);
            for (const job of recoveredJobs)
                this.#emitSafely(job.state === 'failed' ? 'failed' : 'retrying', publicJob(job));
        }
        return recovered;
    }
    async renewLease(id, token, leaseDurationMs) {
        safeInteger(leaseDurationMs, 'leaseDurationMs', 1, 24 * 60 * 60 * 1_000);
        const current = this.#jobs.get(id);
        const now = Date.now();
        if (!current || current.state !== 'active' || current.lockToken !== token || (current.leaseExpiresAt ?? 0) <= now)
            return false;
        this.#writeJob({ ...current, updatedAt: now, leaseExpiresAt: now + leaseDurationMs }, current);
        await this.#flushWrites();
        return true;
    }
    async completeClaim(id, token, result) {
        const current = this.#jobs.get(id);
        const now = Date.now();
        if (!current || current.state !== 'active' || current.lockToken !== token || (current.leaseExpiresAt ?? 0) <= now)
            return false;
        let returnValue;
        try {
            returnValue = result === undefined
                ? undefined
                : jsonCloneWithSize(result, 'job result', this.#maxJobResultBytes).value;
        }
        catch (error) {
            return await this.failClaim(id, token, error);
        }
        const next = buildCompletedJobRecord(current, now, returnValue);
        this.#writeJob(next, current);
        await this.#flushWrites();
        this.#emitSafely('completed', publicJob(next));
        return true;
    }
    async failClaim(id, token, error) {
        const jobError = serializeError(error);
        const current = this.#jobs.get(id);
        const now = Date.now();
        if (!current || current.state !== 'active' || current.lockToken !== token || (current.leaseExpiresAt ?? 0) <= now)
            return false;
        const { exhausted, record: next } = buildFailedJobRecord(current, now, jobError);
        this.#writeJob(next, current);
        await this.#flushWrites();
        this.#emitSafely(exhausted ? 'failed' : 'retrying', publicJob(next));
        return true;
    }
    async releaseClaim(id, token) {
        await this.releaseClaims([{ id, token }]);
    }
    async releaseClaims(claims, options = {}) {
        let released = false;
        for (const { id, token } of claims) {
            const current = this.#jobs.get(id);
            if (!current || current.state !== 'active' || current.lockToken !== token)
                continue;
            this.#writeJob(buildReleasedJobRecord(current, Date.now(), options.restoreAttempts), current);
            released = true;
        }
        if (released)
            await this.#flushWrites();
    }
    registerController(id, controller) {
        const controllers = this.#controllers.get(id) ?? new Set();
        controllers.add(controller);
        this.#controllers.set(id, controllers);
    }
    unregisterController(id, controller) {
        const controllers = this.#controllers.get(id);
        controllers?.delete(controller);
        if (controllers?.size === 0)
            this.#controllers.delete(id);
    }
    registerWorker(worker) {
        // Worker.start() may be waiting for ensureQueue()'s WAL barrier while the
        // queue begins closing. Recheck at registration so that a late continuation
        // cannot restart work after close() has drained the worker set.
        this.#assertStarted();
        this.#workers.add(worker);
    }
    unregisterWorker(worker) {
        this.#workers.delete(worker);
    }
    reportWorkerError(error) {
        this.#reportError(error);
    }
    async #setPaused(name, paused) {
        this.#assertStarted();
        assertQueueName(name);
        const record = this.#ensureQueue(name);
        if (record.paused === paused) {
            await this.#flushWrites();
            return false;
        }
        const next = { ...record, paused, updatedAt: Date.now() };
        this.#queues.put(name, next);
        await this.#flushWrites();
        return true;
    }
    #ensureQueue(name, options = {}) {
        return ensureQueueInTable(this.#queues, this.#counts, name, options, (n, o) => this.#normalizeOptions(n, o));
    }
    #normalizeOptions(name, options) {
        return normalizeJobOptions(this.defaultJobOptions, this.#queues?.get(name)?.defaultJobOptions, options);
    }
    #idForKey(queueName, key) {
        return idForIdempotencyKey(this.namespace, queueName, key);
    }
    #writeJob(next, previous) {
        this.#jobs.put(next.id, next);
        if (!previous) {
            this.#adjustCount(next.queueName, next.state, 1);
            if (TERMINAL_STATES.includes(next.state))
                this.#terminalCount++;
            this.#recentIds.push(next.id);
            if (this.#recentIds.length > 12_000)
                this.#recentIds.splice(0, 2_000);
        }
        else if (previous.state !== next.state) {
            this.#adjustCount(previous.queueName, previous.state, -1);
            this.#adjustCount(next.queueName, next.state, 1);
            if (TERMINAL_STATES.includes(previous.state))
                this.#terminalCount--;
            if (TERMINAL_STATES.includes(next.state))
                this.#terminalCount++;
        }
        if (next.state === 'waiting' || next.state === 'delayed')
            this.#pushPending(next);
        if (next.state === 'active' && next.lockToken && next.leaseExpiresAt !== undefined &&
            (!previous || previous.state !== 'active' || previous.lockToken !== next.lockToken || previous.leaseExpiresAt !== next.leaseExpiresAt)) {
            this.#leaseHeap(next.queueName).push({ id: next.id, token: next.lockToken, expiresAt: next.leaseExpiresAt });
        }
        if (TERMINAL_STATES.includes(next.state) && next.finishedAt !== undefined && previous?.state !== next.state)
            this.#pushTerminal(next);
        if (previous && ['waiting', 'delayed'].includes(previous.state) && !['waiting', 'delayed'].includes(next.state))
            this.#compactQueueIndex(previous.queueName);
        if (previous && TERMINAL_STATES.includes(previous.state) && !TERMINAL_STATES.includes(next.state))
            this.#compactTerminalIndex();
        if (previous?.state === 'active' && (next.state !== 'active' || previous.lockToken !== next.lockToken || previous.leaseExpiresAt !== next.leaseExpiresAt)) {
            this.#compactLeaseIndex(previous.queueName);
        }
    }
    #adjustCount(queueName, state, amount) {
        const counts = this.#counts.get(queueName) ?? emptyCounts();
        counts[state] = Math.max(0, counts[state] + amount);
        this.#counts.set(queueName, counts);
    }
    #rebuildCounts() {
        this.#counts.clear();
        for (const queue of this.#queues.getAll())
            this.#counts.set(queue.name, emptyCounts());
        const jobs = this.#jobs.getAll();
        this.#recentIds = [];
        this.#sequence = 0;
        this.#terminalCount = 0;
        this.#ready.clear();
        this.#delayed.clear();
        this.#leases.clear();
        this.#terminal = new MinHeap((a, b) => a.finishedAt - b.finishedAt);
        for (const job of jobs) {
            this.#adjustCount(job.queueName, job.state, 1);
            if (TERMINAL_STATES.includes(job.state))
                this.#terminalCount++;
            this.#sequence = Math.max(this.#sequence, job.sequence ?? 0);
            if (job.state === 'waiting' || job.state === 'delayed')
                this.#pushPending(job);
            if (job.state === 'active' && job.lockToken && job.leaseExpiresAt !== undefined) {
                this.#leaseHeap(job.queueName).push({ id: job.id, token: job.lockToken, expiresAt: job.leaseExpiresAt });
            }
            if (TERMINAL_STATES.includes(job.state))
                this.#pushTerminal(job);
        }
        this.#recentIds = buildRecentIds(jobs);
    }
    #summary(record) {
        return {
            name: record.name,
            paused: record.paused,
            createdAt: record.createdAt,
            counts: { ...(this.#counts.get(record.name) ?? emptyCounts()) }
        };
    }
    #wakeWorkers(name) {
        for (const worker of this.#workers) {
            if (worker.queueName === name)
                worker.wake();
        }
    }
    #readyHeap(name) {
        let heap = this.#ready.get(name);
        if (!heap) {
            heap = readyHeap();
            this.#ready.set(name, heap);
        }
        return heap;
    }
    #delayedHeap(name) {
        let heap = this.#delayed.get(name);
        if (!heap) {
            heap = delayedHeap();
            this.#delayed.set(name, heap);
        }
        return heap;
    }
    #leaseHeap(name) {
        let heap = this.#leases.get(name);
        if (!heap) {
            heap = leaseHeap();
            this.#leases.set(name, heap);
        }
        return heap;
    }
    #pushPending(job) {
        const entry = { id: job.id, priority: job.priority, sequence: job.sequence };
        if (job.state === 'waiting')
            this.#readyHeap(job.queueName).push(entry);
        else if (job.state === 'delayed')
            this.#delayedHeap(job.queueName).push({ ...entry, availableAt: job.availableAt });
    }
    #promoteDue(name, now) {
        const delayed = this.#delayedHeap(name);
        let promoted = 0;
        while ((delayed.peek()?.availableAt ?? Infinity) <= now) {
            const entry = delayed.pop();
            const job = this.#jobs.get(entry.id);
            if (!job || job.state !== 'delayed' || job.sequence !== entry.sequence || job.availableAt !== entry.availableAt)
                continue;
            this.#writeJob({ ...job, state: 'waiting', updatedAt: now }, job);
            promoted++;
        }
        return promoted;
    }
    #pushTerminal(job) {
        if (job.finishedAt !== undefined)
            this.#terminal.push({ id: job.id, finishedAt: job.finishedAt });
    }
    #compactLeaseIndex(name) {
        compactLeaseHeapForQueue(this.#jobs, this.#counts, this.#leases, name);
    }
    #compactTerminalIndex() {
        this.#terminal = compactTerminalHeapForQueue(this.#jobs, this.#terminal, this.#terminalCount);
    }
    #compactQueueIndex(name) {
        compactPendingHeapsForQueue(this.#jobs, this.#counts, this.#ready, this.#delayed, name);
    }
    #emitSafely(event, value) {
        if (this.listenerCount(event) === 0)
            return;
        try {
            this.emit(event, value);
        }
        catch (error) {
            this.#reportError(error);
        }
    }
    #reportError(value) {
        emitQueueError(this, value);
    }
    async #acquireNamespace() {
        const reg = await acquireQueueNamespace(this, this.db, this.namespace);
        this.#namespaceRegistryKey = reg.namespaceRegistryKey;
        this.#usesDatabaseRegistry = reg.usesDatabaseRegistry;
    }
    #releaseNamespace() {
        const state = { namespaceRegistryKey: this.#namespaceRegistryKey, usesDatabaseRegistry: this.#usesDatabaseRegistry };
        releaseQueueNamespace(this, this.db, this.namespace, state);
        this.#namespaceRegistryKey = state.namespaceRegistryKey;
        this.#usesDatabaseRegistry = state.usesDatabaseRegistry;
    }
    #scheduleMaintenance() {
        if (!this.#started || this.#closing || this.#maintenanceTimer)
            return;
        this.#maintenanceTimer = setInterval(() => { void this.#runMaintenance(); }, this.#maintenanceIntervalMs);
        this.#maintenanceTimer.unref?.();
    }
    async #runMaintenance() {
        if (!this.#started || this.#closing)
            return;
        if (this.#maintenancePromise)
            return await this.#maintenancePromise;
        const operation = (async () => {
            for (let batch = 0; batch < this.#maintenanceMaxBatches && !this.#closing; batch++) {
                const removed = await this.prune({ batchSize: this.#maintenanceBatchSize });
                if (removed < this.#maintenanceBatchSize)
                    break;
            }
        })().catch(error => this.#reportError(error));
        this.#maintenancePromise = operation;
        try {
            await operation;
        }
        finally {
            if (this.#maintenancePromise === operation)
                this.#maintenancePromise = undefined;
        }
    }
    #flushWrites() {
        const promise = new Promise((resolve, reject) => {
            this.#flushWaiters.push({ resolve, reject });
        });
        if (!this.#flushRunning && !this.#flushTimer) {
            this.#flushTimer = setTimeout(() => {
                this.#flushTimer = undefined;
                void this.#drainFlushWaiters();
            }, this.#flushBatchDelayMs);
        }
        return promise;
    }
    async #drainFlushWaiters() {
        if (this.#flushRunning || this.#flushWaiters.length === 0)
            return;
        this.#flushRunning = true;
        const waiters = this.#flushWaiters;
        this.#flushWaiters = [];
        try {
            await this.db.flush();
            this.#lastPersistenceFailureAt = undefined;
            for (const waiter of waiters)
                waiter.resolve();
        }
        catch (error) {
            this.#lastPersistenceFailureAt = Date.now();
            for (const waiter of waiters)
                waiter.reject(error);
        }
        finally {
            this.#flushRunning = false;
            if (this.#flushWaiters.length > 0 && !this.#flushTimer) {
                this.#flushTimer = setTimeout(() => {
                    this.#flushTimer = undefined;
                    void this.#drainFlushWaiters();
                }, this.#flushBatchDelayMs);
            }
        }
    }
    #assertStarted() {
        assert(this.#started && !this.#closing, this.#closing
            ? 'BroccoliQueue is closing and no longer accepts operations'
            : 'BroccoliQueue is not started; call await queue.start() first');
    }
}
