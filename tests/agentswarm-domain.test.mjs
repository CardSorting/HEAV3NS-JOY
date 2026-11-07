/** [LAYER: UI] */
/** AgentSwarm domain (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BroccoliInterAgentMailbox, BroccoliTaskCoordinator, BroccoliTaskDagScheduler, ConvergenceEngineSubstrate, classifyTaskForLegion, completedSwarmReports, escapeSwarmHandoffText, extractLegionHeuristics, formatLegionHandoffText, formatLegionKnowledgeContext, getAgentSwarmEnvironmentOverrides, isReusableLegionObservation, sanitizeAgentSwarmConfig } from "./support/trinity.mjs";

describe("Suite 25: AgentSwarm Domain Substrate", () => {
  it("converges refinements by priority lattice and BFT confidence filtering", () => {
    const engine = new ConvergenceEngineSubstrate();
    const { decisions, resolvedConflicts } = engine.converge([
      { id: "1", role: "product-critic", targetFile: "a.mjs", recommendation: "drop", rationale: "r1", confidence: 0.9 },
      { id: "2", role: "product-strategist", targetFile: "a.mjs", recommendation: "keep", rationale: "r2", confidence: 0.6 },
      { id: "3", role: "ux-architect", targetFile: "b.mjs", recommendation: "move", rationale: "r3", confidence: 0.4 },
      { id: "4", role: "ux-architect", recommendation: "global", rationale: "r4", confidence: 0.8 }
    ]);
    assert.deepEqual(decisions.map((d) => d.id).sort(), ["2", "4"]);
    assert.equal(resolvedConflicts.length, 1);
    assert.equal(resolvedConflicts[0].winningRole, "product-strategist");
    assert.equal(ConvergenceEngineSubstrate.getRolePriority("unknown-role"), 1);
  });

  it("schedules a DAG topologically with failure cascade", () => {
    const dag = new BroccoliTaskDagScheduler();
    dag.addTask("a", "first");
    dag.addTask("b", "second", ["a"]);
    dag.addTask("c", "third", ["b"]);
    dag.addTask("d", "independent");
    assert.deepEqual(dag.getReadyTasks().map((t) => t.id), ["a", "d"]);
    assert.deepEqual(dag.markCompleted("a").map((t) => t.id), ["b", "d"]);
    dag.markFailed("b", "boom");
    const metrics = dag.getMetrics();
    assert.deepEqual(metrics, { total: 4, completed: 1, failed: 1, skipped: 1 });
    assert.equal(dag.isFinished(), false);
    dag.markCompleted("d");
    assert.equal(dag.isFinished(), true);
  });

  it("delivers mailbox messages once and bounds the ring buffer", () => {
    const mailbox = new BroccoliInterAgentMailbox(3);
    mailbox.postMessage("b", "a", "audit", { n: 1 });
    mailbox.postMessage("b", "a", "audit", { n: 2 });
    mailbox.postStatus("a", "ready");
    mailbox.postMessage("b", "a", "error", { n: 3 });
    assert.deepEqual(mailbox.pollInbox("b").map((m) => m.payload.n), [2, 3]);
    assert.deepEqual(mailbox.pollInbox("b"), []);
    assert.equal(mailbox.pollInbox("system")[0].payload.status, "ready");
  });

  it("tracks worker leases, heartbeats, and deferral in the task coordinator", () => {
    const coordinator = new BroccoliTaskCoordinator(5);
    const worker = coordinator.dispatchTask("task-1", "worker-1");
    assert.throws(() => coordinator.dispatchTask("task-1", "worker-2"), /already running/);
    assert.equal(coordinator.getStatus().activeWorkersCount, 1);
    assert.equal(coordinator.recordHeartbeat("worker-1"), true);
    assert.equal(coordinator.recordHeartbeat("ghost"), false);
    assert.equal(coordinator.settleWorker(worker.workerId, "deferred"), true);
    assert.equal(coordinator.resumeDeferredWorker("worker-1").status, "running");
    assert.equal(coordinator.settleWorker("worker-1", "completed"), true);
    assert.equal(coordinator.getStatus().monitoredTasksCount, 0);
    coordinator.startMonitoring(1_000_000);
    coordinator.stopMonitoring();
  });

  it("classifies referenced relative paths without leading slashes", () => {
    const classification = classifyTaskForLegion({
      taskDescription: "Improve UX navigation in app/styles/theme.css and audit docs/findings.md with src/server/worker.ts and tests/worker.test.mjs",
      maxSpecialists: 6
    });
    const ids = classification.assignments.map((assignment) => assignment.id);
    for (const id of ["legion_researcher", "legion_ux_ergonomics", "legion_implementer", "legion_verifier"]) assert.ok(ids.includes(id), id);
    assert.deepEqual(classification.filePartitions.legion_researcher, ["docs/findings.md"]);
    assert.deepEqual(classification.filePartitions.legion_ux_ergonomics, ["app/styles/theme.css"]);
    assert.deepEqual(classification.filePartitions.legion_implementer, ["src/server/worker.ts"]);
    assert.deepEqual(classification.filePartitions.legion_verifier, ["tests/worker.test.mjs"]);
    assert.throws(() => classifyTaskForLegion({ taskDescription: "   " }), /INVALID_LEGION_CLASSIFICATION/);
    assert.equal(classifyTaskForLegion({ taskDescription: "fix the failing test", strategy: "tactical_strike" }).assignments.length, 1);
  });

  it("escapes and byte-bounds handoff text without splitting Unicode", () => {
    assert.equal(escapeSwarmHandoffText("<a href='x'>&</a>"), "&lt;a href=&apos;x&apos;&gt;&amp;&lt;/a&gt;");
    const long = "😀".repeat(500);
    const bounded = formatLegionHandoffText(long, 200);
    assert.ok(new TextEncoder().encode(bounded).length <= 200);
    assert.ok(bounded.endsWith("[report truncated]"));
    assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(bounded), "no lone surrogates");
    assert.equal(formatLegionHandoffText("short", 200), "short");
  });

  it("recovers only complete, consistent deferred roadmaps", () => {
    const assignments = [{ id: "a", role: "r1" }, { id: "b", role: "r2" }];
    const roadmap = { assignments: [{ id: "a", role: "r1", status: "completed", summary: "done" }, { id: "b", role: "r2", status: "deferred" }] };
    assert.deepEqual(completedSwarmReports(assignments, roadmap), [{ id: "a", role: "r1", summary: "done" }]);
    assert.throws(() => completedSwarmReports(assignments, { assignments: [] }), /FORMATION_RESUME_RECONCILIATION_REQUIRED/);
    assert.throws(() => completedSwarmReports(assignments, { assignments: [{ id: "a", role: "WRONG", status: "completed", summary: "s" }, roadmap.assignments[1]] }), /inconsistent/);
  });

  it("sanitizes persisted config and applies environment overrides", () => {
    assert.equal(sanitizeAgentSwarmConfig("garbage").enabled, false);
    assert.equal(sanitizeAgentSwarmConfig("garbage").legion, false);
    const sanitized = sanitizeAgentSwarmConfig({ enabled: true, maxSpecialists: 99, strategy: "nope", deferBoundary: "before_turn", maxInitialReviews: 0 });
    assert.equal(sanitized.maxSpecialists, 8);
    assert.equal(sanitized.strategy, "adaptive");
    assert.equal(sanitized.deferBoundary, "before_turn");
    assert.equal(sanitized.maxInitialReviews, 1);
    const overrides = getAgentSwarmEnvironmentOverrides({
      JOY_SWARM_ENABLED: "on",
      JOY_SWARM_LEGION: "no",
      JOY_SWARM_LEGION_MAX_SPECIALISTS: "12",
      JOY_SWARM_LEGION_STRATEGY: "full_legion",
      JOY_SWARM_DEFER_BOUNDARY: "bogus"
    });
    assert.deepEqual(overrides, { enabled: true, legion: false, strategy: "full_legion", maxSpecialists: 8 });
  });

  it("filters credentials and control characters from shareable heuristics", () => {
    assert.equal(isReusableLegionObservation("Use pnpm test for the unit suite."), true);
    for (const unsafe of ["my password is hunter2", "https://x.test/cb?token=abc123", "line\nbreak", "ghp_" + "a".repeat(30), "https://user:pass@example.com/x", "x".repeat(501), ""]) {
      assert.equal(isReusableLegionObservation(unsafe), false, unsafe.slice(0, 20));
    }
    assert.deepEqual(extractLegionHeuristics("noise\nHeuristic: run tests first\nheuristic: secret value\nHEURISTIC: run tests first"), ["run tests first"]);
    const context = formatLegionKnowledgeContext([{ content: "a <b> & c", createdAt: 1, expiresAt: 2 }]);
    assert.match(context, /trust="untrusted"/);
    assert.match(context, /a &lt;b&gt; &amp; c/);
    assert.equal(formatLegionKnowledgeContext([]), "");
  });
});
