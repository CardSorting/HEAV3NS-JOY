/** [LAYER: UI] */
/** Harness-independent swarm operation (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AgentSwarmDispatcher, BufferedDb, MemoryBufferedStore, ProcessAgentEngine, SwarmFormationLedger, SwarmKnowledgeService, buildSpecialistPrompt, enabledConfigForProcess, tempDir, validateAndOrderFormation } from "./support/trinity.mjs";

describe("Suite 28: Harness-Independent Swarm Operation (Ledger & External Processes)", () => {
  const assignments = [
    { id: "plan", role: "Architect", objective: "design it" },
    { id: "build", role: "Implementer", objective: "build it", dependsOn: ["plan"] },
    { id: "check", role: "Verifier", objective: "verify it", dependsOn: ["build"] }
  ];
  const makeLedger = async (now) => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    return { db, ledger: new SwarmFormationLedger({ db, knowledge: new SwarmKnowledgeService({ db }), ...(now ? { now } : {}) }) };
  };

  it("validates and orders formations and builds self-contained prompts", () => {
    assert.deepEqual(validateAndOrderFormation([assignments[2], assignments[0], assignments[1]]).map((a) => a.id), ["plan", "build", "check"]);
    assert.throws(() => validateAndOrderFormation([]), /INVALID_FORMATION/);
    const prompt = buildSpecialistPrompt({ objective: "O", role: "R", assignmentObjective: "A", priorReports: [{ id: "x", role: "Y", summary: "<script>" }] });
    assert.match(prompt, /Coordinator objective: O/);
    assert.match(prompt, /&lt;script&gt;/);
    assert.doesNotMatch(prompt, /read_file|execute_command|write_to_file/, "prompts name no harness-specific tools");
  });

  it("walks a formation end to end: claim, report, cascade, retry, finish", async () => {
    const { db, ledger } = await makeLedger();
    const created = await ledger.create({ objective: "ship feature", assignments, cwd: "/ws", id: "f1" });
    assert.equal(created.status, "pending");
    await assert.rejects(ledger.create({ objective: "dup", assignments, id: "f1" }), /FORMATION_EXISTS/);

    const peek = await ledger.next("f1", { claim: false });
    assert.deepEqual(peek.ready.map((r) => r.id), ["plan"]);
    const first = await ledger.next("f1");
    assert.deepEqual(first.ready.map((r) => r.id), ["plan"]);
    assert.deepEqual((await ledger.next("f1")).ready, [], "claimed work is never handed out twice");
    assert.match(first.ready[0].prompt, /Your independent specialist role: Architect/);

    await assert.rejects(ledger.report("f1", "build", { status: "completed", summary: "x" }), /not running/);
    await assert.rejects(ledger.report("f1", "plan", { status: "completed", summary: "  " }), /non-empty summary/);
    await assert.rejects(ledger.report("f1", "plan", { status: "maybe" }), /INVALID_REPORT/);
    const reported = await ledger.report("f1", "plan", { status: "completed", summary: "design done\nHeuristic: use the repo's lint script" });
    assert.equal(reported.learned, 1);

    const second = await ledger.next("f1");
    assert.deepEqual(second.ready.map((r) => r.id), ["build"]);
    assert.match(second.ready[0].prompt, /design done/, "prior reports flow into dependent prompts");
    assert.match(second.ready[0].prompt, /use the repo's lint script/, "learned heuristics reach later specialists");

    await ledger.report("f1", "build", { status: "failed", summary: "compile error" });
    const afterFail = await ledger.next("f1");
    assert.equal(afterFail.done, true);
    assert.equal((await ledger.status("f1")).assignments.find((a) => a.id === "check").status, "skipped");
    await assert.rejects(ledger.finish("nope"), /FORMATION_NOT_FOUND/);

    const reset = await ledger.retry("f1", "build");
    assert.deepEqual(reset.reset.sort(), ["build", "check"]);
    const retried = await ledger.next("f1");
    assert.match(retried.ready[0].prompt, /Prior failure: compile error/);
    await ledger.report("f1", "build", { status: "completed", summary: "built" });
    await ledger.next("f1");
    await assert.rejects(ledger.finish("f1"), /FORMATION_INCOMPLETE/);
    await ledger.report("f1", "check", { status: "completed", summary: "all green" });
    const finished = await ledger.finish("f1");
    assert.equal(finished.status, "completed");
    assert.match(finished.handoff, /all green/);
    assert.equal((await ledger.list()).length, 1);
    await db.stop();
  });

  it("plans from a task description when no assignments are given", async () => {
    const { db, ledger } = await makeLedger();
    const created = await ledger.create({ task: "Design and implement a database migration feature in src/db/migrate.ts then verify with tests", maxSpecialists: 4 });
    assert.ok(created.assignments.length >= 2);
    await assert.rejects(ledger.create({}), /objective or task is required/);
    await db.stop();
  });

  const scriptDir = tempDir("process-engine");
  const agent = (body) => {
    const file = path.join(scriptDir, `agent-${Math.random().toString(36).slice(2)}.mjs`);
    fs.writeFileSync(file, body);
    return [process.execPath, file];
  };

  it("runs specialists as external processes through the dispatcher", async () => {
    const command = agent('import { readFileSync } from "node:fs";\nconst p = readFileSync(0, "utf8");\nconst fileCopy = readFileSync(process.env.JOY_SWARM_PROMPT_FILE, "utf8");\nconsole.log(`${/specialist role: (.+)/.exec(p)[1]} ok:${p === fileCopy}`);\n');
    const engine = new ProcessAgentEngine({ command, cwd: scriptDir });
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfigForProcess() });
    const result = await dispatcher.delegateSpecialistFormation("objective", assignments, engine);
    assert.equal(result.status, "completed");
    assert.deepEqual(result.reports.map((r) => r.result.tickResult.response), ["Architect ok:true", "Implementer ok:true", "Verifier ok:true"]);
  });

  it("maps non-zero exits to failed (never auto-replayed) and unspawnable commands to safely retryable", async () => {
    const failing = new ProcessAgentEngine({ command: agent('console.error("boom"); process.exit(3);') }).forkSession("c1");
    const failed = await failing.tick({ prompt: "p" });
    assert.equal(failed.outcome, "failed");
    assert.equal(failed.safeToRetry, false);
    assert.match(failed.response, /boom/);
    const missing = await new ProcessAgentEngine({ command: ["definitely-not-a-real-binary-xyz"] }).forkSession("c2").tick({ prompt: "p" });
    assert.equal(missing.outcome, "failed");
    assert.equal(missing.safeToRetry, true);
    const slow = await new ProcessAgentEngine({ command: agent("setTimeout(() => {}, 5000);"), timeoutMs: 100 }).forkSession("c3").tick({ prompt: "p" });
    assert.equal(slow.outcome, "failed");
    const aborted = new AbortController();
    const pending = new ProcessAgentEngine({ command: agent("setTimeout(() => {}, 5000);") }).forkSession("c4").tick({ prompt: "p", signal: aborted.signal });
    setTimeout(() => aborted.abort(), 100);
    assert.equal((await pending).outcome, "failed");
    assert.throws(() => new ProcessAgentEngine({ command: [] }), /argv array/);
    assert.throws(() => new ProcessAgentEngine({ command: "node x" }), /argv array/);
  });

  it("does not interpret prompt content as shell syntax", async () => {
    const marker = path.join(scriptDir, "pwned");
    const command = agent('import { readFileSync } from "node:fs";\nprocess.stdout.write(readFileSync(0, "utf8").length > 0 ? "fine" : "empty");');
    const outcome = await new ProcessAgentEngine({ command }).forkSession("c5").tick({ prompt: `$(touch ${marker}); \`touch ${marker}\`` });
    assert.equal(outcome.response, "fine");
    assert.equal(fs.existsSync(marker), false);
    fs.rmSync(scriptDir, { recursive: true, force: true });
  });
});
