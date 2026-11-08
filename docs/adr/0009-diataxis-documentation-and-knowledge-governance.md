<!-- [LAYER: UI] -->
# ADR-0009: Diátaxis + Institutional Memory Documentation Architecture & Automated Guardrails

- **Status**: Accepted
- **Date**: 2026-11-07
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`docs/DOCS_GUIDE.md`](../DOCS_GUIDE.md) · [`docs/kb/knowledge-handling-architecture.md`](../kb/knowledge-handling-architecture.md)

---

## Status

Accepted — Enforced by `npm run docs:check` ([`bin/docs-check.mjs`](../../bin/docs-check.mjs) & [`verifyWorkspaceDocs`](../../src/core/SpiderToolkit.mjs)).

## Context

As **HEAV3NS-JOY** grew across three surfaces—Spatial Joyzoning (`spec/00..04`), the Operational Substrate & Portable Trinity (`spec/05`, `joy-trinity`), and Native Agent Tooling (`joy init`, `joy mcp`, `SOUL.md`, `plugin/`)—standard reference docs alone were no longer sufficient for world-class engineering ergonomics:
- **Missing Decision Provenance**: Engineers and agents could see *what* the rules were in `spec/`, but needed **Architecture Decision Records (`docs/adr/`)** to understand *why* alternatives were rejected.
- **Missing Incident Runbooks**: When an operator hit `ROOT_LOCKED`, `BUFFER_FULL`, `SPI-201`, or a stalled swarm formation, they needed step-by-step **Operational Playbooks (`docs/playbooks/`)** with triage decision trees.
- **Missing Approachable Encyclopedia**: New adopters needed a visual, concept-first **Engineering Wiki (`docs/wiki/`)** with mental models and polyglot recipes.
- **Missing Failure Memory**: Lessons from real engineering failure modes needed to be preserved in **Blameless Postmortems (`docs/postmortems/`)** linked to regression tests.
- **Missing Unified Knowledge Handling**: The relationship between runtime workspace heuristics (`SwarmKnowledgeService`) and permanent repository knowledge needed a dedicated **Knowledge Base (`docs/kb/`)** and symptom router.

### Decision drivers

- **Industry-Standard Information Architecture**: Combine **Diátaxis** (Tutorials, How-To Playbooks, Reference, Explanation/Wiki) with **Institutional Memory** (MADR ADRs, Google SRE Blameless Postmortems, Symptom-First Knowledge Base).
- **1-Click Navigation Ergonomics**: Every hub and article must provide top breadcrumb navigation and role/symptom routing tables.
- **Zero Documentation Drift**: Every doc file, section requirement, index link, `[LAYER: <ZONE>]` header, and live codebase metric must be verified automatically in CI by `npm run docs:check`.

### Considered options

1. **Keep Everything in Flat `docs/*.md` Files**: Cluttered root directory; no distinction between normative specs, incident playbooks, historical ADRs, and postmortems.
2. **Host Wiki / Runbooks in an External SaaS Tool (Notion / Confluence / GitHub Wiki Repo)**: Violates Law #1 ("The repository itself is the propagation substrate") and cannot be link-checked or versioned atomically with code PRs.
3. **In-Repository Structured Taxonomy (`docs/adr/`, `docs/playbooks/`, `docs/wiki/`, `docs/postmortems/`, `docs/kb/`, `docs/api/`, `docs/papers/`, `docs/architecture/`) Enforced by `verifyWorkspaceDocs`**.

## Decision

We chose **Option 3**:

1. **Five Institutional Knowledge Pillars under `docs/`**:
   - [`docs/adr/`](README.md): MADR Architecture Decision Records (`ADR-0001..0009` + template).
   - [`docs/playbooks/`](../playbooks/README.md): Operational & incident remediation playbooks (`PB-01..05`).
   - [`docs/wiki/`](../wiki/README.md): Concept encyclopedia, mental models, polyglot cookbook, and metrics guide.
   - [`docs/postmortems/`](../postmortems/README.md): Blameless SRE postmortems (`PM-001..005` + template) tied to ADRs and test suites.
   - [`docs/kb/`](../kb/README.md): Symptom-first Knowledge Base and 3-Tier Knowledge-Based Handling architecture (`JoyRideCache` → `SwarmKnowledgeService` → Repository Docs).
2. **Automated Guardrails in `verifyWorkspaceDocs` (`src/core/SpiderToolkit.mjs`)**:
   - Verifies that all required files across `docs/adr/`, `docs/playbooks/`, `docs/wiki/`, `docs/postmortems/`, and `docs/kb/` exist on disk and carry valid `<!-- [LAYER: UI] -->` headers.
   - Verifies that every ADR, Playbook, Wiki page, Postmortem, and KB article is linked from its respective hub `README.md` and contains its mandatory structural headings.
   - Verifies that `100%` of relative markdown links across the entire repository resolve on disk and live metrics match source code.

## Consequences

### Positive

- Both human engineers and AI coding agents have immediate, self-contained access to ADRs, Playbooks, Wiki guides, Postmortems, and the Knowledge Base directly in the repo.
- `npm run docs:check` prevents orphaned pages, missing sections, or broken cross-links from ever merging.

### Negative / trade-offs

- Adding a new ADR, Playbook, Wiki page, Postmortem, or KB article requires indexing it in its hub `README.md` so `docs:check` passes.

## Verification

```bash
npm run docs:check
node ./bin/docs-check.mjs . --json
```

- **Code**: [`src/core/SpiderToolkit.mjs`](../../src/core/SpiderToolkit.mjs) · [`bin/docs-check.mjs`](../../bin/docs-check.mjs)
- **Guide**: [`docs/DOCS_GUIDE.md`](../DOCS_GUIDE.md) · [`docs/kb/knowledge-handling-architecture.md`](../kb/knowledge-handling-architecture.md)

