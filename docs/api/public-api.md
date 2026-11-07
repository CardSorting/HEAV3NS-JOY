<!-- [LAYER: UI] -->
# Public API (`src/index.mjs`)

The package `heav3ns-joy` exports **84 frozen symbols** from [`src/index.mjs`](../../src/index.mjs) with zero external dependencies.

Guardrail: `npm run docs:check` ([`bin/docs-check.mjs`](../../bin/docs-check.mjs)) verifies that the live export count of `src/index.mjs` matches this specification.

---

## 1. High-Level Composition Root Runners (`runJoy*`)

```js
import {
  runJoyAudit,
  runJoyCheckPhase,
  runJoySkeleton,
  runJoyHeal,
  runJoyHealStatelessness,
  runJoyPlanMove,
  runJoyInit,
  runJoyDocsCheck
} from "heav3ns-joy";
```

| Function | Signature | Description |
|----------|-----------|-------------|
| `runJoyAudit` | `(targetDir, options?)` | Runs a complete Joyzoning & Spider forensic audit (`theme: "strict" \| "relaxed" \| "safety"`). |
| `runJoyCheckPhase` | `(targetDir, options?)` | Runs a unified Spider check (`phase: "pre-edit" \| "post-edit" \| "ci" \| "delta"`, `scope`, `neighborhoodDepth`, `tokenBudget`). |
| `runJoySkeleton` | `(targetDir, relativePath, options?)` | Distills a workspace file into an AST/signature skeleton (`65%–85%` token reduction; optional `keepSymbol`). |
| `runJoyHeal` | `(targetDir, { dryRun? })` | Stamps or aligns `[LAYER: <ZONE>]` headers across `targetDir`. |
| `runJoyHealStatelessness` | `(targetDir, { dryRun? })` | Converts un-reassigned top-level `let`/`var` bindings in `PLUMBING` files to `const`. |
| `runJoyPlanMove` | `(targetDir, fromRelPath, toRelPath)` | Computes a deterministic relative import rewiring plan for moving a file across zones/folders. |
| `runJoyInit` | `(targetDir, { dryRun? })` | Scaffolds `stability.config.json` and `.joyignore` in `targetDir`. |
| `runJoyDocsCheck` | `(targetDir, options?)` | Verifies LUMI-style documentation guardrails (required docs, headers, sections, links, live metrics). |

---

## 2. BroccoliDB Governed Runtime (`BroccoliRuntime` & `RuntimeStateGraph`)

```js
import {
  BroccoliRuntime,
  RuntimeStateGraph,
  NodeCasStorage,
  migrateRuntimeGraph,
  projectReplayForMode,
  verifyRuntimeGraphIntegrity,
  RUNTIME_MODES,
  APPROVAL_POLICIES,
  DEFAULT_MODE_BUDGETS,
  GRAPH_NODE_KINDS,
  GRAPH_EDGE_KINDS,
  RTG_DIAGNOSTICS
} from "heav3ns-joy";
```

| Method | Description |
|--------|-------------|
| `runtime.start()` / `runtime.stop()` | Lifecycle transitions (operations outside `started` throw `GuidedError` `LIFECYCLE_STATE_ERROR`). |
| `runtime.setMode(mode)` | Switches between `development`, `ci`, `production`, `readonly`, `recovery`, `forensic`. |
| `runtime.beginSession({ sessionId?, intent, budget? })` | Initializes a governed session and records `Session` + `Intent` nodes. |
| `runtime.recordAudit(sessionId, auditReport)` | Records an `Audit` node and attaches `Finding` nodes. |
| `runtime.recordGate(sessionId, gateResult)` | Records a `Gate` pass/fail transition. |
| `runtime.planRepairs(sessionId, directives, options?)` | Creates a `MutationPlan` (enforces `RTG-003` Proof-Before-Mutation and mode budgets). |
| `runtime.preview(sessionId, planId)` | Returns a dry-run preview and approval policy decision. |
| `runtime.execute(sessionId, planId, mutationFn, { rollbackFn? })` | Executes a planned mutation with automatic `Rollback` node recording (`RTG-006`) on failure. |
| `runtime.verify(sessionId, postAuditReport)` | Computes `diffSpiderReports`, resolves findings, and records a `Verification` node (`RTG-007`). |
| `runtime.snapshot(sessionId)` | Verifies `RTG-001..008` and persists a canonical snapshot to `NodeCasStorage`. |
| `runtime.state(sessionId)` / `runtime.blockers(sessionId)` | Returns current session state summary and open blockers. |
| `runtime.timeline(sessionId)` / `runtime.nextActions(sessionId)` | Returns chronological `+offsetMs` event timeline and prioritized operator commands. |
| `runtime.causalView(sessionId)` / `runtime.explainNode(sessionId, nodeId)` | Traces causal chains and inbound/outbound edges for any graph node. |
| `runtime.story(sessionId)` | Synthesizes a structured narrative (`whatHappened`, `why`, `whatChanged`, `whatRecovered`, `whatRemainsBlocked`). |
| `runtime.replay(sessionId, { mode?, snapshotId?, liveGraphHash? })` | Rehydrates a read-only forensic replay (`mode`: `forensic` \| `timeline` \| `causal` \| `verification` \| `ci`). |

