/** [LAYER: DOMAIN] */
/**
 * Pure Domain rules, invariants, diagnostics (`RTG-001`..`RTG-008`, `SPI-006`),
 * `GuidedError` pedagogical error model, RuntimeStateGraph integrity verification,
 * and Spider Agent Ergonomics (root-cause clustering, priority queue, playbooks,
 * gate evaluation, report diffing, and semantic footprint matching).
 *
 * Hard Invariant: 0% I/O. Imports only from `src/plumbing/`.
 */

import { sha256Hex, stableStringify } from "../plumbing/canonicalHash.mjs";

export const RUNTIME_MODES = Object.freeze([
  "development",
  "ci",
  "production",
  "readonly",
  "recovery",
  "forensic"
]);

export const APPROVAL_POLICIES = Object.freeze({
  development: "autonomous_safe",
  ci: "ci_gate_only",
  production: "human_approval_required",
  readonly: "readonly",
  recovery: "recovery_mode",
  forensic: "readonly"
});

export const DEFAULT_MODE_BUDGETS = Object.freeze({
  development: Object.freeze({ maxDirectives: 25, maxFiles: 20, maxVerificationFailures: 3 }),
  ci: Object.freeze({ maxDirectives: 0, maxFiles: 0, maxVerificationFailures: 0 }),
  production: Object.freeze({ maxDirectives: 5, maxFiles: 5, maxVerificationFailures: 1 }),
  readonly: Object.freeze({ maxDirectives: 0, maxFiles: 0, maxVerificationFailures: 0 }),
  recovery: Object.freeze({ maxDirectives: 15, maxFiles: 15, maxVerificationFailures: 2 }),
  forensic: Object.freeze({ maxDirectives: 0, maxFiles: 0, maxVerificationFailures: 0 })
});

export const GRAPH_NODE_KINDS = Object.freeze([
  "Intent",
  "Session",
  "Audit",
  "Finding",
  "RepairDirective",
  "MutationPlan",
  "ApprovalDecision",
  "Execution",
  "Verification",
  "Rollback",
  "Replay",
  "RuntimeEvent",
  "HealthSnapshot",
  "BudgetViolation",
  "PolicyViolation",
  "Gate"
]);

export const GRAPH_EDGE_KINDS = Object.freeze([
  "created",
  "triggered",
  "blocked_by",
  "approved_by",
  "executed_by",
  "verified_by",
  "rolled_back_by",
  "introduced",
  "resolved",
  "failed_due_to",
  "replayed_from",
  "belongs_to_session"
]);

