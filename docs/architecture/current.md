<!-- [LAYER: UI] -->
# Architecture (Current)

This document describes the **HEAV3NS-JOY** reference architecture as implemented in this repository. For the normative language-agnostic specifications, see [`spec/00-CANONICAL-MODEL.md`](../../spec/00-CANONICAL-MODEL.md) and [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../../spec/05-PORTABLE-SUBSTRATE-TRINITY.md).

## Overview

`HEAV3NS-JOY` is a zero-dependency, self-hosting ES module package (`heav3ns-joy` v1.0.0) composed of five strictly isolated architectural zones plus normative documentation and runnable polyglot examples:

| Part | Path | Zone | Role |
|------|------|------|------|
| Domain Rules & Math | `src/domain/` | `DOMAIN` | Pure Joyzoning coupling matrix, `SPI-*` / `RTG-*` catalogs, 5-factor entropy & Martin/Gini/Z-score math, BufferedDb/AgentSwarm domain logic, agent installer targets/templates, and `I*` contracts |
| Core Engines | `src/core/` | `CORE` | `SpiderEngine`, `SpiderToolkit`, `StabilityDoctor`, `RefactorHealer`, `JoyRideCache`, `BroccoliRuntime`, `RuntimeStateGraph`, `BufferedDb`, `AgentSwarmDispatcher`, `SwarmFormationLedger`, `AgentInstaller`, and `mcp/McpServer` |
| Infrastructure Adapters | `src/infrastructure/` | `INFRASTRUCTURE` | `NodeWorkspaceScanner`, `NodeCasStorage`, `broccolidb/` (embedded SQLite-backed kernel + `broccolidb-table-query`), `broccoliqueue/` (durable job queue + `queue-helpers`), `BroccoliBufferedStore`, `ProcessAgentEngine`, `FileRootLock`, `NodeProjectFiles`, and `StdioMcpTransport` |
| Stateless Plumbing | `src/plumbing/` | `PLUMBING` | Pure FIPS 180-4 SHA-256, canonical JSON, AST skeletonizer, single-pass lexical tokenizer, polyglot import/export scanner, `AsyncMutex`, `cliArgs`, and `managedBlocks` |
| UI & CLI Presenters | `src/ui/`, `bin/`, `src/index.mjs`, `src/portable.mjs` | `UI` | 10 output formatters, Mermaid graph renderer, interactive wizard presenter, CLI entrypoints (`joy.mjs`, `joy-check.mjs`, `joy-trinity.mjs`, `docs-check.mjs`), and Composition Roots (`src/index.mjs` & `src/portable.mjs`) |

---

## Request & execution flow

```
bin/joy-check.mjs (CLI) / src/index.mjs (Programmatic API)
    → NodeWorkspaceScanner (src/infrastructure/NodeWorkspaceScanner.mjs)
    → SpiderEngine.auditProject() (src/core/SpiderEngine.mjs)
        → scanSourceFile() (src/plumbing/sourceScanner.mjs → codeTokenizer.mjs)
        → inferZoneFromPath() & evaluateZoneDependency() (src/domain/joyRules.mjs)
        → detectCycles() / findArticulationBridges() / computeStructuralEntropy() (src/domain/entropyFormulas.mjs)
    → SpiderToolkit.runSpiderCheck() (src/core/SpiderToolkit.mjs)
        → computeMerkleRoot() & verifyDiskParity() (SPI-006)
        → computeWorkspaceStatistics() & detectGhostCoupling() (SPI-108)
        → evaluateSpiderGate() / clusterFindingsByCause() / buildAgentPlaybook() (src/domain/broccoliRules.mjs)
    → BroccoliRuntime (src/core/BroccoliRuntime.mjs)
        → RuntimeStateGraph (src/core/RuntimeStateGraph.mjs)
        → verifyRuntimeGraphIntegrity() (RTG-001..008)
        → NodeCasStorage (src/infrastructure/NodeCasStorage.mjs)
    → CliFormatter / AgentFormatters (src/ui/)
```

