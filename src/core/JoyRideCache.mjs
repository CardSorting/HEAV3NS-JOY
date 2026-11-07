/** [LAYER: CORE] */
/**
 * JoyRide Bounded Execution Cache Engine.
 * Agnostic, zero-dependency implementation of the 5-tier JoyRide cache protocol
 * (`workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md` & LUMI `JoyRide/spec.md`).
 *
 * Enforces scoped `joyride:<kind>:<id>` keys, typed deterministic key builders,
 * 11-point fingerprint validation, stale marking (`markStale`), single-flight
 * deduplication (`getOrCompute`), scratch artifact lifecycle cleanup (`cleanupHandler`),
 * circular-reference-safe secret/token rejection, and priority-ranked eviction.
 */

import {
  computeDeterministicFingerprint,
  stableStringify,
  utf8ByteLength
} from "../plumbing/canonicalHash.mjs";

export const JOYRIDE_KINDS = Object.freeze({
  hotExecution: {
    defaultTtlMs: 30 * 1000,
    maxItemBytes: 16 * 1024,
    maxKindBytes: 256 * 1024,
    evictionPriority: 1
  },
  scratchArtifact: {
    defaultTtlMs: 5 * 60 * 1000,
    maxItemBytes: 128 * 1024,
    maxKindBytes: 1024 * 1024,
    evictionPriority: 2
  },
  taskLocal: {
    defaultTtlMs: 10 * 60 * 1000,
    maxItemBytes: 64 * 1024,
    maxKindBytes: 1024 * 1024,
    evictionPriority: 3
  },
  verification: {
    defaultTtlMs: 15 * 60 * 1000,
    maxItemBytes: 128 * 1024,
    maxKindBytes: 1024 * 1024,
    evictionPriority: 4
  },
  workspaceIndex: {
    defaultTtlMs: 60 * 60 * 1000,
    maxItemBytes: 512 * 1024,
    maxKindBytes: 3 * 1024 * 1024,
    evictionPriority: 5
  }
});

const SECRET_VALUE_REGEX =
  /(?:sk-ant-[A-Za-z0-9_-]{12,}|sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|Bearer\s+[A-Za-z0-9._~+/=-]{16,}|-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+)?PRIVATE\s+KEY-----)/;
const SECRET_KEY_REGEX =
  /^(?:api[_-]?key|secret|password|access[_-]?token|refresh[_-]?token|private[_-]?key|client[_-]?secret|npm[_-]?token|ssh[_-]?key)$/i;

/**
 * Computes a deterministic 24-char fingerprint for any JoyRide cache input object.
 * @param {any} input
 * @returns {string}
 */
export function createJoyRideFingerprint(input) {
  return computeDeterministicFingerprint(input, 24);
}

/**
 * Builds a deterministic, canonical `joyride:<kind>:<namespace>:<fingerprint>` cache key.
 * @param {"hotExecution"|"taskLocal"|"workspaceIndex"|"verification"|"scratchArtifact"} kind
 * @param {string} namespace
 * @param {any} payload
 * @returns {string}
 */
export function createJoyRideKey(kind, namespace, payload) {
  const ns = String(namespace || "default").replace(/[^A-Za-z0-9_.-]/g, "_");
  const fp = createJoyRideFingerprint(payload);
  return JoyRideCache.formatKey(kind, `${ns}:${fp}`);
}

export function createCommandResultCacheKey({ command, cwd = ".", envFingerprint = "" }) {
  return createJoyRideKey("hotExecution", "cmd", { command, cwd, envFingerprint });
}

export function createGrepResultCacheKey({ pattern, rootDir = ".", include = "*", caseSensitive = true }) {
  return createJoyRideKey("taskLocal", "grep", { pattern, rootDir, include, caseSensitive });
}

export function createFileMetadataCacheKey({ filePath, workspaceId = "default" }) {
  return createJoyRideKey("workspaceIndex", "file-meta", { filePath, workspaceId });
}

