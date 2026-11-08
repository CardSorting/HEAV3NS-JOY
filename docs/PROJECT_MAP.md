<!-- [LAYER: UI] -->
# Project Map & Architecture

This map reflects the **actual** layout of the **HEAV3NS-JOY** workspace. Paths are relative to the repository root (`/Users/bozoegg/Desktop/HEAV3NS-JOY`).

## Workspace overview

| Directory / File | Architectural Zone | Role |
|------------------|--------------------|------|
| **`src/domain/`** | `DOMAIN` | Pure Joyzoning rules (`joyRules.mjs`), BroccoliDB/Spider rules (`broccoliRules.mjs`), 5-factor entropy & Martin/Gini/Z-score formulas (`entropyFormulas.mjs`), BufferedDb/AgentSwarm domain logic (`bufferedDbOps.mjs`, `swarm*.mjs`), and agent installer targets/templates (`agentTargets.mjs`, `agentTemplates.mjs`, `skillTemplates.mjs`) |
| **`src/domain/interfaces/`** | `DOMAIN` | Formal Dependency Inversion contracts (`IWorkspaceScanner.mjs`, `ICasStorage.mjs`, `IBufferedStore.mjs`, `ISwarmLeaseService.mjs`, `ISwarmAgentEngine.mjs`, `ISwarmConfigStore.mjs`, `IProjectFiles.mjs`, `GuidedError`) |
| **`src/core/`** | `CORE` | Orchestration engines: `SpiderEngine.mjs`, `SpiderToolkit.mjs`, `StabilityDoctor.mjs`, `RefactorHealer.mjs`, `JoyRideCache.mjs`, `BroccoliRuntime.mjs`, `RuntimeStateGraph.mjs`, `BufferedDb.mjs`, `AgentSwarmDispatcher.mjs`, `SwarmFormationLedger.mjs`, `AgentInstaller.mjs`, `mcp/McpServer.mjs` |
| **`src/infrastructure/`** | `INFRASTRUCTURE` | Concrete Node.js adapters: `NodeWorkspaceScanner.mjs`, `NodeCasStorage.mjs`, `broccolidb/` (`broccolidb.mjs`, `broccolidb-table.mjs`, `broccolidb-table-query.mjs`, `sqlite-driver.mjs`), `broccoliqueue/` (`queue.mjs`, `queue-helpers.mjs`, `worker.mjs`, `dlq.mjs`), `BroccoliBufferedStore.mjs`, `ProcessAgentEngine.mjs`, `FileRootLock.mjs`, `NodeProjectFiles.mjs`, `StdioMcpTransport.mjs` |
| **`src/plumbing/`** | `PLUMBING` | Stateless leaf primitives: `canonicalHash.mjs`, `codeTokenizer.mjs`, `sourceScanner.mjs`, `commentStyles.mjs`, `pathUtils.mjs`, `ids.mjs`, `AsyncMutex.mjs`, `rowIds.mjs`, `cliArgs.mjs`, `managedBlocks.mjs` |
| **`src/ui/`** | `UI` | Output formatters & presenters: `CliFormatter.mjs`, `AgentFormatters.mjs`, `JoyWizardPresenter.mjs`, and `joyCommands.mjs` |
| **`src/index.mjs`** | `UI` | Public programmatic Composition Root exporting 84 frozen symbols |
| **`src/portable.mjs`** | `UI` | Portable Trinity + AgentInstaller + McpServer Composition Root (`heav3ns-joy/portable`) |
| **`bin/joy.mjs`** | `UI` | Unified `create-next-app`-style agent installer, MCP server (`joy mcp`), hook runner, and CLI |
| **`bin/joy-check.mjs`** | `UI` | Zero-dependency CLI validator, self-healer, doctor, and Spider agent toolkit |
| **`bin/joy-trinity.mjs`** | `UI` | Shell-in/JSON-out interface to the portable BroccoliQueue, BufferedDb, and AgentSwarm |
| **`bin/docs-check.mjs`** | `UI` | Zero-dependency documentation guardrail verifier (`npm run docs:check`) |
| **`scripts/build-plugin.mjs`** | `UI` | Generates `.claude-plugin/marketplace.json` and `plugin/` from `src/domain/agentTargets.mjs` |
| **`plugin/`** | `UI` | Checked-in Claude Code marketplace plugin (skills, commands, subagent, MCP config) |
| **`spec/`** | `DOMAIN` | Normative specifications (`00-CANONICAL-MODEL.md` through `05-PORTABLE-SUBSTRATE-TRINITY.md`) |
| **`workflows/`** | `CORE` | Operational playbooks (`01-TRIAD-AUDIT-PLANNING.md` through `05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`) |
| **`docs/`** | `UI` | Documentation hub, ADRs (`docs/adr/`), operational playbooks (`docs/playbooks/`), engineering wiki (`docs/wiki/`), blameless postmortems (`docs/postmortems/`), knowledge base (`docs/kb/`), architecture maps (`docs/architecture/`), papers (`docs/papers/`), and `docs/api/` reference |
| **`configs/`** | `INFRASTRUCTURE` | Drop-in `stability.config.json`, `spider.spec.json`, `pre-commit-hook.sh`, and `github-action.yml` templates |
| **`examples/`** | `DOMAIN`..`UI` | Self-contained `examples/typescript/` and `examples/polyglot/` (Python, Go, Rust) reference projects |
| **`tests/`** | `UI` | 22 automated verification suites plus CLI smoke tests (`joyzoning.test.mjs`, `joyzoning-advanced.test.mjs`, `trinity-portability.test.mjs`, `cli-smoke.test.mjs`) |

