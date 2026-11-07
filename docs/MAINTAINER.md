<!-- [LAYER: UI] -->
# Documentation Maintainer Guide

How to keep **HEAV3NS-JOY** documentation synchronized with the live codebase.

## When you change code, update docs

Use [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md) to find the matching documentation page. Minimum updates:

| Change | Update |
|--------|--------|
| New exported symbol in `src/index.mjs` | [api/public-api.md](api/public-api.md), [README.md](README.md), [papers/companion-brief.md](papers/companion-brief.md) |
| New CLI option or `--format` in `bin/joy-check.mjs` | [api/cli.md](api/cli.md), [`../README.md`](../README.md), [papers/companion-brief.md](papers/companion-brief.md) |
| New `SPI-xxx` or `RTG-xxx` diagnostic | [api/errors.md](api/errors.md), [`../spec/03-METRICS-AND-FORENSICS.md`](../spec/03-METRICS-AND-FORENSICS.md) |
| New module under `src/` | [PROJECT_MAP.md](PROJECT_MAP.md), [CODE_TO_DOC_MAP.md](CODE_TO_DOC_MAP.md), [architecture/current.md](architecture/current.md) |
| Architectural or mathematical change | [papers/companion-brief.md](papers/companion-brief.md), [papers/philosophy.md](papers/philosophy.md), [papers/whitepaper.md](papers/whitepaper.md) |

---

## Automated CI & documentation guardrails

Run the zero-dependency documentation guardrail verifier from the repository root:

```bash
npm run docs:check                  # Verify required docs, relative links, sections, and live metrics
npm run joy-check                   # Verify 100% Joyzoning & Spider self-conformance across all files
npm test                            # Run all 22 verification suites + CLI smoke tests
```

### What `npm run docs:check` (`bin/docs-check.mjs`) enforces

1. **Required documentation inventory**: Verifies that all 17 canonical documentation files under `docs/` (plus root `README.md`, `AGENTS.md`, `VALIDATION_REPORT.md`, `spec/00..05`, and `workflows/01..05`) exist on disk.
2. **Joyzoning `[LAYER: ...]` header compliance**: Verifies that every markdown file in `docs/`, `spec/`, `workflows/`, and root starts with a valid `<!-- [LAYER: <ZONE>] -->` tag.
3. **Structure guardrails on `docs/README.md`**: Enforces the presence of LUMI-standard sections (`## At a glance`, `## Project configuration`, `## Reading paths by audience`, `## Where to document what`, `## Release & policy`, `## Local development`, `## Principles`) and an embedded `mermaid` diagram.
4. **Zero broken relative links**: Parses every markdown link `[label](target)` across `README.md`, `AGENTS.md`, `VALIDATION_REPORT.md`, `docs/**`, `spec/**`, and `workflows/**` and asserts that the target file exists on disk.
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
