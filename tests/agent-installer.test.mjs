/** [LAYER: UI] */
/** Suite 30: managed-block merge primitives and the agent installer (idempotency, safety, conflicts, drift, removal). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAgentInstaller } from "../src/portable.mjs";
import { upsertBlock, removeBlock, findBlock, readBlock, upsertJsonPath, removeJsonPath, setJsonPath, upsertJsonArrayItem, removeJsonArrayItem } from "../src/domain/managedBlock.mjs";
import { AGENT_TARGETS, resolveLauncher } from "../src/domain/agentTargets.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "joy-inst-"));
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const write = (root, rel, text) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text);
};
const actions = (plan) => plan.operations.map((o) => o.action);

describe("Suite 30: Managed blocks and JSON merges", () => {
  it("upserts a block idempotently and preserves surrounding text byte for byte", () => {
    const original = "# Title\n\nuser text above\n";
    const first = upsertBlock(original, "agents", "## Body\nline");
    assert.equal(first.changed, true);
    assert.ok(first.text.startsWith(original.trimEnd()));
    assert.equal(readBlock(first.text, "agents"), "## Body\nline");
    const again = upsertBlock(first.text, "agents", "## Body\nline");
    assert.equal(again.changed, false);
    assert.equal(again.text, first.text);
    const edited = upsertBlock(`${first.text}\nuser text below\n`, "agents", "## New");
    assert.match(edited.text, /user text below/);
    assert.equal(readBlock(edited.text, "agents"), "## New");
    assert.equal(upsertBlock("", "x", "body").text, "<!-- joy:begin x -->\nbody\n<!-- joy:end x -->\n");
  });

  it("removes a block cleanly and reports empty files; refuses damaged markers", () => {
    const text = upsertBlock("keep me\n", "a", "body").text;
    const removed = removeBlock(text, "a");
    assert.equal(removed.text, "keep me\n");
    assert.equal(removeBlock(upsertBlock("", "a", "b").text, "a").empty, true);
    assert.ok(findBlock("<!-- joy:begin a -->\nno end", "a").conflict);
    assert.ok(upsertBlock("<!-- joy:begin a -->\nno end", "a", "b").conflict);
    const dup = `${text}\n${text}`;
    assert.ok(upsertBlock(dup, "a", "b").conflict, "duplicate blocks are a conflict, never silently merged");
  });

  it("merges JSON entries without disturbing other keys, and flags differing or non-JSON files", () => {
    const base = JSON.stringify({ mcpServers: { other: { command: "x" } }, theme: "dark" });
    const merged = upsertJsonPath(base, ["mcpServers", "joy"], { command: "node" });
    assert.equal(merged.changed, true);
    assert.deepEqual(JSON.parse(merged.text), { mcpServers: { other: { command: "x" }, joy: { command: "node" } }, theme: "dark" });
    assert.equal(upsertJsonPath(merged.text, ["mcpServers", "joy"], { command: "node" }).changed, false);
    assert.deepEqual(upsertJsonPath(merged.text, ["mcpServers", "joy"], { command: "other" }).existing, { command: "node" });
    assert.match(upsertJsonPath("{ // comment\n}", ["a"], 1).conflict, /not strict JSON/);
    assert.match(upsertJsonPath("[1]", ["a"], 1).conflict, /not an object/);
    assert.match(upsertJsonPath('{"a":1}', ["a", "b"], 1).conflict, /not an object/);
    assert.deepEqual(JSON.parse(setJsonPath(merged.text, ["mcpServers", "joy"], { command: "z" }).text).mcpServers.joy, { command: "z" });
    const removed = removeJsonPath(merged.text, ["mcpServers", "joy"]);
    assert.deepEqual(JSON.parse(removed.text), { mcpServers: { other: { command: "x" } }, theme: "dark" });
    const emptied = removeJsonPath(upsertJsonPath("", ["mcpServers", "joy"], { c: 1 }).text, ["mcpServers", "joy"]);
    assert.equal(emptied.empty, true);
  });

  it("manages one identifiable item inside a JSON array", () => {
    const isOurs = (e) => e?.tag === "joy";
    const first = upsertJsonArrayItem('{"hooks":{"PostToolUse":[{"tag":"mine"}]}}', ["hooks", "PostToolUse"], { tag: "joy", v: 1 }, isOurs);
    assert.deepEqual(JSON.parse(first.text).hooks.PostToolUse.map((e) => e.tag), ["mine", "joy"]);
    assert.equal(upsertJsonArrayItem(first.text, ["hooks", "PostToolUse"], { tag: "joy", v: 1 }, isOurs).changed, false);
    const updated = upsertJsonArrayItem(first.text, ["hooks", "PostToolUse"], { tag: "joy", v: 2 }, isOurs);
    assert.equal(JSON.parse(updated.text).hooks.PostToolUse.length, 2);
    assert.match(upsertJsonArrayItem('{"hooks":{"PostToolUse":{}}}', ["hooks", "PostToolUse"], {}, isOurs).conflict, /not an array/);
    const removed = removeJsonArrayItem(updated.text, ["hooks", "PostToolUse"], isOurs);
    assert.deepEqual(JSON.parse(removed.text).hooks.PostToolUse, [{ tag: "mine" }]);
  });
});

describe("Suite 31: AgentInstaller", () => {
  const install = (root, extra = {}, version = "1.2.3") => {
    const installer = createAgentInstaller({ root, version });
    return { installer, run: async (o) => installer.apply(await installer.plan({ targets: ["claude", "cursor"], ...extra, ...o })) };
  };

  it("detects agents from project evidence", async () => {
    const root = tmp();
    write(root, "CLAUDE.md", "# x");
    write(root, ".cursor/rules/a.mdc", "x");
    const detected = (await createAgentInstaller({ root, version: "1" }).detect()).filter((d) => d.detected).map((d) => d.id);
    assert.deepEqual(detected.sort(), ["claude", "cursor"]);
    assert.equal(AGENT_TARGETS.length, 8);
  });

  it("installs everything, is idempotent, and records a manifest", async () => {
    const root = tmp();
    const { installer, run } = install(root);
    const first = await run();
    assert.ok(first.operations.every((o) => ["create"].includes(o.action)));
    for (const rel of ["AGENTS.md", "SOUL.md", "CLAUDE.md", ".claude/skills/joyzoning/SKILL.md", ".claude/commands/joy-check.md", ".claude/agents/joy-auditor.md", ".mcp.json", ".cursor/rules/joyzoning.mdc", ".cursor/mcp.json", ".joy/install.json"]) assert.ok(exists(root, rel), rel);
    assert.match(read(root, "CLAUDE.md"), /@AGENTS\.md/);
    assert.match(read(root, ".claude/skills/joyzoning/SKILL.md"), /^---\nname: joyzoning\n/);
    const plan = await installer.plan({ targets: ["claude", "cursor"] });
    assert.deepEqual([...new Set(actions(plan))], ["unchanged"]);
    const snapshot = read(root, ".joy/install.json");
    await installer.apply(plan);
    assert.equal(read(root, ".joy/install.json"), snapshot, "re-applying changes nothing, not even the manifest");
    assert.equal(JSON.parse(snapshot).entries["AGENTS.md#block:agents"].kind, "block");
  });

  it("never clobbers user content in shared files", async () => {
    const root = tmp();
    write(root, "AGENTS.md", "# House rules\n\nBe kind.\n");
    write(root, ".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    write(root, "CLAUDE.md", "my claude notes\n");
    await install(root).run();
    assert.match(read(root, "AGENTS.md"), /^# House rules\n\nBe kind\./);
    assert.deepEqual(Object.keys(JSON.parse(read(root, ".mcp.json")).mcpServers).sort(), ["joy", "other"]);
    assert.match(read(root, "CLAUDE.md"), /^my claude notes/);
  });

  it("reports conflicts for foreign or edited files, and replaces them with a backup under --force", async () => {
    const root = tmp();
    write(root, ".claude/skills/joyzoning/SKILL.md", "my own skill\n");
    write(root, ".cursor/mcp.json", JSON.stringify({ mcpServers: { joy: { command: "custom" } } }));
    const { installer } = install(root);
    const plan = await installer.plan({ targets: ["claude", "cursor"] });
    const conflicts = plan.operations.filter((o) => o.action === "conflict").map((o) => o.path).sort();
    assert.deepEqual(conflicts, [".claude/skills/joyzoning/SKILL.md", ".cursor/mcp.json"]);
    await installer.apply(plan);
    assert.equal(read(root, ".claude/skills/joyzoning/SKILL.md"), "my own skill\n", "conflicting files are left untouched");
    const forced = await installer.apply(await installer.plan({ targets: ["claude", "cursor"], force: true }));
    assert.match(read(root, ".claude/skills/joyzoning/SKILL.md"), /^---\nname: joyzoning/);
    assert.equal(JSON.parse(read(root, ".cursor/mcp.json")).mcpServers.joy.command, "npx");
    assert.ok(forced.backups.length >= 1);
    assert.equal(read(root, forced.backups.find((b) => b.includes("SKILL"))), "my own skill\n");
  });

  it("detects drift, keeps user edits through update, and refreshes untouched files to new content", async () => {
    const root = tmp();
    const v1 = install(root, {}, "1.0.0");
    await v1.run();
    write(root, ".claude/skills/joy-swarm/SKILL.md", `${read(root, ".claude/skills/joy-swarm/SKILL.md")}\n## my addition\n`);
    const status = await createAgentInstaller({ root, version: "1.0.0" }).status();
    assert.equal(status.entries.find((e) => e.path.endsWith("joy-swarm/SKILL.md")).status, "modified");
    assert.equal(status.outdated, false);

    const v2 = createAgentInstaller({ root, version: "2.0.0" });
    const outdated = await v2.status();
    assert.equal(outdated.outdated, true);
    const plan = await v2.plan({ targets: ["claude", "cursor"] });
    const byPath = Object.fromEntries(plan.operations.map((o) => [o.path, o.action]));
    assert.equal(byPath[".claude/skills/joy-swarm/SKILL.md"], "conflict", "an edited skill is protected from update");
    assert.equal(byPath[".claude/skills/joyzoning/SKILL.md"], "update");
    assert.equal(byPath[".mcp.json"], "update", "launcher pin moved to the new version");
    await v2.apply(plan);
    assert.match(read(root, ".mcp.json"), /heav3ns-joy@2\.0\.0/);
    assert.match(read(root, ".claude/skills/joy-swarm/SKILL.md"), /my addition/);
  });

  it("flags missing files in status", async () => {
    const root = tmp();
    const { installer, run } = install(root);
    await run();
    fs.unlinkSync(path.join(root, "SOUL.md"));
    const status = await installer.status();
    assert.equal(status.entries.find((e) => e.path === "SOUL.md").status, "missing");
  });

  it("removes only what it installed and keeps modified files", async () => {
    const root = tmp();
    write(root, "AGENTS.md", "# House rules\n");
    write(root, ".mcp.json", JSON.stringify({ mcpServers: { other: { command: "x" } } }));
    const { installer, run } = install(root);
    await run({ hooks: true });
    write(root, ".claude/skills/joyzoning/SKILL.md", "edited\n");
    const result = await installer.remove();
    assert.deepEqual(result.kept.map((k) => k.path), [".claude/skills/joyzoning/SKILL.md"]);
    assert.equal(read(root, "AGENTS.md"), "# House rules\n");
    assert.deepEqual(JSON.parse(read(root, ".mcp.json")), { mcpServers: { other: { command: "x" } } });
    for (const rel of ["SOUL.md", "CLAUDE.md", ".cursor", ".claude/commands", ".claude/settings.json", ".joy"]) assert.equal(exists(root, rel), false, rel);
    assert.equal(read(root, ".claude/skills/joyzoning/SKILL.md"), "edited\n");
    assert.equal((await installer.remove()).installed, false);
  });

  it("installs and removes the Claude hook without disturbing existing hooks", async () => {
    const root = tmp();
    write(root, ".claude/settings.json", JSON.stringify({ hooks: { PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] }, permissions: { allow: ["Read"] } }));
    const { installer, run } = install(root);
    await run({ hooks: true });
    const settings = JSON.parse(read(root, ".claude/settings.json"));
    assert.equal(settings.hooks.PostToolUse.length, 2);
    assert.match(JSON.stringify(settings.hooks.PostToolUse[1]), /hook post-edit/);
    assert.deepEqual(settings.permissions, { allow: ["Read"] });
    await installer.remove();
    assert.deepEqual(JSON.parse(read(root, ".claude/settings.json")).hooks.PostToolUse.length, 1);
  });

  it("chooses a safe launcher: local install, self, pinned npx, or an explicit runner", () => {
    assert.equal(resolveLauncher({ version: "1.0.0" }).run, "npx -y heav3ns-joy@1.0.0");
    assert.equal(resolveLauncher({ version: "1.0.0", hasLocalBin: true }).run, "npx --no-install joy");
    assert.deepEqual(resolveLauncher({ version: "1.0.0", isSelf: true }).mcp, { command: "node", args: ["bin/joy.mjs", "mcp"] });
    assert.deepEqual(resolveLauncher({ version: "1.0.0", runner: "pnpm dlx heav3ns-joy" }).mcp, { command: "pnpm", args: ["dlx", "heav3ns-joy", "mcp"] });
    assert.throws(() => resolveLauncher({ version: "1", runner: "  " }), /must not be empty/);
  });

  it("rejects unknown agents, path escapes, symlink escapes, and a corrupt manifest", async () => {
    const root = tmp();
    const { installer } = install(root);
    await assert.rejects(installer.plan({ targets: ["emacs"] }), /UNKNOWN_AGENT/);
    const files = (await import("../src/portable.mjs")).AgentInstaller;
    assert.ok(files);
    const outside = tmp();
    fs.symlinkSync(outside, path.join(root, ".claude"));
    await assert.rejects(async () => installer.apply(await installer.plan({ targets: ["claude"] })), /PATH_REJECTED/);
    assert.deepEqual(fs.readdirSync(outside), [], "nothing was written through the symlink");
    const clean = tmp();
    write(clean, ".joy/install.json", "{not json");
    await assert.rejects(createAgentInstaller({ root: clean, version: "1" }).plan({ targets: [] }), /MANIFEST_CORRUPT/);
  });

  it("applies partial progress safely: an interrupted install re-runs to completion", async () => {
    const root = tmp();
    const { installer } = install(root);
    const plan = await installer.plan({ targets: ["claude", "cursor"] });
    const half = { ...plan, operations: plan.operations.slice(0, 4) };
    await installer.apply(half);
    const finished = await installer.apply(await installer.plan({ targets: ["claude", "cursor"] }));
    assert.ok(exists(root, ".cursor/mcp.json"));
    assert.deepEqual([...new Set(actions(await installer.plan({ targets: ["claude", "cursor"] })))], ["unchanged"]);
    assert.ok(finished.operations.length > 4);
  });
});