1. **Discovery (`NodeWorkspaceScanner`)** — Walks the target workspace with symlink-loop protection (`fs.realpathSync`), null-byte `\0` binary skipping, `.joyignore` glob filtering, and `stability.config.json` / `spider.spec.json` / `tsconfig.json` / `package.json` / `go.mod` / `Cargo.toml` loading.
2. **Lexical & Polyglot Scanning (`codeTokenizer` & `sourceScanner`)** — Tokenizes source files in a single pass (preserving strings, template literals, and regexes while stripping comments) to extract `[LAYER: <ZONE>]` tags, relative/alias imports, transitive re-exports, exported symbols, top-level mutable `let`/`var` bindings, cognitive complexity, and security smells (`SPI-401..403`).
3. **Graph Forensics (`SpiderEngine` & `entropyFormulas`)** — Builds the directed workspace dependency graph, resolves aliases across TypeScript/JS, Python, Go, and Rust, detects runtime vs. type-only cycles (`SPI-201` vs. `SPI-104`), Tarjan articulation bridges (`SPI-207`), blast radius (`SPI-202`, `SPI-300`), and computes the 5-factor Structural Entropy Score ($E_S$) and Stability Index ($SI$).
4. **Agent Ergonomics (`SpiderToolkit` & `JoyRideCache`)** — Computes SHA-256 Merkle roots, checks live disk parity (`SPI-006`), distills AST skeletons (`--skeleton`), scopes $N$-hop neighborhoods (`--scope`), and caches deterministic execution artifacts across 5 JoyRide tiers with 11-point fingerprint validation and L2 CAS spillover.
5. **Governed Runtime (`BroccoliRuntime` & `NodeCasStorage`)** — Tracks `Intent` → `Audit` → `MutationPlan` → `Execution` → `Verification` / `Rollback` in `RuntimeStateGraph`, enforces `RTG-001..008` before persisting snapshots to sharded CAS, and compresses multi-turn wire payloads via RFC 1952 multi-member GZIP streams.
6. **Portable Broccoli Trinity & Native Agent Tooling (`src/portable.mjs`, `bin/joy-trinity.mjs`, `bin/joy.mjs`)** — Provides durable priority job queues (`BroccoliQueue`), write-behind buffered tables with shadow transactions (`BufferedDb`), multi-specialist DAG planning and step-wise/external-process dispatch (`AgentSwarm` + `SwarmFormationLedger`), non-destructive 8-agent installation (`AgentInstaller`), and a 23-tool stdio MCP server (`McpServer`).

---

## `src/` module inventory

