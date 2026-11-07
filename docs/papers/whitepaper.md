<!-- [LAYER: UI] -->
# HEAV3NS-JOY Technical Whitepaper

**Version 1.0.0 — Agnostic Agent-Native Software Development Framework & Portable Operational Substrate**

*Do not build another place where agents run. Build something agents can learn from, carry away, and independently reproduce.*

**Package:** `heav3ns-joy` · **Dependencies:** `0` · **Self-Conformance:** `99% SOVEREIGN (Grade A)`

---

## Abstract

**HEAV3NS-JOY** is a zero-dependency, self-hosting software development framework and reference runtime translated from the LUMI architectural ecosystem. It addresses two coupled failure modes in autonomous software engineering: **spatial entropy** (erosion of module boundaries, circular dependencies, and I/O leakage) and **operational entropy** (context window exhaustion, stale execution caches, unverified file mutations, and non-reproducible agent sessions).

The framework comprises four integrated subsystems implemented entirely in standard ECMAScript / Node.js built-ins:

1. **Joyzoning (`src/domain/joyRules.mjs`, `src/core/RefactorHealer.mjs`)** — A 5-zone spatial architecture model (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) with automated header healing, statelessness healing, and relative import rewiring.
2. **Spider Forensic Engine & Agent Toolkit (`src/core/SpiderEngine.mjs`, `src/core/SpiderToolkit.mjs`)** — A polyglot single-pass lexical dependency analyzer, 5-factor Structural Entropy engine, SHA-256 Merkle disk parity shield (`SPI-006`), semantic footprint tracker, $N$-hop neighborhood scoper, and structural AST skeletonizer.
3. **JoyRide Bounded Execution Cache (`src/core/JoyRideCache.mjs`)** — A 5-tier execution cache with typed deterministic key builders, 11-point environmental fingerprint validation, single-flight request coalescing, a 4-tier memory pressure valve, and L1/L2 Content-Addressable Storage spillover.
4. **BroccoliDB Operational Runtime (`src/core/BroccoliRuntime.mjs`, `src/core/RuntimeStateGraph.mjs`, `src/infrastructure/NodeCasStorage.mjs`)** — A governed session state machine enforcing Proof-Before-Mutation (`RTG-001..008`), sharded SHA-256 CAS with automatic corruption quarantine, and RFC 1952 multi-member GZIP stream synthesis (`BroccoliWireEngine`).

---

## 1. System Inventory (Workspace-Verified)

| Artifact | Value / Location |
|----------|------------------|
| Package version | **1.0.0** — [`package.json`](../../package.json) |
| External npm dependencies | **0** — [`package.json`](../../package.json) |
| Frozen programmatic exports | **84** — [`src/index.mjs`](../../src/index.mjs) |
| Self-explaining diagnostic codes & zones | **44** — [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs) & [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs) |
| CLI output formats (`--format`) | **10** (`text`, `compact`, `json`, `sarif`, `github`, `markdown`, `lsp`, `tap`, `junit`, `ndjson`) |
| Automated verification suites | **22** — [`tests/`](../../tests/joyzoning.test.mjs) |

---

## 2. The Five-Zone Spatial Model (Joyzoning)

Every source file $f$ in a Joyzoned workspace maps to a single zone $Z(f) \in \{\text{DOMAIN}, \text{CORE}, \text{INFRASTRUCTURE}, \text{PLUMBING}, \text{UI}\}$ declared within the first 10,000 characters via a language-native header comment (`/** [LAYER: DOMAIN] */`, `# [LAYER: CORE]`, `// [LAYER: PLUMBING]`, `-- [LAYER: DOMAIN]`, or `<!-- [LAYER: UI] -->`).

### 2.1 Sovereign Dependency Matrix

Let $e = (u \to v)$ be a directed import from module $u$ to module $v$. The transition is evaluated by `evaluateZoneDependency()` in [`src/domain/joyRules.mjs`](../../src/domain/joyRules.mjs):