export const RTG_DIAGNOSTICS = Object.freeze({
  "RTG-001": {
    code: "RTG-001",
    title: "Orphaned Runtime Graph Node",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Link all session nodes via `belongs_to_session` or prune orphaned state",
    rationale:
      "Every node in a RuntimeStateGraph (other than the root `Session` node) must belong to a valid session so causal replay and compaction remain deterministic.",
    remediation: "Ensure every recorded node includes a valid `sessionId` matching an active `Session` node.",
    example: `graph.addNode(sessionId, "Audit", "Spider Audit #1", { conforms: true });`
  },
  "RTG-002": {
    code: "RTG-002",
    title: "Dangling Runtime Graph Edge",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Ensure both `from` and `to` node IDs exist before adding an edge",
    rationale:
      "Edges referencing missing source or target nodes corrupt causal traversal (`causalView`, `story`, `replay`).",
    remediation: "Verify both endpoint nodes exist in the session graph before linking them.",
    example: `graph.addEdge(sessionId, planNode.id, auditNode.id, "triggered");`
  },
  "RTG-003": {
    code: "RTG-003",
    title: "Unproven Mutation or Execution Chain Violation",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Enforce Proof-Before-Mutation: Audit -> MutationPlan -> Execution",
    rationale:
      "In BroccoliDB, Spider proves and Runtime governs: no `Execution` node may exist without a preceding `MutationPlan`, and no `MutationPlan` may exist without a preceding `Audit`.",
    remediation: "Run `recordAudit()` before `planRepairs()`, and `planRepairs()` before `execute()`.",
    example: `const plan = runtime.planRepairs(sessionId, auditReport);\nruntime.execute(sessionId, plan.planId, executorFn);`
  },
  "RTG-004": {
    code: "RTG-004",
    title: "Replay Hash Divergence",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Re-hydrate from immutable CAS snapshot and audit state drift",
    rationale:
      "When replaying a persisted session, the recomputed canonical `graphHash` must match the live or recorded snapshot hash.",
    remediation: "Inspect the diverging nodes or restore from the last verified CAS snapshot.",
    example: `const replay = runtime.replay(sessionId, { mode: "forensic", liveGraphHash });`
  },
  "RTG-005": {
    code: "RTG-005",
    title: "Snapshot or CAS Blob Cryptographic Corruption",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Quarantine corrupted blob to `.broccolidb/storage/corrupt/` and halt mutation",
    rationale:
      "Every CAS blob and snapshot is verified against its SHA-256 digest on read. A mismatch indicates disk corruption or tampering.",
    remediation: "Inspect `.broccolidb/storage/corrupt/manifest.jsonl` and re-materialize the artifact.",
    example: `const content = cas.readBlob(sha256); // Throws GuidedError(STORAGE_CORRUPT) on mismatch`
  },
  "RTG-006": {
    code: "RTG-006",
    title: "Unlinked Rollback Node",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Link every `Rollback` node to the failed `Execution` via `rolled_back_by`",
    rationale:
      "A rollback must record which failed execution triggered it so post-mortem narratives (`story()`) can explain what recovered.",
    remediation: "Add a `rolled_back_by` edge from the failed `Execution` node to the `Rollback` node.",
    example: `graph.addEdge(sessionId, executionId, rollbackId, "rolled_back_by");`
  },
  "RTG-007": {
    code: "RTG-007",
    title: "Unlinked Post-Mutation Verification",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "WARN",
    sop: "Link post-mutation `Verification` nodes to their `Execution` node via `verified_by`",
    rationale:
      "Every mutation execution must be followed by a verification check linked via `verified_by`.",
    remediation: "Call `runtime.verify(sessionId, postAuditReport)` after `runtime.execute(...)`.",
    example: `runtime.verify(sessionId, postAuditReport);`
  },
  "RTG-008": {
    code: "RTG-008",
    title: "Premature Session Completion with Open Blockers",
    series: "BroccoliDB Runtime Integrity (RTG-0xx)",
    defaultSeverity: "ERROR",
    sop: "Resolve all ERROR findings, failed Gates, and failed Verifications before completing a session",
    rationale:
      "A session cannot be marked `completed` while open `ERROR` findings, non-zero `Gate` exit codes, or failed `Verification` nodes remain unresolved.",
    remediation: "Keep session status as `blocked` or `failed`, or repair and verify all blockers before completion.",
    example: `const state = runtime.state(sessionId); // state.blockers must be empty`
  },
  "SPI-006": {
    code: "SPI-006",
    title: "Disk Parity Reality Drift",
    series: "Spider Reality Shield (SPI-0xx)",
    defaultSeverity: "ERROR",
    sop: "Re-synchronize workspace scan before planning or executing mutations",
    rationale:
      "Cached file hashes in the Spider graph diverge from physical files on disk (`drifted` or `missing`). Acting on a stale graph risks corrupting edits.",
    remediation: "Run `verifyDiskParity()` or re-scan the workspace before applying repairs.",
    example: `const parity = verifyDiskParity(scanner, rootDir, cachedReport);`
  },
  "SPI-108": {
    code: "SPI-108",
    title: "Ghost Coupling / Entangled Co-Mutation",
    series: "Spider Advisory Forensics (SPI-1xx)",
    defaultSeverity: "WARN",
    sop: "Extract shared domain contract or plumbing constant to eliminate hidden co-mutation",
    rationale:
      "Two modules repeatedly change together across historical snapshots (Jaccard similarity > 0.7 across >= 2 sessions) without sharing any structural import edge.",
    remediation: "Centralize the duplicated magic values, schema fields, or implicit protocol in `src/domain/` or `src/plumbing/`.",
    example: `const ghosts = detectGhostCoupling(snapshots, report.nodes);`
  },
  BROCCOLIDB: {
    code: "BROCCOLIDB",
    title: "BroccoliDB: Zero-Dependency Portable Operational Substrate",
    series: "Portable Substrate Trinity",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "Sharded CAS (`CAS:<sha256>`), RFC 1952 Wire Engine, & Governed RuntimeStateGraph (`RTG-001..008`)",
    rationale:
      "Agents express intent; Spider proves structure; BroccoliDB governs state, deduplicates large context blobs in sharded SHA-256 storage with automatic corruption quarantine, synthesizes multi-member RFC 1952 GZIP streams, and enforces proof-before-mutation (`MutationPlan`).",
    remediation: "Use `NodeCasStorage` (`ICasStorage`) for CAS/Wire operations and `BroccoliRuntime` for governed sessions.",
    example: `const cas = new NodeCasStorage(rootDir);\nconst ref = cas.scaleContent(largeOutput, 1024);`
  },
  JOYRIDE: {
    code: "JOYRIDE",
    title: "JoyRide: Bounded, Self-Invalidating Execution Ergonomics Cache",
    series: "Portable Substrate Trinity",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "11-Point Fingerprint Validation, Single-Flight Deduplication, & Secret Redaction",
    rationale:
      "Eliminates redundant file reads, AST scans, and command executions across agent turns while guaranteeing 0% stale reuse after file edits, git HEAD shifts, or approval boundary transitions.",
    remediation: "Use `JoyRideCache` with typed key builders (`createCommandResultCacheKey`, etc.) and `markStale()`.",
    example: `const cache = new JoyRideCache({ maxTotalBytes: 64 * 1024 * 1024 });`
  }
});

