<!-- [LAYER: UI] -->
# Documentation Maintainer Guide

How to keep **HEAV3NS-JOY** documentation synchronized with the live codebase.

## When you change code, update docs

Use [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md) to find the matching documentation page. Minimum updates:

| Change | Update |
|--------|--------|
| New exported symbol in `src/index.mjs` or `src/portable.mjs` | [api/public-api.md](api/public-api.md), [PORTABLE_TRINITY.md](PORTABLE_TRINITY.md), [README.md](README.md), [papers/companion-brief.md](papers/companion-brief.md) |
| New CLI command/flag or MCP tool in `bin/joy*.mjs` or `McpServer.mjs` | [api/cli.md](api/cli.md), [`../README.md`](../README.md), [papers/companion-brief.md](papers/companion-brief.md) |
| New agent target, skill, or template in `src/domain/*Templates.mjs` | Run `npm run plugin:build` (`npm run plugin:check` verifies sync in CI), update [api/cli.md](api/cli.md) |
| New `SPI-xxx` or `RTG-xxx` diagnostic | [api/errors.md](api/errors.md), [`../spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) |
| New module under `src/`, `bin/`, or `plugin/` | [PROJECT_MAP.md](PROJECT_MAP.md), [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md), [architecture/current.md](architecture/current.md) |
| Architectural or mathematical change | [papers/companion-brief.md](papers/companion-brief.md), [papers/philosophy.md](papers/philosophy.md), [papers/whitepaper.md](papers/whitepaper.md) |

---

## Automated CI & documentation guardrails

Run the zero-dependency verification suite from the repository root:

```bash
npm run verify                      # Run npm test + joy-check + docs:check + plugin:check
npm run docs:check                  # Verify required docs, relative links, sections, and live metrics
npm run joy-check                   # Verify 100% Joyzoning & Spider self-conformance across all files
npm run plugin:check                # Verify plugin/ bundle matches templates (regenerate via npm run plugin:build)
npm test                            # Run all 22 test files (36 logical suites, 196 tests)
```

### What `npm run docs:check` (`bin/docs-check.mjs`) enforces

1. **Required documentation inventory**: Verifies that all canonical documentation files across `docs/` (`docs/adr/`, `docs/playbooks/`, `docs/wiki/`, `docs/postmortems/`, `docs/kb/`, `docs/api/`, `docs/papers/`, `docs/architecture/`), root (`README.md`, `AGENTS.md`, `SOUL.md`, `VALIDATION_REPORT.md`), `spec/00..05`, and `workflows/01..05` exist on disk.
2. **Joyzoning `[LAYER: ...]` header compliance**: Verifies that every markdown file in `docs/`, `spec/`, `workflows/`, and root starts with a valid `<!-- [LAYER: <ZONE>] -->` tag.
3. **Structure & taxonomy guardrails**:
   - Enforces the presence of LUMI-standard sections in `docs/README.md` (`## At a glance`, `## Project configuration`, `## Reading paths by audience`, `## Where to document what`, `## Release & policy`, `## Local development`, `## Principles`), links to all institutional hubs (`adr/README.md`, `playbooks/README.md`, `wiki/README.md`, `postmortems/README.md`, `kb/README.md`), and an embedded `mermaid` diagram.
   - Verifies that every ADR (`docs/adr/0*.md`) is indexed in `docs/adr/README.md` and contains `## Status`, `## Context`, `## Decision`, `## Consequences`, and `## Verification`.
   - Verifies that every Playbook (`docs/playbooks/*.md`) is indexed in `docs/playbooks/README.md` and contains `## Triage at a glance`, `## Remediation steps`, and `## Verification`.
   - Verifies that every Wiki chapter (`docs/wiki/*.md`) is indexed in `docs/wiki/README.md`.
   - Verifies that every Postmortem (`docs/postmortems/PM-*.md`) is indexed in `docs/postmortems/README.md` and contains `## Summary`, `## Root cause`, `## Action items`, and `## Lessons learned`.
   - Verifies that every Knowledge Base article (`docs/kb/*.md`) is indexed in `docs/kb/README.md`.
4. **Zero broken relative links**: Parses every markdown link `[label](target)` across all scanned markdown files and asserts that the target file exists on disk.
5. **Live codebase metric parity**: Cross-checks `package.json` (`version`), `src/index.mjs` (exported symbol count), `src/domain/joyRules.mjs` (`CANONICAL_ZONES`), `src/domain/broccoliRules.mjs` (`RUNTIME_MODES`), and `src/core/JoyRideCache.mjs` (`JOYRIDE_KINDS`) against the figures published in `docs/README.md` and `docs/papers/companion-brief.md`.

---

## Papers maintenance

Whenever a major capability or architectural pass lands, update the three papers in order:

1. [papers/companion-brief.md](papers/companion-brief.md) — Executive summary and `By the numbers` table.
2. [papers/philosophy.md](papers/philosophy.md) — Doctrine-to-implementation table.
3. [papers/whitepaper.md](papers/whitepaper.md) — Technical architecture and mathematical specification.


---

## CI pipeline & releases

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [`ci.yml`](../.github/workflows/ci.yml) | push to `main`, PRs | Tests (Node 18/20/22 + macOS + Windows), self-audit, docs guardrails, package check, SARIF upload, aggregate `CI required checks passed` gate |
| [`codeql.yml`](../.github/workflows/codeql.yml) | push, PR, weekly | CodeQL security analysis |
| [`release.yml`](../.github/workflows/release.yml) | `v*.*.*` tag | Verified GitHub Release; see [RELEASING.md](RELEASING.md) |
| [`dependabot.yml`](../.github/dependabot.yml) | weekly | Keeps GitHub Actions versions current |

Run everything CI runs with `npm run verify`. See [CI_INTEGRATION.md](CI_INTEGRATION.md) for adopting these in other repositories.

---

## Maintainer quick reference

| Task | How |
|------|-----|
| Run everything CI runs | `npm run verify` |
| Triage an issue | Reproduce with the reporter's command; label `bug`/`enhancement`; ask for `node -v` and output if missing |
| Review a PR | Check the PR template boxes; confirm `CI required checks passed`; confirm new files have matching `[LAYER]` headers; confirm docs/CHANGELOG updated |
| Merge Dependabot PRs | Merge when CI and CodeQL are green; grouped weekly, so review the diff of `uses:` lines only |
| Cut a release | [RELEASING.md](RELEASING.md) |
| Handle a security report | Follow [SECURITY.md](../SECURITY.md); fix privately, then release and disclose |
| Help an operator | [OPERATIONS.md](OPERATIONS.md) runbook |

### Add a diagnostic rule

1. Define it in `src/domain/` (pure rule) and wire evaluation in `src/core/`.
2. Add `--explain` content and a test (positive and negative case).
3. Document in [api/errors.md](api/errors.md) and [`../spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md).
4. Decide severity: new rules should ship as **advisories** in a minor release; promote to blocking only in a major.
5. `npm run verify`, update the CHANGELOG.

### Add a language

Register the extension and comment syntax in `src/plumbing/commentStyles.mjs`, add scanner coverage and a test fixture, then document the header syntax in [`../spec/01-SYNTAX-AND-HEADERS.md`](../spec/01-SYNTAX-AND-HEADERS.md).

### Recommended repository settings

- Branch protection on `main`: require PR, CODEOWNERS review, and the `CI required checks passed` status.
- Enable private vulnerability reporting and Dependabot alerts.
- Disallow force pushes and branch deletion on `main`.

### Definition of done

Tests pass, `joy-check` reports 0 blocking violations, `docs:check` passes, CHANGELOG `[Unreleased]` updated, public behavior changes reflected in [api/cli.md](api/cli.md) or [api/public-api.md](api/public-api.md).
