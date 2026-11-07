/** [LAYER: UI] */
/** Suite 32: MCP server (protocol conformance, validation, confinement) and the real stdio server end to end. */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "../src/portable.mjs";
import { MCP_TOOLS, MCP_RESOURCES, MCP_PROMPTS, SUPPORTED_PROTOCOL_VERSIONS } from "../src/domain/mcpProtocol.mjs";
import { validateAgainstSchema } from "../src/domain/jsonSchemaLite.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const JOY = path.join(ROOT, "bin", "joy.mjs");

function fakeServer(overrides = {}) {
  const calls = [];
  const server = new McpServer({
    info: { name: "t", version: "9" },
    runCli: async (cli, argv, opts) => {
      calls.push({ cli, argv, opts });
      if (overrides.runCli) return overrides.runCli(cli, argv, opts);
      return cli === "trinity" ? { code: 0, stdout: JSON.stringify({ ok: true, command: "x", result: { echoed: argv } }), stderr: "" } : { code: 0, stdout: "[spider:pass]", stderr: "" };
    },
    readResource: async (p) => (p === "AGENTS.md" ? "# agents" : null),
    isInsideProject: (p) => !p.startsWith("/etc") && !p.includes(".."),
    stateRoot: "/state",
    ...overrides.options
  });
  return { server, calls };
}
const rpc = (id, method, params) => ({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });
async function ready(server) {
  await server.handle(rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "c", version: "1" } }));
  await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" });
}
const call = (server, name, args, id = 10) => server.handle(rpc(id, "tools/call", { name, arguments: args }));

