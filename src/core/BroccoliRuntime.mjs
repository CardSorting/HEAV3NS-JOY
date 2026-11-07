/** [LAYER: CORE] */
/**
 * BroccoliDB Zero-Dependency Governed Operational Runtime (`BroccoliRuntime`).
 *
 * Doctrine: "Agents express intent. Capabilities validate. Runtime governs. Spider proves.
 * StateGraph preserves truth. Snapshots preserve continuity. Replay reconstructs causality."
 *
 * Hard Invariant: 0% raw I/O, 0% `ui` imports. Persists via `ICasStorage` contract.
 */

import { stableStringify } from "../plumbing/canonicalHash.mjs";
import { GuidedError } from "../domain/interfaces/ICasStorage.mjs";
import {
  RUNTIME_MODES,
  APPROVAL_POLICIES,
  DEFAULT_MODE_BUDGETS,
  verifyRuntimeGraphIntegrity,
  diffSpiderReports,
  stableFindingId
} from "../domain/broccoliRules.mjs";
import {
  RuntimeStateGraph,
  migrateRuntimeGraph,
  projectReplayForMode
} from "./RuntimeStateGraph.mjs";

export class BroccoliRuntime {
  /**
   * @param {{
   *   casStorage?: import("../domain/interfaces/ICasStorage.mjs").ICasStorage,
   *   mode?: string,
   *   budgets?: Object
   * }} [options]
   */
  constructor(options = {}) {
    this.casStorage = options.casStorage || null;
    this.mode = options.mode || "development";
    this.budgets = {
      ...DEFAULT_MODE_BUDGETS,
      ...(options.budgets || {})
    };
    this.lifecycleState = "new";
    this.graph = new RuntimeStateGraph();
    /** @type {Map<string, Object>} */
    this.sessions = new Map();
    /** @type {Map<string, Object>} */
    this.plans = new Map();
    /** @type {Map<string, Object>} */
    this.lastAudits = new Map();
  }

  start() {
    if (this.lifecycleState === "started") return;
    if (this.lifecycleState === "stopped") {
      throw new GuidedError({
        code: "LIFECYCLE_STATE_ERROR",
        message: "BroccoliRuntime cannot be restarted after stop()",
        likelyCause: "Attempted to reuse a terminated runtime instance.",
        suggestedFix: "Instantiate a fresh BroccoliRuntime instance."
      });
    }
    this.lifecycleState = "started";
  }

  stop() {
    this.lifecycleState = "stopped";
  }

  flush() {
    this.#assertOperational("flush");
  }

  health() {
    return {
      service: "BroccoliRuntime",
      state: this.lifecycleState,
      operational: this.lifecycleState === "started",
      mode: this.mode,
      approvalPolicy: APPROVAL_POLICIES[this.mode],
      activeSessions: this.sessions.size
    };
  }

