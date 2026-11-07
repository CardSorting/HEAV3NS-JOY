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

## Core Orchestration Engines (`src/core/`)

| Source | Documentation |
|--------|---------------|
| `src/core/SpiderEngine.mjs` | [Architecture (current)](architecture/current.md) · [`spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) |
| `src/core/SpiderToolkit.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) · [api/public-api.md](api/public-api.md) |
| `src/core/StabilityDoctor.mjs` | [`spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) · [api/cli.md](api/cli.md) |
| `src/core/RefactorHealer.mjs` | [`workflows/02-TACTICAL-REFACTORING-SOPS.md`](../workflows/02-TACTICAL-REFACTORING-SOPS.md) · [api/public-api.md](api/public-api.md) |
| `src/core/JoyRideCache.mjs` | [`workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md`](../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md) · [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [api/public-api.md](api/public-api.md) |
| `src/core/BroccoliRuntime.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [`workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) · [api/public-api.md](api/public-api.md) |
| `src/core/RuntimeStateGraph.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [Whitepaper §6](papers/whitepaper.md) |

## Infrastructure Adapters (`src/infrastructure/`)

| Source | Documentation |
|--------|---------------|
| `src/infrastructure/NodeWorkspaceScanner.mjs` | [Architecture (current)](architecture/current.md) · [`workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md`](../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md) |
| `src/infrastructure/NodeCasStorage.mjs` | [`spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) · [Whitepaper §6](papers/whitepaper.md) · [api/public-api.md](api/public-api.md) |

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
| `bin/docs-check.mjs` | [MAINTAINER.md](MAINTAINER.md) · [DOCS_GUIDE.md](DOCS_GUIDE.md) |

## Papers & Executive Narrative

| Doc type | Path |
|----------|------|
| Values & doctrine | [papers/philosophy.md](papers/philosophy.md) |
| Live metrics & executive brief | [papers/companion-brief.md](papers/companion-brief.md) |
| Engineering whitepaper | [papers/whitepaper.md](papers/whitepaper.md) |
| Two-layer stack hub | [AGENT_STACK.md](AGENT_STACK.md) |

