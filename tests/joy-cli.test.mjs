/** [LAYER: UI] */
/** Suite 34: the `joy` front door (init/add/update/remove/doctor/agents/hook/passthrough), prompts, and plugin parity. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPrompter } from "../src/ui/prompts.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOY = path.join(ROOT, "bin", "joy.mjs");

function joy(args, { cwd, input, env } = {}) {
  const r = spawnSync(process.execPath, [JOY, ...args], { cwd, input, encoding: "utf8", env: { ...process.env, ...env } });
  let json = null;
  try { json = JSON.parse(r.stdout); } catch { /* text output */ }
  return { status: r.status, stdout: r.stdout, stderr: r.stderr, json };
}
const project = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "joy-cli-"));
  fs.mkdirSync(path.join(dir, "src/domain"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src/domain/a.mjs"), '/** [LAYER: DOMAIN] */\nexport const a = 1;\n');
  return dir;
};
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), "utf8");

describe("Suite 34: joy init and lifecycle", () => {
  it("installs for detected agents non-interactively, as one JSON document", () => {
    const dir = project();
    fs.writeFileSync(path.join(dir, "CLAUDE.md"), "# mine\n");
    fs.mkdirSync(path.join(dir, ".cursor"));
    const r = joy(["init", dir, "--yes", "--json"]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.json.ok, true);
    assert.deepEqual(r.json.result.targets.sort(), ["claude", "cursor"]);
    assert.deepEqual(r.json.result.detected.sort(), ["claude", "cursor"]);
    assert.equal(r.json.result.summary.conflicts, 0);
    assert.ok(fs.existsSync(path.join(dir, ".mcp.json")));
    assert.match(read(dir, "CLAUDE.md"), /^# mine/);
    const again = joy(["init", dir, "--yes", "--json"]);
    assert.equal(again.json.result.summary.created + again.json.result.summary.updated, 0, "second run changes nothing");
  });

  it("supports --agents all|detected|list, --skip-mcp, --hooks, and --dry-run (which writes nothing)", () => {
    const dir = project();
    const dry = joy(["init", dir, "--yes", "--agents", "all", "--hooks", "--dry-run", "--json"]);
    assert.equal(dry.json.result.dryRun, true);
    assert.equal(fs.existsSync(path.join(dir, "AGENTS.md")), false);
    assert.ok(dry.json.result.operations.some((o) => o.path === ".claude/settings.json"));
    const real = joy(["init", dir, "--yes", "--agents", "gemini", "--skip-mcp", "--json"]);
    assert.equal(real.status, 0);
    assert.ok(fs.existsSync(path.join(dir, "GEMINI.md")));
    assert.equal(fs.existsSync(path.join(dir, ".gemini/settings.json")), false, "--skip-mcp registers nothing");
    const none = project();
    const universal = joy(["init", none, "--yes", "--json"]);
    assert.deepEqual(universal.json.result.targets, []);
    assert.ok(fs.existsSync(path.join(none, "SOUL.md")));
  });

  it("add extends the setup; status, update, and remove honor the manifest", () => {
    const dir = project();
    assert.equal(joy(["status", dir, "--json"]).json.result.installed, false);
    joy(["init", dir, "--yes", "--agents", "claude"]);
    const added = joy(["add", "cursor", "--dir", dir, "--yes", "--json"]);
    assert.deepEqual(added.json.result.targets.sort(), ["claude", "cursor"], "add keeps previously installed agents");
    const st = joy(["status", dir, "--json"]);
    assert.equal(st.json.result.installed, true);
    assert.deepEqual(st.json.result.targets.sort(), ["claude", "cursor"]);
    assert.match(joy(["status", dir, "--format", "text"]).stdout, /Installation/);
    const update = joy(["update", dir, "--dry-run", "--json"]);
    assert.equal(update.json.result.summary.created + update.json.result.summary.updated, 0);
    const removed = joy(["remove", dir, "--json"]);
    assert.equal(removed.json.result.removed.length > 5, true);
    assert.equal(fs.existsSync(path.join(dir, ".joy")), false);
    assert.equal(joy(["remove", dir, "--json"]).json.error.code, "NOT_INSTALLED");
    assert.equal(joy(["update", dir, "--json"]).json.error.code, "NOT_INSTALLED");
  });

  it("exits 1 with a structured conflict report and leaves conflicting files alone", () => {
    const dir = project();
    fs.mkdirSync(path.join(dir, ".claude/skills/joyzoning"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".claude/skills/joyzoning/SKILL.md"), "mine\n");
    const r = joy(["init", dir, "--yes", "--agents", "claude", "--json"]);
    assert.equal(r.status, 1);
    assert.equal(r.json.ok, false);
    assert.equal(r.json.error.code, "CONFLICTS");
    assert.equal(r.json.result.conflicts[0].path, ".claude/skills/joyzoning/SKILL.md");
    assert.equal(read(dir, ".claude/skills/joyzoning/SKILL.md"), "mine\n");
    assert.equal(joy(["init", dir, "--yes", "--agents", "claude", "--force", "--json"]).status, 0);
    assert.ok(fs.existsSync(path.join(dir, ".joy/backup/.claude/skills/joyzoning/SKILL.md.bak")));
  });

  it("guides mistakes: unknown agents, missing dirs, typos, and bad options", () => {
    const dir = project();
    const unknown = joy(["init", dir, "--yes", "--agents", "claud", "--json"]);
    assert.equal(unknown.status, 2);
    assert.match(unknown.json.error.hint, /did you mean 'claude'\?/);
    assert.equal(joy(["init", path.join(dir, "nope"), "--yes", "--json"]).status, 2);
    assert.equal(joy(["innit", "--json"]).json.error.hint, "did you mean 'init'?");
    assert.equal(joy(["init", "--agent", "claude", "--json"]).json.error.hint, "did you mean --agents?");
    assert.equal(joy(["add", "--dir", dir, "--json"]).status, 2);
    assert.equal(joy(["hook", "nonsense", "--json"], { input: "{}" }).status, 2);
    const text = joy(["bogus", "--format", "text"]);
    assert.equal(text.status, 2);
    assert.match(text.stderr, /error: unknown command 'bogus'/);
  });

  it("prints help, completion, version, and the agent list", () => {
    assert.match(joy(["--help"]).stdout, /npx heav3ns-joy init/);
    assert.match(joy(["init", "--help"]).stdout, /--agents <value>/);
    assert.equal(joy(["help", "init"]).stdout, joy(["init", "--help"]).stdout);
    assert.match(joy(["completion", "bash"]).stdout, /complete -F _joy joy/);
    assert.equal(joy(["completion", "fish"]).status, 2);
    assert.match(joy(["--version", "--json"]).json.result, /^\d+\.\d+\.\d+/);
    const dir = project();
    fs.writeFileSync(path.join(dir, "GEMINI.md"), "x");
    const agents = joy(["agents", dir, "--json"]).json.result;
    assert.equal(agents.length, 8);
    assert.equal(agents.find((a) => a.id === "gemini").detected, true);
    assert.match(joy(["agents", dir, "--format", "text"]).stdout, /●\s+gemini/);
  });

  it("doctor verifies the installation and a live MCP handshake", () => {
    const dir = project();
    joy(["init", dir, "--yes", "--agents", "claude"]);
    const ok = joy(["doctor", dir, "--json"]);
    assert.equal(ok.status, 0, ok.stdout);
    assert.deepEqual(ok.json.result.checks.map((c) => c.name), ["node", "installation", "version", "mcp", "scripts"]);
    assert.match(ok.json.result.checks.find((c) => c.name === "mcp").detail, /tools respond/);
    fs.unlinkSync(path.join(dir, "SOUL.md"));
    const broken = joy(["doctor", dir, "--json", "--skip-mcp-check"]);
    assert.equal(broken.status, 1);
    assert.match(broken.json.result.checks.find((c) => c.name === "installation").fix, /joy init/);
    fs.writeFileSync(path.join(dir, ".joy/install.json"), "{bad");
    assert.equal(joy(["doctor", dir, "--json"]).json.result.checks.find((c) => c.name === "installation").status, "fail");
    assert.equal(joy(["doctor", project(), "--json"]).json.result.checks.find((c) => c.name === "installation").status, "warn");
  });

  it("never makes the project's own audit fail: agent config is exempt unless opted in", () => {
    const dir = project();
    joy(["init", dir, "--yes", "--agents", "all", "--hooks"]);
    const audit = spawnSync(process.execPath, [path.join(ROOT, "bin", "joy-check.mjs"), dir, "--format", "compact"], { encoding: "utf8" });
    assert.equal(audit.status, 0, audit.stdout);
    assert.match(audit.stdout, /files=1 /);
    fs.writeFileSync(path.join(dir, "stability.config.json"), JSON.stringify({ scanAgentConfig: true }));
    const strict = spawnSync(process.execPath, [path.join(ROOT, "bin", "joy-check.mjs"), dir, "--format", "compact"], { encoding: "utf8" });
    assert.equal(strict.status, 1, "opting in audits the instruction files too");
  });

  it("passes check and trinity through with their exit codes", () => {
    const dir = project();
    assert.equal(joy(["check", dir, "--format", "compact"]).status, 0);
    fs.writeFileSync(path.join(dir, "src/domain/bad.mjs"), '/** [LAYER: DOMAIN] */\nimport fs from "node:fs";\nexport const x = fs;\n');
    const bad = joy(["check", dir, "--format", "compact"]);
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /SPI-206/);
    assert.equal(joy(["check", "--bogus-flag"]).status, 2);
    assert.equal(joy(["trinity", "selftest"]).json.result.checks.queue, true);
    assert.equal(joy(["trinity", "nonsense"]).status, 2);
  });
});

