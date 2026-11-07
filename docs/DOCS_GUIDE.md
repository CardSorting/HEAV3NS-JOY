<!-- [LAYER: UI] -->
# Documentation Guide

Map of the **HEAV3NS-JOY** documentation system, modeled on LUMI's 1-to-1 verifiable documentation strategy.

## Principles

1. **1-to-1 with code** — Architecture and API pages mirror real paths under `src/`, `bin/`, `spec/`, `workflows/`, and `examples/`.
2. **Every markdown file is Joyzoned** — Every `.md` file begins with a valid `<!-- [LAYER: <ZONE>] -->` header tag within the first 10KB and passes `node ./bin/joy-check.mjs . --theme strict`.
3. **Two-layer clarity** — Normative language-agnostic specifications live in `spec/` and `workflows/`; repository navigation, executive/technical papers, and programmatic/CLI references live in `docs/`.
4. **Automated link & metric verification** — `npm run docs:check` (`bin/docs-check.mjs`) verifies that all required docs exist, every relative link resolves on disk, and all quantitative claims match the live codebase.

---

## Documentation map

### Navigation & Governance (`docs/`)

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Central documentation hub, audience reading paths, and Mermaid map |
| [DOCS_GUIDE.md](DOCS_GUIDE.md) | Documentation principles and directory index |
| [AGENT_STACK.md](AGENT_STACK.md) | Two-layer map: Joyzoning spatial rules + Portable Substrate Trinity |
| [PROJECT_MAP.md](PROJECT_MAP.md) | 1-to-1 directory and module map of the repository |
| [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md) | Source file → documentation page lookup table |
| [CONSTITUTION.md](CONSTITUTION.md) | The 5 immutable laws of the HEAV3NS-JOY substrate |
| [CODEBASE_STANDARDS.md](CODEBASE_STANDARDS.md) | Repository layout, zone discipline, and AI-friendly coding rules |
| [MAINTAINER.md](MAINTAINER.md) | Update checklist and `npm run docs:check` CI guardrails |
| [GETTING_STARTED.md](GETTING_STARTED.md) | 10-minute tutorial: audit, fix, enforce |
| [GLOSSARY.md](GLOSSARY.md) | Definitions of every framework term and code prefix |
| [CI_INTEGRATION.md](CI_INTEGRATION.md) | GitHub Actions, GitLab, hooks, editors, branch protection |
| [PROPAGATION.md](PROPAGATION.md) | Adoption script, agent prompts, pitches, cheat sheet, badge |
| [OPERATIONS.md](OPERATIONS.md) | Operator runbook: exit codes, config, rollout, failure modes, incidents |
| [RELEASING.md](RELEASING.md) | Versioning rules and release procedure |

### Architecture (`docs/architecture/`)

| Doc | Purpose |
|-----|---------|
| [architecture/current.md](architecture/current.md) | System architecture, 5-zone topology, and execution pipelines |

### Papers (`docs/papers/`)

| Doc | Purpose |
|-----|---------|
| [papers/README.md](papers/README.md) | Reading order and verification commands |
| [papers/companion-brief.md](papers/companion-brief.md) | Executive summary with workspace-verified metrics |
| [papers/philosophy.md](papers/philosophy.md) | *A Philosophy of Sovereign Agency* — design values tied to code |
| [papers/whitepaper.md](papers/whitepaper.md) | Full technical whitepaper (entropy math, JoyRide, Spider, BroccoliDB) |

### Runtime & Programmatic API (`docs/api/`)

| Doc | Purpose |
|-----|---------|
| [api/README.md](api/README.md) | Programmatic API and CLI reference index |
| [api/public-api.md](api/public-api.md) | Frozen 84-symbol export surface in `src/index.mjs` |
| [api/cli.md](api/cli.md) | `bin/joy-check.mjs` and `bin/docs-check.mjs` CLI reference |
| [api/errors.md](api/errors.md) | Typed `GuidedError` catalog and `SPI-*` / `RTG-*` diagnostic reference |

### Normative Specifications & Workflows (`../spec/` & `../workflows/`)

| Doc | Purpose |
|-----|---------|
| [`../spec/00-CANONICAL-MODEL.md`](../spec/00-CANONICAL-MODEL.md) | The 5 canonical zones (`DOMAIN`, `CORE`, `INFRASTRUCTURE`, `PLUMBING`, `UI`) |
| [`../spec/01-SYNTAX-AND-HEADERS.md`](../spec/01-SYNTAX-AND-HEADERS.md) | Multi-language `[LAYER: <ZONE>]` header syntax and placement rules |
| [`../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md`](../spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md) | Sovereign Dependency Matrix, depth `<= 3`, `I<ClassName>` contracts |
| [`../spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) | 5-factor Structural Entropy ($E_S$), Stability Index ($SI$), `SPI-101..403` |
| [`../spec/04-ENFORCEMENT-AND-LENIENCY.md`](../spec/04-ENFORCEMENT-AND-LENIENCY.md) | Enforcement themes (`strict`, `relaxed`, `safety`) & escape hatches |
| [`../spec/05-PORTABLE-SUBSTRATE-TRINITY.md`](../spec/05-PORTABLE-SUBSTRATE-TRINITY.md) | Zero-dependency JoyRide, Spider Agent Ergonomics, and BroccoliDB |
| [`../workflows/01-TRIAD-AUDIT-PLANNING.md`](../workflows/01-TRIAD-AUDIT-PLANNING.md) | Pre-implementation review (Architect, Critic, SRE) |
| [`../workflows/02-TACTICAL-REFACTORING-SOPS.md`](../workflows/02-TACTICAL-REFACTORING-SOPS.md) | 9 Tactical SOPs and Producer-Before-Consumer batch order |
| [`../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md`](../workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md) | Brownfield incremental adoption playbook |
| [`../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md`](../workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md) | JoyRide 5 cache tiers, 4-tier memory pressure valve, & L2 CAS spillover |
| [`../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md`](../workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md) | Operational playbook for Spider checks and BroccoliDB governed sessions |

---

## Verification

```bash
npm run docs:check
npm run joy-check
npm test
```
