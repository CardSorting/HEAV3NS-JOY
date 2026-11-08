/** [LAYER: UI] */
/**
 * Suite 27: harness-agnostic shell contract of `bin/joy-trinity.mjs` — single JSON
 * document on stdout, exit 0/1/2, durable state across separate processes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "joy-trinity.mjs");

function run(args, input) {
  const result = spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8", input });
  let json = null;
  try { json = JSON.parse(result.stdout); } catch { /* help text */ }
  return { status: result.status, json, stdout: result.stdout };
}

describe("Suite 27: joy-trinity shell contract", () => {
  it("selftest proves queue, BufferedDb, and AgentSwarm in a throwaway directory", () => {
    const { status, json } = run(["selftest"]);
    assert.equal(status, 0);
    assert.deepEqual(json.result.checks, { queue: true, bufferedDb: true, agentSwarm: true, formationLedger: true });
  });

  it("persists queue jobs, drains them with a handler module, and stores rows across processes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-cli-"));
    try {
      const added = run(["queue", "add", "email", "--root", root, "--data", "-", "--key", "k1"], '{"to":"ada"}');
      assert.equal(added.status, 0);
      assert.equal(added.json.result.queueName, "email");
      const duplicate = run(["queue", "add", "email", "--root", root, "--data", '{"to":"other"}', "--key", "k1"]);
      assert.equal(duplicate.json.result.id, added.json.result.id, "idempotency key survives a process restart");
      assert.equal(run(["queue", "list", "--root", root, "--state", "waiting"]).json.result.length, 1);

      const handler = path.join(root, "handler.mjs");
      fs.writeFileSync(handler, "export default async (job) => ({ sent: job.data.to })\n");
      const drained = run(["queue", "drain", "email", "--root", root, "--handler", handler]);
      assert.equal(drained.json.result.drained, true);
      assert.equal(drained.json.result.counts.completed, 1);
      assert.equal(run(["queue", "get", added.json.result.id, "--root", root]).json.result.state, "completed");

      assert.equal(run(["db", "push", "docs", "--root", root, "--data", '{"id":"7","n":1}']).status, 0);
      assert.deepEqual(run(["db", "select", "docs", "--root", root, "--where", "id=7"]).json.result, [{ id: "7", n: 1 }]);
      assert.equal(run(["swarm", "knowledge", "store", "--root", root, "--cwd", "/w", "--note", "run tests first"]).json.result.stored, 1);
      const rejectedNote = run(["swarm", "knowledge", "store", "--root", root, "--cwd", "/w", "--note", "my secret is 123"]).json.result;
      assert.equal(rejectedNote.stored, 0);
      assert.deepEqual(rejectedNote.rejectedReasons, [{ reason: "SENSITIVE_KEYWORD" }]);
      assert.equal(run(["swarm", "knowledge", "recall", "--root", root, "--cwd", "/w"]).json.result[0].content, "run tests first");
      assert.equal(run(["swarm", "knowledge", "search", "--root", root, "--cwd", "/w", "--query", "tests"]).json.result[0].content, "run tests first");
      assert.equal(run(["swarm", "knowledge", "prune", "--root", root, "--cwd", "/w", "--query", "tests"]).json.result.removed, 1);
      assert.equal(run(["swarm", "knowledge", "recall", "--root", root, "--cwd", "/w"]).json.result.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("classifies a task into a specialist roster", () => {
    const { status, json } = run(["swarm", "classify", "--task", "fix the failing test in src/a.ts", "--strategy", "tactical_strike"]);
    assert.equal(status, 0);
    assert.equal(json.result.assignments.length, 1);
  });

  it("exits 2 with a JSON error for usage mistakes and 1 for runtime failures", () => {
    for (const args of [["bogus"], ["queue"], ["queue", "add"], ["db", "push", "t"], ["swarm", "classify"], ["db", "push", "t", "--data", "{bad"]]) {
      const { status, json } = run(args);
      assert.equal(status, 2, args.join(" "));
      assert.equal(json.ok, false);
      assert.equal(json.error.code, "USAGE");
    }
    const missingHandler = run(["queue", "drain", "q", "--handler", "/nonexistent/handler.mjs", "--root", fs.mkdtempSync(path.join(os.tmpdir(), "jt-"))]);
    assert.equal(missingHandler.status, 2);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jt-"));
    const failure = run(["swarm", "next", "no-such-formation", "--root", root]);
    assert.equal(failure.status, 1);
    assert.equal(failure.json.error.code, "FORMATION_NOT_FOUND");
    assert.match(failure.json.error.message, /FORMATION_NOT_FOUND/);
  });

  it("drives a whole swarm formation step by step from the shell, across processes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-swarm-"));
    try {
      const data = JSON.stringify({
        objective: "ship feature",
        assignments: [
          { id: "plan", role: "Architect", objective: "design" },
          { id: "build", role: "Implementer", objective: "build", dependsOn: ["plan"] }
        ]
      });
      const plan = run(["swarm", "plan", "--root", root, "--id", "f1", "--cwd", root, "--data", data]);
      assert.equal(plan.status, 0);
      assert.equal(plan.json.result.assignments.length, 2);

      const first = run(["swarm", "next", "f1", "--root", root]);
      assert.deepEqual(first.json.result.ready.map((r) => r.id), ["plan"]);
      assert.match(first.json.result.ready[0].prompt, /Architect/);
      assert.deepEqual(run(["swarm", "next", "f1", "--root", root]).json.result.ready, [], "claims persist across processes");

      const wrong = run(["swarm", "report", "f1", "--root", root, "--assignment", "build", "--status", "completed", "--summary", "x"]);
      assert.equal(wrong.status, 1);
      assert.equal(run(["swarm", "report", "f1", "--root", root, "--assignment", "plan", "--status", "completed", "--summary", "-"], "design done\nHeuristic: prefer small modules").status, 0);

      const second = run(["swarm", "next", "f1", "--root", root]);
      assert.deepEqual(second.json.result.ready.map((r) => r.id), ["build"]);
      assert.match(second.json.result.ready[0].prompt, /design done/);
      assert.match(second.json.result.ready[0].prompt, /prefer small modules/);

      assert.equal(run(["swarm", "finish", "f1", "--root", root]).status, 1, "finish refuses while work is open");
      run(["swarm", "report", "f1", "--root", root, "--assignment", "build", "--status", "completed", "--summary", "built it"]);
      const finished = run(["swarm", "finish", "f1", "--root", root]);
      assert.equal(finished.json.result.status, "completed");
      assert.equal(run(["swarm", "status", "f1", "--root", root]).json.result.status, "completed");
      assert.equal(run(["swarm", "list", "--root", root]).json.result.length, 1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs a swarm through any command-line agent with `swarm run --exec`", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-run-"));
    try {
      const agent = path.join(root, "agent.mjs");
      fs.writeFileSync(agent, 'import { readFileSync } from "node:fs";\nconst p = readFileSync(0, "utf8");\nconsole.log(`${/specialist role: (.+)/.exec(p)[1]} finished`);\n');
      const result = run(["swarm", "run", "--root", root, "--cwd", root, "--task", "Design and implement a database migration feature in src/db/migrate.ts then verify with tests", "--exec", JSON.stringify([process.execPath, agent])]);
      assert.equal(result.status, 0);
      assert.equal(result.json.result.status, "completed");
      assert.ok(result.json.result.reports.length >= 2);
      assert.ok(result.json.result.reports.every((r) => r.status === "completed" && /finished/.test(r.summary)));
      for (const bad of ['{"not":"an array"}', "[]", "not json"]) {
        assert.equal(run(["swarm", "run", "--root", root, "--task", "x", "--exec", bad]).status, 2, bad);
      }
      assert.equal(run(["swarm", "run", "--root", root, "--task", "x"]).status, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints help and version", () => {
    assert.match(run(["--help"]).stdout, /joy-trinity/);
    assert.match(run(["--version"]).json.result, /^\d+\.\d+\.\d+/);
  });

  it("suggests the intended command, subcommand, option, and value (did you mean)", () => {
    assert.equal(run(["queu"]).json.error.hint, "did you mean 'queue'?");
    assert.equal(run(["queue", "ad", "x"]).json.error.hint, "did you mean 'queue add'?");
    assert.equal(run(["queue", "add", "x", "--attemps", "3"]).json.error.hint, "did you mean --attempts?");
    assert.equal(run(["swarm", "classify", "--task", "t", "--strategy", "full_legon"]).json.error.hint, "did you mean 'full_legion'?");
    assert.match(run(["queue", "add", "x", "--attempts", "many"]).json.error.message, /must be an integer/);
    assert.match(run(["queue", "list", "extra-arg"]).json.error.message, /unexpected argument/);
    assert.match(run(["queue", "get"]).json.error.message, /missing <id>/);
    assert.match(run(["swarm", "report", "f1"]).json.error.message, /missing required option --assignment/);
    assert.match(run(["queue"]).json.error.message, /needs a subcommand/);
  });

  it("offers help at every depth, a help command, and shell completion", () => {
    const top = run(["--help"]).stdout;
    for (const word of ["queue", "db", "swarm", "doctor", "EXIT CODES", "GETTING STARTED"]) assert.match(top, new RegExp(word));
    assert.match(run(["queue", "--help"]).stdout, /SUBCOMMANDS/);
    const leaf = run(["swarm", "report", "-h"]).stdout;
    assert.match(leaf, /--assignment <value>/);
    assert.match(leaf, /required/);
    assert.match(leaf, /EXAMPLES/);
    assert.equal(run(["help", "queue", "add"]).stdout, run(["queue", "add", "--help"]).stdout);
    assert.equal(run(["help", "nonsense"]).status, 2);
    for (const shell of ["bash", "zsh"]) {
      const script = run(["completion", shell]).stdout;
      assert.match(script, /complete -F _joy_trinity joy-trinity/);
      assert.match(script, /--assignment/);
    }
    assert.equal(run(["completion", "fish"]).status, 2);
  });

  it("supports --opt=value, --, and json | ndjson | text output", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-fmt-"));
    try {
      for (const id of ["a", "b"]) assert.equal(run(["db", "push", "t", `--root=${root}`, `--data={"id":"${id}","n":1}`]).status, 0);
      const ndjson = run(["db", "select", "t", "--root", root, "--format", "ndjson"]).stdout.trim().split("\n");
      assert.equal(ndjson.length, 2);
      assert.deepEqual(JSON.parse(ndjson[0]), { id: "a", n: 1 });
      const text = run(["db", "select", "t", "--root", root, "--format", "text"]).stdout;
      assert.match(text, /^ID\s+N/m);
      assert.match(text, /^a\s+1/m);
      const err = spawnSync(process.execPath, [BIN, "bogus", "--format", "text"], { encoding: "utf8" });
      assert.equal(err.status, 2);
      assert.equal(err.stdout, "", "text-mode errors go to stderr");
      assert.match(err.stderr, /error: unknown command 'bogus'/);
      assert.equal(run(["db", "select", "t", "--root", root, "--format", "yaml"]).status, 2);
      assert.equal(run(["db", "select", "--root", root, "--", "t"]).status, 0, "-- ends option parsing");
      assert.equal(spawnSync(process.execPath, [BIN, "db", "select", "t"], { encoding: "utf8", env: { ...process.env, JOY_STATE_ROOT: root, JOY_FORMAT: "ndjson" } }).stdout.trim().split("\n").length, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("serializes concurrent processes on one --root without losing writes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-par-"));
    try {
      const { spawn } = await import("node:child_process");
      const jobs = Array.from({ length: 8 }, (_, i) => new Promise((resolve) => {
        const child = spawn(process.execPath, [BIN, "db", "push", "t", "--root", root, "--data", JSON.stringify({ id: String(i), n: i })]);
        child.on("close", resolve);
      }));
      assert.deepEqual(await Promise.all(jobs), Array(8).fill(0));
      assert.equal(run(["db", "select", "t", "--root", root]).json.result.length, 8);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails fast with ROOT_LOCKED while a live process holds the lock, and reclaims dead locks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-lock-"));
    try {
      const lockFile = path.join(root, ".joy-lock");
      fs.writeFileSync(lockFile, JSON.stringify({ pid: process.pid, host: os.hostname(), token: "t", startedAt: Date.now() }));
      const locked = run(["db", "select", "t", "--root", root, "--lock-timeout-ms", "150"]);
      assert.equal(locked.status, 1);
      assert.equal(locked.json.error.code, "ROOT_LOCKED");
      assert.match(locked.json.error.message, new RegExp(`pid ${process.pid}`));
      const doctor = run(["doctor", "--root", root]);
      assert.equal(doctor.json.result.checks.find((c) => c.name === "lock").status, "warn");
      fs.writeFileSync(lockFile, JSON.stringify({ pid: 2147483646, host: os.hostname(), token: "dead", startedAt: 1 }));
      assert.equal(run(["db", "select", "t", "--root", root]).status, 0, "a lock left by a dead process is reclaimed");
      assert.equal(fs.existsSync(lockFile), false, "and released afterwards");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses unscoped destructive db operations and explains the fix", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-del-"));
    try {
      run(["db", "push", "t", "--root", root, "--data", '{"id":"1"}']);
      const unscoped = run(["db", "push", "t", "--root", root, "--type", "delete"]);
      assert.equal(unscoped.status, 2);
      assert.match(unscoped.json.error.hint, /--where/);
      assert.equal(run(["db", "push", "t", "--root", root, "--type", "delete", "--where", "id=1"]).status, 0);
      assert.deepEqual(run(["db", "select", "t", "--root", root]).json.result, []);
      assert.equal(run(["db", "push", "t", "--root", root, "--data", "[1]"]).status, 2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("peeks without side effects, flags stale claims, validates ids, and prunes finished formations", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-peek-"));
    try {
      assert.equal(run(["swarm", "plan", "--root", root, "--id", "bad id!", "--task", "fix test in src/a.ts"]).status, 1);
      assert.equal(run(["swarm", "plan", "--root", root, "--id", "p1", "--task", "fix the failing test in src/a.ts", "--strategy", "tactical_strike"]).status, 0);
      const peek = run(["swarm", "next", "p1", "--root", root, "--peek"]);
      assert.equal(peek.json.result.ready.length, 1);
      assert.equal(run(["swarm", "status", "p1", "--root", root]).json.result.assignments[0].status, "pending", "peek does not claim");
      const claimed = run(["swarm", "next", "p1", "--root", root]);
      const id = claimed.json.result.ready[0].id;
      assert.deepEqual(claimed.json.result.stale, []);
      const stale = run(["swarm", "next", "p1", "--root", root, "--stale-after-ms", "0"]);
      assert.equal(stale.json.result.stale[0].id, id);
      assert.match(stale.json.result.stale[0].hint, /retry/);
      run(["swarm", "report", "p1", "--root", root, "--assignment", id, "--status", "completed", "--summary", "done"]);
      assert.equal(run(["swarm", "prune", "--root", root, "--older-than-ms", "999999999"]).json.result.removed.length, 0);
      assert.deepEqual(run(["swarm", "prune", "--root", root, "--older-than-ms", "0"]).json.result.removed, ["p1"]);
      assert.equal(run(["swarm", "list", "--root", root]).json.result.length, 0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("doctor reports a healthy environment with actionable checks", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "joy-trinity-doc-"));
    try {
      const { status, json } = run(["doctor", "--root", root]);
      assert.equal(status, 0);
      assert.equal(json.result.ok, true);
      assert.deepEqual(json.result.checks.map((c) => c.name), ["node", "state-directory", "lock", "storage", "swarm-config"]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