/**
 * Verifies a serialized or live `RuntimeStateGraph` session against `RTG-001` through `RTG-008`.
 *
 * @param {{
 *   sessionId: string,
 *   nodes: Array<{ id: string, sessionId?: string, kind: string, label: string, timestamp: number, data?: Object }>,
 *   edges: Array<{ id: string, sessionId?: string, from: string, to: string, kind: string, timestamp: number }>,
 *   graphHash?: string
 * }} graphSnapshot
 * @param {{ status?: string, expectedGraphHash?: string }} [sessionMeta]
 * @returns {{
 *   healthy: boolean,
 *   sessionId: string,
 *   computedGraphHash: string,
 *   violations: Array<{ diagnosticId: string, severity: "ERROR"|"WARN", message: string, nodeId?: string, edgeId?: string }>
 * }}
 */
export function verifyRuntimeGraphIntegrity(graphSnapshot, sessionMeta = {}) {
  const sessionId = graphSnapshot?.sessionId || "unknown-session";
  const nodes = Array.isArray(graphSnapshot?.nodes) ? graphSnapshot.nodes : [];
  const edges = Array.isArray(graphSnapshot?.edges) ? graphSnapshot.edges : [];
  const violations = [];

  const nodeMap = new Map();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // RTG-001: Orphaned node not linked to session
  for (const n of nodes) {
    if (n.sessionId && n.sessionId !== sessionId) {
      violations.push({
        diagnosticId: "RTG-001",
        severity: "ERROR",
        message: `Node '${n.id}' (${n.kind}) belongs to '${n.sessionId}' instead of '${sessionId}'.`,
        nodeId: n.id
      });
    } else if (!n.sessionId && n.kind !== "Session") {
      violations.push({
        diagnosticId: "RTG-001",
        severity: "ERROR",
        message: `Node '${n.id}' (${n.kind}) is missing sessionId linkage.`,
        nodeId: n.id
      });
    }
  }

  // RTG-002: Dangling edge referencing missing node
  for (const e of edges) {
    if (!nodeMap.has(e.from) || !nodeMap.has(e.to)) {
      violations.push({
        diagnosticId: "RTG-002",
        severity: "ERROR",
        message: `Dangling edge '${e.id}' (${e.kind}) references missing node (${e.from} -> ${e.to}).`,
        edgeId: e.id
      });
    }
  }

  // RTG-003: Execution without MutationPlan, or MutationPlan without Audit
  const audits = nodes.filter((n) => n.kind === "Audit");
  const plans = nodes.filter((n) => n.kind === "MutationPlan");
  const executions = nodes.filter((n) => n.kind === "Execution");

  if (plans.length > 0 && audits.length === 0) {
    for (const p of plans) {
      violations.push({
        diagnosticId: "RTG-003",
        severity: "ERROR",
        message: `MutationPlan '${p.id}' created without a preceding Spider Audit node.`,
        nodeId: p.id
      });
    }
  }
  if (executions.length > 0 && plans.length === 0) {
    for (const ex of executions) {
      violations.push({
        diagnosticId: "RTG-003",
        severity: "ERROR",
        message: `Execution '${ex.id}' ran without a governing MutationPlan node.`,
        nodeId: ex.id
      });
    }
  }

  // RTG-004: Replay or snapshot hash divergence
  const canonicalPayload = {
    sessionId,
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges].sort((a, b) => a.id.localeCompare(b.id))
  };
  const computedGraphHash = sha256Hex(stableStringify(canonicalPayload));
  if (
    sessionMeta.expectedGraphHash &&
    sessionMeta.expectedGraphHash !== computedGraphHash
  ) {
    violations.push({
      diagnosticId: "RTG-004",
      severity: "ERROR",
      message: `Runtime graph hash (${computedGraphHash.slice(0, 12)}) diverges from expected hash (${sessionMeta.expectedGraphHash.slice(0, 12)}).`
    });
  }

  // RTG-006: Rollback missing rolled_back_by link
  const rollbacks = nodes.filter((n) => n.kind === "Rollback");
  for (const rb of rollbacks) {
    const linked = edges.some(
      (e) => e.kind === "rolled_back_by" && (e.to === rb.id || e.from === rb.id)
    );
    if (!linked) {
      violations.push({
        diagnosticId: "RTG-006",
        severity: "ERROR",
        message: `Rollback node '${rb.id}' is not linked to an Execution via 'rolled_back_by'.`,
        nodeId: rb.id
      });
    }
  }

  // RTG-007: Verification not linked to Execution (when executions exist)
  const verifications = nodes.filter((n) => n.kind === "Verification");
  for (const vf of verifications) {
    if (executions.length > 0) {
      const linked = edges.some(
        (e) => e.kind === "verified_by" && (e.to === vf.id || e.from === vf.id)
      );
      if (!linked) {
        violations.push({
          diagnosticId: "RTG-007",
          severity: "WARN",
          message: `Verification node '${vf.id}' is not linked to an Execution via 'verified_by'.`,
          nodeId: vf.id
        });
      }
    }
  }

  // RTG-008: Session marked completed with open blockers
  if (sessionMeta.status === "completed") {
    const resolvedFindingIds = new Set(
      edges.filter((e) => e.kind === "resolved").map((e) => e.to)
    );
    const openErrorFindings = nodes.filter(
      (n) =>
        n.kind === "Finding" &&
        n.data?.severity === "ERROR" &&
        !resolvedFindingIds.has(n.id) &&
        !n.data?.resolved
    );
    const failedGates = nodes.filter(
      (n) => n.kind === "Gate" && typeof n.data?.exitCode === "number" && n.data.exitCode !== 0
    );
    const failedVerifications = verifications.filter((n) => n.data?.passed === false);

    if (
      openErrorFindings.length > 0 ||
      failedGates.length > 0 ||
      failedVerifications.length > 0
    ) {
      violations.push({
        diagnosticId: "RTG-008",
        severity: "ERROR",
        message: `Session '${sessionId}' marked 'completed' with open blockers (errors=${openErrorFindings.length}, failedGates=${failedGates.length}, failedVerifications=${failedVerifications.length}).`
      });
    }
  }

  const hasErrors = violations.some((v) => v.severity === "ERROR");
  return {
    healthy: !hasErrors,
    sessionId,
    computedGraphHash,
    violations
  };
}

