/** [LAYER: INFRASTRUCTURE] */
/**
 * Concrete Zero-Dependency Content-Addressable Storage (CAS), Corruption Quarantine,
 * Context Scaling (`CAS:<sha256>`), Durable Snapshot Persistence, and RFC 1952
 * Multi-Member GZIP Wire Engine (`BroccoliWireEngine`) implementing `ICasStorage`.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { ICasStorage, GuidedError } from "../domain/interfaces/ICasStorage.mjs";
import { sha256Hex, stableStringify } from "../plumbing/canonicalHash.mjs";

const DEFAULT_WIRE_CHUNK_BYTES = 64 * 1024;

export class NodeCasStorage extends ICasStorage {
  /**
   * @param {string} rootDir - Workspace root directory (stores data under `<rootDir>/.broccolidb/storage`)
   */
  constructor(rootDir) {
    super();
    this.rootDir = path.resolve(rootDir || ".");
    this.baseDir = path.join(this.rootDir, ".broccolidb", "storage");
    this.blobsDir = path.join(this.baseDir, "blobs");
    this.corruptDir = path.join(this.baseDir, "corrupt");
    this.snapshotsDir = path.join(this.baseDir, "snapshots");
    this.wireDir = path.join(this.baseDir, "wire");
    /** @type {Map<string, Buffer>} */
    this.gzipChunkCache = new Map();
    this.corruptCount = 0;
    this.writeSeq = 0;
  }

  /**
   * Ensures `.broccolidb/storage/{blobs,corrupt,snapshots,wire}` directories exist.
   */
  #ensureDirs() {
    fs.mkdirSync(this.blobsDir, { recursive: true });
    fs.mkdirSync(this.corruptDir, { recursive: true });
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
    fs.mkdirSync(this.wireDir, { recursive: true });
  }

  /**
   * Performs a crash-safe POSIX atomic write via a process-scoped temporary sibling file + rename.
   * @param {string} targetPath
   * @param {string | Buffer | Uint8Array} data
   * @param {BufferEncoding} [encoding]
   */
  #atomicWriteSync(targetPath, data, encoding) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    this.writeSeq += 1;
    const tmpPath = `${targetPath}.${process.pid}.${this.writeSeq}.tmp`;
    if (encoding) {
      fs.writeFileSync(tmpPath, data, encoding);
    } else {
      fs.writeFileSync(tmpPath, data);
    }
    fs.renameSync(tmpPath, targetPath);
  }

  /**
   * Validates that `rawHash` is a canonical 64-character lowercase hex SHA-256 digest,
   * preventing path traversal (`../`) or malformed CAS lookups.
   * @param {string} rawHash
   * @returns {string}
   */
  #validateHash(rawHash) {
    const clean = String(rawHash || "")
      .replace(/^CAS:/i, "")
      .trim()
      .toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Invalid CAS SHA-256 address '${String(rawHash).slice(0, 32)}'`,
        likelyCause: "Provided CAS hash is not a 64-character hexadecimal SHA-256 digest.",
        suggestedFix: "Pass a valid SHA-256 digest returned by writeBlob() or scaleContent()."
      });
    }
    return clean;
  }

  /**
   * Resolves a snapshot ID to a path strictly inside `this.snapshotsDir`.
   * @param {string} snapshotId
   * @returns {string}
   */
  #resolveSnapshotPath(snapshotId) {
    const cleanId = String(snapshotId || "").trim();
    if (!cleanId || !/^[A-Za-z0-9_.-]+$/.test(cleanId) || cleanId.includes("..")) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Invalid or unsafe snapshotId '${cleanId.slice(0, 32)}'`,
        likelyCause: "Snapshot ID contains path traversal characters or invalid symbols.",
        suggestedFix: "Use alphanumeric snapshot IDs (e.g., 'snap-sess-1-1700000000')."
      });
    }
    const candidate = path.resolve(this.snapshotsDir, `${cleanId}.json`);
    if (!candidate.startsWith(this.snapshotsDir + path.sep)) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Snapshot path traversal blocked for '${cleanId}'`,
        likelyCause: "Resolved path escaped .broccolidb/storage/snapshots.",
        suggestedFix: "Provide a valid snapshotId within the workspace storage root."
      });
    }
    return candidate;
  }

  /**
   * Computes the physical path for a sharded CAS blob (`blobs/<h0h1>/<sha256>`).
   * @param {string} hash
   * @returns {string}
   */
  #blobPath(hash) {
    const clean = this.#validateHash(hash);
    const shard = clean.slice(0, 2);
    return path.join(this.blobsDir, shard, clean);
  }

  /**
   * Writes content to the sharded CAS directory under its SHA-256 hex digest.
   * Deduplicates automatically if the verified blob already exists on disk.
   *
   * @param {string | Uint8Array} content
   * @returns {string} 64-char SHA-256 hex digest
   */
  writeBlob(content) {
    this.#ensureDirs();
    const text =
      typeof content === "string"
        ? content
        : Buffer.from(content).toString("utf8");
    const hash = sha256Hex(text);
    const targetPath = this.#blobPath(hash);

    if (fs.existsSync(targetPath)) {
      const existing = fs.readFileSync(targetPath, "utf8");
      if (sha256Hex(existing) === hash) {
        return hash;
      }
    }

    this.#atomicWriteSync(targetPath, text, "utf8");
    return hash;
  }

  /**
   * Reads a CAS blob by SHA-256 hash and verifies cryptographic integrity.
   * If the physical file's SHA-256 does not match `hash`, moves the corrupted file to
   * `.broccolidb/storage/corrupt/<hash>.<timestamp>.corrupt`, appends a forensic record to
   * `manifest.jsonl`, and throws a `GuidedError` (`STORAGE_CORRUPT`).
   *
   * @param {string} hash
   * @returns {string | null}
   */
  readBlob(hash) {
    if (!hash) return null;
    const cleanHash = this.#validateHash(hash);

    const targetPath = this.#blobPath(cleanHash);
    if (!fs.existsSync(targetPath)) {
      return null;
    }

    const content = fs.readFileSync(targetPath, "utf8");
    const actualHash = sha256Hex(content);

    if (actualHash !== cleanHash) {
      this.#quarantineCorruptBlob(cleanHash, actualHash, targetPath);
      throw new GuidedError({
        code: "STORAGE_CORRUPT",
        message: `CAS integrity mismatch for blob ${cleanHash.slice(0, 12)} (actual ${actualHash.slice(0, 12)})`,
        likelyCause: "Physical blob in .broccolidb/storage/blobs was modified or truncated on disk.",
        suggestedFix:
          "Corrupted blob was quarantined to .broccolidb/storage/corrupt/. Re-materialize the payload from source.",
        docsPath: "spec/05-PORTABLE-SUBSTRATE-TRINITY.md#broccolidb-cas"
      });
    }

    return content;
  }

  /**
   * Quarantines a corrupted blob and records a forensic JSONL entry in `manifest.jsonl`.
   * @param {string} expectedHash
   * @param {string} actualHash
   * @param {string} targetPath
   */
  #quarantineCorruptBlob(expectedHash, actualHash, targetPath) {
    this.#ensureDirs();
    this.corruptCount += 1;
    const timestamp = Date.now();
    const corruptFileName = `${expectedHash}.${timestamp}.corrupt`;
    const corruptDest = path.join(this.corruptDir, corruptFileName);

    try {
      fs.renameSync(targetPath, corruptDest);
    } catch {
      fs.copyFileSync(targetPath, corruptDest);
      fs.unlinkSync(targetPath);
    }

    const manifestPath = path.join(this.corruptDir, "manifest.jsonl");
    const entry = {
      timestamp,
      expectedHash,
      actualHash,
      quarantinedFile: corruptFileName,
      reason: "sha256_mismatch"
    };
    fs.appendFileSync(manifestPath, `${JSON.stringify(entry)}\n`, "utf8");
  }

  /**
   * Checks whether a CAS blob exists on disk.
   * @param {string} hash
   * @returns {boolean}
   */
  exists(hash) {
    const clean = String(hash || "").replace(/^CAS:/i, "").trim().toLowerCase();
    return Boolean(clean && fs.existsSync(this.#blobPath(clean)));
  }

  /**
   * Detaches strings larger than `threshold` characters into a `CAS:<sha256>` pointer.
   *
   * @param {string} content
   * @param {number} [threshold=1024]
   * @returns {string}
   */
  scaleContent(content, threshold = 1024) {
    const str = String(content ?? "");
    if (str.length <= threshold) {
      return str;
    }
    const hash = this.writeBlob(str);
    return `CAS:${hash}`;
  }

  /**
   * Hydrates a `CAS:<sha256>` pointer back into its verified string payload.
   * Non-CAS strings are returned unchanged.
   *
   * @param {string} value
   * @returns {string}
   */
  hydrateContent(value) {
    const str = String(value ?? "");
    if (!str.startsWith("CAS:")) {
      return str;
    }
    const hash = str.slice(4).trim();
    const hydrated = this.readBlob(hash);
    if (hydrated === null) {
      throw new GuidedError({
        code: "STORAGE_MISSING",
        message: `Referenced CAS blob CAS:${hash.slice(0, 12)} does not exist`,
        likelyCause: "Blob was pruned or belongs to a different workspace.",
        suggestedFix: "Re-write the artifact to CAS before hydrating."
      });
    }
    return hydrated;
  }

  /**
   * Deletes unreferenced blobs from `.broccolidb/storage/blobs/`.
   *
   * @param {Set<string> | string[]} referencedHashes
   * @returns {number} Number of pruned blobs
   */
  pruneUnreferencedBlobs(referencedHashes) {
    if (!fs.existsSync(this.blobsDir)) return 0;
    const keep = new Set(
      Array.from(referencedHashes || []).map((h) =>
        String(h).replace(/^CAS:/i, "").trim().toLowerCase()
      )
    );

    let pruned = 0;
    for (const shard of fs.readdirSync(this.blobsDir)) {
      const shardDir = path.join(this.blobsDir, shard);
      if (!fs.statSync(shardDir).isDirectory()) continue;
      for (const file of fs.readdirSync(shardDir)) {
        if (!keep.has(file.toLowerCase())) {
          fs.unlinkSync(path.join(shardDir, file));
          pruned += 1;
        }
      }
    }
    return pruned;
  }

  /**
   * Compresses a payload into an RFC 1952 multi-member GZIP stream (`BroccoliWireEngine`).
   * Splits the input into content-addressed chunks, compresses each chunk independently with
   * `zlib.gzipSync`, caches each compressed member by chunk SHA-256 (in memory and on disk),
   * and concatenates the GZIP members in O(1) buffer assembly.
   *
   * Per RFC 1952 Section 2.2, concatenated GZIP members form a valid GZIP file that
   * `zlib.gunzipSync` decompresses seamlessly into the exact original byte stream.
   *
   * @param {string | Uint8Array} payload
   * @param {{ chunkSize?: number }} [options]
   * @returns {{
   *   buffer: Buffer,
   *   chunkCount: number,
   *   cacheHits: number,
   *   cacheMisses: number,
   *   uncompressedBytes: number,
   *   compressedBytes: number,
   *   compressionRatio: number,
   *   chunkHashes: string[]
   * }}
   */
  compressWirePayload(payload, options = {}) {
    this.#ensureDirs();
    const rawBuffer =
      typeof payload === "string"
        ? Buffer.from(payload, "utf8")
        : Buffer.from(payload);
    const chunkSize = Math.max(256, options.chunkSize || DEFAULT_WIRE_CHUNK_BYTES);

    const members = [];
    const chunkHashes = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    if (rawBuffer.byteLength === 0) {
      const emptyGzip = zlib.gzipSync(Buffer.alloc(0));
      return {
        buffer: emptyGzip,
        chunkCount: 1,
        cacheHits: 0,
        cacheMisses: 1,
        uncompressedBytes: 0,
        compressedBytes: emptyGzip.byteLength,
        compressionRatio: 0,
        chunkHashes: [sha256Hex("")]
      };
    }

    for (let offset = 0; offset < rawBuffer.byteLength; offset += chunkSize) {
      const slice = rawBuffer.subarray(offset, Math.min(rawBuffer.byteLength, offset + chunkSize));
      const chunkHash = sha256Hex(slice);
      chunkHashes.push(chunkHash);

      let member = this.gzipChunkCache.get(chunkHash);
      if (member) {
        cacheHits += 1;
        members.push(member);
        continue;
      }

      const diskWirePath = path.join(this.wireDir, `${chunkHash}.gz`);
      if (fs.existsSync(diskWirePath)) {
        member = fs.readFileSync(diskWirePath);
        this.gzipChunkCache.set(chunkHash, member);
        cacheHits += 1;
        members.push(member);
        continue;
      }

      cacheMisses += 1;
      member = zlib.gzipSync(slice);
      this.gzipChunkCache.set(chunkHash, member);
      this.#atomicWriteSync(diskWirePath, member);
      members.push(member);
    }

    const combined = Buffer.concat(members);
    const uncompressedBytes = rawBuffer.byteLength;
    const compressedBytes = combined.byteLength;
    const compressionRatio =
      uncompressedBytes > 0
        ? Number(((1 - compressedBytes / uncompressedBytes) * 100).toFixed(2))
        : 0;

    return {
      buffer: combined,
      chunkCount: members.length,
      cacheHits,
      cacheMisses,
      uncompressedBytes,
      compressedBytes,
      compressionRatio,
      chunkHashes
    };
  }

  /**
   * Decompresses an RFC 1952 multi-member GZIP stream back into UTF-8 text.
   *
   * @param {Uint8Array | Buffer} compressedBuffer
   * @returns {string}
   */
  decompressWirePayload(compressedBuffer) {
    const decompressed = zlib.gunzipSync(Buffer.from(compressedBuffer));
    return decompressed.toString("utf8");
  }

  /**
   * Persists a verified `RuntimeSnapshot` to `.broccolidb/storage/snapshots/<snapshotId>.json`
   * and writes its canonical graph JSON into the CAS blob store.
   *
   * @param {Object} snapshot
   * @returns {string} snapshotId
   */
  saveSnapshot(snapshot) {
    this.#ensureDirs();
    const snapshotId =
      snapshot.snapshotId || `snap-${snapshot.sessionId || "default"}-${Date.now()}`;
    const canonicalGraphJson = stableStringify(snapshot.graph || {});
    const casBlobHash = this.writeBlob(canonicalGraphJson);

    const envelope = {
      ...snapshot,
      snapshotId,
      casBlobHash,
      savedAt: snapshot.savedAt || Date.now()
    };

    const filePath = this.#resolveSnapshotPath(snapshotId);
    this.#atomicWriteSync(filePath, JSON.stringify(envelope, null, 2), "utf8");
    return snapshotId;
  }

  /**
   * Loads a persisted `RuntimeSnapshot` by `sessionId` (and optional `snapshotId`),
   * verifying its backing CAS blob via SHA-256 (`RTG-005`).
   *
   * @param {string} sessionId
   * @param {string} [snapshotId]
   * @returns {Object | null}
   */
  loadSnapshot(sessionId, snapshotId) {
    if (snapshotId) {
      this.#resolveSnapshotPath(snapshotId);
    }
    if (!fs.existsSync(this.snapshotsDir)) return null;

    let targetFile = null;
    if (snapshotId) {
      const candidate = this.#resolveSnapshotPath(snapshotId);
      if (fs.existsSync(candidate)) targetFile = candidate;
    } else {
      const files = fs
        .readdirSync(this.snapshotsDir)
        .filter((f) => f.endsWith(".json"))
        .map((f) => JSON.parse(fs.readFileSync(path.join(this.snapshotsDir, f), "utf8")))
        .filter((s) => !sessionId || s.sessionId === sessionId)
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      if (files.length > 0) {
        targetFile = this.#resolveSnapshotPath(files[0].snapshotId);
      }
    }

    if (!targetFile || !fs.existsSync(targetFile)) return null;
    const envelope = JSON.parse(fs.readFileSync(targetFile, "utf8"));

    if (envelope.casBlobHash) {
      const rawGraph = this.readBlob(envelope.casBlobHash);
      if (rawGraph) {
        envelope.graph = JSON.parse(rawGraph);
      }
    }

    return envelope;
  }
}
