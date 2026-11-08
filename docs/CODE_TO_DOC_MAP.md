<!-- [LAYER: UI] -->
# Code-to-Doc Map

Use this lookup table whenever you modify code in `src/`, `bin/`, or `configs/` to locate the corresponding documentation pages to update.

## Domain & Contracts (`src/domain/`)

| Source | Documentation |
|--------|---------------|
| `src/domain/joyRules.mjs` | [`spec/00-CANONICAL-MODEL.md`](../spec/00-CANONICAL-MODEL.md) · [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) · [api/errors.md](api/errors.md) |
| `src/domain/entropyFormulas.mjs` | [`spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) · [Whitepaper §3](papers/whitepaper.md) |
| `src/domain/broccoliRules.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [api/errors.md](api/errors.md) |
| `src/domain/interfaces/IWorkspaceScanner.mjs` | [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) · [api/public-api.md](api/public-api.md) |
| `src/domain/interfaces/ICasStorage.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [api/errors.md](api/errors.md) |
| `src/domain/managedBlock.mjs`, `src/domain/agentTemplates.mjs`, `src/domain/agentTargets.mjs` | [api/cli.md](api/cli.md) · [`README.md`](../README.md) · [`SOUL.md`](../SOUL.md) |
| `src/domain/mcpProtocol.mjs`, `src/domain/jsonSchemaLite.mjs` | [api/cli.md](api/cli.md) · [`AGENTS.md`](../AGENTS.md) |
| `src/domain/interfaces/IProjectFiles.mjs`, `src/domain/interfaces/IToolRunner.mjs`, `src/domain/interfaces/IPathGuard.mjs`, `src/domain/interfaces/IResourceReader.mjs` | [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) · [api/cli.md](api/cli.md) |
| `src/domain/swarmKnowledge.mjs`, `src/domain/swarm*.mjs`, `src/domain/bufferedDbOps.mjs` | [kb/knowledge-handling-architecture.md](kb/knowledge-handling-architecture.md) · [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [adr/0006-portable-trinity-and-shell-json-contract.md](adr/0006-portable-trinity-and-shell-json-contract.md) |

## Core Orchestration Engines (`src/core/`)

| Source | Documentation |
|--------|---------------|
| `src/core/SpiderEngine.mjs` | [Architecture (current)](architecture/current.md) · [`spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) · [adr/0003-strike-one-vs-advisory-enforcement-model.md](adr/0003-strike-one-vs-advisory-enforcement-model.md) · [playbooks/architectural-violation-remediation.md](playbooks/architectural-violation-remediation.md) |
| `src/core/SpiderToolkit.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) · [api/public-api.md](api/public-api.md) · [adr/0009-diataxis-documentation-and-knowledge-governance.md](adr/0009-diataxis-documentation-and-knowledge-governance.md) |
| `src/core/StabilityDoctor.mjs` | [`spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) · [api/cli.md](api/cli.md) · [wiki/metrics-and-entropy-encyclopedia.md](wiki/metrics-and-entropy-encyclopedia.md) |
| `src/core/RefactorHealer.mjs` | [`workflows/02-TACTICAL-REFACTORING-SOPS.md`](../workflows/02-TACTICAL-REFACTORING-SOPS.md) · [api/public-api.md](api/public-api.md) · [playbooks/architectural-violation-remediation.md](playbooks/architectural-violation-remediation.md) |
| `src/core/JoyRideCache.mjs` | [`workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md`](../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md) · [adr/0005-joyride-eleven-point-fingerprint-cache.md](adr/0005-joyride-eleven-point-fingerprint-cache.md) · [postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md](postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md) |
| `src/core/BroccoliRuntime.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [adr/0004-proof-before-mutation-and-sharded-cas.md](adr/0004-proof-before-mutation-and-sharded-cas.md) · [api/public-api.md](api/public-api.md) |
| `src/core/RuntimeStateGraph.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [Whitepaper §6](papers/whitepaper.md) · [adr/0004-proof-before-mutation-and-sharded-cas.md](adr/0004-proof-before-mutation-and-sharded-cas.md) |
| `src/core/SwarmKnowledgeService.mjs`, `src/core/AgentSwarmDispatcher.mjs`, `src/core/SwarmFormationLedger.mjs`, `src/core/BufferedDb.mjs` | [kb/knowledge-handling-architecture.md](kb/knowledge-handling-architecture.md) · [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [playbooks/swarm-stalls-and-failover.md](playbooks/swarm-stalls-and-failover.md) |
| `src/core/AgentInstaller.mjs`, `src/core/McpServer.mjs` | [api/cli.md](api/cli.md) · [adr/0008-non-destructive-agent-installer-and-safe-mcp.md](adr/0008-non-destructive-agent-installer-and-safe-mcp.md) · [playbooks/agent-drift-and-mcp-troubleshooting.md](playbooks/agent-drift-and-mcp-troubleshooting.md) |

## Infrastructure Adapters (`src/infrastructure/`)

| Source | Documentation |
|--------|---------------|
| `src/infrastructure/NodeWorkspaceScanner.mjs` | [Architecture (current)](architecture/current.md) · [`workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md`](../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md) |
| `src/infrastructure/NodeCasStorage.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [Whitepaper §6](papers/whitepaper.md) · [api/public-api.md](api/public-api.md) |
| `src/infrastructure/broccolidb/*` (`broccolidb.mjs`, `broccolidb-table.mjs`, `broccolidb-table-query.mjs`, `sqlite-driver.mjs`) | [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [api/public-api.md](api/public-api.md) |
| `src/infrastructure/broccoliqueue/*` (`queue.mjs`, `queue-helpers.mjs`, `worker.mjs`, `dlq.mjs`) | [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [api/cli.md](api/cli.md) |
| `src/infrastructure/BroccoliBufferedStore.mjs`, `MemoryBufferedStore.mjs`, `ProcessAgentEngine.mjs`, `FileSwarmConfigStore.mjs`, `MemorySwarmConfigStore.mjs`, `FileRootLock.mjs` | [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md) |
| `src/infrastructure/NodeProjectFiles.mjs`, `StdioMcpTransport.mjs` | [api/cli.md](api/cli.md) · [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md) |

## Stateless Plumbing (`src/plumbing/`)

| Source | Documentation |
|--------|---------------|
| `src/plumbing/canonicalHash.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [api/public-api.md](api/public-api.md) |
| `src/plumbing/commentStyles.mjs` | [`spec/01-SYNTAX-AND-HEADERS.md`](../spec/01-SYNTAX-AND-HEADERS.md) |
| `src/plumbing/codeTokenizer.mjs` | [Architecture (current)](architecture/current.md) · [Whitepaper §4](papers/whitepaper.md) |
| `src/plumbing/sourceScanner.mjs` | [Architecture (current)](architecture/current.md) · [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) |
| `src/plumbing/pathUtils.mjs` | [`spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) |

## UI, CLI, & Composition Root (`src/ui/`, `src/index.mjs`, `bin/`)

| Source | Documentation |
|--------|---------------|
| `src/index.mjs` | [api/public-api.md](api/public-api.md) · [Companion brief](papers/companion-brief.md) |
| `src/ui/CliFormatter.mjs` | [api/cli.md](api/cli.md) · [api/public-api.md](api/public-api.md) |
| `src/ui/AgentFormatters.mjs` | [api/cli.md](api/cli.md) · [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) |
| `bin/joy-check.mjs` | [api/cli.md](api/cli.md) · [`README.md`](../README.md) |
| `bin/joy.mjs`, `src/ui/joyCommands.mjs`, `src/ui/joyRenderer.mjs`, `src/ui/prompts.mjs` | [api/cli.md](api/cli.md) · [`README.md`](../README.md) · [`AGENTS.md`](../AGENTS.md) |
| `bin/joy-trinity.mjs`, `src/ui/trinityCli.mjs`, `src/ui/trinityRenderer.mjs`, `src/ui/cliKit.mjs` | [api/cli.md](api/cli.md) · [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) · [`README.md`](../README.md) |
| `scripts/build-plugin.mjs` | [api/cli.md](api/cli.md) · [`README.md`](../README.md) |
| `bin/docs-check.mjs` | [MAINTAINER.md](MAINTAINER.md) · [DOCS_GUIDE.md](DOCS_GUIDE.md) |

## Papers & Executive Narrative

| Doc type | Path |
|----------|------|
| Values & doctrine | [papers/philosophy.md](papers/philosophy.md) |
| Live metrics & executive brief | [papers/companion-brief.md](papers/companion-brief.md) |
| Engineering whitepaper | [papers/whitepaper.md](papers/whitepaper.md) |
| Two-layer stack hub | [AGENT_STACK.md](AGENT_STACK.md) |

