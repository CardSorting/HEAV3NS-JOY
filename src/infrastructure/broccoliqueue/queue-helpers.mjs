/** [LAYER: INFRASTRUCTURE] */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { resolve as resolvePath } from 'node:path';
/**
 * Stateless BroccoliQueue primitives: state constants, bounded JSON cloning, backoff,
 * error serialization, and the MinHeap used for ready/delayed/lease ordering.
 */
export const STATES = ['waiting', 'delayed', 'active', 'completed', 'failed', 'cancelled'];
export const TERMINAL_STATES = ['completed', 'failed', 'cancelled'];
export const SCHEMA_VERSION = 1;
export const DEFAULT_BACKOFF = { type: 'exponential', delayMs: 1_000, maxDelayMs: 60_000 };
export const MAX_PAGE_SIZE = 500;
export const MAX_PRUNE_BATCH_SIZE = 5_000;
export const MAX_ERROR_MESSAGE_LENGTH = 8_192;
export const MAX_ERROR_STACK_LENGTH = 32_768;
export class MinHeap {
    #values = [];
    #compare;
    constructor(compare) {
        this.#compare = compare;
    }
    get size() { return this.#values.length; }
    peek() { return this.#values[0]; }
    push(value) {
        this.#values.push(value);
        let index = this.#values.length - 1;
        while (index > 0) {
            const parent = Math.floor((index - 1) / 2);
            if (this.#compare(this.#values[index], this.#values[parent]) >= 0)
                break;
            [this.#values[index], this.#values[parent]] = [this.#values[parent], this.#values[index]];
            index = parent;
        }
    }
    pop() {
        if (!this.#values.length)
            return undefined;
        const first = this.#values[0];
        const last = this.#values.pop();
        if (this.#values.length) {
            this.#values[0] = last;
            let index = 0;
            while (true) {
                const left = index * 2 + 1;
                const right = left + 1;
                let smallest = index;
                if (left < this.#values.length && this.#compare(this.#values[left], this.#values[smallest]) < 0)
                    smallest = left;
                if (right < this.#values.length && this.#compare(this.#values[right], this.#values[smallest]) < 0)
                    smallest = right;
                if (smallest === index)
                    break;
                [this.#values[index], this.#values[smallest]] = [this.#values[smallest], this.#values[index]];
                index = smallest;
            }
        }
        return first;
    }
}
export function readyHeap() {
    return new MinHeap((a, b) => b.priority - a.priority || a.sequence - b.sequence);
}
export function delayedHeap() {
    return new MinHeap((a, b) => a.availableAt - b.availableAt || b.priority - a.priority || a.sequence - b.sequence);
}
export function leaseHeap() {
    return new MinHeap((a, b) => a.expiresAt - b.expiresAt || a.id.localeCompare(b.id));
}
export function validQueueName(name) {
    return typeof name === 'string' && name.length > 0 && name.length <= 128 && /^[\w./:-]+$/.test(name);
}
export function assertQueueName(name) {
    assert(validQueueName(name), 'queue name must be 1-128 characters and contain only letters, numbers, _, ., /, :, or -');
}
export function jsonCloneWithSize(value, label, maxBytes = Number.MAX_SAFE_INTEGER) {
    let serialized;
    try {
        serialized = JSON.stringify(value);
    }
    catch (error) {
        throw new TypeError(`${label} must be JSON serializable`, { cause: error });
    }
    assert(serialized !== undefined, `${label} must be JSON serializable`);
    const bytes = Buffer.byteLength(serialized, 'utf8');
    assert(bytes <= maxBytes, `${label} exceeds the configured ${maxBytes}-byte limit`);
    return { value: JSON.parse(serialized), bytes };
}
export function jsonClone(value, label) {
    return jsonCloneWithSize(value, label).value;
}
export function safeInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
    assert(Number.isSafeInteger(value) && value >= minimum && value <= maximum, `${label} must be an integer between ${minimum} and ${maximum}`);
}
export function compareJobs(a, b) {
    return b.priority - a.priority || a.sequence - b.sequence;
}
export function emptyCounts() {
    return { waiting: 0, delayed: 0, active: 0, completed: 0, failed: 0, cancelled: 0 };
}
export function backoffDelay(backoff, attemptsMade) {
    const multiplier = backoff.type === 'exponential' ? 2 ** Math.max(0, attemptsMade - 1) : 1;
    return Math.min(backoff.maxDelayMs ?? 60_000, backoff.delayMs * multiplier);
}
export function serializeError(error) {
    if (error instanceof Error) {
        try {
            const code = 'code' in error && (typeof error.code === 'string' || typeof error.code === 'number')
                ? error.code
                : undefined;
            return {
                name: (typeof error.name === 'string' && error.name ? error.name : 'Error').slice(0, 256),
                message: (typeof error.message === 'string' && error.message ? error.message : 'Job handler failed').slice(0, MAX_ERROR_MESSAGE_LENGTH),
                ...(typeof error.stack === 'string' && error.stack ? { stack: error.stack.slice(0, MAX_ERROR_STACK_LENGTH) } : {}),
                ...(code !== undefined ? { code: typeof code === 'string' ? code.slice(0, 256) : code } : {})
            };
        }
        catch {
            return { name: 'Error', message: 'Job handler failed with an unreadable error object' };
        }
    }
    let message;
    try {
        message = String(error);
    }
    catch {
        message = 'Job handler threw a value that could not be converted to text';
    }
    return { name: 'Error', message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH) };
}
export function publicJob(job) {
    const { lockToken: _lockToken, sequence: _sequence, ...visible } = job;
    return jsonClone(visible, 'job record');
}

const ACTIVE_QUEUE_WORKSPACES = new Map();
const ACTIVE_QUEUE_DATABASES = new WeakMap();

export async function acquireQueueNamespace(ownerInstance, db, namespace) {
    if (db.workspaceRoot) {
        const canonicalRoot = await realpath(resolvePath(db.workspaceRoot));
        const key = `${canonicalRoot}\0${namespace}`;
        const owner = ACTIVE_QUEUE_WORKSPACES.get(key);
        assert(!owner || owner === ownerInstance, `BroccoliQueue namespace "${namespace}" already has an owner in this process`);
        ACTIVE_QUEUE_WORKSPACES.set(key, ownerInstance);
        return { namespaceRegistryKey: key, usesDatabaseRegistry: false };
    }
    const owners = ACTIVE_QUEUE_DATABASES.get(db) ?? new Map();
    const owner = owners.get(namespace);
    assert(!owner || owner === ownerInstance, `BroccoliQueue namespace "${namespace}" already has an owner in this process`);
    owners.set(namespace, ownerInstance);
    ACTIVE_QUEUE_DATABASES.set(db, owners);
    return { namespaceRegistryKey: undefined, usesDatabaseRegistry: true };
}

export function releaseQueueNamespace(ownerInstance, db, namespace, state) {
    if (state.namespaceRegistryKey) {
        if (ACTIVE_QUEUE_WORKSPACES.get(state.namespaceRegistryKey) === ownerInstance)
            ACTIVE_QUEUE_WORKSPACES.delete(state.namespaceRegistryKey);
        state.namespaceRegistryKey = undefined;
    }
    if (state.usesDatabaseRegistry) {
        const owners = ACTIVE_QUEUE_DATABASES.get(db);
        if (owners?.get(namespace) === ownerInstance)
            owners.delete(namespace);
        state.usesDatabaseRegistry = false;
    }
}

export function normalizeJobOptions(defaultJobOptions, queueDefaults, options) {
    assert(options && typeof options === 'object' && !Array.isArray(options), 'job options must be an object');
    const values = { ...defaultJobOptions, ...(queueDefaults ?? {}), ...options };
    const priority = values.priority ?? 0;
    const delayMs = values.delayMs ?? 0;
    const attempts = values.attempts ?? 1;
    safeInteger(priority, 'priority', -2_147_483_648, 2_147_483_647);
    const maximumDateDelay = Number.MAX_SAFE_INTEGER - Date.now();
    safeInteger(delayMs, 'delayMs', 0, maximumDateDelay);
    safeInteger(attempts, 'attempts', 1, 1_000);
    const rawBackoff = values.backoff ?? DEFAULT_BACKOFF;
    assert(rawBackoff.type === 'fixed' || rawBackoff.type === 'exponential', 'backoff.type must be fixed or exponential');
    safeInteger(rawBackoff.delayMs, 'backoff.delayMs', 0, maximumDateDelay);
    if (rawBackoff.maxDelayMs !== undefined)
        safeInteger(rawBackoff.maxDelayMs, 'backoff.maxDelayMs', 0, maximumDateDelay);
    if (values.idempotencyKey !== undefined) {
        assert(typeof values.idempotencyKey === 'string' && values.idempotencyKey.length > 0 && values.idempotencyKey.length <= 256, 'idempotencyKey must be a non-empty string no longer than 256 characters');
    }
    return {
        priority,
        delayMs,
        attempts,
        backoff: jsonClone(rawBackoff, 'backoff'),
        ...(values.idempotencyKey !== undefined ? { idempotencyKey: values.idempotencyKey } : {})
    };
}

export function idForIdempotencyKey(namespace, queueName, key) {
    const hash = createHash('sha256').update(`${namespace}\0${queueName}\0${key}`).digest('hex');
    return `idem_${hash}`;
}

export function compactLeaseHeapForQueue(jobsTable, countsMap, leasesMap, name) {
    const activeCount = countsMap.get(name)?.active ?? 0;
    const heap = leasesMap.get(name);
    if (!heap || heap.size <= activeCount * 2 + 1_000)
        return;
    const compacted = leaseHeap();
    for (const job of jobsTable.query({ where: { queueName: name, state: 'active' } })) {
        if (job.lockToken && job.leaseExpiresAt !== undefined) {
            compacted.push({ id: job.id, token: job.lockToken, expiresAt: job.leaseExpiresAt });
        }
    }
    leasesMap.set(name, compacted);
}

export function compactTerminalHeapForQueue(jobsTable, terminalHeap, terminalCount) {
    if (terminalHeap.size <= terminalCount * 2 + 1_000)
        return terminalHeap;
    const compacted = new MinHeap((a, b) => a.finishedAt - b.finishedAt);
    for (const state of TERMINAL_STATES) {
        for (const job of jobsTable.query({ where: { state } })) {
            if (job.finishedAt !== undefined)
                compacted.push({ id: job.id, finishedAt: job.finishedAt });
        }
    }
    return compacted;
}

export function compactPendingHeapsForQueue(jobsTable, countsMap, readyMap, delayedMap, name) {
    const currentPending = (countsMap.get(name)?.waiting ?? 0) + (countsMap.get(name)?.delayed ?? 0);
    const heapSize = (readyMap.get(name)?.size ?? 0) + (delayedMap.get(name)?.size ?? 0);
    if (heapSize <= currentPending * 2 + 1_000)
        return;
    const ready = readyHeap();
    const delayed = delayedHeap();
    for (const state of ['waiting', 'delayed']) {
        for (const job of jobsTable.query({ where: { queueName: name, state } })) {
            const entry = { id: job.id, priority: job.priority, sequence: job.sequence };
            if (job.state === 'waiting')
                ready.push(entry);
            else
                delayed.push({ ...entry, availableAt: job.availableAt });
        }
    }
    readyMap.set(name, ready);
    delayedMap.set(name, delayed);
}

export function emitQueueError(emitter, value) {
    let error;
    try {
        error = value instanceof Error ? value : new Error(String(value));
    }
    catch {
        error = new Error('Queue operation failed with an unprintable error');
    }
    if (emitter.listenerCount('error') > 0) {
        try {
            emitter.emit('error', error);
            return;
        }
        catch (listenerError) {
            if (emitter.listenerCount('workerError') === 0)
                return;
            try {
                emitter.emit('workerError', listenerError instanceof Error ? listenerError : new Error(String(listenerError)));
            }
            catch { }
            return;
        }
    }
    if (emitter.listenerCount('workerError') > 0) {
        try {
            emitter.emit('workerError', error);
        }
        catch { }
    }
}

export function queryJobsFromTable(jobsTable, recentIds, query = {}) {
    if (query.queueName !== undefined)
        assertQueueName(query.queueName);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    safeInteger(limit, 'limit', 1, MAX_PAGE_SIZE);
    safeInteger(offset, 'offset', 0);
    if (query.beforeId !== undefined)
        assert(typeof query.beforeId === 'string' && query.beforeId.length > 0, 'beforeId must be a non-empty job ID');
    const states = query.state === undefined ? undefined : Array.isArray(query.state) ? query.state : [query.state];
    for (const state of states ?? [])
        assert(STATES.includes(state), `unknown job state: ${state}`);
    if (states?.length && states.every(state => !TERMINAL_STATES.includes(state))) {
        const before = query.beforeId === undefined ? undefined : jobsTable.get(query.beforeId);
        if (query.beforeId !== undefined && !before)
            return [];
        return jobsTable.query({
            where: {
                state: { $in: states },
                ...(query.queueName === undefined ? {} : { queueName: query.queueName }),
                ...(before === undefined ? {} : { sequence: { $lt: before.sequence } })
            },
            sortBy: 'sequence', sortOrder: 'desc', limit, offset
        }).map(job => publicJob(job));
    }
    const result = [];
    let matched = 0;
    const cursorIndex = query.beforeId === undefined ? recentIds.length : recentIds.lastIndexOf(query.beforeId);
    if (query.beforeId !== undefined && cursorIndex < 0)
        return result;
    for (let index = cursorIndex - 1; index >= 0 && result.length < limit; index--) {
        const job = jobsTable.get(recentIds[index]);
        if (!job)
            continue;
        if (query.queueName !== undefined && job.queueName !== query.queueName)
            continue;
        if (states?.length && !states.includes(job.state))
            continue;
        if (matched++ < offset)
            continue;
        result.push(publicJob(job));
    }
    return result;
}

export function buildRecentIds(jobs) {
    const compareSequence = (a, b) => (a.sequence ?? a.createdAt) - (b.sequence ?? b.createdAt);
    const recent = new MinHeap(compareSequence);
    for (const job of jobs) {
        if (recent.size < 12_000)
            recent.push(job);
        else if (compareSequence(job, recent.peek()) > 0) {
            recent.pop();
            recent.push(job);
        }
    }
    const recentIds = [];
    while (recent.size)
        recentIds.push(recent.pop().id);
    return recentIds;
}

export function buildRetryJobRecord(current, now, delayMs) {
    return {
        ...current,
        state: delayMs ? 'delayed' : 'waiting',
        attemptsMade: 0,
        availableAt: now + delayMs,
        updatedAt: now,
        ...(current.processedAt !== undefined ? { processedAt: undefined } : {}),
        ...(current.finishedAt !== undefined ? { finishedAt: undefined } : {}),
        ...(current.lastError !== undefined ? { lastError: undefined } : {}),
        ...(current.returnValue !== undefined ? { returnValue: undefined } : {}),
        workerId: undefined,
        leaseExpiresAt: undefined,
        lockToken: undefined
    };
}

export function buildExpiredLeaseRecord(latest, now) {
    const exhausted = latest.attemptsMade >= latest.maxAttempts;
    const nextAvailableAt = exhausted ? now : now + backoffDelay(latest.backoff, latest.attemptsMade);
    return {
        ...latest,
        state: exhausted ? 'failed' : 'delayed',
        updatedAt: now,
        availableAt: nextAvailableAt,
        ...(exhausted ? { finishedAt: now, lastError: { name: 'LeaseExpiredError', message: 'Worker lease expired before the job was acknowledged' } } : {}),
        workerId: undefined,
        leaseExpiresAt: undefined,
        lockToken: undefined
    };
}

export function buildCompletedJobRecord(current, now, returnValue) {
    return {
        ...current,
        state: 'completed',
        updatedAt: now,
        finishedAt: now,
        ...(returnValue !== undefined ? { returnValue } : {}),
        lastError: undefined,
        workerId: undefined,
        leaseExpiresAt: undefined,
        lockToken: undefined
    };
}

export function buildFailedJobRecord(current, now, jobError) {
    const exhausted = current.attemptsMade >= current.maxAttempts;
    return {
        exhausted,
        record: {
            ...current,
            state: exhausted ? 'failed' : 'delayed',
            availableAt: exhausted ? current.availableAt : now + backoffDelay(current.backoff, current.attemptsMade),
            updatedAt: now,
            ...(exhausted ? { finishedAt: now } : {}),
            lastError: jobError,
            workerId: undefined,
            leaseExpiresAt: undefined,
            lockToken: undefined
        }
    };
}

export function buildReleasedJobRecord(current, now, restoreAttempts) {
    return {
        ...current,
        state: current.availableAt > now ? 'delayed' : 'waiting',
        ...(restoreAttempts ? { attemptsMade: Math.max(0, current.attemptsMade - 1) } : {}),
        updatedAt: now,
        workerId: undefined,
        leaseExpiresAt: undefined,
        lockToken: undefined
    };
}

export function buildCancelledJobRecord(current, now) {
    return {
        ...current,
        state: 'cancelled',
        updatedAt: now,
        finishedAt: now,
        workerId: undefined,
        leaseExpiresAt: undefined,
        lockToken: undefined
    };
}

export function buildClaimedJobRecord(latest, now, workerId, leaseDurationMs, token) {
    return {
        ...latest,
        state: 'active',
        attemptsMade: latest.attemptsMade + 1,
        processedAt: latest.processedAt ?? now,
        updatedAt: now,
        workerId,
        leaseExpiresAt: now + leaseDurationMs,
        lockToken: token
    };
}

export function buildNewJobRecord(id, item, now, sequence) {
    const availableAt = now + item.options.delayMs;
    return {
        id,
        queueName: item.name,
        data: item.data,
        state: item.options.delayMs > 0 ? 'delayed' : 'waiting',
        priority: item.options.priority,
        createdAt: now,
        updatedAt: now,
        availableAt,
        attemptsMade: 0,
        maxAttempts: item.options.attempts,
        backoff: item.options.backoff,
        sequence,
        ...(item.options.idempotencyKey !== undefined ? { idempotencyKey: item.options.idempotencyKey } : {})
    };
}

export function validateQueueConstructorOptions(options) {
    assert(options && typeof options === 'object' && options.db, 'BroccoliQueue requires a started BroccoliDatabaseKernel');
    const namespace = options.namespace ?? 'broccoli_queue';
    assert(/^[a-zA-Z0-9_-]{1,48}$/.test(namespace), 'namespace must contain 1-48 letters, numbers, underscores, or hyphens');
    const defaultJobOptions = jsonClone(options.defaultJobOptions ?? {}, 'defaultJobOptions');
    assert(defaultJobOptions && typeof defaultJobOptions === 'object' && !Array.isArray(defaultJobOptions), 'defaultJobOptions must be an object');
    const retentionMs = options.retentionMs ?? 7 * 24 * 60 * 60 * 1_000;
    safeInteger(retentionMs, 'retentionMs', 0);
    const maxTerminalJobs = options.maxTerminalJobs;
    if (maxTerminalJobs !== undefined)
        safeInteger(maxTerminalJobs, 'maxTerminalJobs', 0, 1_000_000);
    const flushBatchDelayMs = options.flushBatchDelayMs ?? 0;
    safeInteger(flushBatchDelayMs, 'flushBatchDelayMs', 0, 1_000);
    const maxJobDataBytes = options.maxJobDataBytes ?? 1_048_576;
    const maxJobResultBytes = options.maxJobResultBytes ?? 1_048_576;
    const maxBulkItems = options.maxBulkItems ?? 1_000;
    const maxBulkBytes = options.maxBulkBytes ?? 16_777_216;
    const maintenanceIntervalMs = options.maintenanceIntervalMs ?? 5_000;
    const maintenanceBatchSize = options.maintenanceBatchSize ?? 5_000;
    const maintenanceMaxBatches = options.maintenanceMaxBatches ?? 5;
    safeInteger(maxJobDataBytes, 'maxJobDataBytes', 1, 67_108_864);
    safeInteger(maxJobResultBytes, 'maxJobResultBytes', 1, 67_108_864);
    safeInteger(maxBulkItems, 'maxBulkItems', 1, 10_000);
    safeInteger(maxBulkBytes, 'maxBulkBytes', 1, 67_108_864);
    safeInteger(maintenanceIntervalMs, 'maintenanceIntervalMs', 1_000, 24 * 60 * 60 * 1_000);
    safeInteger(maintenanceBatchSize, 'maintenanceBatchSize', 1, MAX_PRUNE_BATCH_SIZE);
    safeInteger(maintenanceMaxBatches, 'maintenanceMaxBatches', 1, 100);
    return {
        namespace,
        defaultJobOptions,
        retentionMs,
        maxTerminalJobs,
        flushBatchDelayMs,
        maxJobDataBytes,
        maxJobResultBytes,
        maxBulkItems,
        maxBulkBytes,
        maintenanceIntervalMs,
        maintenanceBatchSize,
        maintenanceMaxBatches
    };
}

export function ensureQueueInTable(queuesTable, countsMap, name, options, normalizeOptionsFn) {
    assert(options && typeof options === 'object' && !Array.isArray(options), 'queue options must be an object');
    const existing = queuesTable.get(name);
    if (existing)
        return existing;
    if (options.paused !== undefined)
        assert(typeof options.paused === 'boolean', 'paused must be a boolean');
    if (options.defaultJobOptions !== undefined) {
        assert(options.defaultJobOptions && typeof options.defaultJobOptions === 'object' && !Array.isArray(options.defaultJobOptions), 'defaultJobOptions must be an object');
        normalizeOptionsFn(name, options.defaultJobOptions);
    }
    const now = Date.now();
    const record = {
        name,
        paused: options.paused ?? false,
        createdAt: now,
        updatedAt: now,
        ...(options.defaultJobOptions ? { defaultJobOptions: jsonClone(options.defaultJobOptions, 'defaultJobOptions') } : {})
    };
    queuesTable.put(name, record);
    countsMap.set(name, emptyCounts());
    return record;
}

export function normalizeBulkAddItems(items, maxBulkItems, maxJobDataBytes, maxBulkBytes, normalizeOptionsFn) {
    assert(Array.isArray(items), 'addBulk() requires an array of jobs');
    if (items.length === 0)
        return [];
    safeInteger(items.length, 'addBulk item count', 1, maxBulkItems);
    let totalDataBytes = 0;
    return items.map(item => {
        assert(item && typeof item === 'object', 'each addBulk item must include a queue name and data');
        assertQueueName(item.name);
        const data = jsonCloneWithSize(item.data, 'job data', maxJobDataBytes);
        totalDataBytes += data.bytes;
        assert(totalDataBytes <= maxBulkBytes, `addBulk payload exceeds the configured ${maxBulkBytes}-byte limit`);
        return {
            name: item.name,
            data: data.value,
            options: normalizeOptionsFn(item.name, item.options ?? {})
        };
    });
}

export function pruneTerminalJobsFromHeap(jobsTable, terminalHeap, adjustCountFn, getTerminalCountFn, decTerminalCountFn, maxTerminalJobs, defaultRetentionMs, options = {}) {
    const retentionMs = options.retentionMs ?? defaultRetentionMs;
    const batchSize = options.batchSize ?? 250;
    safeInteger(retentionMs, 'retentionMs', 0);
    safeInteger(batchSize, 'batchSize', 1, MAX_PRUNE_BATCH_SIZE);
    const cutoff = Date.now() - retentionMs;
    let removed = 0;
    let inspected = 0;
    const maxInspected = batchSize * 4;
    while (removed < batchSize && inspected < maxInspected) {
        const next = terminalHeap.peek();
        if (!next)
            break;
        const current = jobsTable.get(next.id);
        const matches = current && TERMINAL_STATES.includes(current.state) && current.finishedAt === next.finishedAt;
        if (matches && current.finishedAt > cutoff && (maxTerminalJobs === undefined || getTerminalCountFn() <= maxTerminalJobs))
            break;
        inspected++;
        const entry = terminalHeap.pop();
        const job = jobsTable.get(entry.id);
        if (!job || !TERMINAL_STATES.includes(job.state) || job.finishedAt !== entry.finishedAt)
            continue;
        const expired = job.finishedAt <= cutoff;
        const overLimit = maxTerminalJobs !== undefined && getTerminalCountFn() > maxTerminalJobs;
        if (!expired && !overLimit)
            continue;
        if (jobsTable.delete(job.id)) {
            adjustCountFn(job.queueName, job.state, -1);
            decTerminalCountFn();
            removed++;
        }
    }
    return removed;
}
/**
 * A BroccoliDB-backed queue. The database kernel is supplied by the host and
 * remains host-owned; queue.close() drains workers and flushes it but does not
 * stop the kernel.
 */
