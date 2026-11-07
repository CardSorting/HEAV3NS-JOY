/** [LAYER: PLUMBING] */
/**
 * Paths that hold agent instructions and tool configuration rather than architecture-bearing
 * source (instruction files, skills, rules, MCP/editor settings). `joy-check` excludes them by
 * default so installing agent tooling can never make a project's own audit fail; set
 * `"scanAgentConfig": true` in `stability.config.json` to audit them anyway.
 */
export const AGENT_CONFIG_EXCLUDES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "SOUL.md",
  ".cursorrules",
  ".windsurfrules",
  ".claude",
  ".cursor",
  ".agents",
  ".agent",
  ".windsurf",
  ".clinerules",
  ".cline",
  ".gemini",
  ".vscode",
  ".joy",
  ".github/copilot-instructions.md",
  ".github/instructions"
]);
