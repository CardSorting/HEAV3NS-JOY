<!-- [LAYER: UI] -->
# Documentation Guide

<p align="center">
  <a href="README.md">Docs Hub</a> ·
  <a href="adr/README.md">ADRs</a> ·
  <a href="playbooks/README.md">Playbooks</a> ·
  <a href="wiki/README.md">Wiki</a> ·
  <a href="postmortems/README.md">Postmortems</a> ·
  <a href="kb/README.md">Knowledge Base</a> ·
  <a href="MAINTAINER.md">Maintainer Guide</a>
</p>

Complete map of the **HEAV3NS-JOY** documentation system, combining the **Diátaxis framework** (Tutorials, How-To Playbooks, Reference, Explanation/Wiki) with **Institutional Engineering Memory** (MADR Architecture Decision Records, Google SRE Blameless Postmortems, and a 3-Tier Knowledge Base), continuously verified by `npm run docs:check` ([ADR-0009](adr/0009-diataxis-documentation-and-knowledge-governance.md)).

---

## Principles

1. **1-to-1 with code** — Architecture, ADR, Playbook, Postmortem, Wiki, KB, and API pages mirror real paths under `src/`, `bin/`, `spec/`, `workflows/`, and `examples/`.
2. **Every markdown file is Joyzoned** — Every `.md` file begins with a valid `<!-- [LAYER: <ZONE>] -->` header tag within the first 10KB and passes `node ./bin/joy-check.mjs . --theme strict`.
3. **Diátaxis + Institutional Memory separation** — Normative language-agnostic specifications live in `spec/` and `workflows/`; repository navigation, ADRs, operational playbooks, engineering wiki, blameless postmortems, knowledge base, executive/technical papers, and programmatic/CLI references live in `docs/`.
4. **Automated link, taxonomy, & metric verification** — `npm run docs:check` (`bin/docs-check.mjs`) verifies that all required docs exist, every hub indexes its children, mandatory ADR/Playbook/Postmortem sections are present, every relative link resolves on disk, and all quantitative claims match the live codebase.

---

## Documentation map

### 1. Navigation & Governance (`docs/`)

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Central documentation hub, Diátaxis map, audience reading paths, and Mermaid diagram |
| [DOCS_GUIDE.md](DOCS_GUIDE.md) | Documentation principles and complete directory index |
| [AGENT_STACK.md](AGENT_STACK.md) | Three-surface map: Joyzoning spatial rules + Operational Substrate + Native Agent Tooling |
| [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md) | Zero-dependency `BroccoliQueue`, `BufferedDb`, and `AgentSwarm` shell & Node API guide |
| [PROJECT_MAP.md](PROJECT_MAP.md) | 1-to-1 directory and module map of the repository |
| [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md) | Source file → documentation page lookup table |
| [CONSTITUTION.md](CONSTITUTION.md) | The 5 immutable laws of the HEAV3NS-JOY substrate |
| [CODEBASE_STANDARDS.md](CODEBASE_STANDARDS.md) | Repository layout, zone discipline, and AI-friendly coding rules |
| [MAINTAINER.md](MAINTAINER.md) | Update checklist and `npm run docs:check` CI guardrails |
| [GETTING_STARTED.md](GETTING_STARTED.md) | 10-minute tutorial: audit, `joy init`, fix, enforce |
| [GLOSSARY.md](GLOSSARY.md) | Definitions of every framework term and code prefix |
| [CI_INTEGRATION.md](CI_INTEGRATION.md) | GitHub Actions, GitLab, hooks, editors, branch protection |
| [PROPAGATION.md](PROPAGATION.md) | Adoption script, agent prompts, pitches, cheat sheet, badge |
| [OPERATIONS.md](OPERATIONS.md) | Operator runbook: exit codes, config, rollout, failure modes, incidents |
| [SECURITY_BEST_PRACTICES.md](SECURITY_BEST_PRACTICES.md) | Security model, CAS & `.joy-lock` guards, approval gates, and local-first guarantees |
| [RELEASING.md](RELEASING.md) | Versioning rules and release procedure |

### 2. Architecture Decision Records (`docs/adr/`)