---

## 3. JoyRide Bounded Execution Cache (`JoyRideCache`)

```js
import {
  JoyRideCache,
  JOYRIDE_KINDS,
  createJoyRideFingerprint,
  createJoyRideKey,
  createCommandResultCacheKey,
  createGrepResultCacheKey,
  createFileMetadataCacheKey,
  createVerificationCacheKey,
  createDiffCacheKey,
  createScratchArtifactCacheKey
} from "heav3ns-joy";
```

| Method | Description |
|--------|-------------|
| `cache.set(key, value, meta?)` | Stores an artifact after secret/token scanning, byte budget enforcement, and optional L2 `ICasStorage` persistence. |
| `cache.get(key, context?)` | Validates against 11 fingerprint invariants (and transparently re-hydrates from L2 CAS on L1 miss). |
| `cache.getOrCompute(key, computeFn, meta?, context?)` | Single-flight deduplicating execution wrapper coalescing concurrent identical promises. |
| `cache.validate(key, context?)` / `cache.explain(key)` | Inspects cache validity (`valid`, `stale`, `expired`, `missing`) without mutating hit counts. |
| `cache.markStale(key, reason?)` / `cache.invalidate(filter)` | Marks entries stale or invalidates by `filePath`, `taskId`, `workspaceId`, `prefix`, or `kind`. |
| `cache.getMemoryPressureLevel()` / `cache.handleMemoryPressure(level?)` | 4-tier pressure valve (`normal`, `elevated`, `high`, `critical`). |

---

## 4. Spider Toolkit, Pure Plumbing, & Formatters

| Category | Exported Symbols |
|----------|------------------|
| **Spider Toolkit & Rules** | `SpiderEngine`, `RefactorHealer`, `buildDoctorReport`, `computeMerkleRoot`, `verifyDiskParity`, `computeProjectFootprints`, `trackSymbolMoves`, `getNeighborhood`, `skeletonizeFile`, `applyBundleBudget`, `serializeSpiderWire`, `restoreSpiderFromWire`, `runSpiderCheck`, `scaffoldWorkspaceConfig`, `verifyWorkspaceDocs`, `computeWorkspaceStatistics`, `detectGhostCoupling`, `stableFindingId`, `clusterFindingsByCause`, `buildPriorityQueue`, `buildAgentPlaybook`, `evaluateSpiderGate`, `diffSpiderReports`, `compareSemanticFootprints`, `explainJoyRule`, `EXPLAIN_CATALOG` |
| **Ports & Infrastructure** | `IWorkspaceScanner`, `ICasStorage`, `GuidedError`, `formatErrorGuidance`, `NodeWorkspaceScanner`, `NodeCasStorage` |
| **Stateless Plumbing** | `sha256Hex`, `normalizeForHash`, `stableStringify`, `computeDeterministicFingerprint`, `utf8ByteLength`, `summarizeCommandOutput`, `normalizeAstTokens`, `extractSymbolFootprints`, `distillSourceSkeleton` |
| **UI Formatters** | `formatTerminalReport`, `formatDoctorReport`, `formatSarifReport`, `formatGithubAnnotations`, `formatMarkdownReport`, `formatExplainOutput`, `renderMermaidGraph`, `formatCompactReport`, `formatLspDiagnostics`, `formatTapReport`, `formatJUnitReport`, `formatNdjsonReport`, `exportProblemMatcherConfig`, `formatStatsReport` |

---

## 5. Portable Broccoli Trinity & Native Agent Tooling (`heav3ns-joy/portable`)

To preserve the frozen 84-symbol surface of `src/index.mjs`, the Portable Broccoli Trinity (`BroccoliQueue`, `BufferedDb`, `AgentSwarm`), the 8-agent installer, and the stdio MCP server are exported from the secondary subpath [`src/portable.mjs`](../../src/portable.mjs) (`heav3ns-joy/portable`):

```js
import {
  createPortableBroccoli,
  createAgentSwarm,
  createAgentInstaller,
  createMcpServer,
  serveMcpOverStdio,
  BroccoliDb,
  BroccoliQueue,
  BufferedDb,
  BroccoliBufferedStore,
  MemoryBufferedStore,
  increment,
  ShadowCommitError,
  AgentSwarmDispatcher,
  SwarmFormationLedger,
  ProcessAgentEngine,
  SwarmTaskCoordinator,
  SwarmKnowledgeService,
  SwarmConfigService,
  InMemorySwarmLeaseService,
  FileSwarmConfigStore,
  MemorySwarmConfigStore,
  AgentInstaller,
  AGENT_TARGETS,
  McpServer,
  StdioMcpTransport
} from "heav3ns-joy/portable";
```

See [PORTABLE_TRINITY.md](../PORTABLE_TRINITY.md) and [cli.md](cli.md) for usage examples.
