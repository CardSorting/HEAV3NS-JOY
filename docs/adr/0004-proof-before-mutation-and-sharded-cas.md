<!-- [LAYER: UI] -->
# ADR-0004: Proof-Before-Mutation (`RTG-003`), Causal Graph, & Sharded SHA-256 CAS

- **Status**: Accepted
- **Date**: 2026-03-05
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md)

---

## Status

Accepted — Core Constitutional Law #3 of [`docs/CONSTITUTION.md`](../CONSTITUTION.md).

## Context

In multi-turn coding sessions, autonomous agents often mutate files without recording a pre-edit baseline audit, fail mid-write leaving partial disk state, or lose causal provenance of *why* a file was changed and *whether* post-edit verification succeeded. Furthermore, storing session snapshots as unverified flat JSON files is vulnerable to silent disk truncation, path traversal, and unbounded disk bloat across long trajectories.

### Decision drivers

- **Causal Provenance**: Every mutation in a governed runtime session must trace causally back to a recorded `Intent`, `Audit`, and `MutationPlan`.
- **Automatic Rollback**: If a mutation callback throws or fails verification, the runtime must invoke the rollback handler and record a `Rollback` node in the causal DAG.
- **Cryptographic Storage Integrity**: Persisted blobs must be verified by SHA-256 on every read, with corrupted blobs automatically quarantined rather than crashing or poisoning state.

### Considered options

1. **Ad-hoc Console Logging of Agent Actions**: Non-queryable, unverified, and impossible to replay across modes (`timeline`, `causal`, `verification`, `ci`, `forensic`).
2. **External Database Server (PostgreSQL / Redis) for Session Graphs**: Violates zero-dependency local-first execution.
3. **In-Memory + CAS-Backed `RuntimeStateGraph` (`RTG-001..008`) + `BroccoliRuntime` + Sharded SHA-256 `NodeCasStorage` + RFC 1952 GZIP `BroccoliWireEngine`**.

## Decision

We chose **Option 3**:

1. **Proof-Before-Mutation (`RTG-003`)**: [`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs) enforces a strict state machine over [`src/core/RuntimeStateGraph.mjs`](../../src/core/RuntimeStateGraph.mjs):
   - `beginSession(intent)` → `recordAudit(report)` → `planRepairs(plan)` → `execute(planId, mutationFn, { rollbackFn })` → `verify(postReport)` → `snapshot()`.
   - Calling `planRepairs` without a prior `Audit` or `execute` without a `MutationPlan` throws a typed `GuidedError` (`INVARIANT_VIOLATION` / `RTG-003`).
2. **8 Runtime Graph Integrity Invariants (`RTG-001..008`)**: [`verifyRuntimeGraphIntegrity`](../../src/domain/broccoliRules.mjs) checks session root existence (`RTG-001`), dangling edge endpoints (`RTG-002`), proof-before-mutation (`RTG-003`), execution verification/rollback (`RTG-004`), DAG acyclicity (`RTG-005`), chronological monotonicity (`RTG-006`), cross-session contamination (`RTG-007`), and unresolved error completion (`RTG-008`).
3. **Sharded SHA-256 CAS with Quarantine**: [`src/infrastructure/NodeCasStorage.mjs`](../../src/infrastructure/NodeCasStorage.mjs) stores blobs under `.broccolidb/storage/cas/<2-char-prefix>/<sha256>.blob` using atomic write-temp-then-rename. On `readBlob(hash)`, it recomputes SHA-256; on mismatch, it moves the file to `.broccolidb/storage/corrupt/` and throws `CAS_CORRUPTION_QUARANTINED`.

## Consequences

### Positive

- Every governed session supports deterministic `story()`, `timeline()`, `causalView()`, `explainNode()`, `nextActions()`, and 5-mode `replay()` (`timeline`, `causal`, `verification`, `ci`, `forensic`).
- Path traversal attempts on CAS hashes or snapshot IDs are rejected immediately (`Suite 21`).

### Negative / trade-offs

- Governed sessions require explicit `recordAudit` and `planRepairs` calls before `execute`; read-only modes (`readonly`, `ci`) forbid `execute` entirely (`MODE_READONLY`).

## Verification

```bash
node --test tests/trinity-portability.test.mjs
node ./bin/joy-check.mjs --explain RTG-003
node ./bin/joy-check.mjs --explain BROCCOLIDB
```

- **Code**: [`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs) · [`src/core/RuntimeStateGraph.mjs`](../../src/core/RuntimeStateGraph.mjs) · [`src/domain/broccoliRules.mjs`](../../src/domain/broccoliRules.mjs) · [`src/infrastructure/NodeCasStorage.mjs`](../../src/infrastructure/NodeCasStorage.mjs)
- **Playbook**: [PB-02: Trinity Lock & WAL/CAS Recovery](../playbooks/trinity-lock-and-wal-recovery.md)