| Doc | Purpose |
|-----|---------|
| [adr/README.md](adr/README.md) | ADR index, decision dependency graph, and MADR lifecycle rules |
| [adr/0000-adr-template.md](adr/0000-adr-template.md) | Canonical MADR template with mandatory `## Verification` section |
| [adr/0001-five-canonical-zones-and-geographic-alignment.md](adr/0001-five-canonical-zones-and-geographic-alignment.md) | 5 Canonical Zones & Principle of Geographic Alignment (PGA) |
| [adr/0002-zero-dependency-polyglot-lexical-scanner.md](adr/0002-zero-dependency-polyglot-lexical-scanner.md) | Zero external dependencies & single-pass polyglot lexical scanner |
| [adr/0003-strike-one-vs-advisory-enforcement-model.md](adr/0003-strike-one-vs-advisory-enforcement-model.md) | Strike-1 blocking vs. non-blocking advisory enforcement (`SPI-*`) |
| [adr/0004-proof-before-mutation-and-sharded-cas.md](adr/0004-proof-before-mutation-and-sharded-cas.md) | Proof-Before-Mutation (`RTG-003`), causal graph, & sharded SHA-256 CAS |
| [adr/0005-joyride-eleven-point-fingerprint-cache.md](adr/0005-joyride-eleven-point-fingerprint-cache.md) | JoyRide 5-tier cache, 11-point fingerprint validation, & L1/L2 CAS spillover |
| [adr/0006-portable-trinity-and-shell-json-contract.md](adr/0006-portable-trinity-and-shell-json-contract.md) | Portable Broccoli Trinity & harness-agnostic shell-in/JSON-out contract |
| [adr/0007-dual-composition-roots-and-frozen-api.md](adr/0007-dual-composition-roots-and-frozen-api.md) | Dual Composition Roots (`src/index.mjs` 84 exports & `src/portable.mjs`) |
| [adr/0008-non-destructive-agent-installer-and-safe-mcp.md](adr/0008-non-destructive-agent-installer-and-safe-mcp.md) | Non-destructive 8-agent installer (`joy init`), managed blocks, & safe MCP |
| [adr/0009-diataxis-documentation-and-knowledge-governance.md](adr/0009-diataxis-documentation-and-knowledge-governance.md) | Diátaxis + Institutional Memory documentation architecture & guardrails |

### 3. Operational & Incident Playbooks (`docs/playbooks/`)

| Doc | Purpose |
|-----|---------|
| [playbooks/README.md](playbooks/README.md) | Playbook hub, `SEV-1..4` matrix, and Mermaid triage router |
| [playbooks/architectural-violation-remediation.md](playbooks/architectural-violation-remediation.md) | `PB-01`: Remediating `SPI-201..209` and `SPI-401..403` blocking violations |
| [playbooks/trinity-lock-and-wal-recovery.md](playbooks/trinity-lock-and-wal-recovery.md) | `PB-02`: `ROOT_LOCKED`, `BUFFER_FULL`, failed queue jobs, & CAS quarantine recovery |
| [playbooks/swarm-stalls-and-failover.md](playbooks/swarm-stalls-and-failover.md) | `PB-03`: Stale specialist claims, cascading skips, `swarm retry`, & failover |
| [playbooks/agent-drift-and-mcp-troubleshooting.md](playbooks/agent-drift-and-mcp-troubleshooting.md) | `PB-04`: `CONFLICTS` backups, `joy status` drift, MCP handshakes, & post-edit hooks |
| [playbooks/brownfield-migration-and-monorepo-rollout.md](playbooks/brownfield-migration-and-monorepo-rollout.md) | `PB-05`: 4-phase zero-downtime brownfield & polyglot monorepo rollout |

### 4. Engineering Wiki (`docs/wiki/`)