describe("Suite 35: post-edit hook", () => {
  const hook = (dir, payload) => joy(["hook", "post-edit"], { cwd: dir, input: typeof payload === "string" ? payload : JSON.stringify(payload) });

  it("blocks (exit 2, findings on stderr) only for blocking violations in the edited file", () => {
    const dir = project();
    fs.writeFileSync(path.join(dir, "src/domain/bad.mjs"), '/** [LAYER: DOMAIN] */\nimport fs from "node:fs";\nexport const x = fs;\n');
    const blocked = hook(dir, { tool_input: { file_path: path.join(dir, "src/domain/bad.mjs") } });
    assert.equal(blocked.status, 2);
    assert.match(blocked.stderr, /bad\.mjs has blocking architecture violations/);
    assert.match(blocked.stderr, /SPI-206/);
    assert.equal(hook(dir, { tool_input: { file_path: "src/domain/a.mjs" } }).status, 0, "relative paths work and clean files pass");
  });

  it("never wedges or breaks the agent: junk, missing files, and outside paths all exit 0", () => {
    const dir = project();
    for (const payload of ["", "not json", "{}", { tool_input: {} }, { tool_input: { file_path: "src/ghost.mjs" } }, { tool_input: { file_path: "/etc/hosts" } }, { tool_input: { file_path: "../../x" } }, { file_path: 5 }]) {
      assert.equal(hook(dir, payload).status, 0, JSON.stringify(payload));
    }
  });
});

