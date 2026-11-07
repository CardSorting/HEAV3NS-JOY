#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * `joy` — the front door. One command to make a project agent-ready (`npx heav3ns-joy init`, in the
 * spirit of create-next-app): instruction files (AGENTS.md, CLAUDE.md, GEMINI.md, SOUL.md), skills,
 * slash commands, a subagent, editor rules, an MCP server, and an optional post-edit hook — for
 * Claude Code, Gemini CLI, Antigravity, Cursor, GitHub Copilot, Windsurf, Codex, and Cline.
 *
 *   joy init | add | update | remove | doctor | agents | mcp | hook | check | trinity
 *
 * Output: human text on a terminal, one JSON document otherwise (`--json` forces it).
 * Exit codes: 0 success, 1 failure, 2 usage error.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_TARGETS,
  createAgentInstaller,
  createMcpServer,
  serveMcpOverStdio,
  resolveLauncher
} from "../src/portable.mjs";
import { COMMANDS, UsageError, parseArgv, validateInvocation, renderHelp, renderCompletion } from "../src/ui/joyCommands.mjs";
import { createPrompter } from "../src/ui/prompts.mjs";
import { createStyle, renderChange, renderNextSteps, renderStatus, renderChecks, renderAgents, summarize } from "../src/ui/joyRenderer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, "..");
const SCRIPTS = { check: join(HERE, "joy-check.mjs"), trinity: join(HERE, "joy-trinity.mjs") };
const VERSION = createRequire(import.meta.url)("../package.json").version;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

class CommandFailure extends Error {
  constructor(code, message, hint) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

// ------------------------------------------------------------------ helpers

function projectDir(value) {
  const dir = resolve(value ?? process.cwd());
  let stat;
  try {
    stat = statSync(dir);
  } catch {
    throw new UsageError(`directory does not exist: ${dir}`, "create it first, or run from your project root");
  }
  if (!stat.isDirectory()) throw new UsageError(`not a directory: ${dir}`);
  return dir;
}

function outputFormat(options) {
  if (options.json) return "json";
  const format = options.format ?? process.env.JOY_FORMAT ?? (process.stdout.isTTY ? "text" : "json");
  if (format !== "json" && format !== "text") throw new UsageError(`--format must be json or text, got '${format}'`);
  return format;
}

function interactive(options) {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && !options.yes && !options.json && !process.env.CI && outputFormat(options) === "text");
}

function parseAgents(value, detected) {
  if (value === undefined) return null;
  if (value === "all") return AGENT_TARGETS.map((t) => t.id);
  if (value === "detected") return detected;
  const ids = value.split(",").map((s) => s.trim()).filter(Boolean);
  const known = AGENT_TARGETS.map((t) => t.id);
  for (const id of ids) {
    if (!known.includes(id)) {
      const near = known.find((k) => k.startsWith(id.slice(0, 3)));
      throw new UsageError(`unknown agent '${id}'`, `${near ? `did you mean '${near}'? ` : ""}known agents: ${known.join(", ")}`);
    }
  }
  return [...new Set(ids)];
}

function conflictsOf(plan) {
  return plan.operations.filter((op) => op.action === "conflict").map((op) => ({ path: op.path, reason: op.reason }));
}

function planSummary(plan) {
  return { targets: plan.targets, mcp: plan.mcp, hooks: plan.hooks, launcher: plan.launcher, summary: summarize(plan.operations), operations: plan.operations.map((op) => ({ path: op.path, kind: op.kind, target: op.target, action: op.action, ...(op.reason ? { reason: op.reason } : {}) })), manual: plan.manual };
}

// ------------------------------------------------------------------ commands

