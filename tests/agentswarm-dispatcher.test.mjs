/** [LAYER: UI] */
/** AgentSwarm services and dispatcher (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AgentSwarmDispatcher, BufferedDb, FileSwarmConfigStore, InMemorySwarmLeaseService, MemoryBufferedStore, MemorySwarmConfigStore, SwarmConfigService, SwarmKnowledgeService, createAgentSwarm, createPortableBroccoli, defaultAgentSwarmConfig, tempDir } from "./support/trinity.mjs";

describe("Suite 26: AgentSwarm Services & Host-Agnostic Dispatcher", () => {
  it("grants exclusive fenced leases, expires them, and honors renewal", async () => {
    let now = 1_000;
    const leases = new InMemorySwarmLeaseService({ now: () => now });
    const lease = await leases.acquireLease("res", "owner-1", 100);
    await assert.rejects(leases.acquireLease("res", "owner-2", 100), /SWARM_LEASE_BUSY/);
    now += 90;
    const renewed = await leases.renewLease(lease, 100);
    assert.equal(renewed.expiresAt, 1_190);
    now += 150;
    await assert.rejects(leases.assertLease(lease), /SWARM_LEASE_EXPIRED/);
    const takeover = await leases.acquireLease("res", "owner-2", 100);
    assert.notEqual(takeover.leaseEpoch, lease.leaseEpoch);
    await assert.rejects(leases.assertLease(lease), /SWARM_LEASE_LOST/);
    assert.equal(await leases.release("res", "owner-1", lease.leaseEpoch, lease.fencingToken), false);
    assert.equal(await leases.release("res", "owner-2", takeover.leaseEpoch, takeover.fencingToken), true);
  });

  it("round-trips config through memory and file stores, failing closed on corruption", async () => {
    const memory = new SwarmConfigService({ store: new MemorySwarmConfigStore(), env: {} });
    assert.deepEqual(await memory.read(), defaultAgentSwarmConfig);
    await memory.write({ ...defaultAgentSwarmConfig, enabled: true, maxSpecialists: 6 });
    assert.equal((await memory.read()).maxSpecialists, 6);

    const withEnv = new SwarmConfigService({ store: new MemorySwarmConfigStore({ enabled: false }), env: { JOY_SWARM_ENABLED: "1" } });
    assert.equal((await withEnv.read()).enabled, true, "environment wins on read");
    await withEnv.write({ ...defaultAgentSwarmConfig, enabled: true, maxSpecialists: 3 });
    const raw = await withEnv.read();
    assert.equal(raw.maxSpecialists, 3);

    const dir = tempDir("swarm-config");
    try {
      const file = path.join(dir, "nested", "agent-swarm.json");
      const service = new SwarmConfigService({ store: new FileSwarmConfigStore({ file }), env: {} });
      assert.deepEqual(await service.read(), defaultAgentSwarmConfig);
      await service.write({ ...defaultAgentSwarmConfig, enabled: true });
      assert.equal(JSON.parse(fs.readFileSync(file, "utf8")).enabled, true);
      if (process.platform !== "win32") assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      fs.writeFileSync(file, "{ not json");
      const closed = await service.read();
      assert.equal(closed.enabled, false);
      assert.equal(closed.legion, false);
      assert.deepEqual(fs.readdirSync(path.dirname(file)).filter((name) => name.endsWith(".tmp")), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stores, scopes, expires, and recalls workspace knowledge through BufferedDb", async () => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    const knowledge = new SwarmKnowledgeService({ db });
    const now = 1_000_000;
    assert.equal(await knowledge.store("/ws/a", "stream", ["run pnpm check", "my api_key is hunter2", "run pnpm check"], now), 1);
    assert.equal(await knowledge.store("/ws/a", "stream", ["run pnpm check"], now + 5), 0, "live duplicates are skipped");
    assert.equal(await knowledge.store("/ws/b", "stream", ["only for b"], now), 1);
    assert.deepEqual((await knowledge.recall("/ws/a", now + 10)).map((o) => o.content), ["run pnpm check"]);
    assert.deepEqual((await knowledge.recall("/ws/b", now + 10)).map((o) => o.content), ["only for b"]);
    assert.deepEqual(await knowledge.recall("/ws/a", now + 31 * 24 * 60 * 60 * 1000), [], "expired observations are not recalled");
    await db.stop();
  });

  const idleParent = (overrides = {}) => ({
    sessionContext: { sessionId: `parent-${Math.random()}` },
    createSnapshot: () => ({}),
    forkSession: () => ({
      tick: async () => ({ outcome: "completed", response: "done", toolResults: [] }),
      sessionStore: { getTranscript: () => [], getMessages: () => [], exportJsonl: () => "" }
    }),
    ...overrides
  });
  const enabledConfig = (extra = {}) => ({ read: async () => ({ ...defaultAgentSwarmConfig, enabled: true, ...extra }) });

  it("prevents separate dispatchers sharing a lease service from forming concurrently", async () => {
    const leaseService = new InMemorySwarmLeaseService();
    let started;
    const childStarted = new Promise((resolve) => { started = resolve; });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const parent = idleParent({
      sessionContext: { sessionId: "shared-parent" },
      forkSession: () => ({
        tick: async () => { started(); await gate; return { outcome: "completed", response: "done", toolResults: [] }; },
        sessionStore: { getTranscript: () => [], getMessages: () => [], exportJsonl: () => "" }
      })
    });
    const first = new AgentSwarmDispatcher({ leaseService, configService: enabledConfig() });
    const second = new AgentSwarmDispatcher({ leaseService, configService: enabledConfig() });
    const assignment = [{ id: "worker", role: "developer", objective: "work" }];
    const firstFormation = first.delegateSpecialistFormation("objective", assignment, parent);
    await childStarted;
    await assert.rejects(second.delegateSpecialistFormation("objective", assignment, parent), /SWARM_LEASE_BUSY/);
    await assert.rejects(first.delegateSpecialistFormation("objective", assignment, parent), /AGENT_SWARM_FORMATION_BUSY/);
    release();
    assert.equal((await firstFormation).status, "completed");
    assert.equal((await new AgentSwarmDispatcher({ leaseService, configService: enabledConfig() }).delegateSpecialistFormation("objective", assignment, parent)).status, "completed", "the lease is released afterwards");
  });

  it("refuses to delegate while the swarm and legion are disabled", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: { read: async () => ({ ...defaultAgentSwarmConfig, enabled: false, legion: false }) } });
    await assert.rejects(dispatcher.delegateSpecialistFormation("o", [{ id: "a", role: "r", objective: "x" }], idleParent()), /AGENT_SWARM_DISABLED/);
    await assert.rejects(dispatcher.delegateSubagentTask("x", idleParent()), /AGENT_SWARM_DISABLED/);
  });

  it("validates formations (bounds, duplicates, unknown dependencies, cycles)", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig({ maxSpecialists: 2 }) });
    const run = (assignments) => dispatcher.delegateSpecialistFormation("o", assignments, idleParent());
    await assert.rejects(run([]), /INVALID_FORMATION: provide 1-2/);
    await assert.rejects(run([1, 2, 3].map((n) => ({ id: `s${n}`, role: "r", objective: "x" }))), /INVALID_FORMATION: provide 1-2/);
    await assert.rejects(run([{ id: "a", role: "r", objective: "x" }, { id: "a", role: "r", objective: "y" }]), /unique/);
    await assert.rejects(run([{ id: "a", role: "r", objective: "x", dependsOn: ["ghost"] }]), /unknown or self dependency/);
    await assert.rejects(run([{ id: "a", role: "r", objective: "x", dependsOn: ["b"] }, { id: "b", role: "r", objective: "y", dependsOn: ["a"] }]), /dependency cycle/);
    await assert.rejects(run([{ id: "one", role: "r", objective: "x" }, { id: "one-attempt-1", role: "r", objective: "y" }]), /collide with failover stream IDs/);
  });

  it("runs dependent specialists in order, shares heuristics, and persists new ones", async () => {
    const saved = [];
    const prompts = [];
    const dispatcher = new AgentSwarmDispatcher({
      configService: enabledConfig(),
      workspaceKnowledge: {
        recall: async () => [{ content: "Use pnpm test for the unit suite.", createdAt: 1, expiresAt: Date.now() + 1000 }],
        store: async (_cwd, _streamId, observations) => { saved.push(...observations); return observations.length; }
      }
    });
    dispatcher.delegateSubagentTask = async (prompt) => {
      prompts.push(prompt);
      return { tickResult: { outcome: "completed", response: prompts.length === 1 ? "Heuristic: run pnpm check for type validation" : "Stage complete", toolResults: [] } };
    };
    const result = await dispatcher.delegateSpecialistFormation(
      "Improve the project",
      [
        { id: "verify", role: "verifier", objective: "Verify the changes", dependsOn: ["research"] },
        { id: "research", role: "researcher", objective: "Inspect the workspace" }
      ],
      { sessionContext: { sessionId: "parent", cwd: "/ws" } }
    );
    assert.equal(result.status, "completed");
    assert.match(prompts[0], /Use pnpm test for the unit suite/);
    assert.match(prompts[0], /Your independent specialist role: researcher/);
    assert.match(prompts[1], /run pnpm check for type validation/);
    assert.match(prompts[1], /trust="untrusted"/);
    assert.deepEqual(saved, ["run pnpm check for type validation"]);
  });

  it("does not replay a failed child when retry safety is unknown, and surfaces uncertainty", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig() });
    let calls = 0;
    let firstPrompt = "";
    dispatcher.delegateSubagentTask = async (prompt) => {
      calls++;
      firstPrompt = prompt;
      return { tickResult: { outcome: "failed", toolResults: [], response: "lost result" } };
    };
    const result = await dispatcher.delegateSpecialistFormation("objective", [{ id: "one", role: "developer", objective: "implement code" }], {});
    assert.equal(calls, 1);
    assert.match(firstPrompt, /file reading and searching capabilities/);
    assert.match(firstPrompt, /Never modify files through shell heredocs/);
    assert.equal(result.status, "partial_failure");
    assert.match(result.reports[0].reason, /retry safety/);

    const real = new AgentSwarmDispatcher({ configService: enabledConfig() });
    const throwing = idleParent({ forkSession: () => ({ tick: async () => { throw new Error("lost child outcome"); } }) });
    await assert.rejects(real.delegateSpecialistFormation("objective", [{ id: "one", role: "developer", objective: "implement code" }], throwing), /SWARM_EXECUTION_UNCERTAIN:.*lost child outcome/);
    assert.equal(real.getHierarchyDeferStatus().activeChildren, 0);

    await assert.rejects(
      dispatcher.delegateSpecialistFormation("objective", [{ id: "one", role: "developer", objective: "implement code" }], {}, undefined, async () => { throw new Error("disk failure"); }),
      /SWARM_PROGRESS_PERSISTENCE_UNCERTAIN: child stream persistence failed/
    );
    await assert.rejects(
      dispatcher.delegateSpecialistFormation(
        "objective",
        [{ id: "one", role: "developer", objective: "first" }, { id: "two", role: "reviewer", objective: "second", dependsOn: ["one"] }],
        {}, undefined, undefined, { completed: [{ id: "two", role: "reviewer", summary: "done" }] }
      ),
      /INVALID_FORMATION_RESUME:.*incomplete dependency/
    );
  });

  it("fails over once to a replacement role only when retry is provably safe", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig() });
    const prompts = [];
    dispatcher.delegateSubagentTask = async (prompt) => {
      prompts.push(prompt);
      return prompts.length === 1
        ? { tickResult: { outcome: "failed", safeToRetry: true, toolResults: [], response: "died early" } }
        : { tickResult: { outcome: "completed", toolResults: [], response: "recovered" } };
    };
    const streams = [];
    const result = await dispatcher.delegateSpecialistFormation(
      "objective", [{ id: "one", role: "developer", objective: "implement code" }], {}, undefined,
      async (assignment) => { streams.push(assignment.id); }
    );
    assert.equal(result.status, "completed");
    assert.equal(result.reports[0].attempts, 2);
    assert.ok(result.reports[0].replacementRole);
    assert.deepEqual(streams, ["one-attempt-1", "one"]);
    assert.match(prompts[1], /prior attempt ended before invoking any tools/);
  });

  it("resumes a deferred specialist with its saved session checkpoint", async () => {
    const checkpoint = { activeJsonl: '{"role":"user","content":"prior"}', transcriptJsonl: '{"role":"user","content":"prior"}' };
    let forkArgs = [];
    const parent = idleParent({
      forkSession: (...args) => {
        forkArgs = args;
        return { tick: async () => ({ outcome: "completed", response: "finished", toolResults: [] }), sessionStore: { getTranscript: () => [], getMessages: () => [], exportJsonl: () => "" } };
      }
    });
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig() });
    const result = await dispatcher.delegateSpecialistFormation(
      "objective", [{ id: "specialist", role: "developer", objective: "continue" }], parent, undefined, undefined,
      { completed: [], deferredChildren: { specialist: { childSessionId: "child-existing", ...checkpoint } } }
    );
    assert.equal(result.status, "completed");
    assert.equal(forkArgs[0], "child-existing");
    assert.deepEqual(forkArgs[1], checkpoint);
  });

  it("waits for an active child safe-boundary acknowledgment before settling defer", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig({ hierarchicalDefer: true }) });
    let started;
    const childStarted = new Promise((resolve) => { started = resolve; });
    let releaseDescendants;
    const descendantsSettled = new Promise((resolve) => { releaseDescendants = resolve; });
    let persistCheckpoint;
    let checkpointStarted;
    const checkpointPersisted = new Promise((resolve) => { persistCheckpoint = resolve; });
    const checkpointStartedPromise = new Promise((resolve) => { checkpointStarted = resolve; });
    const parent = idleParent({
      sessionContext: { sessionId: "parent" },
      forkSession: () => ({
        swarmDispatcher: { deferHierarchy: async () => { await descendantsSettled; return { deferred: true, boundary: "safe_boundary", activeChildren: 0 }; } },
        tick: async (input) => {
          started();
          while (!input.shouldDefer?.()) await new Promise((resolve) => setImmediate(resolve));
          return { outcome: "deferred", response: "yielded", toolResults: [] };
        },
        sessionStore: { getTranscript: () => [], getMessages: () => [], exportJsonl: () => "" }
      })
    });
    const formation = dispatcher.delegateSpecialistFormation(
      "objective", [{ id: "child", role: "developer", objective: "work" }], parent, undefined,
      async () => { checkpointStarted(); await checkpointPersisted; }
    );
    await childStarted;
    const deferPromise = dispatcher.deferHierarchy();
    const settled = () => Promise.race([deferPromise.then(() => true), new Promise((resolve) => setImmediate(() => resolve(false)))]);
    assert.equal(await settled(), false);
    releaseDescendants();
    await checkpointStartedPromise;
    assert.equal(await settled(), false);
    persistCheckpoint();
    const result = await deferPromise;
    assert.equal(result.deferred, true);
    assert.equal(result.activeChildren, 0);
    assert.equal(dispatcher.getHierarchyDeferStatus().activeChildren, 0);
    assert.equal((await formation).status, "deferred");
    assert.equal(dispatcher.resumeHierarchy().deferred, false);
  });

  it("does not acknowledge a child whose tick settles without a deferred outcome", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig({ hierarchicalDefer: true }) });
    let started;
    const childStarted = new Promise((resolve) => { started = resolve; });
    const parent = idleParent({
      forkSession: () => ({
        swarmDispatcher: { deferHierarchy: async () => ({ deferred: true, boundary: "safe_boundary", activeChildren: 0 }) },
        tick: async () => { started(); await new Promise((resolve) => setTimeout(resolve, 10)); return { outcome: "failed", response: "uncertain", toolResults: [] }; },
        sessionStore: { getTranscript: () => [], getMessages: () => [], exportJsonl: () => "" }
      })
    });
    const formation = dispatcher.delegateSpecialistFormation("objective", [{ id: "child", role: "developer", objective: "work" }], parent);
    await childStarted;
    await assert.rejects(dispatcher.deferHierarchy(), /AGENT_HIERARCHY_DEFER_UNCONFIRMED/);
    assert.equal(dispatcher.getHierarchyDeferStatus().deferred, false);
    assert.equal(dispatcher.getHierarchyDeferStatus().requested, true);
    assert.equal((await formation).status, "deferred");
  });

  it("aborts a formation when the caller's signal fires", async () => {
    const dispatcher = new AgentSwarmDispatcher({ configService: enabledConfig() });
    const controller = new AbortController();
    controller.abort(new Error("stop now"));
    await assert.rejects(
      dispatcher.delegateSpecialistFormation("o", [{ id: "a", role: "r", objective: "x" }], idleParent(), undefined, undefined, undefined, controller.signal),
      /stop now/
    );
  });

  it("wires createAgentSwarm with durable knowledge and in-memory config", async () => {
    const root = tempDir("agent-swarm");
    const broccoli = createPortableBroccoli({ workspaceRoot: root });
    try {
      await broccoli.start();
      const swarm = createAgentSwarm({ db: broccoli.db, persistConfig: false, env: { JOY_SWARM_ENABLED: "1" } });
      assert.equal((await swarm.config.read()).enabled, true);
      assert.equal(await swarm.knowledge.store(root, "s", ["prefer small PRs"]), 1);
      assert.deepEqual((await swarm.knowledge.recall(root)).map((o) => o.content), ["prefer small PRs"]);
      const prompts = [];
      swarm.dispatcher.delegateSubagentTask = async (prompt) => { prompts.push(prompt); return { tickResult: { outcome: "completed", response: "ok", toolResults: [] } }; };
      const result = await swarm.dispatcher.delegateSpecialistFormation("o", [{ id: "a", role: "r", objective: "x" }], { sessionContext: { sessionId: "p", cwd: root } });
      assert.equal(result.status, "completed");
      assert.match(prompts[0], /prefer small PRs/);
    } finally {
      await broccoli.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