/**
 * Computes a deterministic 16-character `findingId` for a Spider violation or advisory.
 *
 * @param {{ code?: string, diagnosticId?: string, file?: string, filePath?: string, symbolName?: string, message?: string }} finding
 * @returns {string}
 */
export function stableFindingId(finding) {
  const code = finding.code || finding.diagnosticId || "SPI-000";
  const file = finding.file || finding.filePath || "";
  const symbol = finding.symbolName || "";
  const msg = finding.message || "";
  return sha256Hex(`${code}|${file}|${symbol}|${msg}`).slice(0, 16);
}

const CAUSE_MAP = Object.freeze({
  "SPI-006": { cause: "disk-drift", label: "Disk Parity Reality Drift" },
  "SPI-101": { cause: "domain-purity", label: "Domain I/O Impurity" },
  "SPI-108": { cause: "ghost-coupling", label: "Ghost Coupling / Co-Mutation" },
  "SPI-109": { cause: "plumbing-statefulness", label: "Plumbing Mutable State" },
  "SPI-111": { cause: "logic-drift", label: "Logic Density / Domain Drift" },
  "SPI-201": { cause: "structural-cycle", label: "Circular Dependency" },
  "SPI-202": { cause: "blast-radius", label: "Systemic Blast Radius" },
  "SPI-203": { cause: "module-size", label: "Fat Module / Monolith" },
  "SPI-204": { cause: "orphan-module", label: "Orphaned Module" },
  "SPI-205": { cause: "missing-header", label: "Missing Layer Header" },
  "SPI-206": { cause: "layer-violation", label: "Cross-Zone Coupling Violation" },
  "SPI-208": { cause: "geographic-misalignment", label: "Geographic Misalignment (PGA)" },
  "SPI-209": { cause: "import-depth", label: "Import Depth Exceeded" },
  "SPI-210": { cause: "barrel-bypass", label: "Barrel Sovereignty Bypass" },
  "SPI-300": { cause: "security-risk", label: "Security & Execution Hazard" }
});

