<!-- [LAYER: UI] -->
# ADR-0005: JoyRide 5-Tier Bounded Cache, 11-Point Fingerprint Validation, & L1/L2 CAS Spillover

- **Status**: Accepted
- **Date**: 2026-03-19
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md`](../../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md) · [`PM-004`](../postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md)

---

## Status

Accepted — Implemented in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs).

## Context

Coding agents repeatedly execute identical expensive operations across turns (auditing unchanged subgraphs, grepping symbols, running verification checks, computing diffs). However, naive memoization introduces two severe failure modes (documented in [`PM-004`](../postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md)):
1. **Stale Cache Hallucinations**: If a file, config, theme, or tool version changes between turns, returning a cached `PASS` audit causes the agent to believe broken code is clean.
2. **Secret Leakage & Memory Bloat**: Caching raw command outputs or environment dumps can persist API keys, JWTs, or bearer tokens in scratchpads, while unbounded caches exhaust heap memory during long sessions.

### Decision drivers

- **Zero Stale Reads**: Every cache lookup must validate workspace Merkle fingerprints, individual file hashes, config hashes, and tool versions.
- **Zero Secret Admission**: Payloads containing credentials, tokens, or sensitive keys must be rejected at admission time (`SECRET_DETECTED`).
- **Bounded Memory with Durable Spillover**: Memory must be capped per-entry, per-task, and globally, with high-value tiers (`workspaceIndex`, `verification`) transparently spilling to L2 `ICasStorage`.

### Considered options

1. **No Caching (Re-compute Everything)**: Wastes tokens and CPU on redundant full-repo scans and test runs.
2. **Simple TTL / LRU Map Keyed by Command String**: Vulnerable to stale reads after file edits and secret leakage ([`PM-004`](../postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md)).
3. **JoyRide 5-Tier Cache with 11-Point Fingerprint Validation, Secret Admission Guard, Single-Flight Coalescing, 4-Tier Memory Pressure Valve, and L1/L2 CAS Spillover**.

## Decision

We chose **Option 3**, implemented in [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs):

1. **Five Isolated Cache Tiers (`JOYRIDE_KINDS`)**:
   - `hotExecution` (`joyride:hotExecution:*`): Short-lived command/grep outputs.
   - `taskLocal` (`joyride:taskLocal:*`): Task-scoped plans, neighborhood graphs, and diffs.
   - `workspaceIndex` (`joyride:workspaceIndex:*`): Workspace dependency graphs and footprints (L2 CAS eligible).
   - `verification` (`joyride:verification:*`): Typecheck/test/audit outcomes tied to exact content hashes (L2 CAS eligible).
   - `scratchArtifact` (`joyride:scratchArtifact:*`): Volatile agent scratch probes (evicted first under pressure).
2. **11-Point Validation on `get()`**: Checks key namespace, TTL expiration, `workspaceFingerprint`, `relevantFileHashes` (every tracked file hash must match `currentFileHashes`), `configHash`, `toolVersion`, `theme`, `mode`, `taskId`, `sessionId`, and `schemaVersion`.
3. **Secret Admission Guard**: Scans keys and values against `SECRET_KEY_REGEX` (`password`, `secret`, `token`, `apiKey`, `privateKey`) and `SECRET_VALUE_REGEX` (Bearer tokens, JWTs, `sk-*`, `ghp_*`, `AKIA*`), rejecting admission with `reason: "SECRET_DETECTED"`.
4. **4-Tier Memory Pressure Valve (`handleMemoryPressure`)**:
   - `normal`: Expired TTL sweep only.
   - `elevated`: Evicts `hotExecution` tier.
   - `high`: Evicts `hotExecution` + `scratchArtifact` tiers.
   - `critical` / `emergencyTrim()`: Evicts all volatile tiers, preserving `workspaceIndex` and spilling L2-eligible entries to `ICasStorage`.

## Consequences

### Positive

- Eliminates stale verification hallucinations while cutting repeated agent context/audit latency.
- Guarantees zero credential retention in cache entries.

### Negative / trade-offs

- Callers must supply `workspaceFingerprint` / `currentFileHashes` when querying fingerprint-bound entries to benefit from automatic invalidation.

## Verification

```bash
node --test tests/joyzoning-advanced.test.mjs
node --test tests/trinity-portability.test.mjs
node ./bin/joy-check.mjs --explain JOYRIDE
```

- **Code**: [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs)
- **Postmortem**: [PM-004: Cache Poisoning & Secret Leakage in Agent Scratchpads](../postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md)

