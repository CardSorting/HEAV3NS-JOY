<!-- [LAYER: DOMAIN] -->
# 05 — Portable Substrate Trinity: JoyRide, Spider, and BroccoliDB

Beyond the 5-zone **Joyzoning** spatial model, **HEAV3NS-JOY** provides a portable, **zero-dependency operational substrate trinity** translated from LUMI:

1. **JoyRide (`src/core/JoyRideCache.mjs`)** — Bounded, self-invalidating execution cache and single-flight deduplication engine.
2. **Spider (`src/core/SpiderEngine.mjs` & `src/core/SpiderToolkit.mjs`)** — Deterministic architectural proof engine, Merkle reality shield (`SPI-006`), semantic footprint tracker, $N$-hop neighborhood scoper, and structural AST skeletonizer.
3. **BroccoliDB (`src/core/BroccoliRuntime.mjs` & `src/infrastructure/NodeCasStorage.mjs`)** — Sharded SHA-256 Content-Addressable Storage (`CAS:<sha256>`) with automatic corruption quarantine, RFC 1952 multi-member GZIP Wire Engine (`BroccoliWireEngine`), and governed `RuntimeStateGraph` (`RTG-001`..`RTG-008`) enforcing **Proof-Before-Mutation**.

> **Operational Doctrine**:
> *"Agents express intent. Capabilities validate. Runtime governs. Spider proves. StateGraph preserves truth. Snapshots preserve continuity. Replay reconstructs causality. A complete structure is not finished until it is boring to operate."*

---

## 1. JoyRide: 11-Point Fingerprint Validation & Single-Flight Execution

JoyRide (`src/core/JoyRideCache.mjs`) prevents redundant file reads, grep scans, command executions, and verification runs across multi-turn agent workflows while guaranteeing **0% stale reuse**.

### 1.1 Typed Deterministic Key Builders
All JoyRide keys use canonical `joyride:<kind>:<namespace>:<fingerprint>` formatting derived from pure FIPS 180-4 SHA-256 (`src/plumbing/canonicalHash.mjs`):

| Builder Function | Tier (`kind`) | Purpose |
| :--- | :--- | :--- |
| `createCommandResultCacheKey({ command, cwd, envFingerprint })` | `hotExecution` | Short-lived CLI/shell command results |
| `createGrepResultCacheKey({ pattern, rootDir, include, caseSensitive })` | `taskLocal` | Scoped search and regex results |
| `createDiffCacheKey({ baseRef, headRef, paths })` | `taskLocal` | Git/workspace diff snapshots |
| `createFileMetadataCacheKey({ filePath, workspaceId })` | `workspaceIndex` | Parsed AST symbols, imports, and metrics |
| `createVerificationCacheKey({ suite, target, dependencyFingerprint, gitHead })` | `verification` | Test suite & Spider conformance results |
| `createScratchArtifactCacheKey({ taskId, label })` | `scratchArtifact` | Ephemeral intermediate synthesis artifacts |

### 1.2 11-Point Validation Context (`validate(key, context)`)
Every cached entry is validated against up to 11 environmental invariants on `get(key, context)`:
1. `fingerprint` (SHA-256 payload digest for duplicate artifact deduplication)
2. `workspaceFingerprint` (Merkle root of workspace files)
3. `approvalBoundaryId` (invalidates on privilege/approval boundary transition)
4. `generation` (monotonic workspace generation counter)
5. `dependencyFingerprint` (manifest hash)
6. `lockfileFingerprint` (lockfile hash)
7. `gitHead` (commit SHA)
8. `environmentFingerprint` (env var / OS digest)
9. `runtimeVersion` (Node/runtime version)
10. `toolVersion` (`joy-check` version)
11. `relevantFileHashes` (`Record<relativePath, sha256>` per-file hash map)