  /**
   * Switches runtime mode (`development`, `ci`, `production`, `readonly`, `recovery`, `forensic`).
   * @param {string} mode
   */
  setMode(mode) {
    this.#assertOperational("setMode");
    if (!RUNTIME_MODES.includes(mode)) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Unsupported runtime mode '${mode}'`,
        likelyCause: "Provided mode is not one of the 6 canonical BroccoliDB modes.",
        suggestedFix: `Use one of: ${RUNTIME_MODES.join(", ")}`
      });
    }
    this.mode = mode;
  }

  /**
   * Starts a governed orchestration session and records `Session` + `Intent` nodes.
   *
   * @param {{ sessionId?: string, taskId?: string, agentId?: string, intent: string }} params
   * @returns {Object}
   */
  beginSession({ sessionId, taskId = "task-1", agentId = "agent-1", intent }) {
    this.#assertOperational("beginSession");
    const id = sessionId || `sess-${Date.now()}`;
    const sessionNode = this.graph.addNode(id, "Session", `Session ${id}`, {
      taskId,
      agentId,
      mode: this.mode
    });
    const intentNode = this.graph.addNode(id, "Intent", intent || "Architectural task", {
      taskId,
      agentId
    });
    this.graph.addEdge(id, intentNode.id, sessionNode.id, "belongs_to_session");

    const sessionRecord = {
      sessionId: id,
      sessionNodeId: sessionNode.id,
      intentNodeId: intentNode.id,
      taskId,
      agentId,
      mode: this.mode,
      status: "active",
      startedAt: Date.now(),
      failureReason: null,
      verificationFailures: 0
    };
    this.sessions.set(id, sessionRecord);
    return sessionRecord;
  }

  /**
   * Records a Spider Audit report in the session graph without mutating any files.
   * Scales large report payloads into `ICasStorage` if configured.
   *
   * @param {string} sessionId
   * @param {Object} report
   * @returns {{ auditNode: Object, findingNodes: Object[] }}
   */
  recordAudit(sessionId, report) {
    this.#assertOperational("recordAudit");
    const session = this.#getSession(sessionId);
    const serialized = stableStringify(report);
    const casRef = this.casStorage ? this.casStorage.scaleContent(serialized, 1024) : null;

    const auditNode = this.graph.addNode(
      sessionId,
      "Audit",
      `Spider Audit (${report.conforms ? "PASS" : "FAIL"})`,
      {
        conforms: Boolean(report.conforms),
        violationCount: (report.violations || []).length,
        advisoryCount: (report.advisories || []).length,
        stabilityIndex: report.entropy?.stabilityIndex ?? 100,
        casRef
      }
    );
    this.graph.addEdge(sessionId, auditNode.id, session.sessionNodeId, "belongs_to_session");
    this.graph.addEdge(sessionId, session.intentNodeId, auditNode.id, "triggered");

    const findingNodes = [];
    for (const v of report.violations || []) {
      const findingId = v.findingId || stableFindingId(v);
      const fNode = this.graph.addNode(
        sessionId,
        "Finding",
        `[${v.code}] ${v.file || "workspace"}`,
        {
          findingId,
          code: v.code,
          severity: "ERROR",
          file: v.file || "",
          line: v.line || 1,
          message: v.message,
          sop: v.sop || "",
          resolved: false
        }
      );
      this.graph.addEdge(sessionId, auditNode.id, fNode.id, "created");
      findingNodes.push(fNode);
    }

    this.lastAudits.set(sessionId, { auditNode, report: structuredClone(report), findingNodes });
    return { auditNode, findingNodes };
  }

  /**
   * Records a CI/pre-edit Gate evaluation node in the session graph.
   * @param {string} sessionId
   * @param {{ passed: boolean, verdict: string, exitCode: number, blockedReasons?: string[] }} gateResult
   * @returns {Object}
   */
  recordGate(sessionId, gateResult) {
    this.#assertOperational("recordGate");
    const session = this.#getSession(sessionId);
    const gateNode = this.graph.addNode(
      sessionId,
      "Gate",
      `Gate (${gateResult.verdict.toUpperCase()})`,
      {
        passed: gateResult.passed,
        verdict: gateResult.verdict,
        exitCode: gateResult.exitCode,
        blockedReasons: gateResult.blockedReasons || []
      }
    );
    this.graph.addEdge(sessionId, gateNode.id, session.sessionNodeId, "belongs_to_session");
    if (!gateResult.passed) {
      session.status = "blocked";
    }
    return gateNode;
  }

  /**
   * Plans repairs from a recorded Spider Audit (`MutationPlan`).
   * Enforces Proof-Before-Mutation (`RTG-003`) and mode budgets (`BUDGET_EXCEEDED`).
   *
   * @param {string} sessionId
   * @param {Object} [report]
   * @returns {Object}
   */
  planRepairs(sessionId, report) {
    this.#assertOperational("planRepairs");
    const session = this.#getSession(sessionId);
    const lastAudit = this.lastAudits.get(sessionId);
    const activeReport = report || lastAudit?.report;

    if (!lastAudit || !activeReport) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: "Cannot create a MutationPlan before recording a Spider Audit (RTG-003)",
        likelyCause: "planRepairs() was called before recordAudit().",
        suggestedFix: "Call runtime.recordAudit(sessionId, spiderReport) first."
      });
    }

    const directives = (activeReport.violations || []).map((v, idx) => {
      const isAutoSafe = ["SPI-205", "SPI-208", "SPI-109"].includes(v.code);
      return {
        directiveId: `dir-${idx + 1}-${(v.findingId || stableFindingId(v)).slice(0, 8)}`,
        code: v.code,
        targetFile: v.file || "workspace",
        action: v.sop || v.message,
        riskLevel: isAutoSafe ? "low" : v.code === "SPI-201" ? "high" : "medium",
        verificationCommand: v.file
          ? `node ./bin/joy-check.mjs . --scope ${v.file}`
          : "node ./bin/joy-check.mjs ."
      };
    });

    const touchedFiles = [...new Set(directives.map((d) => d.targetFile))];
    const budget = this.budgets[this.mode] || DEFAULT_MODE_BUDGETS.development;

    if (directives.length > budget.maxDirectives || touchedFiles.length > budget.maxFiles) {
      this.graph.addNode(sessionId, "BudgetViolation", "Mutation budget exceeded", {
        mode: this.mode,
        directives: directives.length,
        maxDirectives: budget.maxDirectives,
        files: touchedFiles.length,
        maxFiles: budget.maxFiles
      });
      session.status = "blocked";
      throw new GuidedError({
        code: "BUDGET_EXCEEDED",
        message: `MutationPlan (${directives.length} directives across ${touchedFiles.length} files) exceeds '${this.mode}' mode budget (maxDirectives=${budget.maxDirectives}, maxFiles=${budget.maxFiles})`,
        likelyCause: `Current runtime mode '${this.mode}' restricts mutation scope.`,
        suggestedFix: "Scope the repair to fewer files or switch to 'development' / 'recovery' mode."
      });
    }

    const planNode = this.graph.addNode(
      sessionId,
      "MutationPlan",
      `MutationPlan (${directives.length} directives)`,
      {
        directiveCount: directives.length,
        touchedFiles,
        directives
      }
    );
    this.graph.addEdge(sessionId, lastAudit.auditNode.id, planNode.id, "triggered");

    const plan = {
      planId: planNode.id,
      sessionId,
      auditNodeId: lastAudit.auditNode.id,
      directives,
      touchedFiles,
      requiresHumanApproval:
        this.mode === "production" || directives.some((d) => d.riskLevel === "high")
    };
    this.plans.set(plan.planId, plan);
    return plan;
  }

  /**
   * Returns a non-mutating preview of a planned `MutationPlan`.
   * @param {string} sessionId
   * @param {string} planId
   * @returns {Object}
   */
  preview(sessionId, planId) {
    this.#assertOperational("preview");
    this.#getSession(sessionId);
    const plan = this.plans.get(planId);
    if (!plan || plan.sessionId !== sessionId) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `MutationPlan '${planId}' not found for session '${sessionId}'`,
        likelyCause: "Invalid planId or session mismatch.",
        suggestedFix: "Call runtime.planRepairs(sessionId) first."
      });
    }
    return {
      readonly: true,
      mode: this.mode,
      approvalPolicy: APPROVAL_POLICIES[this.mode],
      ...structuredClone(plan)
    };
  }

  /**
   * Sole mutation boundary: executes a planned `MutationPlan` with pre-mutation backup
   * and automatic rollback if `mutationFn` throws.
   *
   * @param {string} sessionId
   * @param {string} planId
   * @param {(plan: Object) => any} mutationFn
   * @param {{ approved?: boolean, rollbackFn?: () => void }} [options]
   * @returns {{ executionNode: Object, result: any }}
   */
  execute(sessionId, planId, mutationFn, options = {}) {
    this.#assertOperational("execute");
    const session = this.#getSession(sessionId);
    const plan = this.plans.get(planId);

    if (!plan || plan.sessionId !== sessionId) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Cannot execute unknown MutationPlan '${planId}' (RTG-003)`,
        likelyCause: "Attempted to execute mutations without a valid MutationPlan.",
        suggestedFix: "Call runtime.planRepairs(sessionId) before execute()."
      });
    }

    if (["readonly", "ci", "forensic"].includes(this.mode)) {
      this.graph.addNode(sessionId, "PolicyViolation", `Mutation blocked in ${this.mode} mode`, {
        mode: this.mode,
        planId
      });
      session.status = "blocked";
      throw new GuidedError({
        code: "POLICY_BLOCKED",
        message: `Execution blocked: runtime mode '${this.mode}' is non-mutating`,
        likelyCause: `Policy '${APPROVAL_POLICIES[this.mode]}' forbids workspace mutations.`,
        suggestedFix: "Switch to 'development' or 'recovery' mode via runtime.setMode()."
      });
    }

    if (this.mode === "production" && !options.approved) {
      this.graph.addNode(sessionId, "PolicyViolation", "Human approval required in production", {
        mode: this.mode,
        planId
      });
      session.status = "blocked";
      throw new GuidedError({
        code: "POLICY_BLOCKED",
        message: "Execution in 'production' mode requires explicit approval",
        likelyCause: "options.approved was not set to true.",
        suggestedFix: "Pass { approved: true } after human review of runtime.preview()."
      });
    }

    if (options.approved) {
      const approvalNode = this.graph.addNode(
        sessionId,
        "ApprovalDecision",
        `Approved ${planId}`,
        { approved: true, mode: this.mode }
      );
      this.graph.addEdge(sessionId, planId, approvalNode.id, "approved_by");
    }

    const executionNode = this.graph.addNode(
      sessionId,
      "Execution",
      `Execute ${planId}`,
      { planId, status: "running" }
    );
    this.graph.addEdge(sessionId, planId, executionNode.id, "executed_by");

    try {
      const result = mutationFn(plan);
      executionNode.data.status = "succeeded";
      return { executionNode, result };
    } catch (err) {
      executionNode.data.status = "failed";
      executionNode.data.error = err.message;
      if (typeof options.rollbackFn === "function") {
        options.rollbackFn();
      }
      const rollbackNode = this.graph.addNode(
        sessionId,
        "Rollback",
        `Rollback ${executionNode.id}`,
        { reason: err.message, restoredFiles: plan.touchedFiles }
      );
      this.graph.addEdge(sessionId, executionNode.id, rollbackNode.id, "rolled_back_by");
      session.status = "rolled_back";
      session.failureReason = err.message;
      throw err;
    }
  }

  /**
   * Verifies workspace state after an `Execution` by diffing the new Spider report
   * against the pre-mutation audit report and linking via `verified_by` (`RTG-007`).
   *
   * @param {string} sessionId
   * @param {Object} postAuditReport
   * @returns {{ passed: boolean, verificationNode: Object, diff: Object }}
   */
  verify(sessionId, postAuditReport) {
    this.#assertOperational("verify");
    const session = this.#getSession(sessionId);
    const lastAudit = this.lastAudits.get(sessionId);
    const executions = this.graph.getNodes(sessionId, "Execution");
    const lastExecution = executions[executions.length - 1];

    const diff = lastAudit
      ? diffSpiderReports(lastAudit.report, postAuditReport)
      : { introduced: [], resolved: [], persistent: [], entropyDelta: 0, stabilityDelta: 0 };

    const passed = Boolean(postAuditReport.conforms) && diff.introduced.length === 0;
    const verificationNode = this.graph.addNode(
      sessionId,
      "Verification",
      `Post-Mutation Verification (${passed ? "PASS" : "FAIL"})`,
      {
        passed,
        resolvedCount: diff.resolved.length,
        introducedCount: diff.introduced.length,
        remainingCount: (postAuditReport.violations || []).length
      }
    );

    if (lastExecution) {
      this.graph.addEdge(sessionId, lastExecution.id, verificationNode.id, "verified_by");
    }

    if (lastAudit && diff.resolved.length > 0) {
      const resolvedIds = new Set(diff.resolved.map((r) => r.findingId || stableFindingId(r)));
      for (const fNode of lastAudit.findingNodes || []) {
        if (resolvedIds.has(fNode.data?.findingId)) {
          fNode.data.resolved = true;
          this.graph.addEdge(sessionId, verificationNode.id, fNode.id, "resolved");
        }
      }
    }

    if (passed) {
      session.status = "completed";
    } else {
      session.verificationFailures += 1;
      session.status = "failed";
    }

    return { passed, verificationNode, diff };
  }

  /**
   * Validates `RTG-001`..`RTG-008` on the session graph and persists a verified snapshot.
   * Refuses to snapshot if any `RTG-0xx` integrity error is present.
   *
   * @param {string} sessionId
   * @returns {{ snapshotId: string, graph: Object, integrity: Object }}
   */
  snapshot(sessionId) {
    this.#assertOperational("snapshot");
    const session = this.#getSession(sessionId);
    const graphSnap = this.graph.snapshot(sessionId);
    const integrity = verifyRuntimeGraphIntegrity(graphSnap, { status: session.status });

    if (!integrity.healthy) {
      const first = integrity.violations[0];
      throw new GuidedError({
        code: first.diagnosticId,
        message: `Refusing to persist corrupt RuntimeStateGraph snapshot: ${first.message}`,
        likelyCause: `Integrity check failed with ${integrity.violations.length} violation(s).`,
        suggestedFix: `Run joy-check --explain ${first.diagnosticId} and resolve graph linkage before snapshotting.`
      });
    }

    const payload = {
      snapshotId: `snap-${sessionId}-${Date.now()}`,
      sessionId,
      status: session.status,
      mode: this.mode,
      graph: graphSnap,
      integrity
    };

    if (this.casStorage) {
      this.casStorage.saveSnapshot(payload);
    }

    return payload;
  }

  /**
   * Returns current operator state projection (`state`, `blockers`, `summary`).
   * @param {string} sessionId
   */
  state(sessionId) {
    this.#assertOperational("state");
    const session = this.#getSession(sessionId);
    const graph = this.graph.snapshot(sessionId);
    const blockers = this.blockers(sessionId);
    return {
      sessionId,
      status: session.status,
      mode: this.mode,
      approvalPolicy: APPROVAL_POLICIES[this.mode],
      blockers,
      graphHash: graph.graphHash,
      counts: {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        findings: graph.nodes.filter((n) => n.kind === "Finding").length,
        plans: graph.nodes.filter((n) => n.kind === "MutationPlan").length,
        executions: graph.nodes.filter((n) => n.kind === "Execution").length,
        verifications: graph.nodes.filter((n) => n.kind === "Verification").length,
        rollbacks: graph.nodes.filter((n) => n.kind === "Rollback").length
      }
    };
  }

  /**
   * Returns open blockers for `sessionId`.
   * @param {string} sessionId
   */
  blockers(sessionId) {
    const nodes = this.graph.getNodes(sessionId);
    const list = [];
    for (const n of nodes) {
      if (n.kind === "Finding" && n.data?.severity === "ERROR" && !n.data?.resolved) {
        list.push({ kind: "finding", nodeId: n.id, message: n.label, data: n.data });
      } else if (n.kind === "BudgetViolation" || n.kind === "PolicyViolation") {
        list.push({ kind: "policy", nodeId: n.id, message: n.label, data: n.data });
      } else if (n.kind === "Gate" && n.data?.exitCode !== 0) {
        list.push({ kind: "gate", nodeId: n.id, message: n.label, data: n.data });
      }
    }
    return list;
  }

  /**
   * Returns a chronological timeline of all session events with relative `+offsetMs`.
   * @param {string} sessionId
   * @returns {Array<{ nodeId: string, kind: string, label: string, timestamp: number, offsetMs: number }>}
   */
  timeline(sessionId) {
    this.#assertOperational("timeline");
    this.#getSession(sessionId);
    const nodes = [...this.graph.getNodes(sessionId)].sort((a, b) => a.timestamp - b.timestamp);
    const t0 = nodes[0]?.timestamp || 0;
    return nodes.map((n) => ({
      nodeId: n.id,
      kind: n.kind,
      label: n.label,
      timestamp: n.timestamp,
      offsetMs: Math.max(0, n.timestamp - t0)
    }));
  }

  /**
   * Computes prioritized, policy-aware next operator actions (`RuntimeOperator.nextActions`).
   * @param {string} sessionId
   * @returns {Array<{ priority: number, action: string, command: string, riskLevel: string }>}
   */
  nextActions(sessionId) {
    this.#assertOperational("nextActions");
    this.#getSession(sessionId);
    const openBlockers = this.blockers(sessionId);
    const actions = [];
    let priority = 1;

    for (const b of openBlockers) {
      if (b.kind === "finding") {
        const code = b.data?.code || "SPI-205";
        const file = b.data?.file || "";
        const isAutoSafe = ["SPI-205", "SPI-208", "SPI-109"].includes(code);
        actions.push({
          priority: priority++,
          action: `Resolve ${b.message}: ${b.data?.sop || b.data?.message || code}`,
          command: isAutoSafe
            ? "node ./bin/joy-check.mjs . --heal --heal-stateless"
            : file
              ? `node ./bin/joy-check.mjs . --scope ${file}`
              : `node ./bin/joy-check.mjs --explain ${code}`,
          riskLevel: isAutoSafe ? "low" : "medium"
        });
      } else if (b.kind === "policy") {
        actions.push({
          priority: priority++,
          action: `Address policy/budget block: ${b.message}`,
          command: "node ./bin/joy-check.mjs . --doctor",
          riskLevel: "medium"
        });
      }
    }

    if (actions.length === 0) {
      actions.push({
        priority: 1,
        action: "Session is clean; persist snapshot or run strict CI gate.",
        command: "node ./bin/joy-check.mjs . --theme strict",
        riskLevel: "low"
      });
    }

    return actions;
  }

  /**
   * Traces causal chains (`Intent` -> `Audit` -> `MutationPlan` -> `Execution` -> `Verification`/`Rollback`).
   * @param {string} sessionId
   */
  causalView(sessionId) {
    this.#assertOperational("causalView");
    this.#getSession(sessionId);
    const nodes = this.graph.getNodes(sessionId);
    const edges = this.graph.getEdges(sessionId);
    return {
      sessionId,
      intents: nodes.filter((n) => n.kind === "Intent"),
      audits: nodes.filter((n) => n.kind === "Audit"),
      plans: nodes.filter((n) => n.kind === "MutationPlan"),
      executions: nodes.filter((n) => n.kind === "Execution"),
      verifications: nodes.filter((n) => n.kind === "Verification"),
      rollbacks: nodes.filter((n) => n.kind === "Rollback"),
      causalEdges: edges.filter((e) => e.kind !== "belongs_to_session")
    };
  }

  /**
   * Explains any single node in `sessionId` along with its inbound and outbound causal edges.
   * @param {string} sessionId
   * @param {string} nodeId
   */
  explainNode(sessionId, nodeId) {
    this.#assertOperational("explainNode");
    this.#getSession(sessionId);
    return this.graph.explainNode(sessionId, nodeId);
  }

  /**
   * Synthesizes a structured causal operator narrative (`story`) for `sessionId`.
   * @param {string} sessionId
   */
  story(sessionId) {
    this.#assertOperational("story");
    const session = this.#getSession(sessionId);
    const nodes = this.graph.getNodes(sessionId);
    const intents = nodes.filter((n) => n.kind === "Intent").map((n) => n.label);
    const executions = nodes.filter((n) => n.kind === "Execution");
    const rollbacks = nodes.filter((n) => n.kind === "Rollback");
    const resolvedFindings = nodes.filter((n) => n.kind === "Finding" && n.data?.resolved);
    const openBlockers = this.blockers(sessionId);

    return {
      sessionId,
      status: session.status,
      whatHappened: `Session '${sessionId}' ran in '${this.mode}' mode with ${nodes.length} state transitions.`,
      why: intents[0] || "Autonomous architectural audit and remediation.",
      whatChanged: `${executions.filter((e) => e.data?.status === "succeeded").length} mutation execution(s) succeeded; ${resolvedFindings.length} finding(s) resolved.`,
      whatFailed: executions
        .filter((e) => e.data?.status === "failed")
        .map((e) => e.data?.error || e.label),
      whatRecovered: rollbacks.map((r) => r.label),
      whatRemainsBlocked: openBlockers.map((b) => b.message)
    };
  }

  /**
   * Reconstructs and projects a read-only session replay from memory or durable `ICasStorage`.
   *
   * @param {string} sessionId
   * @param {{ mode?: "forensic"|"timeline"|"causal"|"verification"|"ci", snapshotId?: string, liveGraphHash?: string }} [options]
   */
  replay(sessionId, options = {}) {
    this.#assertOperational("replay");
    const mode = options.mode || "forensic";
    let graph;
    if (this.casStorage) {
      const loaded = this.casStorage.loadSnapshot(sessionId, options.snapshotId);
      if (loaded?.graph) {
        graph = migrateRuntimeGraph(loaded.graph);
      }
    }
    if (!graph) {
      graph = this.graph.snapshot(sessionId);
    }

    const integrity = verifyRuntimeGraphIntegrity(graph, {
      expectedGraphHash: options.liveGraphHash
    });

    const baseResult = {
      sessionId,
      mode,
      readonly: true,
      healthy: integrity.healthy,
      divergenceDetected: integrity.violations.some((v) => v.diagnosticId === "RTG-004"),
      integrity,
      graph
    };

    return {
      ...baseResult,
      projection: projectReplayForMode(baseResult)
    };
  }

  #assertOperational(op) {
    if (this.lifecycleState !== "started") {
      throw new GuidedError({
        code: "LIFECYCLE_STATE_ERROR",
        message: `BroccoliRuntime.${op}() called while state is '${this.lifecycleState}'`,
        likelyCause: "Runtime was not started via runtime.start() or was already stopped.",
        suggestedFix: "Call runtime.start() before invoking operational methods."
      });
    }
  }

  #getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Unknown session '${sessionId}'`,
        likelyCause: "Session was not initialized via beginSession().",
        suggestedFix: "Call runtime.beginSession({ sessionId, intent }) first."
      });
    }
    return session;
  }
}
