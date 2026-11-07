/** [LAYER: CORE] */
/**
 * Portable, zero-dependency write-behind buffer (`BufferedDb`) with per-agent
 * transaction shadows, read-your-writes materialization, coalesced layer-ordered
 * flushes, atomic increments, and drain-safe shutdown.
 *
 * Doctrine: writes are acknowledged into memory immediately and persisted in batches
 * through an `IBufferedStore`; reads overlay unflushed operations on the store's rows
 * so callers always observe their own writes. Persistence is delegated entirely to the
 * injected store contract (Hard Invariant: no raw I/O in CORE).
 *
 * Instance-based (no global singleton): construct as many independent buffers as needed,
 * each over its own store.
 */

import { AsyncMutex } from "../plumbing/AsyncMutex.mjs";
import { newUuid } from "../plumbing/ids.mjs";
import { sha256Hex } from "../plumbing/canonicalHash.mjs";
import {
  applyOperationToRows,
  applyValues,
  findUpsertIndex,
  increment,
  isIncrement,
  matches,
  normalizeWhere,
  sortOperationsForFlush
} from "../domain/bufferedDbOps.mjs";

/** Thrown by `stop()` while per-agent shadows still hold uncommitted work. */
export class ShadowCommitError extends Error {
  /** @param {string[]} agentIds */
  constructor(agentIds) {
    super(`Cannot stop the database pool while ${agentIds.length} uncommitted transaction shadow(s) remain: ${agentIds.join(", ")}`);
    this.name = "ShadowCommitError";
    this.agentIds = agentIds;
  }
}

const SILENT_LOGGER = Object.freeze({ error() {}, warn() {} });

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
}

export class BufferedDb {
  #store;
  #logger;
  #flushIntervalMs;
  #cleanupIntervalMs;
  #shadowIdleMs;
  #maxBufferedOps;
  #hardLimitOps;
  #maintenance;
  #activeOps = [];
  #inFlightOps = [];
  #agentShadows = new Map();
  #stateMutex = new AsyncMutex();
  #flushMutex = new AsyncMutex();
  #flushInterval = null;
  #flushTimeout = null;
  #cleanupInterval = null;
  #totalTransactions = 0;
  #started = false;
  #stopped = false;
  #stopping = false;
  #storeReady = false;
  #enqueueLatencies = [];
  #processingLatencies = [];

  /**
   * @param {{
   *   store: import("../domain/interfaces/IBufferedStore.mjs").IBufferedStore,
   *   logger?: { error: Function, warn?: Function },
   *   flushIntervalMs?: number,
   *   cleanupIntervalMs?: number,
   *   shadowIdleMs?: number,
   *   maxBufferedOps?: number,
   *   hardLimitOps?: number,
   *   maintenance?: { start: () => void, stop: () => void }
   * }} options
   */
  constructor(options) {
    if (!options || !options.store) throw new Error("BufferedDb requires an IBufferedStore `store` option");
    this.#store = options.store;
    this.#logger = options.logger ?? SILENT_LOGGER;
    this.#flushIntervalMs = options.flushIntervalMs ?? 1000;
    this.#cleanupIntervalMs = options.cleanupIntervalMs ?? 30_000;
    this.#shadowIdleMs = options.shadowIdleMs ?? 5 * 60 * 1000;
    this.#maxBufferedOps = options.maxBufferedOps ?? 10_000;
    this.#hardLimitOps = options.hardLimitOps ?? this.#maxBufferedOps * 10;
    this.#maintenance = options.maintenance ?? null;
  }

  /** Creates an atomic numeric delta marker usable as a column value. */
  static increment(value) {
    return increment(value);
  }

  #startFlushLoop() {
    if (this.#started) return;
    this.#started = true;
    this.#stopped = false;
    this.#flushInterval = setInterval(() => void this.flush().catch(() => undefined), this.#flushIntervalMs);
    this.#cleanupInterval = setInterval(() => void this.#cleanupShadows(), this.#cleanupIntervalMs);
    this.#flushInterval.unref?.();
    this.#cleanupInterval.unref?.();
    this.#maintenance?.start();
  }