### 1.3 Stale Marking, Single-Flight, & Priority Eviction
- **`markStale(key, reason)`**: Marks an entry stale (`validity: "stale"`) while preserving its diagnostic history (`staleReason`, `invalidationReasons[]`) until read or trimmed, incrementing `staleReusePreventionCount` when a stale read is blocked.
- **`getOrCompute(key, computeFn, meta, context)`**: Coalesces concurrent identical async computations into a single in-flight promise (`singleFlightHits`).
- **Priority-Ranked Eviction**: When trimming to budget, JoyRide evicts expired/stale entries first, then ranks candidates by `evictionPriority` (`hotExecution` -> `scratchArtifact` -> `taskLocal` -> `verification` -> `workspaceIndex`), lowest `hitCount`, oldest `lastAccessedAt`, and largest `byteSize`, invoking any registered `cleanupHandler({ key, kind, reason })`.
- **4-Tier Memory Pressure Valve & L1/L2 `ICasStorage` Spillover**: `getMemoryPressureLevel()` and `handleMemoryPressure("normal" | "elevated" | "high" | "critical")` shed volatile tiers progressively under memory pressure while transparently spilling and re-hydrating high-value `workspaceIndex` and `verification` entries via `ICasStorage` (`stats.l2Hydrations`).
- **Head/Tail Output Summarization (`summarizeCommandOutput`)**: Truncates long command outputs using a **65% head / 35% tail** window while preserving exact UTF-8 byte and character counts.

---

## 2. Spider: Reality Shield, Semantic Footprints, & AST Skeletonization

### 2.1 Merkle Root & Disk Parity (`SPI-006`)
- **`computeMerkleRoot(files)`**: Computes a deterministic SHA-256 Merkle root over sorted `relativePath:sha256(content)` leaves.
- **`verifyDiskParity(scanner, rootDir, baseline)`**: Compares live disk contents against cached Spider file hashes. If any file was modified externally (`drifted`) or deleted (`missing`), Spider emits **`SPI-006` (Disk Parity Reality Drift)** to block mutations against stale state.

### 2.2 Semantic Footprinting Across File Moves
- **`extractSymbolFootprints(source, filePath)` & `compareSemanticFootprints(before, after)`**: Computes comment-stripped, whitespace-normalized AST hashes (`astNormalizedHash`) and signature hashes (`signatureHash`) for exported functions, classes, interfaces, types, and constants.
- When a symbol is relocated to a new file during `MOVE_WITH_REWIRE`, Spider tracks its identity (`previousLocation -> currentLocation`) with `moveConfidence: "exact"` (identical normalized AST body) or `"high"` (identical signature, modified body).

### 2.3 Structural AST Skeletonization (`--skeleton`)
- **`distillSourceSkeleton(source, { keepSymbol })`**: Distills source modules into compact structural contracts (preserving `[LAYER]` headers, imports/exports, class/interface declarations, and single- or multi-line method/function signatures while eliding method bodies into `{ /* ... */ }`), achieving **65%–85% token reduction**.
- Passing `keepSymbol` (or `--keep-symbol <name>`) preserves the full implementation body of the active function/method being edited while skeletonizing the surrounding file.

### 2.4 Multivariate Workspace Telemetry (`--stats`) & Ghost Coupling (`SPI-108`)
- **`computeWorkspaceStatistics(nodes)` (`--stats`)**: Computes multivariate `mean`, `stdDev`, Gini hubbiness, and `> 2.0σ` `zScoreOutliers` across cognitive complexity, afferent coupling ($C_a$), and module line count (translating LUMI V215 `MetricsEngine.getProjectStatistics`).
- **`detectGhostCoupling(snapshots, currentNodes)` (`SPI-108`)**: Detects logical entanglement between files that co-mutate across $\ge 3$ historical snapshots with Jaccard similarity $> 0.7$ while sharing zero structural dependency edges (`MetricsEngine.detectEntangledDependencies`).
- **`scaffoldWorkspaceConfig(scanner, rootDir, options)` (`--init`)**: Scaffolds a ready-to-use `stability.config.json` and `.joyignore` in any target repository (`--dry-run` supported).

### 2.5 Unified Check Phases & Industry-Standard Formats
- **`runSpiderCheck(engine, rootDir, options)`**: Supports `pre-edit`, `post-edit`, `ci`, and `delta` phases, $N$-hop bidirectional dependency neighborhood scoping (`getNeighborhood`), `evaluateSpiderGate`, root-cause clustering (`clusterFindingsByCause`), priority queues (`buildPriorityQueue`), ordered playbooks (`buildAgentPlaybook`), token-budgeted agent bundles (`applyBundleBudget`), and Wire v2 handoff (`serializeSpiderWire` / `restoreSpiderFromWire`).
- **10 Output Formats (`--format`)**: `text`, `compact` (ESLint/cargo 1-line format), `json`, `sarif` (SARIF 2.1.0), `github`, `markdown`, `lsp` (LSP `PublishDiagnostics` + `CodeAction` quick fixes), `tap` (TAP v13), `junit` (JUnit XML), and `ndjson`, plus `--problem-matcher` for VS Code / GitHub Actions Problem Matcher v2.

