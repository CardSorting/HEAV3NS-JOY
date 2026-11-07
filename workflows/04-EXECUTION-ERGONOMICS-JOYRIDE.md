<!-- [LAYER: CORE] -->
# 04 — Execution Ergonomics: JoyRide Bounded Caching Principles

In addition to static architectural topology, the LUMI source embodies an operational runtime convention called **JoyRide**: a discipline for **bounded, invalidation-aware execution caching** during agentic software development workflows.

Just as Joyzoning prevents *structural entropy* in the codebase, JoyRide prevents *execution entropy* (redundant file reads, repeated directory scans, duplicate AST parses, and stale context hallucinations) during development tasks.

---

## 1. Foundational Principle: Execution Cache vs. Durable Memory

Agents and development tools must maintain a strict boundary between two distinct stores:

1. **Execution Cache (JoyRide — Ephemeral & Acceleration-Only)**:
   - Exists solely to avoid redundant read/search/parse/validation work within a bounded task window.
   - **Never authoritative**: If a file on disk changes, the cache entry is immediately invalidated.
   - **Strictly bounded**: Enforces hard caps on entry count, payload byte size, and Time-To-Live (TTL).
2. **Durable Memory (Project Knowledge — Authoritative)**:
   - Architectural conventions (`AGENTS.md`, `spec/`), configuration (`stability.config.json`), and committed source files.
   - Must never be polluted by transient execution scratchpads or unverified intermediate outputs.

---

## 2. The Five Canonical Cache Tiers

When building or operating development tooling (such as `joy-check`, AST analyzers, or agent task runners), organize execution caching into five bounded tiers:

| Tier | Name | Cached Artifact | Invalidation Trigger |
| :--- | :--- | :--- | :--- |
| **Tier 1** | **File Content & Hash Cache** | Raw file text, byte size, `mtime`, and SHA-256 content hash keyed by canonical path. | Any write, edit, rename, delete, or `mtime`/hash change on that path. |
| **Tier 2** | **AST & Symbol Index Cache** | Extracted `[LAYER: ...]` tag, imports, exports, logic density, and line count keyed by `(canonicalPath, contentHash)`. | Automatic miss whenever the file's `contentHash` changes. |
| **Tier 3** | **Graph Topology Cache** | Resolved dependency edges, Tarjan bridges, and cycle sets keyed by the Merkle hash of all project `(path, contentHash)` pairs. | Any addition, deletion, or import-list mutation in any project file, or changes to `spider.spec.json` / `tsconfig.json`. |
| **Tier 4** | **Deterministic Verification Cache** | Results of read-only lint/typecheck/audit runs keyed by `(command, workspaceMerkleHash, envFingerprint)`. | Any workspace file mutation, git branch switch, or dependency lockfile change. |
| **Tier 5** | **Negative Lookup Cache (Short TTL)** | Knowledge that an optional config file (e.g., `spider.spec.json`) does not exist, avoiding repeated `stat` calls during a single pass. | File creation or end of the current audit pass. |

---

## 3. Admission & Safety Invariants

1. **Never Cache Side-Effecting Operations**:
   Write operations (`write_file`, `edit_file`, `--heal`), network mutations, git commits, and non-deterministic commands must **never** be served from cache.
2. **Write-Through Invalidation**:
   Whenever a tool or agent modifies a file $v$ (for example, during `joy-check --heal`), it must immediately invalidate $v$ in Tier 1 and Tier 2 and recompute Tier 3 graph metrics if imports were touched.
3. **Bounded Footprint**:
   Skip caching files larger than `1 MB` or binary assets, and evict least-recently-used (LRU) entries when the in-memory cache exceeds its entry cap (default: `2,000` files).

---

## 4. 4-Tier Memory Pressure Valve & L1/L2 `ICasStorage` Spillover (Zenith Tier)

To remain resilient under heavy multi-turn agent workloads without losing expensive verification proofs:

1. **4-Tier Memory Pressure Valve (`getMemoryPressureLevel` / `handleMemoryPressure`)**:
   - **`normal` (`< 60%` budget)**: Standard TTL and budget trimming.
   - **`elevated` (`60%–75%` budget)**: Immediately evicts volatile `hotExecution` entries.
   - **`high` (`75%–90%` budget)**: Evicts both `hotExecution` and `scratchArtifact` entries and trims L1 memory to `70%` of budget.
   - **`critical` (`>= 90%` budget)**: Invokes `emergencyTrim()`, dropping `scratchArtifact`, `hotExecution`, and `taskLocal` entries and trimming L1 memory to `50%` of budget.
2. **Two-Tier L1/L2 `ICasStorage` Spillover (`options.casStorage`)**:
   - When a `JoyRideCache` is configured with an `ICasStorage` adapter (`NodeCasStorage`), high-value `workspaceIndex` and `verification` entries are persisted into the content-addressable store (`CAS:<sha256>`) on `set()`.
   - If L1 memory pressure evicts those entries, a subsequent `get(key, context)` transparently re-hydrates the entry from L2 CAS (`stats.l2Hydrations`) after verifying its 11-point fingerprint and TTL.


