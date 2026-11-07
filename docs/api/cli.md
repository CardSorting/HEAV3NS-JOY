<!-- [LAYER: UI] -->
# CLI Reference (`joy`, `joy-check`, `joy-trinity` & `docs-check`)

```bash
node bin/joy.mjs <command> [options]
node bin/joy-check.mjs [target-dir] [options]
node bin/joy-trinity.mjs <command> [options]
node bin/docs-check.mjs [target-dir]
```

All four CLI binaries require **zero external dependencies** and run on any standard Node.js ($\ge 18$) environment.

---

## `joy` (`bin/joy.mjs`)

Unified entrypoint (`npx heav3ns-joy` / `joy`) that installs and manages native agent tooling (`AGENTS.md`, `SOUL.md`, `CLAUDE.md`, `GEMINI.md`, skills, commands, subagents, editor rules, MCP servers, and optional hooks), runs a zero-dependency stdio MCP server, and forwards `joy check` and `joy trinity`.

| Command | Purpose |
| :--- | :--- |
| `joy [init] [dir] [--agents all\|detected\|id,...] [--yes] [--dry-run] [--force] [--skip-mcp] [--hooks] [--runner CMD]` | Set up Joyzoning and Trinity for coding agents (`claude`, `gemini`, `antigravity`, `cursor`, `copilot`, `windsurf`, `codex`, `cline`) |
| `joy add <agents...> [dir] [--dry-run] [--force] [--skip-mcp] [--hooks]` | Add agent targets to an existing installation |
| `joy status [dir]` | Report installed version, targets, features, and per-file drift against `.joy/install.json` |
| `joy update [dir] [--dry-run] [--force]` | Refresh managed files and blocks to the current version (conflict backups saved under `.joy/backup/`) |
| `joy remove [dir] [--force]` | Remove managed blocks/JSON keys and owned files; modified files are kept unless `--force` is passed |
| `joy doctor [dir] [--skip-mcp-check]` | Verify Node, `joy-check`, `joy-trinity`, `.joy/install.json`, file drift, and a live stdio MCP handshake |
| `joy agents [dir]` | List supported agents and whether each was detected in the workspace |
| `joy mcp [--root DIR] [--print-config] [--allow-outside-project]` | Run the stdio MCP server (23 `joy_*` tools, 5 `joy://` resources, 3 prompts) or print a ready-to-paste MCP config snippet |
| `joy hook post-edit` | Read a `PostToolUse` JSON payload on stdin, run a neighborhood-scoped post-edit check, and exit `2` only on blocking violations |
| `joy completion bash\|zsh` | Print a shell tab-completion script |
| `joy check ...` / `joy trinity ...` | Passthrough to `bin/joy-check.mjs` and `bin/joy-trinity.mjs` |

---

## Output formats (`--format`)

```bash
--format text      # Default human-readable Sovereign Audit Report
--format compact   # Token-minimal 1-line-per-finding format (ESLint/cargo style)
--format json      # Pretty-printed JSON report (alias: --json)
--format sarif     # OASIS SARIF v2.1.0 for GitHub Code Scanning (alias: --sarif)
--format github    # GitHub Actions workflow annotations (::error / ::warning)
--format markdown  # Markdown summary table + optional --mermaid dependency flowchart
--format lsp       # Language Server Protocol PublishDiagnostics + CodeAction quick fixes
--format tap       # Test Anything Protocol (TAP v13)
--format junit     # JUnit XML test suite report for CI pipelines
--format ndjson    # Newline-Delimited JSON stream (summary, gate, findings, completion)
```

---

## Commands & flags (`bin/joy-check.mjs`)

