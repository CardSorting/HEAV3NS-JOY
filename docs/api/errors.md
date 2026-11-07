<!-- [LAYER: UI] -->
# Errors & Diagnostic Catalog

HEAV3NS-JOY errors and diagnostics are **typed**, **deterministic**, and **actionable**.

---

## 1. Runtime `GuidedError` Codes (`src/domain/interfaces/ICasStorage.mjs`)

Every operational error thrown by `BroccoliRuntime`, `RuntimeStateGraph`, or `NodeCasStorage` is an instance of `GuidedError` containing structured operator guidance:

| Field | Description |
|-------|-------------|
| `code` | Machine-readable error code (`LIFECYCLE_STATE_ERROR`, `POLICY_BLOCKED`, etc.) |
| `message` | Multi-line formatted summary including `Cause`, `Fix`, `Try`, and `Docs` |
| `guidance.likelyCause` | Why this error occurred |
| `guidance.suggestedFix` | Concrete remediation step |
| `guidance.command` | Suggested CLI command (when applicable) |
| `guidance.docsPath` | Link to relevant specification |

### `LIFECYCLE_STATE_ERROR`
- **When**: A `BroccoliRuntime` method (`beginSession`, `planRepairs`, `execute`, `verify`, `snapshot`, `replay`) is invoked before `runtime.start()` or after `runtime.stop()`.
- **Fix**: Call `runtime.start()` before invoking session operations.

### `POLICY_BLOCKED`
- **When**: An operation violates the active runtime mode's approval policy (e.g., calling `execute()` in `readonly` or `forensic` mode, or executing high-risk directives in `ci` mode without `approved: true`).
- **Fix**: Switch to `development` / `recovery` mode via `runtime.setMode("development")` or pass `{ approved: true }` after human review of `runtime.preview(sessionId, planId)`.

### `BUDGET_EXCEEDED`
- **When**: A `MutationPlan` exceeds the active mode's `maxDirectives` or `maxFilesTouched` budget.
- **Fix**: Split the refactoring into smaller producer-before-consumer batches or pass a higher session budget to `beginSession({ budget })`.

### `INVARIANT_VIOLATION`
- **When**: A session violates an `RTG-001..008` graph invariant (such as `RTG-003` calling `planRepairs` without a prior `recordAudit`), or an invalid SHA-256 hash / `../` path traversal is passed to `NodeCasStorage`.
- **Fix**: Follow the `Audit` → `MutationPlan` → `Execution` → `Verification` pipeline and pass only canonical 64-hex SHA-256 digests to CAS methods.

### `STORAGE_CORRUPT`
- **When**: `NodeCasStorage.readBlob(hash)` detects that the physical file's SHA-256 digest does not match its content address.
- **Automatic Quarantine**: The corrupted file is automatically moved to `.broccolidb/storage/corrupt/<hash>.<timestamp>.corrupt` and logged in `.broccolidb/storage/corrupt/manifest.jsonl`.

### `STORAGE_MISSING`
- **When**: `NodeCasStorage.hydrateContent("CAS:<sha256>")` references a blob hash that does not exist on disk.
- **Fix**: Re-write the payload via `writeBlob()` or `scaleContent()` before hydrating.

---

## 2. Runtime Graph Integrity Diagnostics (`RTG-001`..`RTG-008`)

Enforced by `verifyRuntimeGraphIntegrity()` in [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs):

| Code | Title | Invariant |
|------|-------|-----------|
| **`RTG-001`** | Orphaned Runtime Graph Node | Every node must belong to an active `sessionId`. |
| **`RTG-002`** | Dangling Runtime Graph Edge | Every edge's `from` and `to` endpoints must exist in the session graph. |
| **`RTG-003`** | Unproven Mutation Chain | Every `MutationPlan` requires a preceding `Audit`; every `Execution` requires a `MutationPlan`. |
| **`RTG-004`** | Replay Hash Divergence | Rehydrated snapshot `graphHash` must match the expected live `graphHash`. |
| **`RTG-005`** | Snapshot/CAS Blob Corruption | Backing CAS blob SHA-256 must match on snapshot load. |
| **`RTG-006`** | Unlinked Rollback Node | Every `Rollback` node must link to its failed `Execution` via `rolled_back_by`. |
| **`RTG-007`** | Unlinked Verification Node | Post-mutation `Verification` nodes must link to `Execution` via `verified_by`. |
| **`RTG-008`** | Premature Session Completion | A session cannot be marked `completed` while open `ERROR` findings or failed gates remain. |

---

## 3. Spider Static & Reality Shield Diagnostics (`SPI-006`..`SPI-403`)

Run `node bin/joy-check.mjs --explain <CODE>` for full remediation examples on any code:

