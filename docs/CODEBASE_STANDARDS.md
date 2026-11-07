<!-- [LAYER: UI] -->
# Codebase Standards & Rules

This guide covers (1) how **this repository** (`HEAV3NS-JOY`) is structured, and (2) how **your project** can adopt Joyzoning and the Portable Substrate Trinity to stay clean, modular, and AI-friendly.

## Workspace layout (this repository)

Verified map — full detail in [Project map](PROJECT_MAP.md):

| Directory | Zone | Role |
|-----------|------|------|
| `src/domain/` | `DOMAIN` | Pure Joyzoning rules (`joyRules.mjs`), BroccoliDB/Spider rules (`broccoliRules.mjs`), entropy/Martin/Gini math (`entropyFormulas.mjs`), agent installer targets/templates (`agentTargets.mjs`, `agentTemplates.mjs`, `skillTemplates.mjs`), and BufferedDb/AgentSwarm domain logic (`bufferedDbOps.mjs`, `swarm*.mjs`) |
| `src/domain/interfaces/` | `DOMAIN` | Formal `IWorkspaceScanner`, `ICasStorage`, `IBufferedStore`, `ISwarmLeaseService`, `ISwarmAgentEngine`, `ISwarmConfigStore`, and `IProjectFiles` contracts + `GuidedError` |
| `src/core/` | `CORE` | `SpiderEngine`, `SpiderToolkit`, `StabilityDoctor`, `RefactorHealer`, `JoyRideCache`, `BroccoliRuntime`, `RuntimeStateGraph`, `BufferedDb`, `AgentSwarmDispatcher`, `SwarmFormationLedger`, `AgentInstaller`, and `mcp/McpServer` |
| `src/infrastructure/` | `INFRASTRUCTURE` | `NodeWorkspaceScanner`, `NodeCasStorage`, `broccolidb/` (embedded SQLite-backed kernel + `broccolidb-table-query`), `broccoliqueue/` (durable job queue + `queue-helpers`), `BroccoliBufferedStore`, `ProcessAgentEngine`, `FileRootLock`, `NodeProjectFiles`, and `StdioMcpTransport` |
| `src/plumbing/` | `PLUMBING` | Stateless leaf helpers: `canonicalHash`, `codeTokenizer`, `sourceScanner`, `commentStyles`, `pathUtils`, `ids`, `AsyncMutex`, `rowIds`, `cliArgs`, `managedBlocks` |
| `src/ui/` | `UI` | `CliFormatter`, `AgentFormatters`, `JoyWizardPresenter`, and `joyCommands` |
| `bin/` | `UI` | `joy.mjs` (unified CLI & installer), `joy-check.mjs` (validator/toolkit), `joy-trinity.mjs` (Portable Trinity shell CLI), and `docs-check.mjs` (documentation verifier) |
| `plugin/` | `UI` / `CORE` | Pre-built Claude Code / agent marketplace plugin (`.claude-plugin/plugin.json`, `.mcp.json`, `skills/`, `agents/`, `hooks/`) |
| `spec/` | `DOMAIN` | Language-agnostic normative specifications (`00`..`05`) |
| `workflows/` | `CORE` | Operational playbooks and refactoring SOPs (`01`..`05`) |
| `docs/` | `UI` | Documentation hub, architecture maps, papers, and `api/` reference |

### Dependency discipline

- **Header tags**: Every file begins with its language-appropriate `[LAYER: <ZONE>]` header within the first 10,000 characters.
- **Geographic alignment**: Physical directory paths match declared header tags (`src/domain/**` → `[LAYER: DOMAIN]`).
- **Import depth**: Relative imports never traverse more than 3 parent directories (`../../..`, enforced by `SPI-209`).
- **Zero external dependencies**: `package.json` contains zero runtime or dev dependencies.

---

## Your project: AI-friendly patterns

1. **Small & Sharp modules (Tier 1: `0–800` lines)** — Decompose files before they exceed 800 lines (`SPI-203`) so coding agents can inspect and edit complete modules without context truncation.
2. **Explicit `I<ClassName>` contracts** — Keep `CORE` orchestration decoupled from `INFRASTRUCTURE` I/O by defining interfaces in `src/domain/interfaces/`.
3. **Stateless `PLUMBING` (`UTILS`)** — Keep leaf utilities 100% pure (`const` only, zero upward imports) so helpers can be safely shared across all zones without creating circular dependencies (`SPI-201`).
4. **Scoped neighborhood checks** — Before and after editing a file, run `joy-check --phase pre-edit --scope <file> --format compact` or use `--skeleton <file>` to reduce agent token consumption by `65%–85%`.

---

## Enforcing standards in your repository

| Mechanism | Command / File | Purpose |
|-----------|----------------|---------|
| **Agent Acquisition Protocol** | [`AGENTS.md`](../AGENTS.md) & [`SOUL.md`](../SOUL.md) | 60-second operational protocol and operating principles for any coding agent |
| **Native 8-Agent Installer** | `node bin/joy.mjs init <dir> --yes --hooks` | Non-destructively installs instructions, skills, hooks, `SOUL.md`, and MCP config |
| **Config initialization** | `node bin/joy-check.mjs <dir> --init` | Scaffolds `stability.config.json` and `.joyignore` |
| **Brownfield zone mapping** | [`configs/spider.spec.json`](../configs/spider.spec.json) | Maps legacy folder names onto the 5 canonical zones |
| **Auto-healing headers & state** | `node bin/joy-check.mjs <dir> --heal --heal-stateless` | Aligns `[LAYER]` tags and heals `let`/`var` in `PLUMBING` |
| **Pre-commit git hook** | [`configs/pre-commit-hook.sh`](../configs/pre-commit-hook.sh) | Blocks commits that introduce `SPI-201..403` errors |
| **GitHub Actions CI gate** | [`configs/github-action.yml`](../configs/github-action.yml) | Runs strict audit + SARIF/GitHub annotations in CI |

---

## Related

- [Philosophy — Sovereign Agency](papers/philosophy.md)
- [Constitution](CONSTITUTION.md)
- [9 Tactical Refactoring SOPs](../workflows/02-TACTICAL-REFACTORING-SOPS.md)