describe("Suite 36: prompts and plugin parity", () => {
  const session = (lines) => {
    const input = new PassThrough();
    const output = new PassThrough();
    let text = "";
    output.on("data", (c) => { text += c; });
    for (const l of lines) input.write(`${l}\n`);
    return { prompter: createPrompter({ input, output }), text: () => text };
  };
  const items = [{ id: "a", label: "A" }, { id: "b", label: "B", hint: "h" }, { id: "c", label: "C" }];

  it("multiSelect honors defaults, numbers, all, none, and re-asks on invalid input", async () => {
    const run = async (lines, defaults) => { const s = session(lines); const r = await s.prompter.multiSelect("pick", items, defaults); s.prompter.close(); return [r, s.text()]; };
    assert.deepEqual((await run([""], ["b"]))[0], ["b"]);
    assert.deepEqual((await run(["1, 3"], []))[0], ["a", "c"]);
    assert.deepEqual((await run(["all"], []))[0], ["a", "b", "c"]);
    assert.deepEqual((await run(["none"], ["a"]))[0], []);
    const [retry, transcript] = await run(["9", "x", "2"], []);
    assert.deepEqual(retry, ["b"]);
    assert.match(transcript, /between 1 and 3/);
    assert.match(transcript, /\[x\] B {2}— h/.source ? /\[ \] B/ : /x/);
  });

  it("confirm honors defaults, y/n, retries, and end of input", async () => {
    const ask = async (lines, def) => { const s = session(lines); const r = await s.prompter.confirm("ok?", def); s.prompter.close(); return r; };
    assert.equal(await ask([""], true), true);
    assert.equal(await ask([""], false), false);
    assert.equal(await ask(["yes"], false), true);
    assert.equal(await ask(["maybe", "n"], true), false);
    const closed = new PassThrough();
    const p = createPrompter({ input: closed, output: new PassThrough() });
    closed.end();
    assert.equal(await p.confirm("ok?", true), true, "EOF falls back to the default instead of hanging");
    p.close();
  });

  it("keeps the checked-in Claude plugin identical to what the installer templates generate", () => {
    const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "build-plugin.mjs"), "--check"], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, ".claude-plugin/marketplace.json"), "utf8"));
    assert.equal(marketplace.plugins[0].source, "./plugin");
    assert.ok(fs.existsSync(path.join(ROOT, "plugin/.claude-plugin/plugin.json")));
  });
});
