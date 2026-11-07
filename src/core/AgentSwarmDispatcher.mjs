/** [LAYER: CORE] */
/**
 * Host-agnostic Agent Swarm dispatcher (`AgentSwarmDispatcher`): bounded specialist
 * formations, dependency-ordered execution, hierarchy defer barriers, fenced formation
 * leases, safe failover, and a convergence/knowledge blackboard.
 *
 * Embeddable in any host: every collaborator is injected (for hosts that cannot be
 * modified, `ProcessAgentEngine` and `SwarmFormationLedger` drive swarms from outside):
 *  - the parent agent engine passed to `delegate*` follows `ISwarmAgentEngine`;
 *  - leases follow `ISwarmLeaseService` (default: `InMemorySwarmLeaseService`);
 *  - config follows `SwarmConfigService.read()` (default: library defaults);
 *  - workspace knowledge follows `SwarmKnowledgeService` (default: no persistence).
 */
import { sha256Hex } from "../plumbing/canonicalHash.mjs";
import { newUuid } from "../plumbing/ids.mjs";
import { ConvergenceEngineSubstrate } from "../domain/swarmConvergence.mjs";
import { BroccoliTaskDagScheduler } from "../domain/swarmDag.mjs";
import { BroccoliInterAgentMailbox } from "../domain/swarmMailbox.mjs";
import { agentSwarmFeatureEnabled, defaultAgentSwarmConfig } from "../domain/swarmConfig.mjs";
import { classifyTaskForLegion } from "../domain/swarmClassifier.mjs";
import { extractLegionHeuristics, formatLegionKnowledgeContext, LEGION_KNOWLEDGE_TTL_MS } from "../domain/swarmKnowledge.mjs";
import { LEGION_CORE_RULES } from "../domain/swarmFormation.mjs";
import { BroccoliTaskCoordinator } from "./SwarmTaskCoordinator.mjs";
import { InMemorySwarmLeaseService } from "./InMemorySwarmLeaseService.mjs";
/** Runs bounded specialist formations, coordinates safe defer barriers, and reconciles child outcomes. */
export class AgentSwarmDispatcher {
    workspaceKnowledge;
    leaseService;
    configService;
    logger;
    activeLocks = new Map();
    activeFormations = new Map();
    hierarchyDeferred = false;
    hierarchySuspended = false;
    hierarchyDeferBoundary = "safe_boundary";
    childDeferRequests = new Map();
    activeDelegations = 0;
    deferWaiters = [];
    lockCounter = 0;
    convergenceEngine = new ConvergenceEngineSubstrate();
    dagScheduler = new BroccoliTaskDagScheduler();
    mailbox = new BroccoliInterAgentMailbox();
    taskCoordinator = new BroccoliTaskCoordinator();
    /**
     * @param {{
     *   workspaceKnowledge?: { recall: (cwd: string) => Promise<Array<{ content: string, createdAt: number, expiresAt: number }>>, store: (cwd: string, streamId: string, observations: readonly string[]) => Promise<number> },
     *   leaseService?: import("../domain/interfaces/ISwarmLeaseService.mjs").ISwarmLeaseService,
     *   configService?: { read: () => Promise<import("../domain/swarmConfig.mjs").AgentSwarmConfig> },
     *   logger?: { warn: Function }
     * }} [options]
     */
    constructor(options = {}) {
        this.workspaceKnowledge = options.workspaceKnowledge ?? { recall: async () => [], store: async () => 0 };
        this.leaseService = options.leaseService ?? new InMemorySwarmLeaseService();
        this.configService = options.configService ?? { read: async () => ({ ...defaultAgentSwarmConfig }) };
        this.logger = options.logger ?? { warn() { } };
    }
    async deferHierarchy(boundary) {
        const resolvedBoundary = boundary ?? (await this.configService.read()).deferBoundary;
        this.hierarchyDeferBoundary = resolvedBoundary;
        this.hierarchyDeferred = true;
        this.hierarchySuspended = false;
        const initialChildren = [...this.childDeferRequests.values()];
        await Promise.all(initialChildren.map((child) => child.request()));
        await Promise.all(initialChildren.map((child) => child.acknowledged));
        if (this.activeDelegations > 0)
            await new Promise((resolve) => this.deferWaiters.push(resolve));
        const settledChildren = [...this.childDeferRequests.values()];
        await Promise.all(settledChildren.map((child) => child.request()));
        await Promise.all(settledChildren.map((child) => child.acknowledged));
        this.hierarchySuspended = true;
        return { deferred: true, boundary: resolvedBoundary, activeChildren: 0 };
    }
    resumeHierarchy() {
        this.hierarchyDeferred = false;
        this.hierarchySuspended = false;
        return { deferred: false };
    }
    getHierarchyDeferStatus() {
        return {
            deferred: this.hierarchySuspended,
            requested: this.hierarchyDeferred,
            activeChildren: this.activeDelegations,
            boundary: this.hierarchyDeferBoundary,
        };
    }
    acknowledgeChildDefer(childSessionId) {
        this.childDeferRequests.get(childSessionId)?.acknowledge();
    }
    failChildDefer(childSessionId, error) {
        const child = this.childDeferRequests.get(childSessionId);
        if (!child)
            return;
        child.fail(error);
        this.childDeferRequests.delete(childSessionId);
    }
    convergeSwarmOutputs(refinements) {
        return this.convergenceEngine.converge(refinements);
    }
    acquireLock(resourceKey, ownerId, ttlMs = 60_000) {
        const existing = this.activeLocks.get(resourceKey);
        const now = Date.now();
        if (existing && existing.expiresAt > now)
            throw new Error(`Swarm Lock Busy: Resource '${resourceKey}' is held by '${existing.ownerId}'`);
        this.lockCounter += 1;
        const lease = {
            lockId: `lock-${this.lockCounter}-${now}`,
            resourceKey,
            ownerId,
            expiresAt: now + ttlMs,
            fencingToken: `ft-${this.lockCounter}`,
        };
        this.activeLocks.set(resourceKey, lease);
        return lease;
    }
    releaseLock(resourceKey, lockId) {
        const lease = this.activeLocks.get(resourceKey);
        if (!lease || lease.lockId !== lockId)
            return false;
        this.activeLocks.delete(resourceKey);
        return true;
    }
    async delegateSpecialistFormation(objective, assignments, parentEngine, onProgress, onChildStream, resumeState, signal, onAdmitted) {
        const ids = new Set(assignments.map((assignment) => assignment.id));
        if (assignments.some((assignment) => ids.has(`${assignment.id}-attempt-1`)))
            throw new Error("INVALID_FORMATION: specialist IDs must not collide with failover stream IDs");
        const parentSessionId = parentEngine.sessionContext?.sessionId ?? `anonymous-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (this.activeFormations.has(parentSessionId))
            throw new Error(`AGENT_SWARM_FORMATION_BUSY: a Legion formation is already active for parent session '${parentSessionId}'`);
        const reservation = Symbol(parentSessionId);
        this.activeFormations.set(parentSessionId, reservation);
        try {
            signal?.throwIfAborted();
            const resourceKey = `agent-swarm-formation:${sha256Hex(parentSessionId)}`;
            const ownerId = `legion-${newUuid()}`;
            const leaseDurationMs = 60_000;
            const lease = await this.leaseService.acquireLease(resourceKey, ownerId, leaseDurationMs);
            const formationController = new AbortController();
            const abortFromParent = () => formationController.abort(signal?.reason);
            if (signal?.aborted)
                abortFromParent();
            else
                signal?.addEventListener("abort", abortFromParent, { once: true });
            let leaseLost = false;
            let renewalInFlight = false;
            let renewalPromise;
            const renewalTimer = setInterval(() => {
                if (renewalInFlight || leaseLost)
                    return;
                renewalInFlight = true;
                renewalPromise = this.leaseService.renewLease(lease, leaseDurationMs)
                    .then(() => undefined)
                    .catch((error) => {
                    leaseLost = true;
                    formationController.abort(error);
                })
                    .finally(() => { renewalInFlight = false; });
            }, 20_000);
            renewalTimer.unref?.();
            try {
                await this.leaseService.assertLease(lease);
                await onAdmitted?.();
                await this.leaseService.assertLease(lease);
                const assertCurrentOwner = async () => {
                    if (leaseLost)
                        throw new Error("AGENT_SWARM_FORMATION_LEASE_LOST: durable formation ownership was lost; inspect child streams before retrying");
                    await this.leaseService.assertLease(lease);
                };
                const guardedProgress = async (progress) => {
                    await assertCurrentOwner();
                    await onProgress?.(progress);
                };
                const guardedChildStream = async (assignment, result) => {
                    await assertCurrentOwner();
                    await onChildStream?.(assignment, result);
                };
                const result = await this.runSpecialistFormation(objective, assignments, parentEngine, guardedProgress, guardedChildStream, resumeState, formationController.signal);
                if (renewalPromise)
                    await renewalPromise;
                await assertCurrentOwner();
                return result;
            }
            finally {
                clearInterval(renewalTimer);
                signal?.removeEventListener("abort", abortFromParent);
                try {
                    if (renewalPromise)
                        await renewalPromise;
                }
                finally {
                    await this.leaseService.release(resourceKey, ownerId, lease.leaseEpoch, lease.fencingToken);
                }
            }
        }
        finally {
            if (this.activeFormations.get(parentSessionId) === reservation)
                this.activeFormations.delete(parentSessionId);
        }
    }
    async runSpecialistFormation(objective, assignments, parentEngine, onProgress, onChildStream, resumeState, signal) {
        signal?.throwIfAborted();
        const config = await this.configService.read();
        if (!agentSwarmFeatureEnabled(config, "legion"))
            throw new Error("AGENT_SWARM_DISABLED: enable Legion before forming specialists");
        if (!assignments.length || assignments.length > config.maxSpecialists)
            throw new Error(`INVALID_FORMATION: provide 1-${config.maxSpecialists} specialists`);
        const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]));
        if (byId.size !== assignments.length || assignments.some((assignment) => !assignment.id.trim() || !assignment.role.trim() || !assignment.objective.trim()))
            throw new Error("INVALID_FORMATION: specialist IDs must be unique and assignments must be complete");
        if (assignments.some((assignment) => byId.has(`${assignment.id}-attempt-1`)))
            throw new Error("INVALID_FORMATION: specialist IDs must not collide with failover stream IDs");
        for (const assignment of assignments)
            for (const dependency of assignment.dependsOn ?? [])
                if (!byId.has(dependency) || dependency === assignment.id)
                    throw new Error(`INVALID_FORMATION: unknown or self dependency '${dependency}'`);
        const remaining = new Set(assignments.map((assignment) => assignment.id));
        const ordered = [];
        while (remaining.size) {
            const ready = assignments.filter((assignment) => remaining.has(assignment.id) && (assignment.dependsOn ?? []).every((dependency) => !remaining.has(dependency)));
            if (!ready.length)
                throw new Error("INVALID_FORMATION: dependency cycle detected");
            for (const assignment of ready) {
                ordered.push(assignment);
                remaining.delete(assignment.id);
            }
        }
        const reports = [];
        const outcomes = new Map();
        let status = "completed";
        const progressStates = new Map(assignments.map((assignment) => [assignment.id, { status: "pending" }]));
        const workspaceCwd = parentEngine.sessionContext?.cwd;
        const knowledgeStreamId = parentEngine.sessionContext?.sessionId ?? "legion-workspace";
        const blackboard = [];
        if (workspaceCwd) {
            try {
                blackboard.push(...(await this.workspaceKnowledge.recall(workspaceCwd)));
            }
            catch (error) {
                this.logger.warn(`[AgentSwarmDispatcher] Could not load scoped workspace heuristics: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
        const knownHeuristics = new Set(blackboard.map((observation) => observation.content.toLowerCase()));
        for (const prior of resumeState?.completed ?? []) {
            const assignment = byId.get(prior.id);
            if (!assignment || assignment.role !== prior.role || typeof prior.summary !== "string" || outcomes.has(prior.id))
                throw new Error(`INVALID_FORMATION_RESUME: completed report '${prior.id}' does not match this formation`);
            outcomes.set(prior.id, "completed");
            progressStates.get(prior.id).status = "completed";
            reports.push({ id: prior.id, role: prior.role, status: "completed", summary: prior.summary.slice(0, 6000), reason: "Restored from the durable formation report" });
        }
        for (const prior of resumeState?.completed ?? []) {
            if ((byId.get(prior.id).dependsOn ?? []).some((dependency) => outcomes.get(dependency) !== "completed"))
                throw new Error(`INVALID_FORMATION_RESUME: completed report '${prior.id}' has an incomplete dependency`);
        }
        const persistChild = async (assignment, result) => {
            try {
                await onChildStream?.(assignment, result);
                if (result.tickResult.outcome === "deferred")
                    this.acknowledgeChildDefer(result.childSessionId);
            }
            catch (error) {
                const failure = new Error(`SWARM_PROGRESS_PERSISTENCE_UNCERTAIN: child stream persistence failed: ${error instanceof Error ? error.message : String(error)}`);
                this.failChildDefer(result.childSessionId, failure);
                throw failure;
            }
        };
        const persistProgress = async (formationStatus = status) => {
            const roadmapAssignments = assignments.map((assignment) => {
                const state = progressStates.get(assignment.id);
                const report = reports.find((entry) => entry.id === assignment.id);
                const result = report?.result;
                return {
                    id: assignment.id,
                    role: assignment.role,
                    objective: assignment.objective,
                    dependsOn: assignment.dependsOn ?? [],
                    status: state.status,
                    childSessionId: result?.childSessionId,
                    summary: result ? result.tickResult.response.slice(0, 6000) : report?.summary,
                    reason: report?.reason,
                    replacementRole: report?.replacementRole,
                    attempts: report?.attempts,
                };
            });
            const completedWork = roadmapAssignments.filter((assignment) => assignment.status === "completed").map((assignment) => assignment.id);
            const outstandingWork = roadmapAssignments.filter((assignment) => assignment.status !== "completed").map((assignment) => assignment.id);
            const blockers = roadmapAssignments.filter((assignment) => ["failed", "skipped", "deferred"].includes(assignment.status)).map((assignment) => `${assignment.id}: ${assignment.reason ?? assignment.status}`);
            const nextActions = formationStatus === "deferred"
                ? ["Resume the hierarchy, reconcile child sessions, then continue deferred assignments"]
                : roadmapAssignments.filter((assignment) => assignment.status === "pending" || assignment.status === "failed").map((assignment) => assignment.status === "failed" ? `Review failure and decide whether to reroute ${assignment.id}` : `Dispatch ${assignment.id} when dependencies are complete`);
            try {
                await onProgress?.({
                    objective, status: formationStatus, assignments: roadmapAssignments, completedWork, outstandingWork, blockers, nextActions,
                    synchronizationStatus: formationStatus === "deferred" ? "deferred" : roadmapAssignments.some((assignment) => assignment.status === "running") ? "awaiting_children" : "synchronized",
                    updatedAt: Date.now(),
                });
            }
            catch (error) {
                throw new Error(`SWARM_PROGRESS_PERSISTENCE_UNCERTAIN: formation progress failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        };
        await persistProgress("running");
        const markDeferred = () => {
            status = "deferred";
            for (const assignment of ordered) {
                if (outcomes.has(assignment.id))
                    continue;
                outcomes.set(assignment.id, "deferred");
                progressStates.get(assignment.id).status = "deferred";
                reports.push({ id: assignment.id, role: assignment.role, status: "deferred", reason: "Waiting for the parent hierarchy to resume" });
            }
        };
        while (ordered.some((assignment) => !outcomes.has(assignment.id))) {
            signal?.throwIfAborted();
            if (this.hierarchyDeferred) {
                markDeferred();
                await persistProgress("deferred");
                break;
            }
            const unresolved = ordered.filter((assignment) => !outcomes.has(assignment.id));
            for (const assignment of unresolved) {
                const failedDependency = (assignment.dependsOn ?? []).find((dependency) => outcomes.has(dependency) && outcomes.get(dependency) !== "completed");
                if (!failedDependency)
                    continue;
                outcomes.set(assignment.id, "skipped");
                progressStates.get(assignment.id).status = "skipped";
                reports.push({ id: assignment.id, role: assignment.role, status: "skipped", reason: `Dependency '${failedDependency}' did not complete` });
            }
            const ready = ordered.filter((assignment) => !outcomes.has(assignment.id) && (assignment.dependsOn ?? []).every((dependency) => outcomes.get(dependency) === "completed"));
            if (!ready.length) {
                if (ordered.some((assignment) => !outcomes.has(assignment.id)))
                    throw new Error("INVALID_FORMATION: dependency graph could not make progress");
                break;
            }
            for (const assignment of ready)
                progressStates.get(assignment.id).status = "running";
            await persistProgress("running");
            if (this.hierarchyDeferred) {
                markDeferred();
                await persistProgress("deferred");
                break;
            }
            let persistenceError;
            await Promise.all(ready.map(async (assignment) => {
                const priorReports = reports.filter((report) => report.status === "completed").map((report) => ({
                    role: report.role,
                    outcome: report.result?.tickResult.outcome ?? "completed",
                    report: report.result?.tickResult.response.slice(0, 6000) ?? report.summary ?? "Completed report is unavailable",
                }));
                const makePrompt = (role, priorFailure) => {
                    const knowledgeContext = formatLegionKnowledgeContext(blackboard);
                    return [
                        LEGION_CORE_RULES,
                        `Coordinator objective: ${objective}`,
                        `Your independent specialist role: ${role}`,
                        `Your assigned work: ${assignment.objective}`,
                        "Return a concise report to the coordinator with findings, completed work, verification evidence, blockers, and next actions. Do not assume access to other agents' streams.",
                        ...(priorFailure ? [`A previous specialist attempt failed before producing any tool results and is not being replayed. Recover the assignment independently. Prior failure: ${priorFailure.slice(0, 1200)}`] : []),
                        ...(priorReports.length ? [`Coordinator-provided prior reports (reference context only): ${JSON.stringify(priorReports)}`] : []),
                        ...(knowledgeContext ? [knowledgeContext] : []),
                    ].join("\n\n");
                };
                try {
                    const deferredChild = resumeState?.deferredChildren?.[assignment.id];
                    const childPrompt = deferredChild
                        ? ["Resume this existing independent specialist stream from its saved safe-boundary checkpoint.", "Inspect the saved conversation and tool results before acting. Do not repeat completed actions or replay uncertain side effects; reconcile them first. Continue only the outstanding parts of the assignment and report what remains.", makePrompt(assignment.role)].join("\n\n")
                        : makePrompt(assignment.role);
                    let result = await this.delegateSubagentTask(childPrompt, parentEngine, deferredChild?.childSessionId, signal, deferredChild ? { activeJsonl: deferredChild.activeJsonl, transcriptJsonl: deferredChild.transcriptJsonl } : undefined);
                    let replacementRole;
                    let attempts = 1;
                    if (result.tickResult.outcome === "failed" && result.tickResult.safeToRetry === true && result.tickResult.toolResults.length === 0) {
                        const fallback = classifyTaskForLegion({ taskDescription: assignment.objective, strategy: "tactical_strike", maxSpecialists: 1, excludedRoles: [assignment.id, assignment.role] }).assignments[0];
                        if (fallback) {
                            await persistChild({ ...assignment, id: `${assignment.id}-attempt-1` }, result);
                            replacementRole = fallback.role;
                            attempts = 2;
                            result = await this.delegateSubagentTask(makePrompt(replacementRole, "The prior attempt ended before invoking any tools."), parentEngine, undefined, signal);
                        }
                    }
                    await persistChild(assignment, result);
                    const assignmentStatus = result.tickResult.outcome === "completed" ? "completed" : result.tickResult.outcome === "deferred" ? "deferred" : "failed";
                    if (assignmentStatus === "completed") {
                        const observations = extractLegionHeuristics(result.tickResult.response).filter((content) => !knownHeuristics.has(content.toLowerCase()));
                        for (const content of observations) {
                            knownHeuristics.add(content.toLowerCase());
                            const createdAt = Date.now();
                            blackboard.push({ content, createdAt, expiresAt: createdAt + LEGION_KNOWLEDGE_TTL_MS });
                        }
                        if (workspaceCwd && observations.length) {
                            try {
                                await this.workspaceKnowledge.store(workspaceCwd, knowledgeStreamId, observations);
                            }
                            catch (error) {
                                this.logger.warn(`[AgentSwarmDispatcher] Could not persist scoped workspace heuristics: ${error instanceof Error ? error.message : String(error)}`);
                            }
                        }
                    }
                    outcomes.set(assignment.id, assignmentStatus);
                    reports.push({ id: assignment.id, role: assignment.role, status: assignmentStatus, result, replacementRole, attempts, ...(assignmentStatus === "failed" ? { reason: "Automatic failover was withheld because retry safety was not established or the specialist did not complete." } : {}) });
                    progressStates.get(assignment.id).status = assignmentStatus;
                }
                catch (error) {
                    if (error instanceof Error && /^(?:SWARM_PROGRESS_PERSISTENCE|SWARM_EXECUTION)_UNCERTAIN:/.test(error.message)) {
                        persistenceError ??= error;
                        return;
                    }
                    if (error instanceof Error && error.message.startsWith("AGENT_HIERARCHY_DEFERRED:")) {
                        outcomes.set(assignment.id, "deferred");
                        progressStates.get(assignment.id).status = "deferred";
                        reports.push({ id: assignment.id, role: assignment.role, status: "deferred", reason: "Waiting for the parent hierarchy to resume" });
                        status = "deferred";
                        return;
                    }
                    outcomes.set(assignment.id, "failed");
                    progressStates.get(assignment.id).status = "failed";
                    reports.push({ id: assignment.id, role: assignment.role, status: "failed", reason: error instanceof Error ? error.message : String(error) });
                }
            }));
            if (persistenceError)
                throw persistenceError;
            if (reports.some((report) => report.status === "deferred") || this.hierarchyDeferred) {
                markDeferred();
                await persistProgress("deferred");
                break;
            }
            await persistProgress("running");
        }
        if (status === "completed" && reports.some((report) => report.status === "failed" || report.status === "skipped"))
            status = "partial_failure";
        await persistProgress(status);
        return { objective, status, reports };
    }
    async delegateSubagentTask(taskPrompt, parentEngine, subagentId, signal, checkpoint) {
        signal?.throwIfAborted();
        const config = await this.configService.read();
        if (!agentSwarmFeatureEnabled(config, "legion"))
            throw new Error("AGENT_SWARM_DISABLED: enable Legion before delegating");
        if (this.hierarchyDeferred)
            throw new Error("AGENT_HIERARCHY_DEFERRED: resume the hierarchy before delegating new work");
        const taskId = `task-${newUuid()}`;
        const childSessionId = subagentId ?? `subagent-${taskId}`;
        const lease = this.acquireLock(`session:${childSessionId}`, taskId, Number.POSITIVE_INFINITY);
        let worker;
        let heartbeat;
        let tickStarted = false;
        let childDeferred = false;
        let deferRequested = this.hierarchyDeferred;
        let rejectChildDefer;
        try {
            worker = this.taskCoordinator.resumeDeferredWorker(childSessionId) ?? this.taskCoordinator.dispatchTask(taskId, childSessionId);
            this.activeDelegations += 1;
            heartbeat = setInterval(() => this.taskCoordinator.recordHeartbeat(childSessionId), 10_000);
            heartbeat.unref?.();
            const parentSnapshot = parentEngine.createSnapshot();
            const childEngine = parentEngine.forkSession(childSessionId, checkpoint);
            let propagatedDefer;
            let acknowledgeDefer;
            let failDefer;
            const acknowledged = new Promise((resolve, reject) => { acknowledgeDefer = resolve; failDefer = reject; });
            rejectChildDefer = failDefer;
            void acknowledged.catch(() => undefined);
            const requestChildDefer = async () => {
                deferRequested = true;
                propagatedDefer ??= childEngine.swarmDispatcher.deferHierarchy().then(() => undefined);
                await propagatedDefer;
            };
            this.childDeferRequests.set(childSessionId, { request: requestChildDefer, acknowledged, acknowledge: acknowledgeDefer, fail: failDefer });
            if (this.hierarchyDeferred)
                void requestChildDefer().catch(() => undefined);
            tickStarted = true;
            const tickResult = await childEngine.tick({ prompt: taskPrompt, shouldDefer: () => deferRequested, deferBoundary: config.deferBoundary, ...(signal ? { signal } : {}) });
            if (deferRequested && tickResult.outcome === "deferred")
                childDeferred = true;
            else if (deferRequested)
                this.failChildDefer(childSessionId, new Error(`AGENT_HIERARCHY_DEFER_UNCONFIRMED: child ${childSessionId} settled as ${tickResult.outcome}`));
            this.taskCoordinator.settleWorker(worker.workerId, tickResult.outcome === "completed" ? "completed" : tickResult.outcome === "deferred" ? "deferred" : "failed");
            return {
                taskId,
                childSessionId,
                parentSnapshot,
                tickResult,
                transcript: childEngine.sessionStore.getTranscript().map((message) => ({ role: message.role, content: message.content, timestamp: message.timestamp })),
                activeJsonl: childEngine.sessionStore.getMessages().map((message) => JSON.stringify(message)).join("\n"),
                transcriptJsonl: childEngine.sessionStore.exportJsonl(),
                completedAt: Date.now(),
            };
        }
        catch (error) {
            if (deferRequested)
                rejectChildDefer?.(error instanceof Error ? error : new Error(String(error)));
            if (worker)
                this.taskCoordinator.settleWorker(worker.workerId, "failed");
            if (tickStarted)
                throw new Error(`SWARM_EXECUTION_UNCERTAIN: child ${childSessionId} did not return a terminal result: ${error instanceof Error ? error.message : String(error)}`);
            throw error;
        }
        finally {
            this.releaseLock(`session:${childSessionId}`, lease.lockId);
            if (heartbeat)
                clearInterval(heartbeat);
            if (!childDeferred)
                this.childDeferRequests.delete(childSessionId);
            if (worker)
                this.activeDelegations -= 1;
            if (this.activeDelegations === 0)
                for (const resolve of this.deferWaiters.splice(0))
                    resolve();
        }
    }
}
