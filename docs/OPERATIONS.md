<!-- [LAYER: UI] -->
# Operations Runbook

For people who **run** `joy`, `joy-check`, `joy-trinity`, or `joy mcp` in CI, hooks, or agent pipelines. Contributors should read [MAINTAINER.md](MAINTAINER.md) instead. For symptom-specific step-by-step runbooks, see the [Operational Playbooks (`PB-01..05`)](playbooks/README.md), [Symptom Diagnosis Matrix](kb/symptom-diagnosis-matrix.md), and [Blameless Postmortems (`PM-001..005`)](postmortems/README.md).

## At a glance

| Item | Value |
| :--- | :--- |
| Runtime | Node.js 18+, no dependencies, no network access, no telemetry |
| Install | None; run `node bin/joy.mjs`, `node bin/joy-check.mjs`, or `node bin/joy-trinity.mjs` from a clone or vendored copy |
| Reads | Source files, `stability.config.json`, `spider.spec.json`, `.joyignore`, `.joy/install.json` in the target root |
| Writes | **Nothing** during audits; `joy init/add/update/remove` manage agent files (with backups in `.joy/backup/`); `joy-check --init/--heal/--heal-stateless` support `--dry-run`; `joy-trinity` writes under `--root` (default `./.joy-state`, locked by `.joy-lock`) |
| Typical cost | Seconds for projects of thousands of files; single-threaded |

## Exit codes

| Code | Meaning | CI action |
| :---: | :--- | :--- |
| `0` | No blocking violations (`joy-check`), or command succeeded (`joy`, `joy-trinity`, `docs-check`) | Pass |
| `1` | One or more blocking violations (`joy-check`), runtime failure (`joy-trinity`), or drift/failure (`joy status/doctor`, `docs-check`) | Fail the build; read the report |
| `2` | Usage or environment error (bad flag, invalid `--format`/`--theme`, missing target directory) | Fix the pipeline; this is never a pass |

Advisories (`[INFO]`, `SPI-101..112`) never change the exit code. `--heal` and `--init` exit `0` after writing; run an audit afterward to gate.

> [!IMPORTANT]
> Always check the exit code, not output text. Pipelines that pipe `joy-check` into another command should use `set -o pipefail`.

## Configuration

| File (in target root) | Purpose |
| :--- | :--- |
| `stability.config.json` | Zone path mappings, size tiers, depth limits, excludes, `theme` |
| `spider.spec.json` | Alternative resource-to-zone mapping (LUMI-compatible) |
| `.joyignore` | Extra exclusion patterns (vendored, generated) |

`--init` scaffolds the first and last. Config is read fresh on every run; there is no daemon or cache to invalidate.

## Policy themes

| Theme | Use when |
| :--- | :--- |
| `strict` (default) | Steady state; full enforcement |
| `relaxed` | Brownfield or active refactoring: missing/misaligned headers and deep imports become warnings; cycles, `DOMAIN` leaks, and security findings still block |
| `safety` | Emergency hotfix only: only Domain I/O impurity and security anti-patterns (`SPI-401..403`) still block. Record why and revert afterward |

Set with `--theme <mode>` or `"theme"` in config. Details: [`spec/04-ENFORCEMENT-AND-LENIENCY.md`](../spec/04-ENFORCEMENT-AND-LENIENCY.md).

## Rolling out to an existing codebase

1. `--init`, then audit with `--theme relaxed`; fix or ignore until exit `0`.
2. Run `--heal --dry-run`, review, then `--heal` in its own commit.
3. Make CI required ([CI_INTEGRATION.md](CI_INTEGRATION.md)).
4. Move to `--theme strict` once advisories are triaged.

## Failure modes

| Symptom | Cause | Resolution |
| :--- | :--- | :--- |
| Exit `2`, "target directory not found" | Wrong path or working directory in CI | Check `working-directory`/checkout step |
| Exit `2`, "unknown or incomplete option" | Typo, or flag missing its value | Run `joy-check --help` |
| Exit `0` but `Files Scanned : 0` | Everything excluded, or sources in unsupported extensions | Review `exclude` and `.joyignore`; confirm the language is supported |
| Exit `1` on every file | Fresh adoption, headers missing | `--heal --dry-run`, then `--heal` |
| Exit `1` with `SPI-201` | Real import cycle | `--explain SPI-201`; extract a contract or helper |
| Exit `1` on a generated/vendored path | Not excluded | Add to `.joyignore` |
| Output unparseable by a tool | Wrong `--format` | See [api/cli.md](api/cli.md); use `--json`/`--sarif` for machines |
| `SyntaxError` at startup | Node < 18 | Upgrade Node |
| `docs:check` fails after a rename | Dangling link | Fix link; `npm run docs:check` names the file |
| `ROOT_LOCKED` from `joy-trinity` | Another process holds `.joy-lock` on `--root` | Wait for concurrent command to finish, or run `node bin/joy-trinity.mjs doctor` (auto-reclaims dead PID locks) |
| `joy status` reports `modified` drift | User edited a managed agent block/file | Run `node bin/joy.mjs update --force` (backs up prior file to `.joy/backup/`) |

> [!TIP]
> Before trusting a green run, confirm `Files Scanned` is non-zero and plausible for your repository.

## Choosing an output format

| Consumer | Flag |
| :--- | :--- |
| Humans | default text, `--doctor` for health |
| GitHub annotations / summary | `--format github`, `--format markdown --mermaid` |
| Code scanning | `--sarif` |
| Test reporters | `--format junit` / `tap` |
| Log pipelines | `--format ndjson` |
| Agents | `--format compact`, `--phase pre-edit --scope <file>` |

## Upgrading

1. Read the [CHANGELOG](../CHANGELOG.md) for your version range; Major bumps may add blocking rules.
2. Pin to a release tag, not `main`.
3. Run the new version with `--theme relaxed` first and compare findings.
4. Verify `node bin/joy-check.mjs --version`.

## Incident checklist: "CI is red on joy-check"

1. Is the exit code `2`? Pipeline/config problem, see failure modes above.
2. Is it `1`? Open the job summary (Markdown format) or run locally with the same flags.
3. `--explain <code>` for each blocking finding.
4. If a finding is a false positive, exclude narrowly via `.joyignore` and open an issue with a minimal repro ([SUPPORT.md](../SUPPORT.md)).
5. Never disable the whole check to unblock a release; use `--theme relaxed` (or `safety` for a true hotfix) temporarily and record why.
