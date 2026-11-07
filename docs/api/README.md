<!-- [LAYER: UI] -->
# Runtime & Programmatic API Reference

These pages document the frozen programmatic export surface ([`src/index.mjs`](../../src/index.mjs)), CLI tools ([`bin/joy-check.mjs`](../../bin/joy-check.mjs) & [`bin/docs-check.mjs`](../../bin/docs-check.mjs)), and typed error/diagnostic catalogs of **HEAV3NS-JOY**.

For the normative architectural conventions, start with [Architecture (current)](../architecture/current.md) and [Papers](../papers/README.md).

## Core API & CLI Reference

| Doc | Topic |
|-----|-------|
| [public-api.md](public-api.md) | Frozen 84-symbol programmatic API exported by [`src/index.mjs`](../../src/index.mjs) |
| [cli.md](cli.md) | Complete CLI reference for `bin/joy-check.mjs` and `bin/docs-check.mjs` |
| [errors.md](errors.md) | Typed `GuidedError` catalog + `SPI-006..403` and `RTG-001..008` diagnostic reference |

---

## Subsystem touchpoints

| Subsystem | Primary Classes / Functions | Source |
|-----------|-----------------------------|--------|
| **Joyzoning & Self-Healing** | `runJoyAudit`, `runJoyHeal`, `runJoyHealStatelessness`, `runJoyPlanMove`, `runJoyInit`, `RefactorHealer`, `StabilityDoctor` | [`src/index.mjs`](../../src/index.mjs) |
| **Spider Agent Ergonomics** | `SpiderEngine`, `runJoyCheckPhase`, `runJoySkeleton`, `computeMerkleRoot`, `verifyDiskParity`, `getNeighborhood`, `skeletonizeFile`, `computeWorkspaceStatistics`, `detectGhostCoupling` | [`src/core/SpiderToolkit.mjs`](../../src/core/SpiderToolkit.mjs) |
| **JoyRide Execution Cache** | `JoyRideCache`, `JOYRIDE_KINDS`, `createCommandResultCacheKey`, `createGrepResultCacheKey`, `createFileMetadataCacheKey`, `createVerificationCacheKey`, `createDiffCacheKey`, `createScratchArtifactCacheKey` | [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) |
| **BroccoliDB Runtime & CAS** | `BroccoliRuntime`, `RuntimeStateGraph`, `NodeCasStorage`, `ICasStorage`, `verifyRuntimeGraphIntegrity`, `migrateRuntimeGraph`, `projectReplayForMode` | [`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs) |
| **Output Formatters** | `formatTerminalReport`, `formatCompactReport`, `formatSarifReport`, `formatLspDiagnostics`, `formatTapReport`, `formatJUnitReport`, `formatNdjsonReport`, `formatStatsReport` | [`src/ui/AgentFormatters.mjs`](../../src/ui/AgentFormatters.mjs) |

---

## Related specifications

- [`spec/03-METRICS-AND-FORENSICS.md`](../../spec/03-METRICS-AND-FORENSICS.md) — Mathematical definitions & `SPI-*` series
- [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) — JoyRide, Spider, and BroccoliDB specification
- [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) — End-to-end operational recipes