---

## Core execution flow

```
bin/joy-check.mjs
  └─ src/index.mjs (Composition Root)
       ├─ NodeWorkspaceScanner (src/infrastructure/NodeWorkspaceScanner.mjs)
       ├─ SpiderEngine (src/core/SpiderEngine.mjs)
       │    ├─ scanSourceFile() (src/plumbing/sourceScanner.mjs → codeTokenizer.mjs)
       │    ├─ evaluateZoneDependency() (src/domain/joyRules.mjs)
       │    └─ computeStructuralEntropy() / computeWorkspaceStatistics() (src/domain/entropyFormulas.mjs)
       ├─ SpiderToolkit (src/core/SpiderToolkit.mjs)
       │    ├─ computeMerkleRoot() / verifyDiskParity() (SPI-006)
       │    ├─ skeletonizeFile() → distillSourceSkeleton() (src/plumbing/canonicalHash.mjs)
       │    └─ runSpiderCheck() → evaluateSpiderGate() / buildAgentPlaybook() (src/domain/broccoliRules.mjs)
       ├─ JoyRideCache (src/core/JoyRideCache.mjs)
       │    └─ 11-Point Validation + 4-Tier Pressure Valve + L2 NodeCasStorage Spillover
       ├─ BroccoliRuntime (src/core/BroccoliRuntime.mjs)
       │    ├─ RuntimeStateGraph (src/core/RuntimeStateGraph.mjs)
       │    ├─ verifyRuntimeGraphIntegrity() (RTG-001..008)
       │    └─ NodeCasStorage (src/infrastructure/NodeCasStorage.mjs)
       └─ CliFormatter / AgentFormatters (src/ui/)
```

---

## Key files

| Concern | File |
|---------|------|
| Agent operational entrypoint | [`AGENTS.md`](../AGENTS.md) |
| CLI binary | [`bin/joy-check.mjs`](../bin/joy-check.mjs) |
| Docs guardrail binary | [`bin/docs-check.mjs`](../bin/docs-check.mjs) |
| Public programmatic API | [`src/index.mjs`](../src/index.mjs) |
| Zone & `SPI-*` rules catalog | [`src/domain/joyRules.mjs`](../src/domain/joyRules.mjs) |
| BroccoliDB & `RTG-*` rules | [`src/domain/broccoliRules.mjs`](../src/domain/broccoliRules.mjs) |
| Entropy, Martin, Gini, & `SPI-108` math | [`src/domain/entropyFormulas.mjs`](../src/domain/entropyFormulas.mjs) |
| Pure SHA-256 & AST skeletonizer | [`src/plumbing/canonicalHash.mjs`](../src/plumbing/canonicalHash.mjs) |
| Single-pass polyglot lexical scanner | [`src/plumbing/codeTokenizer.mjs`](../src/plumbing/codeTokenizer.mjs) & [`src/plumbing/sourceScanner.mjs`](../src/plumbing/sourceScanner.mjs) |
| Spider forensic graph engine | [`src/core/SpiderEngine.mjs`](../src/core/SpiderEngine.mjs) |
| Spider agent ergonomics toolkit | [`src/core/SpiderToolkit.mjs`](../src/core/SpiderToolkit.mjs) |
| JoyRide bounded execution cache | [`src/core/JoyRideCache.mjs`](../src/core/JoyRideCache.mjs) |
| BroccoliDB governed runtime | [`src/core/BroccoliRuntime.mjs`](../src/core/BroccoliRuntime.mjs) & [`src/core/RuntimeStateGraph.mjs`](../src/core/RuntimeStateGraph.mjs) |
| Sharded CAS & RFC 1952 Wire Engine | [`src/infrastructure/NodeCasStorage.mjs`](../src/infrastructure/NodeCasStorage.mjs) |

---

## Architectural patterns

### 1. Contractual Sovereignty (`I<ClassName>`)
`CORE` engines (`SpiderEngine`, `RefactorHealer`, `BroccoliRuntime`, `JoyRideCache`) never import `node:fs` or concrete `INFRASTRUCTURE` classes. They depend exclusively on [`IWorkspaceScanner`](../src/domain/interfaces/IWorkspaceScanner.mjs) and [`ICasStorage`](../src/domain/interfaces/ICasStorage.mjs), wired together at the Composition Root ([`src/index.mjs`](../src/index.mjs)).

### 2. Stateless Leaf Plumbing (`[LAYER: PLUMBING]`)
All files in `src/plumbing/` are pure functions with `0` upward imports and `0` top-level mutable `let`/`var` bindings (`SPI-205`). Even cryptographic SHA-256 (`sha256Hex`) is implemented in pure ECMAScript in [`src/plumbing/canonicalHash.mjs`](../src/plumbing/canonicalHash.mjs) so `DOMAIN` and `CORE` remain 100% I/O-free.

### 3. Tier 1 Module Size Discipline (`< 800` lines)
Every file in the repository is kept under the `800`-line Tier 1 threshold (`0` Fat Module warnings), ensuring any module can be read and reasoned about by an agent in a single context window pass.

---

## Further reading

- [Architecture (current)](architecture/current.md)
- [Code-to-doc map](CODE_TO_DOC_MAP.md)
- [Agent papers](papers/README.md)
- [Public API reference](api/public-api.md)
