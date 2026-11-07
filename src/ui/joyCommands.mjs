/** [LAYER: UI] */
/**
 * Command model for the top-level `joy` CLI: `init` (npx-style agent setup), `add`, `update`,
 * `remove`, `doctor`, `agents`, `mcp`, `hook`, plus pass-through to `check` and `trinity`.
 * Parsing, validation, help, suggestions, and completion come from the shared `cliKit`.
 */

import { createCli, UsageError, suggest } from "./cliKit.mjs";

export { UsageError, suggest };

const SETUP_OPTIONS = {
  "skip-mcp": { type: "flag", description: "do not register the joy MCP server with the selected agents" },
  hooks: { type: "flag", description: "also install the Claude Code post-edit architecture hook" },
  force: { type: "flag", description: "replace conflicting files (a backup is kept under .joy/backup/)" },
  "dry-run": { type: "flag", description: "show exactly what would change; write nothing" },
  runner: { type: "string", description: 'how agents invoke joy, e.g. "npx -y heav3ns-joy@1" (default: local install, else a pinned npx)' }
};

export const GLOBAL_OPTIONS = /** @type {Record<string, import("./cliKit.mjs").OptionSpec>} */ ({
  json: { type: "flag", description: "machine-readable output (default when stdout is not a terminal)" },
  format: { type: "string", values: ["json", "text"], description: "output format (default $JOY_FORMAT, else text on a terminal, json otherwise)" },
  yes: { type: "flag", description: "accept defaults; never prompt (also implied by CI and non-interactive shells)" },
  help: { type: "flag", description: "show help for the command" },
  version: { type: "flag", description: "print the version" }
});

/** @type {Record<string, import("./cliKit.mjs").CommandSpec>} */
export const COMMANDS = {
  init: {
    summary: "Set up Joyzoning for your coding agents (interactive, like create-next-app; --yes for scripts)",
    args: [{ name: "dir", description: "project directory (default: current directory)" }],
    options: {
      agents: { type: "string", description: "comma list of agents, `all`, or `detected` (see: joy agents). Omit to be asked" },
      ...SETUP_OPTIONS
    },
    examples: ["npx heav3ns-joy init", "joy init --yes --agents claude,cursor", "joy init --yes --agents all --hooks --dry-run"]
  },
  add: {
    summary: "Add one or more agents to an existing setup",
    args: [{ name: "agent", description: "claude | gemini | antigravity | cursor | copilot | windsurf | codex | cline", required: true, variadic: true }],
    options: { dir: { type: "string", description: "project directory (default: current directory)" }, ...SETUP_OPTIONS },
    examples: ["joy add cursor", "joy add gemini antigravity --dry-run"]
  },
  update: {
    summary: "Refresh installed files to this version of joy (keeps your edits outside managed blocks)",
    args: [{ name: "dir", description: "project directory (default: current directory)" }],
    options: { force: SETUP_OPTIONS.force, "dry-run": SETUP_OPTIONS["dry-run"], runner: SETUP_OPTIONS.runner },
    examples: ["joy update", "joy update --dry-run"]
  },
  remove: {
    summary: "Uninstall everything joy installed (files you edited are kept unless --force)",
    args: [{ name: "dir", description: "project directory (default: current directory)" }],
    options: { force: { type: "flag", description: "also delete files modified since install" } },
    examples: ["joy remove"]
  },
  status: {
    summary: "Show installed version, agents, features, and per-file drift against .joy/install.json",
    args: [{ name: "dir", description: "project directory (default: current directory)" }],
    examples: ["joy status"]
  },
  doctor: {
    summary: "Check the installation and environment, including a live MCP handshake",
    args: [{ name: "dir", description: "project directory (default: current directory)" }],
    options: { "skip-mcp-check": { type: "flag", description: "do not start the MCP server to test it" } },
    examples: ["joy doctor"]
  },
  agents: {
    summary: "List supported agents and which ones this project appears to use",
    args: [{ name: "dir", description: "project directory (default: current directory)" }]
  },
  mcp: {
    summary: "Run the MCP server on stdio (what your agent launches); --print-config shows how to register it",
    options: {
      root: { type: "string", description: "state directory for queue/db/swarm tools (default $JOY_STATE_ROOT or ./.joy-state)" },
      "allow-outside-project": { type: "flag", description: "let tools touch paths outside the project directory (off by default)" },
      "print-config": { type: "flag", description: "print the server command and exit instead of serving" }
    },
    examples: ["joy mcp --print-config", "claude mcp add joy -- npx -y heav3ns-joy mcp"]
  },
  hook: {
    summary: "Agent lifecycle hook entry point (reads the hook payload on stdin)",
    args: [{ name: "event", description: "post-edit", required: true }],
    examples: ["echo '{\"tool_input\":{\"file_path\":\"src/a.mjs\"}}' | joy hook post-edit"]
  },
  check: {
    summary: "Audit a project against Joyzoning (pass-through to joy-check; see `joy check --help`)",
    args: [{ name: "args", description: "forwarded unchanged to joy-check", variadic: true }],
    examples: ["joy check . --phase pre-edit --scope src/a.mjs --format compact"]
  },
  trinity: {
    summary: "Durable queue, buffered tables, specialist swarm (pass-through to joy-trinity)",
    args: [{ name: "args", description: "forwarded unchanged to joy-trinity", variadic: true }],
    examples: ["joy trinity selftest", "joy trinity swarm plan --task \"<goal>\" --id f1"]
  },
  completion: {
    summary: "Print a shell completion script",
    args: [{ name: "shell", description: "bash | zsh", required: true }],
    examples: ["source <(joy completion bash)"]
  },
  help: { summary: "Show help for a command", args: [{ name: "command", description: "e.g. `init`", variadic: true }] }
};

const cli = createCli({
  name: "joy",
  tagline: "agent-native architecture, tools, and skills for any coding agent (zero dependencies)",
  commands: COMMANDS,
  globalOptions: GLOBAL_OPTIONS,
  gettingStarted: [
    "npx heav3ns-joy init        set up your agents (instructions, skills, MCP) in this project",
    "joy doctor                  verify the installation, including a live MCP handshake",
    "joy check . --format compact   audit the architecture",
    "joy <command> --help        details and examples for any command"
  ],
  outputNotes: ["text for people on a terminal; --json (or a non-terminal stdout) prints exactly one JSON document: {\"ok\":true,\"command\",\"result\"} or {\"ok\":false,\"error\":{\"code\",\"message\",\"hint\"}}."]
});

export const { parseArgv, validateInvocation, renderHelp, renderCompletion } = cli;