describe("Suite 32: MCP server", () => {
  it("negotiates the protocol version, advertises capabilities, and demands initialize first", async () => {
    const { server } = fakeServer();
    const early = await server.handle(rpc(1, "tools/list"));
    assert.equal(early.error.code, -32002);
    assert.deepEqual((await server.handle(rpc(2, "ping"))).result, {}, "ping works before initialize");
    const init = await server.handle(rpc(3, "initialize", { protocolVersion: "2024-11-05" }));
    assert.equal(init.result.protocolVersion, "2024-11-05");
    assert.equal((await server.handle(rpc(4, "initialize", { protocolVersion: "1999-01-01" }))).result.protocolVersion, SUPPORTED_PROTOCOL_VERSIONS[0]);
    assert.deepEqual(Object.keys(init.result.capabilities).sort(), ["prompts", "resources", "tools"]);
    assert.equal(init.result.serverInfo.name, "t");
    assert.match(init.result.instructions, /joy_check/);
    assert.equal(await server.handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null, "notifications get no response");
  });

  it("rejects malformed envelopes and unknown methods precisely", async () => {
    const { server } = fakeServer();
    await ready(server);
    assert.equal((await server.handle(null)).error.code, -32600);
    assert.equal((await server.handle({ jsonrpc: "1.0", id: 1, method: "x" })).error.code, -32600);
    assert.equal((await server.handle({ jsonrpc: "2.0", id: {}, method: "x" })).error.code, -32600);
    assert.equal((await server.handle({ jsonrpc: "2.0", id: 1, method: "x", params: 5 })).error.code, -32602);
    assert.equal((await server.handle(rpc(5, "nope/nothing"))).error.code, -32601);
    assert.equal((await server.handle([])).error.code, -32600);
    const batch = await server.handle([rpc(6, "ping"), { jsonrpc: "2.0", method: "notifications/initialized" }, rpc(7, "ping")]);
    assert.equal(batch.length, 2);
  });

  it("lists tools with valid schemas, annotations, and no code-execution primitives", async () => {
    const { server } = fakeServer();
    await ready(server);
    const { tools } = (await server.handle(rpc(2, "tools/list"))).result;
    assert.equal(tools.length, MCP_TOOLS.length);
    for (const t of tools) {
      assert.match(t.name, /^joy_[a-z_]+$/);
      assert.equal(t.inputSchema.type, "object");
      assert.equal(t.inputSchema.additionalProperties, false, `${t.name} rejects unknown arguments`);
      assert.equal(typeof t.annotations.readOnlyHint, "boolean");
      assert.ok(t.description.length > 20);
      if (t.annotations.readOnlyHint) assert.equal(t.annotations.destructiveHint, false);
    }
    const names = tools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length);
    assert.ok(!names.some((n) => /drain|exec|run|shell/.test(n)), "MCP must not expose arbitrary code execution");
    assert.ok(!JSON.stringify(MCP_TOOLS.map((t) => t.argv.toString())).includes("--handler"));
  });

  it("maps typed arguments to fixed argv arrays", async () => {
    const { server, calls } = fakeServer();
    await ready(server);
    await call(server, "joy_check", { scope: ["src/a.mjs", "src/b.mjs"], phase: "pre-edit", neighborhood: 2 });
    assert.deepEqual(calls[0], { cli: "check", argv: [".", "--phase", "pre-edit", "--scope", "src/a.mjs,src/b.mjs", "--neighborhood", "2", "--format", "compact"], opts: calls[0].opts });
    await call(server, "joy_queue_add", { name: "email", data: { to: "a" }, key: "k" });
    assert.deepEqual(calls[1].argv, ["queue", "add", "email", "--data", '{"to":"a"}', "--key", "k", "--root", "/state"]);
    await call(server, "joy_swarm_report", { formation: "f1", assignment: "a", status: "completed", summary: "--rm -rf; $(x)" });
    assert.deepEqual(calls[2].argv.slice(0, 8), ["swarm", "report", "f1", "--assignment", "a", "--status", "completed", "--summary"]);
    assert.equal(calls[2].argv[8], "--rm -rf; $(x)", "values are passed as single argv entries, never shell-parsed");
    await call(server, "joy_db_push", { table: "t", type: "delete", where: ["id=1"] });
    assert.ok(!calls[3].argv.includes("--data"));
    await call(server, "joy_heal", {});
    assert.ok(calls[4].argv.includes("--dry-run"), "heal defaults to a dry run");
    await call(server, "joy_heal", { apply: true });
    assert.ok(!calls[5].argv.includes("--dry-run"));
  });

  it("returns unwrapped structured content for trinity tools and distinguishes failures", async () => {
    const { server } = fakeServer();
    await ready(server);
    const ok = (await call(server, "joy_swarm_list", {})).result;
    assert.equal(ok.isError, false);
    assert.ok(ok.structuredContent.result.echoed);
    const failing = fakeServer({ runCli: async () => ({ code: 1, stdout: JSON.stringify({ ok: false, command: "x", error: { code: "ROOT_LOCKED", message: "busy", hint: "wait" } }), stderr: "" }) });
    await ready(failing.server);
    const bad = (await call(failing.server, "joy_swarm_list", {})).result;
    assert.equal(bad.isError, true);
    assert.match(bad.content[0].text, /ROOT_LOCKED: busy\nhint: wait/);
    const garbage = fakeServer({ runCli: async () => ({ code: 3, stdout: "oops", stderr: "boom" }) });
    await ready(garbage.server);
    assert.equal((await call(garbage.server, "joy_swarm_list", {})).result.isError, true);
  });

  it("treats audit violations (exit 1) as a result, and bad invocation (exit 2) as an error", async () => {
    const violations = fakeServer({ runCli: async () => ({ code: 1, stdout: "x.mjs:1:1: error SPI-206", stderr: "" }) });
    await ready(violations.server);
    const r = (await call(violations.server, "joy_check", {})).result;
    assert.equal(r.isError, false);
    assert.equal(r.structuredContent.conforms, false);
    const usage = fakeServer({ runCli: async () => ({ code: 2, stdout: "", stderr: "bad flag" }) });
    await ready(usage.server);
    assert.equal((await call(usage.server, "joy_check", {})).result.isError, true);
  });

  it("validates arguments, reporting every problem so the model can self-correct", async () => {
    const { server, calls } = fakeServer();
    await ready(server);
    const bad = (await call(server, "joy_swarm_report", { formation: "bad id!", status: "maybe", extra: 1 })).result;
    assert.equal(bad.isError, true);
    for (const needle of ["formation has an invalid format", "status must be one of completed, failed", "assignment is required", "extra is not a recognized argument"]) assert.match(bad.content[0].text, new RegExp(needle));
    assert.equal(calls.length, 0, "invalid calls never reach the CLI");
    assert.equal((await call(server, "joy_check", "nope")).result.isError, true);
    assert.equal((await call(server, "joy_check", { neighborhood: 99 })).result.isError, true);
    assert.equal((await call(server, "joy_queue_add", { name: "q", data: "x".repeat(130_000) })).result.isError, true);
    assert.equal((await call(server, "nope", {})).error.code, -32602, "unknown tools are protocol errors");
  });

  it("confines every path argument to the project", async () => {
    const { server, calls } = fakeServer();
    await ready(server);
    for (const [tool, args] of [["joy_check", { dir: "/etc" }], ["joy_check", { scope: ["../../secrets"] }], ["joy_skeleton", { file: "/etc/passwd" }], ["joy_swarm_plan", { task: "t", cwd: "/etc" }], ["joy_db_select", { table: "t", root: "/etc/state" }]]) {
      const result = (await call(server, tool, args)).result;
      assert.equal(result.isError, true, `${tool} ${JSON.stringify(args)}`);
      assert.match(result.content[0].text, /outside the project/);
    }
    assert.equal(calls.length, 0);
  });

  it("supports cancellation, shutdown, timeouts passthrough, and truncates oversized output", async () => {
    let seenSignal;
    const slow = fakeServer({ runCli: (cli, argv, { signal }) => new Promise((resolve, reject) => { seenSignal = signal; signal.addEventListener("abort", () => reject(new Error("cancelled by client"))); }) });
    await ready(slow.server);
    const pending = call(slow.server, "joy_swarm_list", {}, 77);
    await new Promise((r) => setImmediate(r));
    await slow.server.handle({ jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 77 } });
    const result = (await pending).result;
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /cancelled/);
    assert.equal(seenSignal.aborted, true);
    const big = fakeServer({ runCli: async () => ({ code: 0, stdout: "x".repeat(200_000), stderr: "" }) });
    await ready(big.server);
    const text = (await call(big.server, "joy_check", {})).result.content[0].text;
    assert.ok(text.length < 61_000 && /truncated/.test(text));
    const timeout = fakeServer({ options: { toolTimeoutMs: 1234 } });
    await ready(timeout.server);
    await call(timeout.server, "joy_check", {});
    assert.equal(timeout.calls[0].opts.timeoutMs, 1234);
  });

  it("serves resources and prompts", async () => {
    const { server } = fakeServer();
    await ready(server);
    assert.equal((await server.handle(rpc(2, "resources/list"))).result.resources.length, MCP_RESOURCES.length);
    assert.equal((await server.handle(rpc(3, "resources/read", { uri: "joy://protocol/agents" }))).result.contents[0].text, "# agents");
    assert.equal((await server.handle(rpc(4, "resources/read", { uri: "joy://nope" }))).error.code, -32002);
    assert.equal((await server.handle(rpc(5, "resources/read", { uri: "joy://spec/canonical-model" }))).error.code, -32002, "unreadable resources are errors, not empty documents");
    assert.equal((await server.handle(rpc(6, "prompts/list"))).result.prompts.length, MCP_PROMPTS.length);
    const prompt = (await server.handle(rpc(7, "prompts/get", { name: "joy-pre-edit", arguments: { file: "src/a.mjs" } }))).result;
    assert.match(prompt.messages[0].content.text, /src\/a\.mjs/);
    assert.equal((await server.handle(rpc(8, "prompts/get", { name: "joy-pre-edit" }))).error.code, -32602);
    assert.equal((await server.handle(rpc(9, "prompts/get", { name: "nope" }))).error.code, -32602);
  });

  it("validates schemas with the lightweight validator", () => {
    const schema = { type: "object", required: ["a"], additionalProperties: false, properties: { a: { type: "integer", minimum: 1, maximum: 5 }, b: { type: "array", maxItems: 1, items: { type: "string", enum: ["x"] } } } };
    assert.deepEqual(validateAgainstSchema(schema, { a: 3, b: ["x"] }), []);
    assert.equal(validateAgainstSchema(schema, { a: 1.5 }).length, 1);
    assert.equal(validateAgainstSchema(schema, { a: 9, b: ["y", "x"] }).length, 3);
    assert.match(validateAgainstSchema(schema, [])[0], /must be an object/);
  });
});