| Doc | Purpose |
|-----|---------|
| [wiki/README.md](wiki/README.md) | Engineering Wiki portal and visual system map |
| [wiki/mental-models.md](wiki/mental-models.md) | The 6 core mental models & analogies of HEAV3NS-JOY |
| [wiki/polyglot-recipes.md](wiki/polyglot-recipes.md) | Side-by-side header, interface, & alias cookbook across 9+ languages |
| [wiki/mcp-and-agent-harnesses.md](wiki/mcp-and-agent-harnesses.md) | Guide to the 8 coding agent targets, `SOUL.md`, CLI vs MCP vs ESM, & hooks |
| [wiki/metrics-and-entropy-encyclopedia.md](wiki/metrics-and-entropy-encyclopedia.md) | Visual math encyclopedia for $E_S$, $SI$, Martin ($I, A, D'$), Gini, bridges, & `SPI-108` |

### 5. Blameless SRE Postmortems (`docs/postmortems/`)

| Doc | Purpose |
|-----|---------|
| [postmortems/README.md](postmortems/README.md) | Postmortem registry and closed-loop incident learning pipeline |
| [postmortems/0000-postmortem-template.md](postmortems/0000-postmortem-template.md) | Canonical blameless postmortem template (5 Whys, timeline, action items) |
| [postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md](postmortems/PM-001-agent-infinite-repair-loop-on-advisory-warnings.md) | `PM-001`: Agent repair loops on advisories → Strike-1 vs Advisory split |
| [postmortems/PM-002-multi-process-wal-contention-and-orphaned-root-locks.md](postmortems/PM-002-multi-process-wal-contention-and-orphaned-root-locks.md) | `PM-002`: Concurrent WAL access & crashed PID locks → `FileRootLock` |
| [postmortems/PM-003-template-literal-false-positive-imports-and-bom-headers.md](postmortems/PM-003-template-literal-false-positive-imports-and-bom-headers.md) | `PM-003`: Nested `${...}` template strings & UTF-8 BOM → `codeTokenizer.mjs` |
| [postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md](postmortems/PM-004-cache-poisoning-and-secret-leakage-in-agent-scratchpads.md) | `PM-004`: Stale cache reads & token persistence → 11-point JoyRide + `SECRET_DETECTED` |
| [postmortems/PM-005-prompt-injection-and-unverified-replay-in-specialist-swarms.md](postmortems/PM-005-prompt-injection-and-unverified-replay-in-specialist-swarms.md) | `PM-005`: Shell metacharacters & heuristic poisoning → `shell: false` + untrusted XML framing |

### 6. Knowledge Base & Knowledge-Based Handling (`docs/kb/`)

| Doc | Purpose |
|-----|---------|
| [kb/README.md](kb/README.md) | Knowledge Base hub and top-10 symptom router |
| [kb/knowledge-handling-architecture.md](kb/knowledge-handling-architecture.md) | Complete 3-Tier Knowledge-Based Handling architecture & `swarm knowledge` CLI/MCP/API guide |
| [kb/symptom-diagnosis-matrix.md](kb/symptom-diagnosis-matrix.md) | Master Symptom → Root Cause → Fix Command → Playbook/ADR resolution table |
| [kb/faq-and-edge-cases.md](kb/faq-and-edge-cases.md) | Technical FAQ, Composition Roots, `import type`, `@joyzoning-bypass`, & heuristic curation |

### 7. Architecture (`docs/architecture/`)

| Doc | Purpose |
|-----|---------|
| [architecture/current.md](architecture/current.md) | System architecture, 5-zone topology, and execution pipelines |

### 8. Papers (`docs/papers/`)

| Doc | Purpose |
|-----|---------|
| [papers/README.md](papers/README.md) | Reading order and verification commands |
| [papers/companion-brief.md](papers/companion-brief.md) | Executive summary with workspace-verified metrics |
| [papers/philosophy.md](papers/philosophy.md) | *A Philosophy of Sovereign Agency* — design values tied to code |
| [papers/whitepaper.md](papers/whitepaper.md) | Full technical whitepaper (entropy math, JoyRide, Spider, BroccoliDB) |

### 9. Runtime & Programmatic API (`docs/api/`)

| Doc | Purpose |
|-----|---------|
| [api/README.md](api/README.md) | Programmatic API and CLI reference index |
| [api/public-api.md](api/public-api.md) | Frozen 84-symbol export surface in `src/index.mjs` + `heav3ns-joy/portable` |
| [api/cli.md](api/cli.md) | `bin/joy.mjs`, `bin/joy-check.mjs`, `bin/joy-trinity.mjs`, `bin/docs-check.mjs`, & MCP server reference |
| [api/errors.md](api/errors.md) | Typed `GuidedError` catalog and `SPI-*` / `RTG-*` diagnostic reference |

### 10. Normative Specifications & Workflows (`../spec/` & `../workflows/`)

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
