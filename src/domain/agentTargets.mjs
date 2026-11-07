/** [LAYER: DOMAIN] */
/**
 * Catalog of agent integrations and the pure planning of the artifacts each one receives.
 * Adding support for a new agent means adding one entry here; the installer, doctor, updater, and
 * remover are all driven by this table.
 *
 * Artifact kinds:
 *  - `block` : a managed markdown block inside a file the user may also edit (AGENTS.md, CLAUDE.md …)
 *  - `file`  : a file this tool owns completely (skills, rules, commands)
 *  - `json`  : one entry (`jsonPath`) inside a shared JSON config (`.mcp.json` …)
 *  - `jsonArray` : one identifiable item inside a JSON array (Claude Code hooks)
 *
 * @typedef {Object} Artifact
 * @property {string} path @property {"block"|"file"|"json"|"jsonArray"} kind @property {string} target
 * @property {string} [blockId] @property {string} [content] @property {string[]} [jsonPath] @property {unknown} [value]
 * @property {"mcp"|"hooks"} [feature]
 *
 * @typedef {Object} TargetSpec
 * @property {string} id @property {string} label @property {string[]} detect @property {string} note
 * @property {string[]} [manual] steps that cannot be automated at project scope
 */

import {
  SKILL_NAMES,
  renderProtocolBody,
  renderSoulBody,
  renderClaudeBody,
  renderGeminiBody,
  renderSkill,
  renderClaudeCheckCommand,
  renderClaudeSwarmCommand,
  renderClaudeAuditorAgent,
  renderCursorRule,
  renderWindsurfRule,
  renderClineRule,
  renderClaudeHooks,
  renderAntigravityPluginManifest,
  renderClaudePluginManifest,
  renderClaudeMarketplace
} from "./agentTemplates.mjs";

export const PACKAGE_NAME = "heav3ns-joy";
export const HOOK_MARKER = "hook post-edit";

/** @type {TargetSpec[]} */
export const AGENT_TARGETS = [
  { id: "claude", label: "Claude Code", detect: ["CLAUDE.md", ".claude", ".mcp.json"], note: "CLAUDE.md, skills, commands, subagent, MCP, optional hook" },
  { id: "gemini", label: "Gemini CLI", detect: ["GEMINI.md", ".gemini"], note: "GEMINI.md and MCP settings" },
  { id: "antigravity", label: "Antigravity", detect: [".agents", ".agent", "GEMINI.md"], note: "workspace skills and an MCP plugin under .agents/" },
  { id: "cursor", label: "Cursor", detect: [".cursor", ".cursorrules"], note: "always-on rule and MCP config", manual: [] },
  { id: "copilot", label: "GitHub Copilot / VS Code", detect: [".github/copilot-instructions.md", ".vscode"], note: "copilot instructions and .vscode/mcp.json" },
  { id: "windsurf", label: "Windsurf", detect: [".windsurf", ".windsurfrules"], note: "always-on rule", manual: ["Windsurf configures MCP globally: add the joy server in Cascade → MCP, command shown by `joy mcp --print-config`."] },
  { id: "codex", label: "OpenAI Codex CLI", detect: [".codex"], note: "uses AGENTS.md", manual: ["Register the MCP server once per machine: `codex mcp add joy -- <command from joy mcp --print-config>`."] },
  { id: "cline", label: "Cline", detect: [".clinerules", ".cline"], note: "rules file", manual: ["Cline configures MCP globally: add the joy server from the MCP Servers panel."] }
];

/** @param {string} id */
export const isTargetId = (id) => AGENT_TARGETS.some((t) => t.id === id);

/**
 * Chooses how the project should invoke joy. Local installs are preferred (offline, reproducible);
 * otherwise a version-pinned `npx` is used so agents never run an unreviewed `latest`.
 * @param {{ isSelf?: boolean, hasLocalBin?: boolean, version: string, runner?: string }} facts
 * @returns {{ run: string, mcp: { command: string, args: string[] }, hook: string }}
 */
export function resolveLauncher(facts) {
  if (facts.runner) {
    const parts = facts.runner.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) throw new Error("--runner must not be empty");
    return { run: facts.runner.trim(), mcp: { command: parts[0], args: [...parts.slice(1), "mcp"] }, hook: `${facts.runner.trim()} ${HOOK_MARKER}` };
  }
  if (facts.isSelf) return { run: "node bin/joy.mjs", mcp: { command: "node", args: ["bin/joy.mjs", "mcp"] }, hook: `node bin/joy.mjs ${HOOK_MARKER}` };
  if (facts.hasLocalBin) return { run: "npx --no-install joy", mcp: { command: "npx", args: ["--no-install", "joy", "mcp"] }, hook: `npx --no-install joy ${HOOK_MARKER}` };
  const spec = `${PACKAGE_NAME}@${facts.version}`;
  return { run: `npx -y ${spec}`, mcp: { command: "npx", args: ["-y", spec, "mcp"] }, hook: `npx -y ${spec} ${HOOK_MARKER}` };
}

const ours = (entry) => JSON.stringify(entry ?? "").includes(HOOK_MARKER);
export const isJoyHookEntry = ours;

/**
 * Plans every artifact for the chosen targets.
 * @param {{ targets: string[], mcp: boolean, hooks: boolean, ctx: import("./agentTemplates.mjs").TemplateContext, launcher: ReturnType<typeof resolveLauncher> }} input
 * @returns {Artifact[]}
 */
