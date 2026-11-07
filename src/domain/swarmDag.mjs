/** [LAYER: DOMAIN] */
/**
 * Task DAG scheduler. Dependency-based task scheduling (dependsOnTaskIds), topological sort execution queues,
 * and failure cascade resolution. Zero external dependencies.
 */
export class BroccoliTaskDagScheduler {
    tasks = new Map();
    /**
     * Adds a task node to the DAG with dependency requirements.
     */
    addTask(id, taskPrompt, dependsOnTaskIds = []) {
        const node = {
            id,
            taskPrompt,
            dependsOnTaskIds,
            status: "pending",
            createdAt: Date.now(),
        };
        this.tasks.set(id, node);
        return node;
    }
    /**
     * Evaluates topological execution order, returning ready tasks with satisfied dependencies.
     */
    getReadyTasks() {
        const ready = [];
        for (const task of this.tasks.values()) {
            if (task.status !== "pending")
                continue;
            let dependenciesSatisfied = true;
            for (const depId of task.dependsOnTaskIds) {
                const depNode = this.tasks.get(depId);
                if (!depNode || depNode.status !== "completed") {
                    dependenciesSatisfied = false;
                    break;
                }
            }
            if (dependenciesSatisfied) {
                ready.push(task);
            }
        }
        return ready;
    }
    /**
     * Marks a task as completed and returns next ready tasks.
     */
    markCompleted(id, result) {
        const node = this.tasks.get(id);
        if (node) {
            node.status = "completed";
            node.result = result;
        }
        return this.getReadyTasks();
    }
    /**
     * Marks a task as failed and cascade-skips downstream dependent tasks.
     */
    markFailed(id, error) {
        const node = this.tasks.get(id);
        if (!node)
            return;
        node.status = "failed";
        node.error = error;
        // Cascade skip downstream dependencies
        for (const task of this.tasks.values()) {
            if (task.status === "pending" && task.dependsOnTaskIds.includes(id)) {
                task.status = "skipped";
                task.error = `Skipped due to upstream dependency failure in '${id}'`;
            }
        }
    }
    /**
     * Checks if all DAG tasks have finished execution (completed, failed, or skipped).
     */
    isFinished() {
        for (const task of this.tasks.values()) {
            if (task.status === "pending" || task.status === "running") {
                return false;
            }
        }
        return true;
    }
    /**
     * Returns current DAG metrics.
     */
    getMetrics() {
        let completed = 0;
        let failed = 0;
        let skipped = 0;
        for (const t of this.tasks.values()) {
            if (t.status === "completed")
                completed++;
            else if (t.status === "failed")
                failed++;
            else if (t.status === "skipped")
                skipped++;
        }
        return {
            total: this.tasks.size,
            completed,
            failed,
            skipped,
        };
    }
}
