/** [LAYER: INFRASTRUCTURE] */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MAX_PAGE_SIZE, publicJob, safeInteger } from './queue-helpers.mjs';
export class QueueWorker {
    id;
    queueName;
    #queue;
    #processor;
    #concurrency;
    #batchSize;
    #pollingIntervalMs;
    #leaseDurationMs;
    #keepAlive;
    #running = false;
    #paused = false;
    #pumpPromise;
    #stopPromise;
    #timer;
    #active = new Map();
    constructor(queue, name, processor, options) {
        this.#queue = queue;
        this.queueName = name;
        this.#processor = processor;
        this.#concurrency = options.concurrency ?? 1;
        this.#batchSize = options.batchSize ?? 32;
        this.#pollingIntervalMs = options.pollingIntervalMs ?? 100;
        this.#leaseDurationMs = options.leaseDurationMs ?? 30_000;
        this.#keepAlive = options.keepAlive ?? true;
        assert(typeof this.#keepAlive === 'boolean', 'keepAlive must be a boolean');
        this.id = options.workerId ?? `worker-${randomUUID()}`;
        assert(typeof this.id === 'string' && this.id.length > 0 && this.id.length <= 128, 'workerId must be 1-128 characters');
        safeInteger(this.#concurrency, 'concurrency', 1, 10_000);
        safeInteger(this.#batchSize, 'batchSize', 1, MAX_PAGE_SIZE);
        safeInteger(this.#pollingIntervalMs, 'pollingIntervalMs', 10, 60_000);
        safeInteger(this.#leaseDurationMs, 'leaseDurationMs', 500, 24 * 60 * 60 * 1_000);
    }
    get isRunning() {
        return this.#running;
    }
    get activeCount() {
        return this.#active.size;
    }
    get concurrency() {
        return this.#concurrency;
    }
    async start() {
        if (this.#stopPromise)
            await this.#stopPromise;
        if (this.#running)
            return this;
        await this.#queue.ensureQueue(this.queueName);
        if (this.#running)
            return this;
        this.#queue.registerWorker(this);
        this.#running = true;
        this.#schedule(0);
        return this;
    }
    pause() {
        this.#paused = true;
    }
    resume() {
        this.#paused = false;
        this.wake();
    }
    wake() {
        if (!this.#running)
            return;
        this.#schedule(0);
    }
    async stop(options = {}) {
        const drainTimeoutMs = options.drainTimeoutMs ?? 30_000;
        safeInteger(drainTimeoutMs, 'drainTimeoutMs', 0);
        if (this.#stopPromise)
            return await this.#stopPromise;
        if (!this.#running) {
            this.#queue.unregisterWorker(this);
            return;
        }
        const operation = this.#stopInternal(drainTimeoutMs);
        this.#stopPromise = operation;
        try {
            await operation;
        }
        finally {
            if (this.#stopPromise === operation)
                this.#stopPromise = undefined;
        }
    }
    async #stopInternal(drainTimeoutMs) {
        this.#running = false;
        if (this.#timer)
            clearTimeout(this.#timer);
        this.#timer = undefined;
        await this.#pumpPromise?.catch(error => this.#queue.reportWorkerError(error));
        const tasks = [...this.#active.values()].map(active => active.task);
        if (tasks.length && drainTimeoutMs > 0) {
            let timer;
            await Promise.race([
                Promise.allSettled(tasks),
                new Promise(resolve => {
                    timer = setTimeout(resolve, drainTimeoutMs);
                })
            ]);
            if (timer)
                clearTimeout(timer);
        }
        if (this.#active.size) {
            const active = [...this.#active.entries()];
            for (const [, task] of active) {
                if (task.heartbeat)
                    clearTimeout(task.heartbeat);
                task.controller.abort(new Error('Worker stopped before the handler completed'));
            }
            await this.#queue.releaseClaims(active.map(([id, task]) => ({ id, token: task.token })))
                .catch(error => this.#queue.reportWorkerError(error));
        }
        this.#queue.unregisterWorker(this);
    }
    async #pump() {
        if (!this.#running || this.#pumpPromise)
            return;
        this.#pumpPromise = (async () => {
            // Retry a previously failed WAL flush before mutating more claims. A
            // handler must never start behind an unflushed state transition.
            await this.#queue.flushWrites();
            await this.#queue.recoverExpired(this.queueName, this.#batchSize);
            if (!this.#running || this.#paused)
                return;
            const available = this.#concurrency - this.#active.size;
            if (this.#queue.isPaused(this.queueName) || available <= 0) {
                await this.#queue.promoteDue(this.queueName);
                return;
            }
            const claimed = this.#queue.claimReady(this.queueName, this.id, Math.min(this.#batchSize, available), this.#leaseDurationMs);
            if (claimed.length) {
                try {
                    await this.#queue.flushWrites();
                }
                catch (error) {
                    await this.#queue.releaseClaims(claimed.map(item => ({ id: item.job.id, token: item.token })), { restoreAttempts: true })
                        .catch(releaseError => this.#queue.reportWorkerError(releaseError));
                    throw error;
                }
            }
            if (!this.#running) {
                await this.#queue.releaseClaims(claimed.map(item => ({ id: item.job.id, token: item.token })), { restoreAttempts: true });
                return;
            }
            for (const item of claimed) {
                const live = this.#queue.getJob(item.job.id);
                if (!live || live.state !== 'active')
                    continue;
                this.#run(item);
            }
        })();
        try {
            await this.#pumpPromise;
        }
        catch (error) {
            this.#queue.reportWorkerError(error);
        }
        finally {
            this.#pumpPromise = undefined;
            if (this.#running)
                this.#schedule(this.#pollingIntervalMs);
        }
    }
    #run(claim) {
        const controller = new AbortController();
        const { job, token } = claim;
        this.#queue.registerController(job.id, controller);
        const active = {
            token,
            controller,
            task: Promise.resolve()
        };
        this.#active.set(job.id, active);
        controller.signal.addEventListener('abort', () => {
            if (active.heartbeat)
                clearTimeout(active.heartbeat);
        }, { once: true });
        const scheduleHeartbeat = () => {
            if (controller.signal.aborted || this.#active.get(job.id) !== active)
                return;
            active.heartbeat = setTimeout(() => {
                void this.#queue.renewLease(job.id, token, this.#leaseDurationMs).then(renewed => {
                    if (!renewed)
                        controller.abort(new Error('Job lease was taken by another worker'));
                }).catch(error => {
                    controller.abort(error);
                    this.#queue.reportWorkerError(error);
                }).finally(scheduleHeartbeat);
            }, Math.max(250, Math.floor(this.#leaseDurationMs / 3)));
        };
        scheduleHeartbeat();
        active.task = Promise.resolve().then(async () => {
            const context = {
                signal: controller.signal,
                heartbeat: () => this.#queue.renewLease(job.id, token, this.#leaseDurationMs)
            };
            let result;
            try {
                result = await this.#processor(publicJob(job), context);
            }
            catch (error) {
                try {
                    await this.#queue.failClaim(job.id, token, error);
                }
                catch (settlementError) {
                    this.#queue.reportWorkerError(settlementError);
                }
                return;
            }
            try {
                await this.#queue.completeClaim(job.id, token, result);
            }
            catch (settlementError) {
                // A failed persistence flush is ambiguous: the WAL may still contain
                // the completion frame. Do not overwrite it with a synthetic failure.
                this.#queue.reportWorkerError(settlementError);
            }
        }).catch(error => {
            this.#queue.reportWorkerError(error);
        }).finally(() => {
            if (active.heartbeat)
                clearTimeout(active.heartbeat);
            this.#queue.unregisterController(job.id, controller);
            if (this.#active.get(job.id) === active)
                this.#active.delete(job.id);
            if (this.#running)
                this.#schedule(0);
        });
    }
    #schedule(delayMs) {
        if (!this.#running)
            return;
        if (this.#timer)
            clearTimeout(this.#timer);
        this.#timer = setTimeout(() => {
            this.#timer = undefined;
            void this.#pump();
        }, delayMs);
        if (!this.#keepAlive && this.#active.size === 0 && this.#queue.getHealth().status !== 'closing') {
            const counts = this.#queue.getQueue(this.queueName)?.counts;
            if (!counts?.waiting && !counts?.delayed && !counts?.active)
                this.#timer.unref();
        }
    }
}