---

## 3. BroccoliDB: Sharded CAS, RFC 1952 Wire Engine, & Governed RuntimeStateGraph {#broccolidb-cas}

### 3.1 Sharded Content-Addressable Storage (`NodeCasStorage` / `ICasStorage`)
- **Sharded Storage Layout & Crash-Safe Atomic Writes**: Blobs are stored by SHA-256 hex digest under `.broccolidb/storage/blobs/<first-2-hex>/<full-sha256>` using atomic temp-file writes + POSIX `fs.renameSync`. Strict `/^[0-9a-f]{64}$/` validation and snapshot path containment block malformed hashes or `../` path traversal (`INVARIANT_VIOLATION`).
- **Cryptographic Read Verification & Quarantine (`STORAGE_CORRUPT`)**: Every `readBlob(hash)` and `hydrateContent("CAS:<sha256>")` recomputes the physical file's SHA-256 digest. On mismatch:
  1. The corrupted file is quarantined to `.broccolidb/storage/corrupt/<hash>.<timestamp>.corrupt`.
  2. A forensic JSONL record (`expectedHash`, `actualHash`, `quarantinedFile`, `reason: "sha256_mismatch"`) is appended to `.broccolidb/storage/corrupt/manifest.jsonl`.
  3. A pedagogical `GuidedError` (`STORAGE_CORRUPT`) is thrown.
- **Context Scaling (`scaleContent` / `hydrateContent`)**: Strings exceeding `threshold` (default `1024` chars) are automatically detached into `CAS:<sha256>` pointers and hydrated on demand.

### 3.2 `BroccoliWireEngine`: RFC 1952 Multi-Member GZIP Stream Synthesis
- Per **RFC 1952 Section 2.2**, a GZIP file consists of one or more concatenated "members" (`[Member 1][Member 2]...[Member N]`), which decompress seamlessly via standard `zlib.gunzipSync`.
- `compressWirePayload(payload, { chunkSize })` splits payloads into content-addressed chunks, compresses each chunk independently with `zlib.gzipSync`, caches each compressed GZIP member by chunk SHA-256 in memory and `.broccolidb/storage/wire/<hash>.gz`, and assembles multi-turn wire streams via $O(1)$ `Buffer.concat(members)`.

### 3.3 `RuntimeStateGraph`, Operator Projections, & `RTG-001`..`RTG-008` Integrity Verification
`BroccoliRuntime` (`src/core/BroccoliRuntime.mjs`) and `RuntimeStateGraph` (`src/core/RuntimeStateGraph.mjs`) govern agent sessions across **6 runtime modes** (`development`, `ci`, `production`, `readonly`, `recovery`, `forensic`), expose operator projections (`state`, `blockers`, `timeline`, `nextActions`, `causalView`, `explainNode`, `story`), migrate legacy schema versions (`migrateRuntimeGraph`), support 5 `replay` modes (`forensic`, `timeline`, `causal`, `verification`, `ci`), and enforce **8 Runtime Graph Integrity Diagnostics** before any snapshot is persisted:

| Code | Title | Invariant |
| :--- | :--- | :--- |
| **`RTG-001`** | Orphaned Runtime Graph Node | Every node must link to an active `sessionId`. |
| **`RTG-002`** | Dangling Runtime Graph Edge | Every edge's `from` and `to` nodes must exist in the session graph. |
| **`RTG-003`** | Unproven Mutation Chain | No `MutationPlan` without a preceding `Audit`; no `Execution` without a `MutationPlan`. |
| **`RTG-004`** | Replay Hash Divergence | Rehydrated snapshot `graphHash` must match expected live `graphHash`. |
| **`RTG-005`** | Snapshot/CAS Blob Corruption | Backing CAS blob SHA-256 must match on snapshot load. |
| **`RTG-006`** | Unlinked Rollback Node | Every `Rollback` node must link to its failed `Execution` via `rolled_back_by`. |
| **`RTG-007`** | Unlinked Verification Node | Post-mutation `Verification` nodes must link to `Execution` via `verified_by`. |
| **`RTG-008`** | Premature Session Completion | A session cannot be marked `completed` while open `ERROR` findings, failed `Gate`s, or failed `Verification`s exist. |

