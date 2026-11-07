<!-- [LAYER: UI] -->
# Runtime & Programmatic API Reference

These pages document the frozen programmatic export surface ([`src/index.mjs`](../../src/index.mjs)), the portable Trinity & agent installer surface ([`src/portable.mjs`](../../src/portable.mjs)), CLI tools ([`bin/joy.mjs`](../../bin/joy.mjs), [`bin/joy-check.mjs`](../../bin/joy-check.mjs), [`bin/joy-trinity.mjs`](../../bin/joy-trinity.mjs), [`bin/docs-check.mjs`](../../bin/docs-check.mjs)), the stdio MCP server, and typed error/diagnostic catalogs of **HEAV3NS-JOY**.

For the normative architectural conventions, start with [Architecture (current)](../architecture/current.md) and [Papers](../papers/README.md).

## Core API & CLI Reference

| Doc | Topic |
|-----|-------|
| [public-api.md](public-api.md) | Frozen 84-symbol programmatic API exported by [`src/index.mjs`](../../src/index.mjs) + 23 portable exports in [`src/portable.mjs`](../../src/portable.mjs) |
| [cli.md](cli.md) | Complete CLI & MCP reference for `bin/joy.mjs`, `bin/joy-check.mjs`, `bin/joy-trinity.mjs`, and `bin/docs-check.mjs` |
| [errors.md](errors.md) | Typed `GuidedError` catalog + `SPI-006..403` and `RTG-001..008` diagnostic reference |
| [../PORTABLE_TRINITY.md](../PORTABLE_TRINITY.md) | Operational guide for `BroccoliQueue`, `BufferedDb`, and `AgentSwarm` |

---

## Subsystem touchpoints

| Subsystem | Primary Classes / Functions | Source |
|-----------|-----------------------------|--------|
| **Joyzoning & Self-Healing** | `runJoyAudit`, `runJoyHeal`, `runJoyHealStatelessness`, `runJoyPlanMove`, `runJoyInit`, `RefactorHealer`, `StabilityDoctor` | [`src/index.mjs`](../../src/index.mjs) |
| **Spider Agent Ergonomics** | `SpiderEngine`, `runJoyCheckPhase`, `runJoySkeleton`, `computeMerkleRoot`, `verifyDiskParity`, `getNeighborhood`, `skeletonizeFile`, `computeWorkspaceStatistics`, `detectGhostCoupling` | [`src/core/SpiderToolkit.mjs`](../../src/core/SpiderToolkit.mjs) |
| **JoyRide Execution Cache** | `JoyRideCache`, `JOYRIDE_KINDS`, `createCommandResultCacheKey`, `createGrepResultCacheKey`, `createFileMetadataCacheKey`, `createVerificationCacheKey`, `createDiffCacheKey`, `createScratchArtifactCacheKey` | [`src/core/JoyRideCache.mjs`](../../src/core/JoyRideCache.mjs) |
| **BroccoliDB Runtime & CAS** | `BroccoliRuntime`, `RuntimeStateGraph`, `NodeCasStorage`, `ICasStorage`, `verifyRuntimeGraphIntegrity`, `migrateRuntimeGraph`, `projectReplayForMode` | [`src/core/BroccoliRuntime.mjs`](../../src/core/BroccoliRuntime.mjs) |
| **Portable Broccoli Trinity** | `createPortableBroccoli`, `createAgentSwarm`, `BroccoliDb`, `BroccoliQueue`, `BufferedDb`, `AgentSwarmDispatcher`, `SwarmFormationLedger`, `ProcessAgentEngine` | [`src/portable.mjs`](../../src/portable.mjs) |
| **Native Agent Installer & MCP** | `createAgentInstaller`, `AgentInstaller`, `AGENT_TARGETS`, `createMcpServer`, `McpServer`, `serveMcpOverStdio` | [`src/portable.mjs`](../../src/portable.mjs) |
| **Output Formatters** | `formatTerminalReport`, `formatCompactReport`, `formatSarifReport`, `formatLspDiagnostics`, `formatTapReport`, `formatJUnitReport`, `formatNdjsonReport`, `formatStatsReport` | [`src/ui/AgentFormatters.mjs`](../../src/ui/AgentFormatters.mjs) |

---

## Related specifications

- [`spec/03-METRICS-AND-FORENSICS.md`](../../spec/03-METRICS-AND-FORENSICS.md) — Mathematical definitions & `SPI-*` series
- [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) — JoyRide, Spider, and BroccoliDB specification
- [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) — End-to-end operational recipes