async function runSetup(command, positionals, options, ctx) {
  const root = projectDir(command === "add" ? options.dir : positionals[0]);
  const installer = createAgentInstaller({ root, version: VERSION });
  const detection = await installer.detect();
  const detected = detection.filter((d) => d.detected).map((d) => d.id);
  const manifest = await installer.manifest();
  let targets = command === "add" ? parseAgents(positionals.join(","), detected) : parseAgents(options.agents, detected);
  let hooks = Boolean(options.hooks);
  const wizard = command === "init" && targets === null && interactive(options);

  if (wizard) {
    const prompter = createPrompter({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write(`\n${ctx.style.bold("◆ joy")} ${ctx.style.dim(`v${VERSION} — agent-native Joyzoning setup for ${root}`)}\n\n`);
      const items = detection.map((d) => ({ id: d.id, label: d.label, hint: d.detected ? `detected: ${d.evidence.join(", ")}` : d.note }));
      targets = await prompter.multiSelect("Which coding agents do you use in this project?", items, manifest?.targets ?? detected);
      if (targets.includes("claude") && !options.hooks) hooks = await prompter.confirm("Add the Claude Code post-edit hook (audits each edited file; blocks on violations)?", false);
      const preview = await installer.plan({ targets, mcp: !options["skip-mcp"], hooks, force: Boolean(options.force), ...(options.runner ? { runner: options.runner } : {}) });
      process.stdout.write(`\n${renderChange(preview, { applied: false, style: ctx.style, dryRun: false })}\n\n`);
      if (!(await prompter.confirm("Apply these changes?", true))) return { cancelled: true };
    } finally {
      prompter.close();
    }
  }
  targets ??= command === "init" ? (manifest?.targets?.length ? manifest.targets : detected) : [];
  if (command === "add" && !targets.length) throw new UsageError("add requires at least one agent", `known agents: ${AGENT_TARGETS.map((t) => t.id).join(", ")}`);
  if (command === "add" && manifest) targets = [...new Set([...(manifest.targets ?? []), ...targets])];
  if (manifest?.features?.hooks && !options.hooks && command !== "init") hooks = true;

  const plan = await installer.plan({ targets, mcp: !options["skip-mcp"], hooks, force: Boolean(options.force), ...(options.runner ? { runner: options.runner } : {}) });
  const dryRun = Boolean(options["dry-run"]);
  const applied = dryRun ? null : await installer.apply(plan);
  const conflicts = conflictsOf(plan);
  return { plan, applied, dryRun, conflicts, detected, root, noAgents: targets.length === 0 };
}

async function runUpdate(positionals, options) {
  const root = projectDir(positionals[0]);
  const installer = createAgentInstaller({ root, version: VERSION });
  const manifest = await installer.manifest();
  if (!manifest) throw new CommandFailure("NOT_INSTALLED", "joy is not installed in this project", "run: joy init");
  const plan = await installer.plan({ targets: manifest.targets, mcp: manifest.features.mcp, hooks: manifest.features.hooks, force: Boolean(options.force), ...(options.runner ?? manifest.launcher?.runner ? { runner: options.runner ?? manifest.launcher.runner } : {}) });
  const dryRun = Boolean(options["dry-run"]);
  const applied = dryRun ? null : await installer.apply(plan);
  return { plan, applied, dryRun, conflicts: conflictsOf(plan), root, noAgents: false, previousVersion: manifest.version };
}

async function mcpHandshake(root) {
  return new Promise((resolveCheck) => {
    const child = spawn(process.execPath, [join(HERE, "joy.mjs"), "mcp"], { cwd: root, stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, JOY_STATE_ROOT: join(root, ".joy-state") } });
    let out = "";
    const timer = setTimeout(() => { child.kill("SIGKILL"); resolveCheck({ ok: false, detail: "no response within 8 s" }); }, 8000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      out += chunk;
      const lines = out.split("\n").filter(Boolean);
      const list = lines.map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((m) => m?.id === 2);
      if (list) {
        clearTimeout(timer);
        child.stdin.end();
        resolveCheck(list.result?.tools ? { ok: true, detail: `${list.result.tools.length} tools respond over stdio` } : { ok: false, detail: "tools/list returned no tools" });
      }
    });
    child.on("error", (error) => { clearTimeout(timer); resolveCheck({ ok: false, detail: error.message }); });
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "joy-doctor", version: VERSION } } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })}\n`);
  });
}

async function runDoctor(positionals, options) {
  const root = projectDir(positionals[0]);
  const installer = createAgentInstaller({ root, version: VERSION });
  const checks = [];
  const add = (name, status, detail, fix) => checks.push({ name, status, detail, ...(fix ? { fix } : {}) });
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 18 ? "ok" : "fail", `Node.js ${process.version}`, major >= 18 ? undefined : "install Node.js 18 or newer");
  let status;
  try {
    status = await installer.status();
  } catch (error) {
    add("installation", "fail", error.message, "fix or delete .joy/install.json, then run `joy init`");
    return { ok: false, root, checks };
  }
  if (!status.installed) {
    add("installation", "warn", "joy is not installed in this project", "run: joy init");
  } else {
    const missing = status.entries.filter((e) => e.status === "missing");
    const modified = status.entries.filter((e) => e.status === "modified");
    add("installation", missing.length ? "fail" : "ok", `v${status.version}; ${status.entries.length} managed entries; agents: ${status.targets.join(", ") || "none"}`, missing.length ? `restore with: joy init (missing: ${missing.map((e) => e.path).join(", ")})` : undefined);
    if (modified.length) add("drift", "warn", `${modified.length} file(s) edited since install: ${modified.map((e) => e.path).join(", ")}`, "intentional? nothing to do. Otherwise `joy update --force` restores them (backups are kept)");
    add("version", status.outdated ? "warn" : "ok", status.outdated ? `installed content is older than joy ${VERSION}` : `up to date (${VERSION})`, status.outdated ? "run: joy update" : undefined);
    if (status.features.mcp && !options["skip-mcp-check"]) {
      const handshake = await mcpHandshake(root);
      add("mcp", handshake.ok ? "ok" : "fail", handshake.detail, handshake.ok ? undefined : "run `joy mcp` by hand to see the error; check that Node can start the launcher command");
    }
  }
  const scriptsOk = existsSync(SCRIPTS.check) && existsSync(SCRIPTS.trinity);
  add("scripts", scriptsOk ? "ok" : "fail", "joy-check and joy-trinity are present", scriptsOk ? undefined : "reinstall heav3ns-joy");
  return { ok: !checks.some((c) => c.status === "fail"), root, checks, ...(status ? { installation: status } : {}) };
}

async function runRemove(positionals, options) {
  const root = projectDir(positionals[0]);
  const installer = createAgentInstaller({ root, version: VERSION });
  const result = await installer.remove({ force: Boolean(options.force) });
  if (!result.installed) throw new CommandFailure("NOT_INSTALLED", "joy is not installed in this project", "nothing to remove");
  return result;
}

async function runMcp(options) {
  const projectRoot = process.cwd();
  const installer = createAgentInstaller({ root: projectRoot, version: VERSION });
  if (options["print-config"]) {
    const facts = await installer.facts();
    const launcher = resolveLauncher(facts);
    return { raw: `${JSON.stringify({ mcpServers: { joy: { command: launcher.mcp.command, args: launcher.mcp.args } } }, null, 2)}\n` };
  }
  const stateRoot = resolve(options.root ?? process.env.JOY_STATE_ROOT ?? join(projectRoot, ".joy-state"));
  const server = createMcpServer({
    projectRoot, packageRoot: PACKAGE_ROOT, scripts: SCRIPTS, version: VERSION, stateRoot,
    allowOutsideProject: Boolean(options["allow-outside-project"]) || process.env.JOY_MCP_ALLOW_OUTSIDE === "1",
    logger: { warn: (m) => process.stderr.write(`${m}\n`) }
  });
  const stop = () => server.shutdown();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await serveMcpOverStdio(server);
  return { streamed: true };
}

async function runHook(event) {
  if (event !== "post-edit") throw new UsageError(`unknown hook event '${event}'`, "supported: post-edit");
  // A hook must never wedge or break the agent: any internal problem exits 0 silently.
  let payload = {};
  try {
    const raw = readFileSync(0, "utf8").slice(0, 1_000_000);
    payload = raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return { exit: 0 };
  }
  const input = payload.tool_input ?? payload.toolInput ?? payload;
  const file = input.file_path ?? input.path ?? input.filePath;
  if (typeof file !== "string" || !file) return { exit: 0 };
  let cwd;
  let absFile;
  try {
    cwd = realpathSync(resolve(payload.cwd ?? process.cwd()));
    const rawTarget = isAbsolute(file) ? file : resolve(cwd, file);
    if (!existsSync(rawTarget)) return { exit: 0 };
    absFile = realpathSync(rawTarget);
  } catch {
    return { exit: 0 };
  }
  const rel = relative(cwd, absFile);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return { exit: 0 };
  const run = spawnSync(process.execPath, [SCRIPTS.check, ".", "--phase", "post-edit", "--scope", rel.split("\\").join("/"), "--format", "compact"], { cwd, encoding: "utf8", timeout: 45_000 });
  if (run.status !== 1) return { exit: 0 };
  const findings = (run.stdout ?? "").split("\n").filter((l) => /\berror\b/.test(l)).slice(0, 20).join("\n");
  process.stderr.write(`Joyzoning: ${rel} has blocking architecture violations. Fix them before continuing:\n${findings || run.stdout}\nExplain a code with: joy check --explain <CODE>\n`);
  return { exit: 2 };
}

// ------------------------------------------------------------------ dispatch

function passthrough(name, args) {
  const result = spawnSync(process.execPath, [SCRIPTS[name], ...args], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

function emit(format, command, result, text) {
  if (format === "json") process.stdout.write(`${JSON.stringify({ ok: true, command, result }, null, 2)}\n`);
  else process.stdout.write(`${text}\n`);
}

async function main(argv) {
  if (argv[0] === "check" || argv[0] === "trinity") return passthrough(argv[0], argv.slice(1));
  const { path, spec, positionals, options } = parseArgv(argv);
  const format = outputFormat(options);
  const style = createStyle(format === "text" && process.stdout.isTTY && !process.env.NO_COLOR);
  if (options.version) return emit(format, "version", VERSION, VERSION);
  if (path[0] === "help") {
    const target = positionals.slice(0, 1);
    if (target[0] && !COMMANDS[target[0]]) throw new UsageError(`no help topic '${target[0]}'`, `commands: ${Object.keys(COMMANDS).join(", ")}`);
    return process.stdout.write(`${renderHelp(target)}\n`);
  }
  if (options.help || path.length === 0) return process.stdout.write(`${renderHelp(path)}\n`);
  validateInvocation(spec, path, positionals, options);
  const command = path[0];
  const ctx = { style };

  switch (command) {
    case "init":
    case "add": {
      const out = await runSetup(command, positionals, options, ctx);
      if (out.cancelled) return process.stdout.write("Cancelled. Nothing was changed.\n");
      const summary = { ...planSummary(out.plan), dryRun: out.dryRun, conflicts: out.conflicts, detected: out.detected, ...(out.applied ? { manifest: ".joy/install.json" } : {}) };
      if (format === "json") process.stdout.write(`${JSON.stringify({ ok: out.conflicts.length === 0, command, result: summary, ...(out.conflicts.length ? { error: { code: "CONFLICTS", message: `${out.conflicts.length} file(s) conflict and were left untouched`, hint: "review them, or re-run with --force (a backup is kept)" } } : {}) }, null, 2)}\n`);
      else {
        process.stdout.write(`${renderChange(out.plan, { applied: Boolean(out.applied), style, dryRun: out.dryRun })}\n`);
        if (out.noAgents) process.stdout.write(`\n${style.yellow("No agents were detected or selected.")} Universal files were installed. Add agents with ${style.cyan("joy add <agent>")} (see ${style.cyan("joy agents")}).\n`);
        if (out.applied) process.stdout.write(`\n${renderNextSteps(out.plan, style)}\n`);
      }
      if (out.conflicts.length) process.exitCode = EXIT_FAILURE;
      return;
    }
    case "update": {
      const out = await runUpdate(positionals, options);
      const summary = { ...planSummary(out.plan), dryRun: out.dryRun, conflicts: out.conflicts, previousVersion: out.previousVersion };
      if (format === "json") process.stdout.write(`${JSON.stringify({ ok: out.conflicts.length === 0, command, result: summary }, null, 2)}\n`);
      else process.stdout.write(`${renderChange(out.plan, { applied: Boolean(out.applied), style, dryRun: out.dryRun })}\n`);
      if (out.conflicts.length) process.exitCode = EXIT_FAILURE;
      return;
    }
    case "remove": {
      const result = await runRemove(positionals, options);
      return emit(format, command, result, `${style.bold("Removed")} ${result.removed.length} item(s).\n${result.removed.map((r) => `  - ${r.path}${r.detail ? `  ${style.dim(r.detail)}` : ""}`).join("\n")}${result.kept.length ? `\n${style.yellow("Kept (needs your attention):")}\n${result.kept.map((k) => `  ! ${k.path}  ${style.dim(k.detail)}`).join("\n")}` : ""}`);
    }
    case "status": {
      const installer = createAgentInstaller({ root: projectDir(positionals[0]), version: VERSION });
      const status = await installer.status();
      return emit(format, command, status, renderStatus(status, style));
    }
    case "doctor": {
      const result = await runDoctor(positionals, options);
      emit(format, command, result, `${style.bold("joy doctor")} ${style.dim(result.root)}\n${renderChecks(result.checks, style)}\n\n${result.ok ? style.green("All good.") : style.red("Problems found. Follow the fixes above.")}`);
      if (!result.ok) process.exitCode = EXIT_FAILURE;
      return;
    }
    case "agents": {
      const installer = createAgentInstaller({ root: projectDir(positionals[0]), version: VERSION });
      const list = await installer.detect();
      return emit(format, command, list, renderAgents(list, style));
    }
    case "mcp": {
      const out = await runMcp(options);
      if (out.raw) process.stdout.write(out.raw);
      return;
    }
    case "hook": {
      const { exit } = await runHook(positionals[0]);
      process.exitCode = exit;
      return;
    }
    case "completion":
      return process.stdout.write(renderCompletion(positionals[0]));
    default:
      throw new UsageError(`unknown command '${command}'`);
  }
}

const wantJson = process.argv.includes("--json") || process.env.JOY_FORMAT === "json" || (!process.stdout.isTTY && !process.argv.includes("--format"));

try {
  await main(process.argv.slice(2));
} catch (error) {
  const usage = error instanceof UsageError;
  const prefix = /^([A-Z][A-Z0-9_]{2,}): /.exec(error.message ?? "")?.[1];
  const code = usage ? "USAGE" : (typeof error.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(error.code) ? error.code : prefix ?? "FAILURE");
  if (wantJson) process.stdout.write(`${JSON.stringify({ ok: false, command: process.argv[2] ?? "", error: { code, message: error.message, ...(error.hint ? { hint: error.hint } : {}) } }, null, 2)}\n`);
  else process.stderr.write(`error: ${error.message}\n${error.hint ? `hint: ${error.hint}\n` : ""}`);
  process.exitCode = usage ? EXIT_USAGE : EXIT_FAILURE;
}