| Module | Zone | Lines | Primary Responsibility |
|--------|------|------:|------------------------|
| `src/domain/joyRules.mjs` | `DOMAIN` | ~782 | Canonical zones, Sovereign Dependency Matrix, `SPI-101..403` catalog, `explainJoyRule` |
| `src/domain/broccoliRules.mjs` | `DOMAIN` | ~767 | Runtime modes, budgets, `RTG-001..008` graph integrity verifier, Spider gate & playbooks |
| `src/domain/entropyFormulas.mjs` | `DOMAIN` | ~568 | Martin metrics ($I, A, D'$), 5-factor entropy ($E_S, SI$), Gini hubbiness, Z-score stats, `SPI-108` Ghost Coupling |
| `src/domain/agentTargets.mjs` | `DOMAIN` | ~220 | 8 agent target definitions (`claude`, `gemini`, `antigravity`, `cursor`, `copilot`, `windsurf`, `codex`, `cline`) |
| `src/domain/agentTemplates.mjs` & `skillTemplates.mjs` | `DOMAIN` | ~590 | Pure template generators for `SOUL.md`, `AGENTS.md`, skills (`joyzoning`, `joy-trinity`, `joy-swarm`), and plugin manifests |
| `src/domain/swarm*.mjs` & `bufferedDbOps.mjs` | `DOMAIN` | ~1,900 | Pure task classifier, DAG planner, convergence checker, mailbox, handoff, resume, and buffered row operations |
| `src/domain/interfaces/I*.mjs` | `DOMAIN` | ~420 | Formal port contracts (`IWorkspaceScanner`, `ICasStorage`, `IBufferedStore`, `ISwarmLeaseService`, `ISwarmAgentEngine`, `ISwarmConfigStore`, `IProjectFiles`) |
| `src/core/SpiderEngine.mjs` | `CORE` | ~786 | Polyglot dependency graph builder and `SPI-101..403` forensic auditor |
| `src/core/JoyRideCache.mjs` | `CORE` | ~785 | 5-tier bounded cache, 11-point validation, single-flight, 4-tier pressure valve, L2 CAS spillover |
| `src/core/BroccoliRuntime.mjs` | `CORE` | ~753 | Governed session lifecycle, Proof-Before-Mutation, rollback, story, operator views, and replay |
| `src/core/SpiderToolkit.mjs` | `CORE` | ~740 | Merkle parity (`SPI-006`), semantic footprints, $N$-hop neighborhood, AST skeletonizer, `--init`, `verifyWorkspaceDocs` |
| `src/core/BufferedDb.mjs` | `CORE` | ~545 | Write-behind table buffer, layer-ordered batch flushes, and shadow transactions over `IBufferedStore` |
| `src/core/AgentSwarmDispatcher.mjs` & `SwarmFormationLedger.mjs` | `CORE` | ~960 | Multi-specialist formation dispatcher and durable step-by-step formation state machine |
| `src/core/AgentInstaller.mjs` | `CORE` | ~520 | Non-destructive 8-agent installer (`init`, `add`, `status`, `update`, `remove`, `doctor`) |
| `src/core/mcp/McpServer.mjs` | `CORE` | ~595 | Protocol-agnostic JSON-RPC 2.0 MCP server (23 tools, 5 resources, 3 prompts) |
| `src/core/RuntimeStateGraph.mjs` | `CORE` | ~308 | Causal session DAG, schema v0→v1 migration, `explainNode`, and 5 replay mode projections |
| `src/core/RefactorHealer.mjs` | `CORE` | ~296 | Automated `[LAYER]` tag alignment (`--heal`), `PLUMBING` statelessness healing, `planMove` import rewiring |
| `src/core/StabilityDoctor.mjs` | `CORE` | ~224 | Hotspot ranking, Gini concentration analysis, and `I<ClassName>` interface synthesis |
| `src/infrastructure/NodeWorkspaceScanner.mjs` | `INFRASTRUCTURE` | ~540 | Concrete `node:fs` scanner with symlink guard, binary guard, `.joyignore`, and atomic writes |
| `src/infrastructure/NodeCasStorage.mjs` | `INFRASTRUCTURE` | ~471 | Sharded SHA-256 CAS store, corruption quarantine, and RFC 1952 multi-member GZIP Wire Engine |
| `src/infrastructure/broccolidb/` | `INFRASTRUCTURE` | ~2,100 | Zero-dependency SQLite-backed BroccoliDB kernel (`broccolidb.mjs`, `broccolidb-table.mjs`, `broccolidb-table-query.mjs`, `sqlite-driver.mjs`) |
| `src/infrastructure/broccoliqueue/` | `INFRASTRUCTURE` | ~1,800 | Durable job queue (`queue.mjs`, `queue-helpers.mjs`, `worker.mjs`, `dlq.mjs`) |
| `src/infrastructure/BroccoliBufferedStore.mjs`, `ProcessAgentEngine.mjs`, `FileRootLock.mjs`, `NodeProjectFiles.mjs`, `StdioMcpTransport.mjs` | `INFRASTRUCTURE` | ~950 | Durable BufferedDb adapter, subprocess specialist runner, `.joy-lock` PID mutex, atomic project file I/O, and stdio MCP framing |
| `src/plumbing/sourceScanner.mjs` | `PLUMBING` | ~662 | Polyglot import/export/symbol/complexity extractor (TS/JS, Python, Go, Rust, Java) |
| `src/plumbing/canonicalHash.mjs` | `PLUMBING` | ~528 | Pure FIPS 180-4 SHA-256, `stableStringify`, 65/35 output summarizer, and AST skeletonizer |
| `src/plumbing/pathUtils.mjs` | `PLUMBING` | ~338 | POSIX path normalization, relative import depth, rewiring math, and Levenshtein distance |
| `src/plumbing/codeTokenizer.mjs` | `PLUMBING` | ~285 | Single-pass lexical string/template/regex/comment scanner (with `${...}` expression lexing) and UTF-8 BOM stripper |
| `src/plumbing/commentStyles.mjs` | `PLUMBING` | ~236 | Multi-language `[LAYER: <ZONE>]` header parser and injector |
| `src/plumbing/ids.mjs`, `AsyncMutex.mjs`, `rowIds.mjs`, `cliArgs.mjs`, `managedBlocks.mjs` | `PLUMBING` | ~480 | Pure ID generation, FIFO mutex, row key extraction, Levenshtein CLI flag parser, and idempotent managed block markers |
| `src/ui/CliFormatter.mjs` & `AgentFormatters.mjs` | `UI` | ~652 | Terminal, StabilityDoctor, SARIF 2.1.0, GitHub Actions, Markdown, Explain, Mermaid, Compact, LSP, TAP, JUnit, NDJSON, and Stats presenters |
| `src/ui/JoyWizardPresenter.mjs` & `joyCommands.mjs` | `UI` | ~370 | Interactive/non-interactive `joy` CLI presenter and command registry |
| `src/index.mjs` & `src/portable.mjs` | `UI` | ~415 | Public Composition Roots exporting 84 frozen symbols (`heav3ns-joy`) and 23 portable symbols (`heav3ns-joy/portable`) |