describe("Suite 33: joy mcp over real stdio", () => {
  function session(cwd, env = {}) {
    const child = spawn(process.execPath, [JOY, "mcp"], { cwd, env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "";
    const waiters = new Map();
    const messages = [];
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf("\n"); i !== -1; i = buffer.indexOf("\n")) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 1);
        const message = JSON.parse(line);
        messages.push(message);
        waiters.get(message.id)?.(message);
      }
    });
    return {
      child,
      messages,
      send: (message) => child.stdin.write(`${JSON.stringify(message)}\n`),
      request(message) {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error(`timeout waiting for ${message.method}`)), 20_000);
          waiters.set(message.id, (m) => { clearTimeout(timer); resolve(m); });
          child.stdin.write(`${JSON.stringify(message)}\n`);
        });
      },
      close: () => new Promise((resolve) => { child.on("close", resolve); child.stdin.end(); })
    };
  }

  it("handshakes, audits, and drives the swarm ledger through MCP", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "joy-mcp-"));
    fs.mkdirSync(path.join(dir, "src/domain"), { recursive: true });
    fs.writeFileSync(path.join(dir, "src/domain/a.mjs"), '/** [LAYER: DOMAIN] */\nimport fs from "node:fs";\nexport const a = fs;\n');
    const s = session(dir);
    try {
      const init = await s.request(rpc(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
      assert.equal(init.result.serverInfo.name, "heav3ns-joy");
      s.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const tools = await s.request(rpc(2, "tools/list"));
      assert.ok(tools.result.tools.length >= 20);

      const audit = await s.request(rpc(3, "tools/call", { name: "joy_check", arguments: { phase: "post-edit", scope: ["src/domain/a.mjs"] } }));
      assert.equal(audit.result.isError, false);
      assert.equal(audit.result.structuredContent.conforms, false, "a domain file importing fs must be flagged");
      assert.match(audit.result.content[0].text, /SPI-206/);
      const explain = await s.request(rpc(4, "tools/call", { name: "joy_explain", arguments: { code: "SPI-206" } }));
      assert.equal(explain.result.isError, false);

      const outside = await s.request(rpc(5, "tools/call", { name: "joy_check", arguments: { dir: "/" } }));
      assert.equal(outside.result.isError, true);

      const plan = await s.request(rpc(6, "tools/call", { name: "joy_swarm_plan", arguments: { task: "fix the failing test in src/a.ts", strategy: "tactical_strike", id: "m1" } }));
      assert.equal(plan.result.isError, false, JSON.stringify(plan.result));
      const next = await s.request(rpc(7, "tools/call", { name: "joy_swarm_next", arguments: { formation: "m1" } }));
      const specialist = next.result.structuredContent.result.ready[0];
      assert.match(specialist.prompt, /Specialist working rules/);
      const report = await s.request(rpc(8, "tools/call", { name: "joy_swarm_report", arguments: { formation: "m1", assignment: specialist.id, status: "completed", summary: "done" } }));
      assert.equal(report.result.isError, false);
      const finish = await s.request(rpc(9, "tools/call", { name: "joy_swarm_finish", arguments: { formation: "m1" } }));
      assert.equal(finish.result.structuredContent.result.status, "completed");
      assert.ok(fs.existsSync(path.join(dir, ".joy-state")), "state lives inside the project by default");

      const resource = await s.request(rpc(10, "resources/read", { uri: "joy://protocol/agents" }));
      assert.match(resource.result.contents[0].text, /Joyzoning|joyzoning|zone/i);
      assert.equal(s.messages.filter((m) => m.id === undefined).length, 0, "no unsolicited stdout traffic");
    } finally {
      await s.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("survives malformed input and oversized garbage, then keeps serving", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "joy-mcp-bad-"));
    const s = session(dir);
    try {
      s.child.stdin.write("this is not json\n");
      s.child.stdin.write(`${JSON.stringify([])}\n`);
      const init = await s.request(rpc(1, "initialize", { protocolVersion: "2025-06-18" }));
      assert.ok(init.result);
      assert.equal(s.messages[0].error.code, -32700);
      assert.equal(s.messages[1].error.code, -32600);
      const pong = await s.request(rpc(2, "ping"));
      assert.deepEqual(pong.result, {});
    } finally {
      await s.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("exits cleanly when the client closes stdin, and prints a registrable config", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "joy-mcp-exit-"));
    const s = session(dir);
    const code = await s.close();
    assert.equal(code, 0);
    const out = (await import("node:child_process")).spawnSync(process.execPath, [JOY, "mcp", "--print-config"], { cwd: dir, encoding: "utf8" });
    assert.equal(out.status, 0);
    assert.equal(JSON.parse(out.stdout).mcpServers.joy.command, "npx");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