  #ensureStarted() {
    if (this.#stopping) throw new Error("DB_POOL_STOPPING: database pool is draining and no new work can be accepted");
    if (!this.#started || this.#stopped) this.#startFlushLoop();
  }

  #scheduleFlush(delay = 5) {
    if (this.#stopped) return;
    if (this.#flushTimeout) clearTimeout(this.#flushTimeout);
    this.#flushTimeout = setTimeout(() => {
      this.#flushTimeout = null;
      void this.flush().catch(() => undefined);
    }, delay);
    this.#flushTimeout.unref?.();
  }

  async #cleanupShadows() {
    const release = await this.#stateMutex.acquire();
    try {
      const cutoff = Date.now() - this.#shadowIdleMs;
      // Age alone is not evidence that an owner abandoned its only copy of uncommitted work.
      for (const [agentId, shadow] of this.#agentShadows) {
        if (shadow.ops.length === 0 && shadow.lastUpdated < cutoff) this.#agentShadows.delete(agentId);
      }
    } finally {
      release();
    }
  }

  #detectMetadata(op) {
    op.hasIncrements = Object.values(op.values ?? {}).some((value) => isIncrement(value));
    if (op.type === "update" && op.where && !Array.isArray(op.where) && op.where.column === "id") {
      op.dedupKey = `${String(op.table)}:${op.where.value}`;
    }
  }

  async #ensureStore() {
    if (!this.#storeReady) {
      await this.#store.start();
      this.#storeReady = true;
    }
    return this.#store;
  }

  /** Opens an isolated shadow so an agent's writes stay private until `commitWork`. */
  async beginWork(agentId) {
    this.#ensureStarted();
    const release = await this.#stateMutex.acquire();
    try {
      if (!this.#agentShadows.has(agentId)) {
        this.#agentShadows.set(agentId, { ops: [], affectedFiles: new Set(), lastUpdated: Date.now(), checksum: "INIT" });
      }
    } finally {
      release();
    }
  }

  /** Buffers one write (into the agent's shadow when `agentId` is supplied). */
  async push(op, agentId, affectedFile) {
    await this.pushBatch([op], agentId, affectedFile);
  }

  /** Buffers many writes atomically with respect to other buffer mutations. */
  async pushBatch(ops, agentId, affectedFile) {
    this.#ensureStarted();
    const startedAt = performance.now();
    for (const op of ops) {
      if (agentId) op.agentId = agentId;
      this.#detectMetadata(op);
    }
    const release = await this.#stateMutex.acquire();
    try {
      // Backpressure: if the store keeps failing, refuse new work instead of growing without bound.
      if (this.#activeOps.length + this.#inFlightOps.length + ops.length > this.#hardLimitOps) {
        const error = new Error(`BUFFER_FULL: ${this.#activeOps.length + this.#inFlightOps.length} operations are waiting to be flushed (limit ${this.#hardLimitOps}); the store is not draining`);
        error.code = "BUFFER_FULL";
        throw error;
      }
      if (agentId) {
        const shadow = this.#agentShadows.get(agentId) ?? { ops: [], affectedFiles: new Set(), lastUpdated: Date.now(), checksum: "INIT" };
        for (const op of ops) shadow.ops.push({ ...op, agentId, values: op.values ? { ...op.values } : undefined });
        if (affectedFile) shadow.affectedFiles.add(affectedFile);
        shadow.lastUpdated = Date.now();
        shadow.checksum = sha256Hex(`${shadow.checksum}:${ops.length}:${ops[0]?.table ?? ""}`);
        this.#agentShadows.set(agentId, shadow);
      } else {
        this.#activeOps.push(...ops);
      }
    } finally {
      release();
    }
    this.#enqueueLatencies.push(performance.now() - startedAt);
    if (this.#enqueueLatencies.length > 5000) this.#enqueueLatencies.shift();
    this.#scheduleFlush(this.#activeOps.length >= this.#maxBufferedOps ? 0 : 5);
  }

  /** Publishes the agent's shadow into the shared buffer. */
  async commitWork(agentId, _validator) {
    this.#ensureStarted();
    const release = await this.#stateMutex.acquire();
    try {
      const shadow = this.#agentShadows.get(agentId);
      if (shadow) this.#activeOps.push(...shadow.ops);
      this.#agentShadows.delete(agentId);
    } finally {
      release();
    }
    this.#scheduleFlush(0);
  }

  /** Discards the agent's shadow without persisting anything. */
  async rollbackWork(agentId, _reason) {
    this.#ensureStarted();
    const release = await this.#stateMutex.acquire();
    try {
      this.#agentShadows.delete(agentId);
    } finally {
      release();
    }
  }

  /** Runs `callback` inside a private shadow, committing on success and rolling back on error. */
  async runTransaction(callback) {
    const agentId = `trx-${newUuid()}`;
    await this.beginWork(agentId);
    try {
      const result = await callback(agentId);
      await this.commitWork(agentId);
      return result;
    } catch (error) {
      await this.rollbackWork(agentId);
      throw error;
    }
  }

  /** Persists every buffered operation in one atomic, layer-ordered store transaction. */
  async flush() {
    if (this.#stopped && this.#activeOps.length === 0 && this.#inFlightOps.length === 0) return;
    const releaseFlush = await this.#flushMutex.acquire();
    const startedAt = performance.now();
    try {
      const releaseState = await this.#stateMutex.acquire();
      try {
        if (this.#inFlightOps.length === 0 && this.#activeOps.length > 0) {
          this.#inFlightOps = this.#activeOps;
          this.#activeOps = [];
        }
      } finally {
        releaseState();
      }
      if (this.#inFlightOps.length === 0) return;

      const store = await this.#ensureStore();
      const operations = sortOperationsForFlush(this.#inFlightOps);
      await store.transaction(async () => {
        for (const op of operations) this.#applyOperation(store, op);
      });
      this.#inFlightOps = [];
      this.#totalTransactions++;
      this.#processingLatencies.push(performance.now() - startedAt);
      if (this.#processingLatencies.length > 5000) this.#processingLatencies.shift();
    } catch (error) {
      const releaseState = await this.#stateMutex.acquire();
      try {
        this.#activeOps.unshift(...this.#inFlightOps);
        this.#inFlightOps = [];
      } finally {
        releaseState();
      }
      this.#logger.error("[BufferedDb] Flush failed; operations returned to the buffer:", error);
      throw error;
    } finally {
      releaseFlush();
    }
  }

  #applyOperation(store, op) {
    const table = String(op.table);
    const values = op.values ? { ...op.values } : undefined;
    const conditions = normalizeWhere(op.where);
    if (op.type === "insert" && values) {
      store.putRow(table, values);
      return;
    }
    if (op.type === "delete") {
      for (const row of store.rows(table)) if (matches(row, conditions)) store.deleteRow(table, row);
      return;
    }
    if (op.type === "update" && values) {
      for (const row of store.rows(table)) if (matches(row, conditions)) store.putRow(table, applyValues(row, values));
      return;
    }
    if (op.type === "upsert" && values) {
      const rows = store.rows(table);
      const index = findUpsertIndex(rows, op, values, conditions);
      store.putRow(table, applyValues(index >= 0 ? rows[index] : {}, values));
    }
  }

  #materialize(table, agentId) {
    if (!this.#storeReady) return [];
    let rows = this.#store.rows(String(table));
    const shadowOps = agentId ? this.#agentShadows.get(agentId)?.ops ?? [] : [];
    for (const op of [...this.#inFlightOps, ...this.#activeOps, ...shadowOps]) {
      if (op.table !== table) continue;
      rows = applyOperationToRows(rows, op);
    }
    return rows;
  }

  /**
   * Reads rows matching `where`, overlaying unflushed operations (and `agentId`'s shadow).
   * @param {string} table
   * @param {import("../domain/bufferedDbOps.mjs").WhereCondition | import("../domain/bufferedDbOps.mjs").WhereCondition[]} where
   * @param {string} [agentId]
   * @param {{ orderBy?: { column: string, direction: "asc" | "desc" }, limit?: number }} [options]
   * @returns {Promise<Array<Record<string, any>>>}
   */
  async selectWhere(table, where, agentId, options) {
    this.#ensureStarted();
    await this.#ensureStore();
    const release = await this.#stateMutex.acquire();
    try {
      const conditions = normalizeWhere(where);
      let rows = this.#materialize(table, agentId).filter((row) => matches(row, conditions));
      if (options?.orderBy) {
        const column = String(options.orderBy.column);
        const direction = options.orderBy.direction === "desc" ? -1 : 1;
        rows.sort((a, b) => (a[column] > b[column] ? direction : a[column] < b[column] ? -direction : 0));
      }
      if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
      return rows;
    } finally {
      release();
    }
  }

  /** Returns the most recent matching row, or `null`. */
  async selectOne(table, where, agentId) {
    const rows = await this.selectWhere(table, where, agentId);
    return rows.length > 0 ? rows[rows.length - 1] : null;
  }

  /** Returns every row in `table` (with unflushed writes overlaid). */
  async selectAllFrom(table, agentId) {
    return this.selectWhere(table, [], agentId);
  }

  /** Indexes `statusCol` (when supported) and counts up to 500 rows in `statusValue`. */
  async warmupTable(table, statusCol, statusValue) {
    this.#ensureStarted();
    const store = await this.#ensureStore();
    store.createIndex?.(String(table), statusCol);
    return (await this.selectWhere(table, { column: statusCol, value: statusValue }, undefined, { limit: 500 })).length;
  }

  /** Maps each file touched by an open shadow to its owning agent. */
  async getActiveAffectedFiles() {
    const release = await this.#stateMutex.acquire();
    try {
      const affected = new Map();
      for (const [agentId, shadow] of this.#agentShadows) for (const file of shadow.affectedFiles) affected.set(file, agentId);
      return affected;
    } finally {
      release();
    }
  }

  /** Buffer depth, shadow count, throughput, and p95/p99 latency snapshot. */
  getMetrics() {
    return {
      activeBufferSize: this.#activeOps.length,
      inFlightOpsSize: this.#inFlightOps.length,
      activeShadows: this.#agentShadows.size,
      totalTransactions: this.#totalTransactions,
      latencies: {
        enqueue: { p95: percentile(this.#enqueueLatencies, 95), p99: percentile(this.#enqueueLatencies, 99) },
        processing: { p95: percentile(this.#processingLatencies, 95), p99: percentile(this.#processingLatencies, 99) }
      }
    };
  }

  /**
   * Drains the buffer and stops the store. Rejects with `ShadowCommitError` while any
   * shadow is uncommitted so no private work is silently dropped.
   */
  async stop() {
    if (this.#stopped && !this.#started) return;
    if (this.#stopping) throw new Error("DB_POOL_STOPPING: another shutdown is already in progress");
    this.#stopping = true;
    const release = await this.#stateMutex.acquire();
    try {
      const pendingAgents = [...this.#agentShadows.keys()];
      if (pendingAgents.length > 0) throw new ShadowCommitError(pendingAgents);
    } catch (error) {
      this.#stopping = false;
      throw error;
    } finally {
      release();
    }
    try {
      await this.flush();
    } catch (error) {
      this.#stopping = false;
      throw error;
    }
    if (this.#flushInterval) clearInterval(this.#flushInterval);
    if (this.#cleanupInterval) clearInterval(this.#cleanupInterval);
    if (this.#flushTimeout) clearTimeout(this.#flushTimeout);
    this.#flushInterval = null;
    this.#cleanupInterval = null;
    this.#flushTimeout = null;
    // Synchronize with interval flushes that were already queued before the timers stopped.
    try {
      await this.flush();
    } catch (error) {
      this.#started = false;
      this.#stopping = false;
      this.#startFlushLoop();
      throw error;
    }
    this.#maintenance?.stop();
    try {
      await this.#store.stop();
      this.#storeReady = false;
      this.#started = false;
      this.#stopped = true;
    } catch (error) {
      this.#started = false;
      this.#stopped = false;
      this.#startFlushLoop();
      throw error;
    } finally {
      this.#stopping = false;
    }
  }
}

/** Alias for the former `BufferedDbPool` name. */
export { BufferedDb as BufferedDbPool };
