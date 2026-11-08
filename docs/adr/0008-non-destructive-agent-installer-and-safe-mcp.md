<!-- [LAYER: UI] -->
# ADR-0008: Non-Destructive 8-Agent Installer (`joy init`), Managed Blocks, & RCE-Free Stdio MCP Server

- **Status**: Accepted
- **Date**: 2026-05-01
- **Deciders**: HEAV3NS-JOY Core Architecture Team
- **Technical Story**: [`docs/api/cli.md`](../api/cli.md) · [`docs/SECURITY_BEST_PRACTICES.md`](../SECURITY_BEST_PRACTICES.md) · [`PM-005`](../postmortems/PM-005-prompt-injection-and-unverified-replay-in-specialist-swarms.md)

---

## Status

Accepted — Implemented in [`src/core/AgentInstaller.mjs`](../../src/core/AgentInstaller.mjs), [`src/core/McpServer.mjs`](../../src/core/McpServer.mjs), and [`bin/joy.mjs`](../../bin/joy.mjs).

## Context

Developers often use multiple AI coding agents across a team (`claude`, `gemini`, `antigravity`, `cursor`, `copilot`, `windsurf`, `codex`, `cline`). Setting up instruction files (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `SOUL.md`), skills (`SKILL.md`), editor rules (`.cursor/rules/`, `.windsurf/rules/`, `.clinerules/`), MCP configs (`.mcp.json`, `.vscode/mcp.json`), and post-edit hooks by hand is error-prone.

However, naive project scaffolding tools create two major hazards:
1. **Destructive Overwrites**: Overwriting a project's existing `AGENTS.md`, `CLAUDE.md`, or `.claude/settings.json` destroys user-authored instructions and hooks.
2. **MCP Remote Code Execution (RCE) & Path Escape**: Exposing CLI flags that execute arbitrary code (`queue drain --handler <file>`, `swarm run --exec <cmd>`) or allowing unrestricted paths (`../../etc/passwd`) over an MCP server turns the MCP server into an unauthenticated code-execution primitive.

### Decision drivers

- **Byte-for-Byte Preservation of User Content**: Installing, updating, or removing `joy` must never clobber user prose or unrelated JSON settings.
- **Drift Visibility & Safe Conflict Backups**: Users must be able to inspect drift (`joy status`) and back up conflicting files to `.joy/backup/` under `--force`.
- **Zero Code-Execution Surface in MCP**: `joy mcp` must validate every argument against a strict JSON Schema, confine every path inside the project root (`ProjectPathGuard`), and never expose `--handler` or `--exec`.

### Considered options

1. **Overwrite Target Files Templates on `init`**: Clobbers user customizations in `AGENTS.md`, `CLAUDE.md`, and `.mcp.json`.
2. **Expose All `joy-trinity` Subcommands Raw Over MCP**: Exposes `queue drain --handler` and `swarm run --exec` to prompt-injected tool calls.
3. **Managed Block Markers (`<!-- joy:<id>:start/end -->`) + Key-Scoped JSON Merges + `.joy/install.json` SHA-256 Manifest + Curated 23-Tool RCE-Free `McpServer`**.

## Decision

We chose **Option 3**:

1. **Idempotent Managed Blocks & JSON Merges (`src/domain/managedBlock.mjs` & `src/core/AgentInstaller.mjs`)**:
   - Shared markdown files (`AGENTS.md`, `SOUL.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) use `<!-- joy:<id>:start --> ... <!-- joy:<id>:end -->` blocks. Surrounding user text is preserved byte-for-byte.
   - Shared JSON files (`.mcp.json`, `.gemini/settings.json`, `.claude/settings.json`, `.cursor/mcp.json`, `.vscode/mcp.json`) merge only the `mcpServers.joy` key or the identifiable `joy hook post-edit` array entry.
   - `.joy/install.json` tracks SHA-256 digests of every managed block/file so `joy status`, `joy update`, and `joy remove` detect user edits and refuse to delete modified files unless `--force` is passed (which saves a copy under `.joy/backup/`).
2. **Hardened Stdio MCP Server (`src/core/McpServer.mjs` & `src/domain/mcpProtocol.mjs`)**:
   - Exposes **23 declarative tools**, **5 `joy://` resources**, and **3 prompts** over both newline-delimited JSON-RPC 2.0 (`2025-06-18` / `2024-11-05`) and `Content-Length` framing.
   - Deliberately omits `queue drain --handler` and `swarm run --exec` (enforced by `Suite 32`).
   - Validates every tool call with `validateAgainstSchema` (`additionalProperties: false`) and checks every path argument via `ProjectPathGuard` (resolving symlinks via `fs.realpathSync`).

## Consequences

### Positive

- Teams can run `npx heav3ns-joy init`, `joy add`, `joy update`, and `joy remove` at any time with zero fear of losing custom project instructions.
- `joy doctor` performs an end-to-end live stdio MCP handshake (`initialize` → `tools/list`) to prove agent readiness.

### Negative / trade-offs

- MCP clients use the step-wise ledger (`joy_swarm_plan` → `joy_swarm_next` / `joy_swarm_report` → `joy_swarm_finish`) rather than `swarm run --exec`, which is safer and works natively inside the calling MCP agent.

## Verification

```bash
node --test tests/agent-installer.test.mjs
node --test tests/mcp-server.test.mjs
node ./bin/joy.mjs doctor .
```

- **Code**: [`src/core/AgentInstaller.mjs`](../../src/core/AgentInstaller.mjs) · [`src/domain/managedBlock.mjs`](../../src/domain/managedBlock.mjs) · [`src/core/McpServer.mjs`](../../src/core/McpServer.mjs) · [`src/domain/mcpProtocol.mjs`](../../src/domain/mcpProtocol.mjs)
- **Playbook**: [PB-04: Agent Drift & MCP Troubleshooting](../playbooks/agent-drift-and-mcp-troubleshooting.md)

