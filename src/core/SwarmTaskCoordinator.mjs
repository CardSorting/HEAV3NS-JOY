/** [LAYER: CORE] */
/**
 * Zero-dependency task coordinator. Orchestrates multi-worker software engineering tasks across subagents, tracking worker heartbeats,
 * active worker processes, and worker lease expiration. Zero external npm dependencies.
 */
import { newUuid } from "../plumbing/ids.mjs";
export class BroccoliTaskCoordinator {
    activeWorkers = new Map();
    taskToWorker = new Map();
    heartbeatInterval = null;
    heartbeatTimeoutMs;
    constructor(heartbeatTimeoutMs = 30_000) {
        this.heartbeatTimeoutMs = heartbeatTimeoutMs;
    }
    /**
     * Starts background worker heartbeat monitoring.
     */
    startMonitoring(checkIntervalMs = 10_000) {
        if (this.heartbeatInterval)
            return;
        this.heartbeatInterval = setInterval(() => {
            this.monitorHeartbeats();
        }, checkIntervalMs);
        this.heartbeatInterval.unref();
    }
    /**
     * Stops background worker heartbeat monitoring.
     */
    stopMonitoring() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    /**
     * Dispatches a new task to a registered subagent worker.
     */
    dispatchTask(taskId, workerId = newUuid()) {
        if (this.taskToWorker.has(taskId) || this.activeWorkers.get(workerId)?.status === "running") {
            throw new Error("Worker or task is already running");
        }
        const worker = {
            workerId,
            taskId,
            lastHeartbeat: Date.now(),
            status: "running",
        };
        this.activeWorkers.set(workerId, worker);
        this.taskToWorker.set(taskId, workerId);
        return worker;
    }
    /**
     * Records a heartbeat ping from an active worker process.
     */
    recordHeartbeat(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker)
            return false;
        worker.lastHeartbeat = Date.now();
        return true;
    }
    /** Reopen an explicitly deferred worker without allocating a second task lease. */
    resumeDeferredWorker(workerId) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker || worker.status !== "deferred")
            return undefined;
        worker.status = "running";
        worker.lastHeartbeat = Date.now();
        return { ...worker };
    }
    /** Release live coordination state; durable formation reports are stored by the host. */
    settleWorker(workerId, status) {
        const worker = this.activeWorkers.get(workerId);
        if (!worker || worker.status !== "running")
            return false;
        worker.status = status;
        worker.lastHeartbeat = Date.now();
        if (status !== "deferred") {
            this.taskToWorker.delete(worker.taskId);
            this.activeWorkers.delete(workerId);
        }
        return true;
    }
    /**
     * Reports stale workers without inferring that their work has stopped.
     */
    monitorHeartbeats() {
        const now = Date.now();
        const staleWorkerIds = [];
        for (const [workerId, worker] of this.activeWorkers.entries()) {
            if (worker.status !== "running")
                continue;
            if (now - worker.lastHeartbeat > this.heartbeatTimeoutMs) {
                staleWorkerIds.push(workerId);
            }
        }
        return staleWorkerIds;
    }
    /**
     * Returns health status metrics for the task coordinator.
     */
    getStatus() {
        const now = Date.now();
        let staleCount = 0;
        let activeWorkersCount = 0;
        for (const worker of this.activeWorkers.values()) {
            if (worker.status !== "running")
                continue;
            activeWorkersCount++;
            if (now - worker.lastHeartbeat > this.heartbeatTimeoutMs) {
                staleCount++;
            }
        }
        return {
            activeWorkersCount,
            monitoredTasksCount: this.taskToWorker.size,
            staleWorkersCount: staleCount,
        };
    }
}