| Caller Zone $Z(u)$ | Permitted Callee Zones $Z(v)$ | Forbidden Callee Zones (`SPI-206`) | Max I/O Entropy |
| :--- | :--- | :--- | :---: |
| **`DOMAIN`** | `DOMAIN`, `PLUMBING` | `CORE`*, `INFRASTRUCTURE`, `UI`, external I/O SDKs | `0.00` |
| **`CORE`** | `CORE`, `DOMAIN`, `PLUMBING`, `INFRASTRUCTURE` (via `I*` contracts) | `UI`, raw low-level I/O | `0.00` |
| **`INFRASTRUCTURE`** | `INFRASTRUCTURE`, `PLUMBING`, `DOMAIN` (`interfaces/I*` or `import type` only) | `CORE`, `UI`, concrete `DOMAIN` entities | `1.00` |
| **`UI`** | `UI`, `CORE`, `DOMAIN`, `PLUMBING` | `INFRASTRUCTURE` | `1.00` |
| **`PLUMBING`** | `PLUMBING` only | `DOMAIN`, `CORE`, `INFRASTRUCTURE`, `UI` | `0.00` |

*\*Note: `DOMAIN` is strictly forbidden from runtime imports of `CORE`; compile-time `import type` is permitted when erased by the compiler.*

---

## 3. Mathematical Graph Forensics & Structural Entropy

### 3.1 Robert C. Martin Coupling & Main Sequence Metrics
For each module $v$ with afferent coupling $C_a(v)$ (incoming dependents) and efferent coupling $C_e(v)$ (outgoing dependencies):

$$\text{Instability } I(v) = \frac{C_e(v)}{C_a(v) + C_e(v)} \in [0, 1]$$

$$\text{Abstractness } A(v) = \frac{N_{\text{abstract}}(v)}{N_{\text{total}}(v)} \in [0, 1]$$

$$\text{Normalized Distance } D'(v) = |A(v) + I(v) - 1| \in [0, 1]$$

Modules with $D'(v) > 0.7$ and total coupling $C_a + C_e \ge 3$ emit `SPI-101` (Zone of Pain when $A \approx 0, I \approx 0$; Zone of Uselessness when $A \approx 1, I \approx 1$).

### 3.2 Five-Factor Structural Entropy ($E_S$) & Stability Index ($SI$)
Implemented in `computeStructuralEntropy()` in [`src/domain/entropyFormulas.mjs`](../../src/domain/entropyFormulas.mjs):

$$E_S = \min\!\left(1.0,\; 0.25 S_{\text{depth}} + 0.20 S_{\text{naming}} + 0.25 S_{\text{orphan}} + 0.20 S_{\text{coupling}} + 0.10 S_{\text{complexity}} + P_{\text{cycle}}\right)$$

$$\text{Stability Index } SI = \text{round}\!\left((1 - E_S) \times 100\right)\%$$

where $P_{\text{cycle}} = 0.05$ if any runtime directed cycle (`SPI-201`) exists and $0$ otherwise. Workspaces with $E_S \le 0.05$ and zero blocking violations achieve **`SOVEREIGN`** status.

### 3.3 Multivariate Z-Score Outliers & `SPI-108` Ghost Coupling
- **`computeWorkspaceStatistics(nodes)` (`--stats`)**: Computes population mean $\mu$, standard deviation $\sigma$, Gini coefficient $G \in [0, 1]$ of incoming dependency concentration, and flags modules exceeding $+2.0\sigma$ across complexity, coupling, or line count.
- **`detectGhostCoupling(snapshots, currentNodes)` (`SPI-108`)**: Across chronological file-hash snapshots $S_0, S_1, \dots, S_k$, constructs change sets $M(f) = \{t \mid H_t(f) \neq H_{t-1}(f)\}$ and flags structurally unlinked pairs $(f_A, f_B)$ with Jaccard similarity:

$$J(f_A, f_B) = \frac{|M(f_A) \cap M(f_B)|}{|M(f_A) \cup M(f_B)|} > 0.7 \quad \text{and} \quad |M(f_A) \cap M(f_B)| \ge 2$$

---

## 4. Polyglot Single-Pass Lexical Scanner & AST Skeletonizer