/**
 * Clusters findings from a Spider report by root cause for rapid agent triage.
 *
 * @param {Object} report
 * @returns {Array<{
 *   cause: string,
 *   label: string,
 *   codes: string[],
 *   count: number,
 *   hasBlockers: boolean,
 *   findingIds: string[],
 *   files: string[],
 *   remediationHint: string
 * }>}
 */
export function clusterFindingsByCause(report) {
  const allFindings = [
    ...(Array.isArray(report?.violations) ? report.violations : []),
    ...(Array.isArray(report?.advisories) ? report.advisories : [])
  ];
  const buckets = new Map();

  for (const f of allFindings) {
    const code = f.code || f.diagnosticId || "SPI-000";
    const meta = CAUSE_MAP[code] || { cause: "architectural-risk", label: code };
    const findingId = f.findingId || stableFindingId(f);
    const file = f.file || f.filePath || "";
    const isBlocker = f.severity === "ERROR";

    if (!buckets.has(meta.cause)) {
      buckets.set(meta.cause, {
        cause: meta.cause,
        label: meta.label,
        codes: [code],
        count: 0,
        hasBlockers: false,
        findingIds: [],
        files: [],
        remediationHint: f.sop || f.message || meta.label
      });
    }
    const bucket = buckets.get(meta.cause);
    bucket.count += 1;
    if (isBlocker) bucket.hasBlockers = true;
    if (!bucket.codes.includes(code)) bucket.codes.push(code);
    bucket.findingIds.push(findingId);
    if (file && !bucket.files.includes(file)) bucket.files.push(file);
  }

  return Array.from(buckets.values()).sort((a, b) => {
    if (a.hasBlockers !== b.hasBlockers) return a.hasBlockers ? -1 : 1;
    return b.count - a.count;
  });
}

/**
 * Builds a single priority-ordered work queue (`drift` -> `blocker` -> `warning`) for agent execution.
 *
 * @param {Object} report
 * @param {string[]} [driftedFiles=[]]
 * @returns {Array<{
 *   rank: number,
 *   kind: "drift"|"blocker"|"warning",
 *   code: string,
 *   findingId: string,
 *   file: string,
 *   line: number,
 *   summary: string,
 *   sop: string,
 *   verificationCommand: string
 * }>}
 */
export function buildPriorityQueue(report, driftedFiles = []) {
  const items = [];
  let rank = 1;

  for (const file of driftedFiles) {
    items.push({
      rank: rank++,
      kind: "drift",
      code: "SPI-006",
      findingId: stableFindingId({ code: "SPI-006", file, message: "Disk drift" }),
      file,
      line: 1,
      summary: `[SPI-006] Disk drift on ${file} — re-scan workspace before editing`,
      sop: "RESYNC_WORKSPACE",
      verificationCommand: `node ./bin/joy-check.mjs . --scope ${file}`
    });
  }

  for (const v of report?.violations || []) {
    const file = v.file || v.filePath || "";
    items.push({
      rank: rank++,
      kind: "blocker",
      code: v.code || "SPI-000",
      findingId: v.findingId || stableFindingId(v),
      file,
      line: v.line || 1,
      summary: `[${v.code}] ${file}:${v.line || 1} — ${v.message}`,
      sop: v.sop || "REPAIR_VIOLATION",
      verificationCommand: file
        ? `node ./bin/joy-check.mjs . --scope ${file}`
        : "node ./bin/joy-check.mjs ."
    });
  }

  for (const a of report?.advisories || []) {
    const file = a.file || a.filePath || "";
    items.push({
      rank: rank++,
      kind: "warning",
      code: a.code || "SPI-000",
      findingId: a.findingId || stableFindingId(a),
      file,
      line: a.line || 1,
      summary: `[${a.code}] ${file}:${a.line || 1} — ${a.message}`,
      sop: a.sop || "INVESTIGATE_ADVISORY",
      verificationCommand: file
        ? `node ./bin/joy-check.mjs . --scope ${file}`
        : "node ./bin/joy-check.mjs ."
    });
  }

  return items;
}

