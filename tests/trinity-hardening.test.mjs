/** [LAYER: UI] */
/** Hardening: cross-process lock, backpressure, ledger races, and kill escalation (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BufferedDb,
  MemoryBufferedStore,
  ProcessAgentEngine,
  RootLockedError,
  SwarmFormationLedger,
  acquireRootLock,
  createPortableBroccoli,
  tempDir
} from "./support/trinity.mjs";

describe("Suite 29: Hardening (Cross-Process Lock, Backpressure, Ledger Races, Kill Escalation)", () => {
  it("excludes a second holder, waits for release, and reclaims locks from dead processes", async () => {
    const root = tempDir("root-lock");
    try {
      const first = await acquireRootLock(root);
      await assert.rejects(acquireRootLock(root, { timeoutMs: 100, pollMs: 10 }), (error) => error instanceof RootLockedError && error.code === "ROOT_LOCKED" && error.holder.pid === process.pid);
      const waiter = acquireRootLock(root, { timeoutMs: 2000, pollMs: 10 });
      setTimeout(() => void first.release(), 50);
      const second = await waiter;
      assert.equal(await first.release(), false, "a stale handle cannot release someone else's lock");
      assert.equal(await second.release(), true);
      fs.writeFileSync(path.join(root, ".joy-lock"), JSON.stringify({ pid: 2147483646, host: os.hostname(), token: "dead", startedAt: 1 }));
      const reclaimed = await acquireRootLock(root, { timeoutMs: 500, pollMs: 10 });
      await reclaimed.release();
      fs.writeFileSync(path.join(root, ".joy-lock"), JSON.stringify({ pid: 2147483646, host: "some-other-host", token: "remote", startedAt: 1 }));
      await assert.rejects(acquireRootLock(root, { timeoutMs: 100, pollMs: 10, hostname: os.hostname() }), /some-other-host/, "locks from other hosts are never assumed dead");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("releases an exclusive broccoli lock on stop and refuses concurrent instances", async () => {
    const root = tempDir("exclusive");
    const a = createPortableBroccoli({ workspaceRoot: root, exclusive: true, lockTimeoutMs: 100 });
    const b = createPortableBroccoli({ workspaceRoot: root, exclusive: true, lockTimeoutMs: 100 });
    try {
      await a.start();
      await assert.rejects(b.start(), RootLockedError);
      await a.stop();
      await b.start();
    } finally {
      await b.stop().catch(() => undefined);
      await a.stop().catch(() => undefined);
      fs.rmSync(root, { recursive: true, force: true });
    }
    await assert.rejects(createPortableBroccoli({ exclusive: true }).start(), /requires a workspaceRoot/);
  });

  it("applies backpressure instead of buffering without bound when the store stops draining", async () => {
    class DeadStore extends MemoryBufferedStore {
      async transaction() { throw new Error("store offline"); }
    }
    const db = new BufferedDb({ store: new DeadStore(), maxBufferedOps: 5, hardLimitOps: 8, flushIntervalMs: 60_000, logger: { error() {} } });
    for (let i = 0; i < 8; i++) await db.push({ type: "insert", table: "t", values: { id: String(i) } });
    await assert.rejects(db.push({ type: "insert", table: "t", values: { id: "overflow" } }), (error) => error.code === "BUFFER_FULL");
    assert.equal(db.getMetrics().activeBufferSize, 8, "nothing already accepted was dropped");
  });

  it("serializes concurrent ledger callers so a specialist is never claimed twice", async () => {
    const db = new BufferedDb({ store: new MemoryBufferedStore() });
    const ledger = new SwarmFormationLedger({ db });
    await ledger.create({ objective: "o", assignments: [{ id: "a", role: "r", objective: "x" }, { id: "b", role: "r", objective: "y" }], id: "race" });
    const claims = await Promise.all(Array.from({ length: 10 }, () => ledger.next("race")));
    const handedOut = claims.flatMap((c) => c.ready.map((r) => r.id)).sort();
    assert.deepEqual(handedOut, ["a", "b"]);
    await assert.rejects(ledger.create({ objective: "o", assignments: [{ id: "a", role: "r", objective: "x" }], id: "../escape" }), /id must be/);
    await db.stop();
  });

  it("escalates to SIGKILL when a specialist ignores SIGTERM", async () => {
    const dir = tempDir("sigkill");
    try {
      const file = path.join(dir, "stubborn.mjs");
      fs.writeFileSync(file, 'process.on("SIGTERM", () => {});\nsetInterval(() => {}, 1000);\n');
      const started = Date.now();
      const outcome = await new ProcessAgentEngine({ command: [process.execPath, file], timeoutMs: 150, killGraceMs: 150 }).forkSession("k").tick({ prompt: "p" });
      assert.equal(outcome.outcome, "failed");
      assert.ok(Date.now() - started < 4000, "did not hang on a SIGTERM-immune child");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
