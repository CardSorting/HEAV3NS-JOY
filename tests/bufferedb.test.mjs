/** [LAYER: UI] */
/** BufferedDb (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BroccoliBufferedStore, BufferedDb, BufferedDbPool, MemoryBufferedStore, ShadowCommitError, applyValues, createMonomorphicWriteOp, createPortableBroccoli, eventually, increment, matches, sortOperationsForFlush, tempDir } from "./support/trinity.mjs";

describe("Suite 24: BufferedDb Write-Behind Semantics", () => {
  it("applies pure write-op algebra (matches, applyValues, increments, layer ordering)", () => {
    assert.equal(matches({ a: 5, s: "Hello" }, [{ column: "a", value: 3, operator: ">" }, { column: "s", value: "he%", operator: "LIKE" }]), true);
    assert.equal(matches({ a: null }, [{ column: "a", value: null, operator: "IS" }]), true);
    assert.equal(matches({ a: 2 }, [{ column: "a", value: [1, 2], operator: "IN" }]), true);
    assert.equal(matches({ a: 2 }, [{ column: "a", value: 2, operator: "??" }]), false);
    assert.deepEqual(applyValues({ n: 1 }, { n: increment(4), m: "x" }), { n: 5, m: "x" });
    const sorted = sortOperationsForFlush([
      createMonomorphicWriteOp("insert", "b", {}, undefined, undefined, undefined, "ui"),
      createMonomorphicWriteOp("insert", "z", {}, undefined, undefined, undefined, "domain"),
      createMonomorphicWriteOp("insert", "a", {}, undefined, undefined, undefined, "domain")
    ]);
    assert.deepEqual(sorted.map((op) => op.table), ["a", "z", "b"]);
  });

  it("gives read-your-writes before flush and persists on flush", async () => {
    const store = new MemoryBufferedStore();
    const db = new BufferedDb({ store, flushIntervalMs: 60_000 });
    await db.push({ type: "insert", table: "t", values: { id: "1", v: 1 } });
    assert.equal((await db.selectOne("t", { column: "id", value: "1" })).v, 1);
    assert.equal(store.rows("t").length, 0, "nothing is persisted before flush");
    await db.push({ type: "update", table: "t", values: { v: increment(2) }, where: { column: "id", value: "1" } });
    assert.equal((await db.selectOne("t", { column: "id", value: "1" })).v, 3);
    await db.flush();
    assert.deepEqual(store.rows("t"), [{ id: "1", v: 3 }]);
    assert.equal(db.getMetrics().totalTransactions, 1);
    await db.stop();
  });

  it("supports upsert, delete, ordering, and limits", async () => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    for (const [id, n] of [["a", 3], ["b", 1], ["c", 2]]) await db.push({ type: "upsert", table: "t", values: { id, n }, conflictTarget: "id" });
    await db.push({ type: "upsert", table: "t", values: { id: "a", n: increment(10) }, conflictTarget: "id" });
    await db.flush();
    const sorted = await db.selectWhere("t", [], undefined, { orderBy: { column: "n", direction: "asc" }, limit: 2 });
    assert.deepEqual(sorted.map((r) => r.id), ["b", "c"]);
    assert.equal((await db.selectOne("t", { column: "id", value: "a" })).n, 13);
    await db.push({ type: "delete", table: "t", where: { column: "id", value: "b" } });
    assert.equal((await db.selectAllFrom("t")).length, 2, "deletes are visible before flush");
    await db.flush();
    assert.equal((await db.selectAllFrom("t")).length, 2);
    await db.stop();
  });

  it("isolates agent shadows until commit and discards them on rollback", async () => {
    const store = new MemoryBufferedStore();
    const db = new BufferedDb({ store });
    await db.beginWork("agent-1");
    await db.push({ type: "insert", table: "t", values: { id: "x" } }, "agent-1", "src/a.mjs");
    assert.equal((await db.selectAllFrom("t")).length, 0, "other readers do not see shadow writes");
    assert.equal((await db.selectAllFrom("t", "agent-1")).length, 1, "the owner sees its own shadow");
    assert.equal((await db.getActiveAffectedFiles()).get("src/a.mjs"), "agent-1");
    await assert.rejects(db.stop(), ShadowCommitError);
    await db.commitWork("agent-1");
    await db.flush();
    assert.equal(store.rows("t").length, 1);

    await db.beginWork("agent-2");
    await db.push({ type: "insert", table: "t", values: { id: "y" } }, "agent-2");
    await db.rollbackWork("agent-2");
    await db.flush();
    assert.equal(store.rows("t").length, 1);
    await db.stop();
  });

  it("runTransaction commits on success and rolls back on error", async () => {
    const store = new MemoryBufferedStore();
    const db = new BufferedDb({ store });
    await db.runTransaction(async (agentId) => db.push({ type: "insert", table: "t", values: { id: "ok" } }, agentId));
    await assert.rejects(
      db.runTransaction(async (agentId) => {
        await db.push({ type: "insert", table: "t", values: { id: "bad" } }, agentId);
        throw new Error("boom");
      }),
      /boom/
    );
    await db.flush();
    assert.deepEqual(store.rows("t").map((r) => r.id), ["ok"]);
    await db.stop();
  });

  it("returns operations to the buffer when a flush fails and succeeds on retry", async () => {
    class FlakyStore extends MemoryBufferedStore {
      failures = 1;
      async transaction(fn) {
        if (this.failures-- > 0) throw new Error("disk full");
        return super.transaction(fn);
      }
    }
    const store = new FlakyStore();
    const errors = [];
    const db = new BufferedDb({ store, logger: { error: (...args) => errors.push(args) }, flushIntervalMs: 60_000 });
    await db.push({ type: "insert", table: "t", values: { id: "1" } });
    await assert.rejects(db.flush(), /disk full/);
    assert.equal(errors.length, 1);
    assert.equal(db.getMetrics().activeBufferSize, 1, "operations were returned to the buffer");
    assert.equal((await db.selectAllFrom("t")).length, 1, "reads still observe the unflushed write");
    await db.flush();
    assert.equal(store.rows("t").length, 1);
    await db.stop();
  });

  it("rejects new work while draining and can restart after stop", async () => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    await db.push({ type: "insert", table: "t", values: { id: "1" } });
    await db.stop();
    await db.push({ type: "insert", table: "t", values: { id: "2" } });
    await db.flush();
    assert.equal((await db.selectAllFrom("t")).length, 2);
    await db.stop();
    assert.equal(BufferedDbPool, BufferedDb);
  });

  it("flushes automatically in the background", async () => {
    const store = new MemoryBufferedStore();
    const db = new BufferedDb({ store });
    await db.push({ type: "insert", table: "t", values: { id: "auto" } });
    await eventually(() => store.rows("t").length === 1);
    assert.equal(db.getMetrics().activeBufferSize, 0);
    await db.stop();
  });

  it("persists across restarts through the vendored BroccoliDB kernel", async () => {
    const root = tempDir("buffered-db");
    try {
      const first = new BufferedDb({ store: new BroccoliBufferedStore({ workspaceRoot: root }) });
      await first.push({ type: "insert", table: "docs", values: { id: "d1", title: "hello", views: 0 } });
      await first.push({ type: "update", table: "docs", values: { views: increment(5) }, where: { column: "id", value: "d1" } });
      assert.equal(await first.warmupTable("docs", "title", "hello"), 1);
      await first.stop();

      const second = new BufferedDb({ store: new BroccoliBufferedStore({ workspaceRoot: root }) });
      const row = await second.selectOne("docs", { column: "id", value: "d1" });
      assert.deepEqual(row, { id: "d1", title: "hello", views: 5 });
      await second.stop();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails loudly when a row has no id and no resolver was supplied", async () => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    await db.push({ type: "insert", table: "t", values: { name: "no-id" } });
    await assert.rejects(db.flush(), /BUFFERED_DB_ROW_ID_MISSING/);
    assert.throws(() => new BufferedDb({}), /requires an IBufferedStore/);
  });

  it("shares one durable kernel between BufferedDb and BroccoliQueue", async () => {
    const root = tempDir("trinity");
    const broccoli = createPortableBroccoli({ workspaceRoot: root });
    try {
      await broccoli.start();
      const queue = broccoli.createQueue({ namespace: "trinity" });
      await queue.start();
      const processed = [];
      const worker = queue.process("job", async (job) => {
        await broccoli.db.push({ type: "upsert", table: "results", values: { id: job.id, value: job.data.value }, conflictTarget: "id" });
        processed.push(job.data.value);
        return { ok: true };
      }, { concurrency: 2 });
      await worker.start();
      const jobs = await Promise.all([1, 2, 3].map((value) => queue.add("job", { value })));
      await eventually(() => processed.length === 3);
      await eventually(() => jobs.every((job) => queue.getJob(job.id).state === "completed"));
      assert.equal((await broccoli.db.selectAllFrom("results")).length, 3);
    } finally {
      await broccoli.stop({ drainTimeoutMs: 2000 });
    }
    const reopened = createPortableBroccoli({ workspaceRoot: root });
    try {
      await reopened.start();
      assert.equal((await reopened.db.selectAllFrom("results")).length, 3);
    } finally {
      await reopened.stop();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