### 1. Standard Joyzoning & Spider Audit
```bash
node bin/joy-check.mjs .
node bin/joy-check.mjs . --theme strict
node bin/joy-check.mjs . --theme relaxed
node bin/joy-check.mjs . --theme safety
```
Exits with code `0` when zero blocking violations exist under the selected theme, `1` when blocking violations exist, and `2` on usage or environment errors (unknown option, invalid `--format`/`--theme`, missing target directory). See [Exit codes](../OPERATIONS.md#exit-codes).

### 2. Initialize Project Configuration (`--init`)
```bash
node bin/joy-check.mjs <project-dir> --init
node bin/joy-check.mjs <project-dir> --init --dry-run
```
Scaffolds `stability.config.json` and `.joyignore` in `<project-dir>`.

### 3. Autonomous Self-Healing (`--heal` & `--heal-stateless`)
```bash
node bin/joy-check.mjs <project-dir> --heal
node bin/joy-check.mjs <project-dir> --heal --heal-stateless
node bin/joy-check.mjs <project-dir> --heal --heal-stateless --dry-run
```
- `--heal`: Stamps missing `[LAYER: <ZONE>]` headers or aligns mismatched headers to match physical folder geography (preserving `#!` shebangs and `---` YAML frontmatter).
- `--heal-stateless`: Converts un-reassigned top-level `let`/`var` bindings in `[LAYER: PLUMBING]` files to `const` (`SPI-205`).

### 4. StabilityDoctor & Multivariate Statistics (`--doctor` & `--stats`)
```bash
node bin/joy-check.mjs . --doctor
node bin/joy-check.mjs . --stats
node bin/joy-check.mjs . --stats --json
```
- `--doctor` (alias `--pulse`): Renders Build Health grade, Gini hubbiness concentration, top entropy hotspots, and `I<ClassName>` interface synthesis recommendations.
- `--stats`: Computes V215 multivariate `mean`, `stdDev`, Gini hubbiness, and `> 2.0σ` Z-score outliers across complexity, coupling, and module line count.

### 5. Scoped Agent Check Phases (`--phase`, `--scope`, `--neighborhood`)
```bash
node bin/joy-check.mjs . --phase pre-edit --scope src/core/SpiderEngine.mjs --neighborhood 1 --format compact
node bin/joy-check.mjs . --phase ci --format junit
```
Scopes verification to a comma-separated list of target files plus their $N$-hop bidirectional dependency neighborhood.

### 6. Structural AST Skeletonization (`--skeleton` & `--keep-symbol`)
```bash
node bin/joy-check.mjs . --skeleton src/core/SpiderEngine.mjs
node bin/joy-check.mjs . --skeleton src/core/SpiderEngine.mjs --keep-symbol auditProject
```
Distills a file into its `[LAYER]` header, imports/exports, class declarations, and method signatures (`65%–85%` token reduction) while optionally preserving the full body of `--keep-symbol`.

### 7. Interactive Rule & Diagnostic Explainer (`--explain`)
```bash
node bin/joy-check.mjs --explain SPI-206
node bin/joy-check.mjs --explain SPI-108
node bin/joy-check.mjs --explain RTG-003
node bin/joy-check.mjs --explain BROCCOLIDB
node bin/joy-check.mjs --explain DOMAIN
```
Prints the title, series, default severity, SOP, rationale, remediation steps, and code example for any of the **44** registered diagnostic codes and zones.

### 8. Problem Matcher Export (`--problem-matcher`)
```bash
node bin/joy-check.mjs --problem-matcher
```
Emits a ready-to-save `.vscode/problem-matcher.json` (v2) matching `--format compact`.

---

## Documentation Guardrails (`bin/docs-check.mjs`)

```bash
npm run docs:check
# or directly:
node bin/docs-check.mjs
```
Verifies that all required docs exist, start with valid `<!-- [LAYER: ...] -->` headers, contain zero broken relative links, include required `docs/README.md` sections and Mermaid diagrams, and match live codebase metrics.

---

## `joy-trinity` (`bin/joy-trinity.mjs`)

Harness-agnostic shell interface to BroccoliQueue, BufferedDb, and AgentSwarm. Patterns follow `git`/`docker`/`npm`:
`joy-trinity <command> <subcommand> [args] [--options]`, `--help` at any depth (or `joy-trinity help <command>`),
`--opt value` or `--opt=value`, `--` to end options. The command model in [`src/ui/trinityCli.mjs`](../../src/ui/trinityCli.mjs) is the
single source of truth for parsing, validation, help, suggestions, and completion; `joy-trinity --help` is authoritative.

| Command | Purpose |
| :--- | :--- |
| `selftest` | Proves queue, BufferedDb, ledger, and swarm classification work in a throwaway directory |
| `doctor` | Checks Node, state-directory permissions, lock holder, storage health, and swarm config; every problem has a fix |
| `completion bash\|zsh` | Prints a shell completion script (`source <(joy-trinity completion bash)`) |
| `queue add <name> [--data J] [--key K] [--attempts N] [--delay-ms N] [--priority N]` | Durable enqueue; `--key` makes it idempotent |
| `queue list [--name Q] [--state S] [--limit N]` / `get` / `retry` / `cancel` / `delete` / `overview` / `pause` / `resume` / `prune` | Inspect and manage jobs |
| `queue drain <name> --handler <module.mjs> [--timeout-ms N] [--concurrency N]` | Process jobs with a default-exported async handler until empty |
| `db push <table> [--type insert\|upsert\|update\|delete] [--data J] [--where col=val] [--conflict col]` | Buffered write, flushed before exit; `update`/`delete` require `--where` |
| `db select <table> [--where col=val] [--limit N] [--order col[:desc]]` | Read rows (equality, `!=`, `<`, `<=`, `>`, `>=`) |
| `swarm classify --task T [--strategy S] [--max N] [--file F]` | Specialist roster and file partitions (writes nothing) |
| `swarm plan --task T [--cwd D] [--strategy S] [--max N] [--file F] [--id ID]` (or `--data` with explicit `assignments`) | Create a durable, dependency-ordered formation |
| `swarm next <id> [--peek] [--stale-after-ms N]` | Claim ready specialists (`--peek` is read-only); each has a complete `prompt`; `stale` lists claims with no report |
| `swarm report <id> --assignment A --status completed\|failed [--summary T]` (`--summary -` reads stdin) | Record a specialist outcome; `Heuristic:` lines are persisted |
| `swarm retry <id> --assignment A` / `status <id>` / `list` / `finish <id>` / `prune [--older-than-ms N] [--include-open]` | Retry, inspect, list, close out, and clean up formations |
| `swarm run --task T --exec '["cmd","arg"]' [--cwd D] [--max N] [--strategy S] [--timeout-ms N]` | Run specialists as external processes (prompt on stdin and `$JOY_SWARM_PROMPT_FILE`; stdout = report; SIGTERM then SIGKILL on timeout) |
| `swarm config` / `swarm knowledge store\|recall --cwd D [--note T]` | Effective swarm config; workspace heuristics |

**Global options:** `--root <dir>` (or `$JOY_STATE_ROOT`, default `./.joy-state`), `--format json|ndjson|text` (or `$JOY_FORMAT`), `--lock-timeout-ms N`, `--help`, `--version`.

**Output (json):** one document on stdout, `{"ok":true,"command","result"}` or `{"ok":false,"error":{"code","message","hint"?}}`. `ndjson` prints one document per line for lists; `text` prints tables and key/value lists, with errors on stderr.

**Exit codes:** `0` success, `1` runtime failure, `2` usage error (unknown command/option, bad value, missing argument; the `hint` usually names the fix).

**Error codes:** `USAGE`, `ROOT_LOCKED`, `NOT_FOUND`, `BUFFER_FULL`, or the leading code of the message (`FORMATION_NOT_FOUND`, `INVALID_FORMATION`, `INVALID_REPORT`, `FORMATION_INCOMPLETE`, …); otherwise `FAILURE`.

**State safety:** each state-touching command takes an exclusive cross-process lock on `--root` (`.joy-lock`), so parallel invocations are serialized rather than corrupting the WAL; locks from crashed processes are reclaimed; Ctrl-C flushes and unlocks. Covered by `tests/joy-trinity-cli.test.mjs` and `tests/trinity-hardening.test.mjs`.