| Code | Default Severity | Title | SOP |
|------|------------------|-------|-----|
| **`SPI-006`** | `ERROR` | Disk Parity Reality Drift (Merkle Mismatch) | `SOP: REFRESH_REALITY` |
| **`SPI-101`** | `ADVISORY` | High Distance from Main Sequence ($D' > 0.7$) | `SOP: EXTRACT_CONTRACT` |
| **`SPI-102`** | `ADVISORY` | Phantom Symbol Import (Missing Named Export) | `SOP: FIX_EXPORT_OR_IMPORT` |
| **`SPI-103`** | `ADVISORY` | Deep Directory Nesting (`> 4` Levels) | `SOP: FLATTEN_TREE` |
| **`SPI-104`** | `ADVISORY` | Compile-Time Type Cycle (`import type` Loop) | `SOP: EXTRACT_INTERFACE` |
| **`SPI-105`** | `ADVISORY` | High Logic Density in Non-Domain Layer (`> 0.30`) | `SOP: EXTRACT_DOMAIN` |
| **`SPI-106`** | `ADVISORY` | Symbol Resonance (Cross-Zone Naming Collision) | `SOP: RENAME_DISAMBIGUATE` |
| **`SPI-107`** | `ADVISORY` | Implicit Interface (Missing `I<ClassName>`) | `SOP: SYNTHESIZE_INTERFACE` |
| **`SPI-108`** | `ADVISORY` | Ghost Coupling (Jaccard Co-Mutation $> 0.7$) | `SOP: EXTRACT_CONTRACT` |
| **`SPI-109`** | `ADVISORY` | Silent Clone (Duplicate Logic Across Modules) | `SOP: EXTRACT` |
| **`SPI-110`** | `ADVISORY` | Asymmetric Lifecycle (`init` without `dispose`) | `SOP: SYMMETRIC_LIFECYCLE` |
| **`SPI-111`** | `ADVISORY` | Domain Drift (Pure Logic in `INFRASTRUCTURE`) | `SOP: EXTRACT_DOMAIN` |
| **`SPI-112`** | `ADVISORY` | Unused Import Binding | `SOP: CLEAN_IMPORTS` |
| **`SPI-201`** | `ERROR` | Runtime Circular Dependency (`A -> B -> A`) | `SOP: DECOUPLE` |
| **`SPI-202`** | `ADVISORY` | Systemic Risk (Node Blast Radius $> 60\%$) | `SOP: SPLIT_HUB` |
| **`SPI-203`** | `ADVISORY` | Structural Load (Fat Module $> 800$ LOC) | `SOP: DECOMPOSE` |
| **`SPI-204`** | `ADVISORY` | Orphaned Module ($C_a = 0$) | `SOP: PRUNE` |
| **`SPI-205`** | `ERROR` | Mutable Plumbing State (`let`/`var` in `PLUMBING`) | `SOP: HEAL_STATELESSNESS` |
| **`SPI-206`** | `ERROR` | Axiomatic Layer Leakage (Forbidden Cross-Zone Import) | `SOP: INVERT_DEPENDENCY` |
| **`SPI-207`** | `INFO` | Structural Bridge (Tarjan Articulation Point) | `SOP: HARDEN_BRIDGE` |
| **`SPI-208`** | `ERROR` | Geographic Misalignment (Missing/Mismatched `[LAYER]`) | `SOP: ALIGN_TAGS` |
| **`SPI-209`** | `ERROR` | Import Depth Exceeded (`> 3` `../` Traversals) | `SOP: FLATTEN_OR_ALIAS` |
| **`SPI-300`** | `ADVISORY` | Ripple Prophecy Alert (Blast Radius $> 80\%$) | `SOP: TRIAD_AUDIT` |
| **`SPI-301`** | `ADVISORY` | Vocabulary Drift (Zone Naming Mismatch) | `SOP: RENAME_DISAMBIGUATE` |
| **`SPI-302`** | `ADVISORY` | Refactoring Fatigue / Structural Fission Needed | `SOP: DECOMPOSE` |
| **`SPI-303`** | `ADVISORY` | Low Maintainability Index ($MI < 50$) | `SOP: SIMPLIFY_CONTROL_FLOW` |
| **`SPI-401`** | `ERROR` | Dynamic Code Execution (`eval` / `new Function`) | `SOP: ELIMINATE_EVAL` |
| **`SPI-402`** | `ERROR` | Unsanitized DOM Assignment (`innerHTML`) | `SOP: SANITIZE_DOM` |
| **`SPI-403`** | `ERROR` | Unverified `dangerouslySetInnerHTML` | `SOP: SANITIZE_DOM` |