export function createVerificationCacheKey({ suite, target, dependencyFingerprint = "", gitHead = "" }) {
  return createJoyRideKey("verification", "verify", { suite, target, dependencyFingerprint, gitHead });
}

export function createDiffCacheKey({ baseRef, headRef, paths = [] }) {
  return createJoyRideKey("taskLocal", "diff", { baseRef, headRef, paths });
}

export function createScratchArtifactCacheKey({ taskId, label }) {
  return createJoyRideKey("scratchArtifact", "scratch", { taskId, label });
}

export class JoyRideCache {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxTotalBytes]
   * @param {number} [options.maxTaskBytes]
   * @param {number} [options.maxArtifactCount]
   * @param {number} [options.maxArtifactBytes]
   * @param {() => number} [options.clock]
   */
  constructor(options = {}) {
    this.maxTotalBytes = options.maxTotalBytes ?? 6 * 1024 * 1024;
    this.maxTaskBytes = options.maxTaskBytes ?? 512 * 1024;
    this.maxArtifactCount = options.maxArtifactCount ?? 128;
    this.maxArtifactBytes = options.maxArtifactBytes ?? JOYRIDE_KINDS.scratchArtifact.maxKindBytes;
    this.casStorage = options.casStorage || null;
    this.clock = typeof options.clock === "function" ? options.clock : () => Date.now();
    /** @type {Map<string, Object>} */
    this.entries = new Map();
    /** @type {Map<string, Object>} */
    this.l2Index = new Map();
    /** @type {Map<string, Promise<any>>} */
    this.inFlight = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      rejectedSecrets: 0,
      rejectedOversize: 0,
      evictions: 0,
      invalidations: 0,
      staleReusePreventionCount: 0,
      verificationCacheReuseCount: 0,
      duplicateArtifactDeduplicationCount: 0,
      singleFlightHits: 0,
      l2Hydrations: 0
    };
  }

  /**
   * Builds a canonical `joyride:<kind>:<id>` cache key.
   * @param {"hotExecution"|"taskLocal"|"workspaceIndex"|"verification"|"scratchArtifact"} kind
   * @param {string} id
   * @returns {string}
   */
  static formatKey(kind, id) {
    if (!JOYRIDE_KINDS[kind]) {
      throw new Error(`Invalid JoyRide cache kind '${kind}'.`);
    }
    const cleanId = String(id || "").trim();
    if (!cleanId) {
      throw new Error("JoyRide cache key id must be non-empty.");
    }
    return `joyride:${kind}:${cleanId}`;
  }

  /**
   * Stores a value in the bounded cache after running admission, secret, and budget checks.
   * @param {string} key - Canonical `joyride:<kind>:<id>` key
   * @param {any} value - Serializable payload
   * @param {Object} [meta]
   * @returns {{ stored: boolean, deduplicated?: boolean, reason?: string, byteSize?: number }}
   */
  set(key, value, meta = {}) {
    const parsed = this.#parseKey(key);
    if (!parsed) {
      return { stored: false, reason: "INVALID_KEY_PREFIX" };
    }
    if (this.#containsSecrets(value, new WeakSet())) {
      this.stats.rejectedSecrets += 1;
      return { stored: false, reason: "SECRET_DETECTED" };
    }

    const serialized = stableStringify(value) ?? "";
    const byteSize = utf8ByteLength(serialized);
    const policy = JOYRIDE_KINDS[parsed.kind];

    if (byteSize > policy.maxItemBytes) {
      this.stats.rejectedOversize += 1;
      return { stored: false, reason: "ITEM_EXCEEDS_KIND_LIMIT", byteSize };
    }

    if (meta.taskId && this.#computeTaskBytes(meta.taskId, key) + byteSize > this.maxTaskBytes) {
      this.stats.rejectedOversize += 1;
      return { stored: false, reason: "TASK_BUDGET_EXCEEDED", byteSize };
    }

    if (parsed.kind === "scratchArtifact") {
      const scratchCount = this.#countKindEntries("scratchArtifact", key);
      if (scratchCount + 1 > this.maxArtifactCount) {
        this.stats.rejectedOversize += 1;
        return { stored: false, reason: "ARTIFACT_COUNT_EXCEEDED", byteSize };
      }
    }

    const now = this.clock();
    const ttlMs = meta.ttlMs ?? policy.defaultTtlMs;
    const fingerprint = meta.fingerprint || computeDeterministicFingerprint(serialized, 24);

    const existing = this.entries.get(key);
    if (existing && !existing.stale && now <= existing.expiresAt && existing.fingerprint === fingerprint) {
      existing.lastAccessedAt = now;
      existing.expiresAt = now + ttlMs;
      this.stats.duplicateArtifactDeduplicationCount += 1;
      return { stored: true, deduplicated: true, byteSize };
    }

    if (existing) {
      this.#deleteEntry(key, "overwrite");
    }

    let casHash = null;
    if (this.casStorage && (parsed.kind === "workspaceIndex" || parsed.kind === "verification")) {
      casHash = this.casStorage.writeBlob(serialized);
    }

    const record = {
      key,
      kind: parsed.kind,
      value: structuredClone(value),
      byteSize,
      fingerprint,
      casHash,
      createdAt: now,
      lastAccessedAt: now,
      expiresAt: now + ttlMs,
      hitCount: 0,
      stale: false,
      staleReason: null,
      invalidationReasons: [],
      taskId: meta.taskId || null,
      workspaceId: meta.workspaceId || null,
      workspaceFingerprint: meta.workspaceFingerprint || null,
      approvalBoundaryId: meta.approvalBoundaryId || null,
      generation: meta.generation ?? null,
      dependencyFingerprint: meta.dependencyFingerprint || null,
      lockfileFingerprint: meta.lockfileFingerprint || null,
      gitHead: meta.gitHead || null,
      environmentFingerprint: meta.environmentFingerprint || null,
      runtimeVersion: meta.runtimeVersion || null,
      toolVersion: meta.toolVersion || null,
      relevantFileHashes: meta.relevantFileHashes ? { ...meta.relevantFileHashes } : null,
      cleanupHandler: typeof meta.cleanupHandler === "function" ? meta.cleanupHandler : null
    };

    this.entries.set(key, record);
    if (casHash) {
      const { value: _omitted, ...l2Meta } = record;
      this.l2Index.set(key, l2Meta);
    }

    const kindCap =
      parsed.kind === "scratchArtifact"
        ? Math.min(policy.maxKindBytes, this.maxArtifactBytes)
        : policy.maxKindBytes;
    this.#enforceKindBudget(parsed.kind, kindCap);
    this.trimToBudget(this.maxTotalBytes);

    return { stored: true, deduplicated: false, byteSize };
  }

  /**
   * Validates an entry against the 11-point JoyRide fingerprint context without mutating hit counts.
   * @param {string} key
   * @param {Object} [context]
   * @returns {{ valid: boolean, status: "valid"|"stale"|"expired"|"missing", reason?: string }}
   */
  validate(key, context = {}) {
    const entry = this.entries.get(key);
    if (!entry) {
      return { valid: false, status: "missing", reason: "KEY_NOT_FOUND" };
    }

    const now = this.clock();
    if (now > entry.expiresAt) {
      return { valid: false, status: "expired", reason: "TTL_EXPIRED" };
    }

    if (entry.stale) {
      return { valid: false, status: "stale", reason: entry.staleReason || "MARKED_STALE" };
    }

    const scalarChecks = [
      ["workspaceFingerprint", "WORKSPACE_FINGERPRINT_MISMATCH"],
      ["approvalBoundaryId", "APPROVAL_BOUNDARY_CHANGED"],
      ["generation", "GENERATION_MISMATCH"],
      ["dependencyFingerprint", "DEPENDENCY_FINGERPRINT_MISMATCH"],
      ["lockfileFingerprint", "LOCKFILE_FINGERPRINT_MISMATCH"],
      ["gitHead", "GIT_HEAD_MISMATCH"],
      ["environmentFingerprint", "ENVIRONMENT_FINGERPRINT_MISMATCH"],
      ["runtimeVersion", "RUNTIME_VERSION_MISMATCH"],
      ["toolVersion", "TOOL_VERSION_MISMATCH"]
    ];

    for (const [field, code] of scalarChecks) {
      if (
        context[field] !== undefined &&
        entry[field] !== null &&
        entry[field] !== undefined &&
        context[field] !== entry[field]
      ) {
        return { valid: false, status: "stale", reason: code };
      }
    }

    const fileMap = context.currentFileHashes || context.relevantFileHashes;
    if (fileMap && entry.relevantFileHashes) {
      for (const [filePath, expectedHash] of Object.entries(entry.relevantFileHashes)) {
        if (fileMap[filePath] !== undefined && fileMap[filePath] !== expectedHash) {
          return { valid: false, status: "stale", reason: `FILE_HASH_DRIFT:${filePath}` };
        }
      }
    }

    return { valid: true, status: "valid" };
  }

  /**
   * Retrieves a cached entry if it is present, unexpired, and matches validation context.
   * @param {string} key
   * @param {Object} [context]
   * @returns {any|null}
   */
  get(key, context = {}) {
    let entry = this.entries.get(key);
    if (!entry && this.casStorage && this.l2Index.has(key)) {
      const l2Meta = this.l2Index.get(key);
      if (this.clock() <= l2Meta.expiresAt && !l2Meta.stale) {
        const raw = this.casStorage.readBlob(l2Meta.casHash);
        if (raw !== null) {
          entry = { ...l2Meta, value: JSON.parse(raw) };
          this.entries.set(key, entry);
          this.stats.l2Hydrations += 1;
        }
      }
    }
    if (!entry) {
      this.stats.misses += 1;
      return null;
    }

    const check = this.validate(key, context);
    if (!check.valid) {
      this.stats.misses += 1;
      this.stats.invalidations += 1;
      if (check.status === "stale") {
        this.stats.staleReusePreventionCount += 1;
      }
      this.#deleteEntry(key, check.reason || "invalidated");
      return null;
    }

    const now = this.clock();
    entry.lastAccessedAt = now;
    entry.hitCount += 1;
    if (entry.kind === "verification") {
      this.stats.verificationCacheReuseCount += 1;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);

    this.stats.hits += 1;
    return structuredClone(entry.value);
  }

  /**
   * Single-flight deduplicating execution wrapper: coalesces concurrent identical requests
   * and caches the resolved value under `key`.
   *
   * @param {string} key
   * @param {() => Promise<any>} computeFn
   * @param {Object} [meta]
   * @param {Object} [context]
   * @returns {Promise<any>}
   */
  async getOrCompute(key, computeFn, meta = {}, context = {}) {
    const cached = this.get(key, context);
    if (cached !== null) {
      return cached;
    }

    if (this.inFlight.has(key)) {
      this.stats.singleFlightHits += 1;
      const shared = await this.inFlight.get(key);
      return structuredClone(shared);
    }

    const promise = Promise.resolve()
      .then(() => computeFn())
      .then((result) => {
        if (result !== undefined && result !== null) {
          this.set(key, result, meta);
        }
        return result;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);
    const resolved = await promise;
    return structuredClone(resolved);
  }

  /**
   * Marks an entry stale without deleting its diagnostic record until read or trimmed.
   * @param {string} key
   * @param {string} [reason="MANUAL_STALE"]
   * @returns {boolean}
   */
  markStale(key, reason = "MANUAL_STALE") {
    const entry = this.entries.get(key);
    if (!entry) return false;
    entry.stale = true;
    entry.staleReason = reason;
    entry.invalidationReasons.push(reason);
    return true;
  }

  /**
   * Checks whether `key` is currently valid in the cache without incrementing hit statistics.
   * @param {string} key
   * @param {Object} [context]
   * @returns {boolean}
   */
  has(key, context = {}) {
    return this.validate(key, context).valid;
  }

  /**
   * Refreshes `lastAccessedAt` on a valid entry without incrementing hit statistics.
   * @param {string} key
   * @returns {boolean}
   */
  touch(key) {
    const entry = this.entries.get(key);
    if (!entry || entry.stale || this.clock() > entry.expiresAt) return false;
    entry.lastAccessedAt = this.clock();
    this.entries.delete(key);
    this.entries.set(key, entry);
    return true;
  }

  /**
   * Explicitly disposes a single key and invokes its `cleanupHandler` if registered.
   * @param {string} key
   * @returns {boolean}
   */
  dispose(key) {
    return this.#deleteEntry(key, "disposed");
  }

  /**
   * Invalidates entries matching a file path, task ID, workspace ID, key prefix, or kind.
   * @param {{ filePath?: string, taskId?: string, workspaceId?: string, prefix?: string, kind?: string }} filter
   * @returns {number} Number of invalidated entries
   */
  invalidate(filter = {}) {
    let removed = 0;
    for (const [key, entry] of [...this.entries.entries()]) {
      const matchPrefix = filter.prefix && key.startsWith(filter.prefix);
      const matchKind = filter.kind && entry.kind === filter.kind;
      const matchTask = filter.taskId && entry.taskId === filter.taskId;
      const matchWorkspace = filter.workspaceId && entry.workspaceId === filter.workspaceId;
      const matchFile =
        filter.filePath &&
        entry.relevantFileHashes &&
        Object.prototype.hasOwnProperty.call(entry.relevantFileHashes, filter.filePath);

      if (matchPrefix || matchKind || matchTask || matchWorkspace || matchFile) {
        this.#deleteEntry(key, "invalidated");
        removed += 1;
      }
    }
    this.stats.invalidations += removed;
    return removed;
  }

  /**
   * Flushes all task-local and scratch entries associated with a completed task.
   * @param {string} taskId
   * @returns {number}
   */
  flushTask(taskId) {
    if (!taskId) return 0;
    return this.invalidate({ taskId });
  }

  /**
   * Flushes all entries scoped to a workspace ID.
   * @param {string} workspaceId
   * @returns {number}
   */
  flushWorkspace(workspaceId) {
    if (!workspaceId) return 0;
    return this.invalidate({ workspaceId });
  }

  /**
   * Evicts expired and stale entries first, then priority-ranked entries until total bytes <= targetBytes.
   * @param {number} [targetBytes]
   * @returns {number} Number of evicted entries
   */
  trimToBudget(targetBytes = this.maxTotalBytes) {
    const now = this.clock();
    let evicted = 0;

    for (const [key, entry] of [...this.entries.entries()]) {
      if (now > entry.expiresAt || entry.stale) {
        if (entry.stale) {
          this.stats.staleReusePreventionCount += 1;
        }
        this.#deleteEntry(key, "expired_or_stale");
        evicted += 1;
      }
    }

    while (this.getTotalBytes() > targetBytes && this.entries.size > 0) {
      const candidateKey = this.#selectEvictionVictim();
      if (!candidateKey) break;
      this.#deleteEntry(candidateKey, "budget_trim");
      evicted += 1;
    }

    this.stats.evictions += evicted;
    return evicted;
  }

  /**
   * Emergency memory pressure valve: immediately drops volatile tiers (`scratchArtifact`,
   * `hotExecution`, `taskLocal`) and trims remaining cache to 50% budget.
   * @returns {number}
   */
  emergencyTrim() {
    let dropped = 0;
    for (const [key, entry] of [...this.entries.entries()]) {
      if (
        entry.kind === "scratchArtifact" ||
        entry.kind === "hotExecution" ||
        entry.kind === "taskLocal"
      ) {
        this.#deleteEntry(key, "emergency_trim");
        dropped += 1;
      }
    }
    this.stats.evictions += dropped;
    dropped += this.trimToBudget(Math.floor(this.maxTotalBytes / 2));
    return dropped;
  }

  /**
   * Computes the current 4-tier JoyRide memory pressure level (`normal` | `elevated` | `high` | `critical`).
   * @returns {"normal"|"elevated"|"high"|"critical"}
   */
  getMemoryPressureLevel() {
    const ratio = this.maxTotalBytes > 0 ? this.getTotalBytes() / this.maxTotalBytes : 0;
    if (ratio >= 0.9) return "critical";
    if (ratio >= 0.75) return "high";
    if (ratio >= 0.6) return "elevated";
    return "normal";
  }

  /**
   * Responds to a 4-tier memory pressure level (`normal`, `elevated`, `high`, `critical`).
   * @param {"normal"|"elevated"|"high"|"critical"} [level]
   * @returns {{ level: string, evicted: number, remainingBytes: number }}
   */
  handleMemoryPressure(level = this.getMemoryPressureLevel()) {
    let evicted = 0;
    if (level === "critical") {
      evicted = this.emergencyTrim();
    } else if (level === "high") {
      for (const [key, entry] of [...this.entries.entries()]) {
        if (entry.kind === "hotExecution" || entry.kind === "scratchArtifact") {
          this.#deleteEntry(key, "high_pressure");
          evicted += 1;
        }
      }
      this.stats.evictions += evicted;
      evicted += this.trimToBudget(Math.floor(this.maxTotalBytes * 0.7));
    } else if (level === "elevated") {
      for (const [key, entry] of [...this.entries.entries()]) {
        if (entry.kind === "hotExecution") {
          this.#deleteEntry(key, "elevated_pressure");
          evicted += 1;
        }
      }
      this.stats.evictions += evicted;
      evicted += this.trimToBudget(this.maxTotalBytes);
    } else {
      evicted = this.trimToBudget(this.maxTotalBytes);
    }
    return {
      level,
      evicted,
      remainingBytes: this.getTotalBytes()
    };
  }

  /**
   * Returns diagnostic inspection metadata for a cache key without mutating hit counts.
   * @param {string} key
   * @returns {Object|null}
   */
  explain(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    const now = this.clock();
    const isExpired = now > entry.expiresAt;
    const validity = isExpired ? "expired" : entry.stale ? "stale" : "valid";
    return {
      key: entry.key,
      kind: entry.kind,
      validity,
      stale: entry.stale,
      staleReason: entry.staleReason,
      invalidationReasons: [...entry.invalidationReasons],
      fingerprint: entry.fingerprint,
      byteSize: entry.byteSize,
      hitCount: entry.hitCount,
      ageMs: Math.max(0, now - entry.createdAt),
      remainingTtlMs: Math.max(0, entry.expiresAt - now),
      isExpired,
      taskId: entry.taskId,
      workspaceId: entry.workspaceId,
      workspaceFingerprint: entry.workspaceFingerprint,
      gitHead: entry.gitHead
    };
  }

  /**
   * @returns {number}
   */
  getTotalBytes() {
    let sum = 0;
    for (const entry of this.entries.values()) {
      sum += entry.byteSize;
    }
    return sum;
  }

  /**
   * Returns summary telemetry for the cache instance, including `largestEntries` and `hottestKeys`.
   */
  getStats() {
    const byKind = {};
    for (const kind of Object.keys(JOYRIDE_KINDS)) {
      byKind[kind] = { entries: 0, bytes: 0 };
    }
    const allEntries = [...this.entries.values()];
    for (const entry of allEntries) {
      if (byKind[entry.kind]) {
        byKind[entry.kind].entries += 1;
        byKind[entry.kind].bytes += entry.byteSize;
      }
    }
    const largestEntries = [...allEntries]
      .sort((a, b) => b.byteSize - a.byteSize)
      .slice(0, 5)
      .map((e) => ({ key: e.key, kind: e.kind, byteSize: e.byteSize }));
    const hottestKeys = [...allEntries]
      .sort((a, b) => b.hitCount - a.hitCount)
      .slice(0, 5)
      .map((e) => ({ key: e.key, kind: e.kind, hitCount: e.hitCount }));

    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      totalEntries: this.entries.size,
      totalBytes: this.getTotalBytes(),
      maxTotalBytes: this.maxTotalBytes,
      hitRate: totalRequests === 0 ? 0 : Number((this.stats.hits / totalRequests).toFixed(4)),
      ...this.stats,
      byKind,
      largestEntries,
      hottestKeys
    };
  }

  #parseKey(key) {
    if (typeof key !== "string" || !key.startsWith("joyride:")) return null;
    const parts = key.split(":");
    if (parts.length < 3) return null;
    const kind = parts[1];
    const id = parts.slice(2).join(":");
    if (!JOYRIDE_KINDS[kind] || !id) return null;
    return { kind, id };
  }

  #containsSecrets(val, seen, depth = 0) {
    if (depth > 8 || val === null || val === undefined) return false;
    if (typeof val === "string") {
      return SECRET_VALUE_REGEX.test(val);
    }
    if (typeof val !== "object") return false;
    if (seen.has(val)) return false;
    seen.add(val);

    if (Array.isArray(val)) {
      return val.some((item) => this.#containsSecrets(item, seen, depth + 1));
    }
    for (const [k, v] of Object.entries(val)) {
      if (SECRET_KEY_REGEX.test(k) && typeof v === "string" && v.length > 0) {
        return true;
      }
      if (this.#containsSecrets(v, seen, depth + 1)) {
        return true;
      }
    }
    return false;
  }

  #computeTaskBytes(taskId, excludeKey) {
    let bytes = 0;
    for (const [k, entry] of this.entries.entries()) {
      if (k !== excludeKey && entry.taskId === taskId) {
        bytes += entry.byteSize;
      }
    }
    return bytes;
  }

  #countKindEntries(kind, excludeKey) {
    let count = 0;
    for (const [k, entry] of this.entries.entries()) {
      if (k !== excludeKey && entry.kind === kind) count += 1;
    }
    return count;
  }

  #deleteEntry(key, reason) {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.entries.delete(key);
    const keepL2 =
      reason === "budget_trim" ||
      reason === "emergency_trim" ||
      reason === "high_pressure" ||
      reason === "elevated_pressure" ||
      reason === "kind_budget_trim";
    if (!keepL2) {
      this.l2Index.delete(key);
    }
    if (typeof entry.cleanupHandler === "function") {
      try {
        entry.cleanupHandler({ key, kind: entry.kind, reason });
      } catch {
        // Swallow cleanup handler errors so cache invariants never break
      }
    }
    return true;
  }

  #selectEvictionVictim() {
    const candidates = [...this.entries.values()];
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? -1 : 1;
      const prioA = JOYRIDE_KINDS[a.kind]?.evictionPriority ?? 1;
      const prioB = JOYRIDE_KINDS[b.kind]?.evictionPriority ?? 1;
      if (prioA !== prioB) return prioA - prioB;
      if (a.hitCount !== b.hitCount) return a.hitCount - b.hitCount;
      if (a.lastAccessedAt !== b.lastAccessedAt) return a.lastAccessedAt - b.lastAccessedAt;
      return b.byteSize - a.byteSize;
    });
    return candidates[0].key;
  }

  #enforceKindBudget(kind, maxKindBytes) {
    let kindBytes = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind === kind) kindBytes += entry.byteSize;
    }
    if (kindBytes <= maxKindBytes) return;

    for (const [key, entry] of [...this.entries.entries()]) {
      if (kindBytes <= maxKindBytes) break;
      if (entry.kind === kind) {
        kindBytes -= entry.byteSize;
        this.#deleteEntry(key, "kind_budget_trim");
        this.stats.evictions += 1;
      }
    }
  }
}