/**
 * Generates an ordered, deterministic 3-step agent remediation playbook.
 *
 * @param {Object} report
 * @param {string[]} [driftedFiles=[]]
 * @returns {Array<{ order: number, phase: "resync"|"repair"|"verify"|"investigate", action: string, command: string }>}
 */
export function buildAgentPlaybook(report, driftedFiles = []) {
  const steps = [];
  let order = 1;

  if (driftedFiles.length > 0) {
    steps.push({
      order: order++,
      phase: "resync",
      action: `Re-synchronize ${driftedFiles.length} drifted file(s) from disk before mutating.`,
      command: "node ./bin/joy-check.mjs ."
    });
  }

  const violations = report?.violations || [];
  const autoHealable = violations.filter((v) =>
    ["SPI-205", "SPI-208", "SPI-109"].includes(v.code)
  );
  if (autoHealable.length > 0) {
    steps.push({
      order: order++,
      phase: "repair",
      action: `Auto-heal ${autoHealable.length} header/statelessness violation(s) via RefactorHealer.`,
      command: "node ./bin/joy-check.mjs . --heal --heal-stateless"
    });
  }

  const manualBlockers = violations.filter(
    (v) => !["SPI-205", "SPI-208", "SPI-109"].includes(v.code)
  );
  for (const b of manualBlockers.slice(0, 5)) {
    steps.push({
      order: order++,
      phase: "repair",
      action: `Fix [${b.code}] in ${b.file || "workspace"}: ${b.sop || b.message}`,
      command: `node ./bin/joy-check.mjs --explain ${b.code}`
    });
  }

  if (violations.length > 0 || driftedFiles.length > 0) {
    steps.push({
      order: order++,
      phase: "verify",
      action: "Re-run strict Spider audit to prove zero remaining blockers.",
      command: "node ./bin/joy-check.mjs . --theme strict"
    });
  } else if ((report?.advisories || []).length > 0) {
    steps.push({
      order: order++,
      phase: "investigate",
      action: `Review ${report.advisories.length} non-blocking architectural advisory item(s).`,
      command: "node ./bin/joy-check.mjs . --doctor"
    });
  }

  return steps;
}

/**
 * Evaluates a Spider report against a CI/pre-edit Gate Policy.
 *
 * @param {Object} report
 * @param {{
 *   blockOnErrors?: boolean,
 *   blockOnWarnings?: boolean,
 *   blockOnDrift?: boolean,
 *   maxErrorCount?: number,
 *   maxWarningCount?: number,
 *   driftedFiles?: string[]
 * }} [policy]
 * @returns {{
 *   passed: boolean,
 *   verdict: "pass"|"warn"|"fail",
 *   conclusion: "success"|"neutral"|"failure",
 *   exitCode: 0|1,
 *   blockedReasons: string[]
 * }}
 */