export function planArtifacts(input) {
  const { targets, ctx, launcher } = input;
  /** @type {Artifact[]} */
  const out = [
    { target: "universal", kind: "block", path: "AGENTS.md", blockId: "agents", content: renderProtocolBody(ctx) },
    { target: "universal", kind: "block", path: "SOUL.md", blockId: "soul", content: renderSoulBody() }
  ];
  const mcpEntry = { command: launcher.mcp.command, args: launcher.mcp.args };
  const skillsAt = (dir, target) => SKILL_NAMES.map((name) => ({ target, kind: "file", path: `${dir}/${name}/SKILL.md`, content: renderSkill(name, ctx) }));

  for (const id of targets) {
    switch (id) {
      case "claude":
        out.push(
          { target: id, kind: "block", path: "CLAUDE.md", blockId: "claude", content: renderClaudeBody() },
          ...skillsAt(".claude/skills", id),
          { target: id, kind: "file", path: ".claude/commands/joy-check.md", content: renderClaudeCheckCommand(ctx) },
          { target: id, kind: "file", path: ".claude/commands/joy-swarm.md", content: renderClaudeSwarmCommand(ctx) },
          { target: id, kind: "file", path: ".claude/agents/joy-auditor.md", content: renderClaudeAuditorAgent(ctx) }
        );
        if (input.mcp) out.push({ target: id, kind: "json", path: ".mcp.json", jsonPath: ["mcpServers", "joy"], value: { type: "stdio", ...mcpEntry }, feature: "mcp" });
        if (input.hooks) out.push({ target: id, kind: "jsonArray", path: ".claude/settings.json", jsonPath: ["hooks", "PostToolUse"], value: renderClaudeHooks(launcher.hook).PostToolUse[0], feature: "hooks" });
        break;
      case "gemini":
        out.push({ target: id, kind: "block", path: "GEMINI.md", blockId: "gemini", content: renderGeminiBody() });
        if (input.mcp) out.push({ target: id, kind: "json", path: ".gemini/settings.json", jsonPath: ["mcpServers", "joy"], value: mcpEntry, feature: "mcp" });
        break;
      case "antigravity":
        out.push(...skillsAt(".agents/skills", id));
        if (input.mcp) {
          out.push(
            { target: id, kind: "file", path: ".agents/plugins/joy/plugin.json", content: `${JSON.stringify(renderAntigravityPluginManifest(ctx.version), null, 2)}\n`, feature: "mcp" },
            { target: id, kind: "file", path: ".agents/plugins/joy/mcp_config.json", content: `${JSON.stringify({ mcpServers: { joy: mcpEntry } }, null, 2)}\n`, feature: "mcp" }
          );
        }
        break;
      case "cursor":
        out.push({ target: id, kind: "file", path: ".cursor/rules/joyzoning.mdc", content: renderCursorRule(ctx) });
        if (input.mcp) out.push({ target: id, kind: "json", path: ".cursor/mcp.json", jsonPath: ["mcpServers", "joy"], value: mcpEntry, feature: "mcp" });
        break;
      case "copilot":
        out.push({ target: id, kind: "block", path: ".github/copilot-instructions.md", blockId: "copilot", content: `${renderProtocolBody(ctx)}\n\n${renderSoulBody()}` });
        if (input.mcp) out.push({ target: id, kind: "json", path: ".vscode/mcp.json", jsonPath: ["servers", "joy"], value: { type: "stdio", ...mcpEntry }, feature: "mcp" });
        break;
      case "windsurf":
        out.push({ target: id, kind: "file", path: ".windsurf/rules/joyzoning.md", content: renderWindsurfRule(ctx) });
        break;
      case "cline":
        out.push({ target: id, kind: "file", path: ".clinerules/joyzoning.md", content: renderClineRule(ctx) });
        break;
      case "codex":
        break; // AGENTS.md (universal) is Codex's native instruction file.
      default:
        throw new Error(`unknown agent target '${id}'`);
    }
  }
  return out;
}

/**
 * Files of the checked-in Claude Code marketplace plugin (`plugin/` + `.claude-plugin/marketplace.json`),
 * generated from the same templates the installer uses so the two can never drift apart. The plugin
 * ships no hooks: hooks are intrusive and stay opt-in through `joy init --hooks`.
 * @param {string} version
 * @returns {Record<string, string>} repository-relative path → file content
 */
export function planPluginFiles(version) {
  const launcher = resolveLauncher({ version });
  const ctx = { run: launcher.run, version };
  const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
  const files = {
    ".claude-plugin/marketplace.json": json(renderClaudeMarketplace(version)),
    "plugin/.claude-plugin/plugin.json": json(renderClaudePluginManifest(version)),
    "plugin/.mcp.json": json({ mcpServers: { joy: { command: launcher.mcp.command, args: launcher.mcp.args } } }),
    "plugin/commands/joy-check.md": renderClaudeCheckCommand(ctx),
    "plugin/commands/joy-swarm.md": renderClaudeSwarmCommand(ctx),
    "plugin/agents/joy-auditor.md": renderClaudeAuditorAgent(ctx),
    "plugin/README.md": `<!-- [LAYER: UI] -->\n# joy — Claude Code plugin\n\nGenerated by \`npm run plugin:build\` from the same templates as \`joy init\`; do not edit by hand.\n\nInstall: \`/plugin marketplace add CardSorting/HEAV3NS-JOY\` then \`/plugin install joy@heav3ns-joy\`.\n\nProvides skills (${SKILL_NAMES.join(", ")}), commands (\`/joy:joy-check\`, \`/joy:joy-swarm\`), the \`joy-auditor\` subagent, and the \`joy\` MCP server (${launcher.mcp.command} ${launcher.mcp.args.join(" ")}).\nFor project instruction files (AGENTS.md, SOUL.md) and the optional post-edit hook run \`${launcher.run} init\`.\n`
  };
  for (const name of SKILL_NAMES) files[`plugin/skills/${name}/SKILL.md`] = renderSkill(name, ctx);
  return files;
}
