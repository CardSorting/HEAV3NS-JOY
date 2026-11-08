<!-- [LAYER: UI] -->
# PM-004: Stale Verification Cache Hallucinations & Secret Leakage in Agent Scratchpads

<p align="center">
  <a href="README.md">Postmortems Hub</a> ·
  <a href="../README.md">Docs Hub</a> ·
  <a href="../adr/0005-joyride-eleven-point-fingerprint-cache.md">ADR-0005</a> ·
  <a href="../../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md">Workflow 04: JoyRide</a>
</p>

- **Incident ID**: `PM-004`
- **Date**: `2026-03-19`
- **Severity**: `SEV-1` (Data Integrity & Security Boundary)
- **Status**: Resolved
- **Affected Zones**: `CORE` (`JoyRideCache.mjs`, `SpiderToolkit.mjs`), `INFRASTRUCTURE` (`NodeCasStorage.mjs`)
- **Related ADR & Playbook**: [ADR-0005](../adr/0005-joyride-eleven-point-fingerprint-cache.md) · [Playbook PB-02](../playbooks/trinity-lock-and-wal-recovery.md)

---

## Summary

When caching agent command outputs and verification results across turns to reduce token and CPU overhead, two critical hazards emerged:
1. If a file was modified on disk between turns (either by the user in their IDE or by a formatter hook), a cache keyed only by `(command, args, cwd)` returned a stale `PASS` result.
2. If a cached command output or scratch artifact contained an `Authorization: Bearer ...` header, JWT, or `apiKey` field, persisting that cache entry to L2 disk storage risked writing secrets into `.broccolidb/storage/`.

## Root cause

1. **Why did the cache return a stale `PASS` result?** Command strings (`npm test`, `joy-check .`) do not change when underlying source files or `stability.config.json` change.
2. **Why did the agent not notice the external file edit?** No baseline SHA-256 Merkle parity check (`SPI-006`) was run before post-edit verification.
3. **Why could secrets enter the cache?** Cache `set()` accepted arbitrary JSON objects without inspecting property keys or string values for credential patterns.
4. **What invariant was missing?** An 11-point fingerprint validation contract on every cache read, a pre-admission secret detector (`SECRET_KEY_REGEX` + `SECRET_VALUE_REGEX`), and a Merkle Reality Shield (`verifyDiskParity` / `SPI-006`).

## Action items

| Action | Type | Code / Test Reference | Status |
| :--- | :--- | :--- | :---: |
| Implement 11-point fingerprint validation (`workspaceFingerprint`, `relevantFileHashes`, `configHash`, `toolVersion`, `theme`, `mode`, etc.) in `JoyRideCache.get()` | Preventative | [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) | Done |
| Reject any cache admission matching `SECRET_KEY_REGEX` or `SECRET_VALUE_REGEX` with `reason: "SECRET_DETECTED"` | Preventative | [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) | Done |
| Implement `computeMerkleRoot` and `verifyDiskParity` (`SPI-006`) in `SpiderToolkit.mjs` | Preventative | [`src/core/SpiderToolkit.mjs`](../../src/core/SpiderToolkit.mjs) | Done |
| Add Suite 14 and Suite 21 tests for stale hash invalidation, secret rejection, 4-tier pressure eviction, and L2 CAS re-hydration | Verification | [`tests/joyzoning-advanced.test.mjs`](../../tests/joyzoning-advanced.test.mjs), [`tests/trinity-portability.test.mjs`](../../tests/trinity-portability.test.mjs) | Done |

## Lessons learned

- **What went well**: Separating cache entries into 5 explicit kinds (`JOYRIDE_KINDS`) made it trivial to evict volatile tiers (`hotExecution`, `scratchArtifact`) while spilling `workspaceIndex` and `verification` to L2 CAS.
- **What went wrong**: Caching without cryptographic input-file hashes is indistinguishable from hallucination in multi-actor workspaces.
- **Permanent rule**: *Every cached verification artifact must bind to the SHA-256 hashes of its inputs, and no credential pattern may ever be admitted to L1 or L2 cache storage.*