export function evaluateSpiderGate(report, policy = {}) {
  const blockOnErrors = policy.blockOnErrors ?? true;
  const blockOnWarnings = policy.blockOnWarnings ?? false;
  const blockOnDrift = policy.blockOnDrift ?? true;
  const maxErrors = policy.maxErrorCount ?? 0;
  const maxWarnings = policy.maxWarningCount ?? Infinity;
  const driftedFiles = policy.driftedFiles || [];

  const errorCount = (report?.violations || []).length;
  const warningCount = (report?.advisories || []).length;
  const blockedReasons = [];

  if (blockOnDrift && driftedFiles.length > 0) {
    blockedReasons.push(`${driftedFiles.length} drifted file(s) violate disk parity (SPI-006)`);
  }
  if (blockOnErrors && errorCount > maxErrors) {
    blockedReasons.push(`${errorCount} blocking violation(s) exceed maxErrorCount (${maxErrors})`);
  }
  if (blockOnWarnings && warningCount > maxWarnings) {
    blockedReasons.push(`${warningCount} advisory warning(s) exceed maxWarningCount (${maxWarnings})`);
  }

  const passed = blockedReasons.length === 0;
  const verdict = !passed ? "fail" : warningCount > 0 ? "warn" : "pass";
  const conclusion = !passed ? "failure" : warningCount > 0 ? "neutral" : "success";

  return {
    passed,
    verdict,
    conclusion,
    exitCode: passed ? 0 : 1,
    blockedReasons
  };
}

/**
 * Computes the delta between two Spider audit reports (`before` vs. `after`).
 *
 * @param {Object} beforeReport
 * @param {Object} afterReport
 * @returns {{
 *   introduced: Object[],
 *   resolved: Object[],
 *   persistent: Object[],
 *   entropyDelta: number,
 *   stabilityDelta: number,
 *   verdictChanged: boolean
 * }}
 */
export function diffSpiderReports(beforeReport, afterReport) {
  const beforeItems = [
    ...(beforeReport?.violations || []),
    ...(beforeReport?.advisories || [])
  ];
  const afterItems = [
    ...(afterReport?.violations || []),
    ...(afterReport?.advisories || [])
  ];

  const beforeMap = new Map(beforeItems.map((f) => [f.findingId || stableFindingId(f), f]));
  const afterMap = new Map(afterItems.map((f) => [f.findingId || stableFindingId(f), f]));

  const introduced = [];
  const resolved = [];
  const persistent = [];

  for (const [id, item] of afterMap.entries()) {
    if (beforeMap.has(id)) persistent.push(item);
    else introduced.push(item);
  }
  for (const [id, item] of beforeMap.entries()) {
    if (!afterMap.has(id)) resolved.push(item);
  }

  const beforeEntropy = beforeReport?.entropy?.entropyScore ?? 0;
  const afterEntropy = afterReport?.entropy?.entropyScore ?? 0;
  const beforeStability = beforeReport?.entropy?.stabilityIndex ?? 100;
  const afterStability = afterReport?.entropy?.stabilityIndex ?? 100;

  return {
    introduced,
    resolved,
    persistent,
    entropyDelta: Number((afterEntropy - beforeEntropy).toFixed(4)),
    stabilityDelta: Number((afterStability - beforeStability).toFixed(2)),
    verdictChanged: Boolean(beforeReport?.conforms) !== Boolean(afterReport?.conforms)
  };
}

/**
 * Compares exported symbol footprints before and after a refactoring/move to detect
 * semantic identity preservation (`exact` vs. `high` vs. `none` move confidence).
 *
 * @param {Array<Object>} beforeFootprints
 * @param {Array<Object>} afterFootprints
 * @returns {Array<{
 *   symbolName: string,
 *   kind: string,
 *   previousLocation: string,
 *   currentLocation: string,
 *   moved: boolean,
 *   moveConfidence: "exact"|"high"|"none",
 *   signatureHash: string,
 *   astNormalizedHash: string
 * }>}
 */
export function compareSemanticFootprints(beforeFootprints = [], afterFootprints = []) {
  const beforeByName = new Map();
  for (const fp of beforeFootprints) {
    beforeByName.set(`${fp.kind}:${fp.symbolName}`, fp);
  }

  const results = [];
  for (const after of afterFootprints) {
    const key = `${after.kind}:${after.symbolName}`;
    const prev = beforeByName.get(key);
    if (!prev) continue;

    const moved = prev.filePath !== after.filePath;
    let moveConfidence = "none";
    if (prev.astNormalizedHash === after.astNormalizedHash) {
      moveConfidence = "exact";
    } else if (prev.signatureHash === after.signatureHash) {
      moveConfidence = "high";
    }

    results.push({
      symbolName: after.symbolName,
      kind: after.kind,
      previousLocation: prev.filePath,
      currentLocation: after.filePath,
      moved,
      moveConfidence,
      signatureHash: after.signatureHash,
      astNormalizedHash: after.astNormalizedHash
    });
  }

  return results;
}