### 4.1 Single-Pass Tokenizer (`src/plumbing/codeTokenizer.mjs`)
Regex-based comment stripping fails when URLs (`"https://..."`) or comment tokens (`"/*"`) appear inside string or regex literals. `scanCodeTokens()` performs a single-pass character state machine tracking single quotes, double quotes, template literals (with nested `${...}`), regex literals, line comments, and block comments, producing a comment-stripped, string-masked view with preserved line numbers.

### 4.2 Structural AST Skeletonization (`src/plumbing/canonicalHash.mjs`)
`distillSourceSkeleton(source, { keepSymbol })` reduces source files by **65%–85%** for agent context windows while preserving:
- Top-of-file `[LAYER: <ZONE>]` headers,
- All `import` and `export` declarations,
- `class`, `interface`, `type`, and `enum` declarations,
- Single- and multi-line function and class method signatures (replacing bodies with `{ /* ... */ }`),
- The complete implementation body of `keepSymbol` when targeted editing is requested.

---

## 5. JoyRide: Bounded Execution Caching & L1/L2 CAS Spillover

Implemented in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs), JoyRide partitions ephemeral execution caching into 5 tiers (`hotExecution`, `taskLocal`, `workspaceIndex`, `verification`, `scratchArtifact`):

1. **11-Point Fingerprint Validation**: Validates `fingerprint`, `workspaceFingerprint`, `approvalBoundaryId`, `generation`, `dependencyFingerprint`, `lockfileFingerprint`, `gitHead`, `environmentFingerprint`, `runtimeVersion`, `toolVersion`, and per-file `relevantFileHashes`.
2. **Secret & Token Rejection**: Deep-scans candidate values (circular-reference safe) against `SECRET_KEY_REGEX` (`apiKey`, `token`, `password`, `secret`, `authorization`) and token prefix patterns (`sk-`, `ghp_`, `AKIA`, `Bearer `), refusing to cache sensitive credentials.
3. **4-Tier Memory Pressure Valve & L2 CAS Hydration**: `handleMemoryPressure("normal" | "elevated" | "high" | "critical")` sheds volatile tiers first, while `workspaceIndex` and `verification` artifacts spilled to `ICasStorage` (`NodeCasStorage`) are transparently re-hydrated (`stats.l2Hydrations`) on L1 cache misses.

---

## 6. BroccoliDB: Sharded CAS, RFC 1952 Wire Engine, & `RuntimeStateGraph`

### 6.1 Sharded SHA-256 CAS & Corruption Quarantine (`src/infrastructure/NodeCasStorage.mjs`)
Blobs are written atomically via process-scoped `.tmp` files + `fs.renameSync` to `.broccolidb/storage/blobs/<h0h1>/<sha256>`. Every `readBlob(hash)` recomputes the FIPS 180-4 SHA-256 digest; any mismatch moves the corrupted file to `.broccolidb/storage/corrupt/<hash>.<timestamp>.corrupt`, appends a forensic entry to `manifest.jsonl`, and throws a `GuidedError` (`STORAGE_CORRUPT`).

### 6.2 RFC 1952 Multi-Member GZIP Synthesis (`BroccoliWireEngine`)
Per RFC 1952 §2.2, concatenated GZIP members decompress as a single stream. `compressWirePayload()` splits payloads into 64KB content-addressed chunks, compresses each chunk once via `zlib.gzipSync`, caches each compressed member by chunk SHA-256 in memory and `.broccolidb/storage/wire/<hash>.gz`, and concatenates members in $O(1)$ via `Buffer.concat`.

### 6.3 Governed `RuntimeStateGraph` (`RTG-001`..`RTG-008`)
`BroccoliRuntime` ([`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs)) and `RuntimeStateGraph` ([`src/core/RuntimeStateGraph.mjs`](../../src/core/RuntimeStateGraph.mjs)) enforce 8 structural invariants on session state transitions (`RTG-001` Orphaned Node, `RTG-002` Dangling Edge, `RTG-003` Unproven Mutation Chain, `RTG-004` Replay Hash Divergence, `RTG-005` CAS Corruption, `RTG-006` Unlinked Rollback, `RTG-007` Unlinked Verification, `RTG-008` Premature Completion) and project read-only replays across 5 operator modes (`forensic`, `timeline`, `causal`, `verification`, `ci`).
