/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty Interface (`ICasStorage`) and `GuidedError` contract
 * for BroccoliDB Content-Addressable Storage, Corruption Quarantine, Context Scaling,
 * and RFC 1952 Multi-Member Wire Compression.
 *
 * Pure Domain Contract — 0% I/O.
 */

/**
 * Formats a `GuidedError` payload into a deterministic human/agent-actionable string.
 *
 * @param {{
 *   code: string,
 *   message: string,
 *   likelyCause: string,
 *   suggestedFix: string,
 *   command?: string,
 *   docsPath?: string
 * }} g
 * @returns {string}
 */
export function formatErrorGuidance(g) {
  const parts = [
    `[${g.code}] ${g.message}`,
    `Why: ${g.likelyCause}`,
    `Next: ${g.suggestedFix}`
  ];
  if (g.command) parts.push(`Run: ${g.command}`);
  if (g.docsPath) parts.push(`Docs: ${g.docsPath}`);
  return parts.join(" -> ");
}

/**
 * Pedagogical error class (`[CODE] message -> Why: ... -> Next: ...`) translated from BroccoliDB.
 */
export class GuidedError extends Error {
  /**
   * @param {{
   *   code: string,
   *   message: string,
   *   likelyCause: string,
   *   suggestedFix: string,
   *   command?: string,
   *   docsPath?: string
   * }} guidance
   */
  constructor(guidance) {
    const formatted = formatErrorGuidance(guidance);
    super(formatted);
    this.name = "GuidedError";
    this.code = guidance.code || "GUIDED_ERROR";
    this.guidance = Object.freeze({ ...guidance });
  }
}

export class ICasStorage {
  /**
   * Writes content to the content-addressable store under its SHA-256 hash.
   *
   * @param {string | Uint8Array} _content
   * @returns {string} 64-character SHA-256 hex digest
   */
  writeBlob(_content) {
    throw new Error("ICasStorage.writeBlob() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Reads a content-addressable blob by SHA-256 hash and verifies cryptographic parity.
   * On mismatch, quarantines the corrupted file and throws a `STORAGE_CORRUPT` `GuidedError`.
   *
   * @param {string} _hash
   * @returns {string | null}
   */
  readBlob(_hash) {
    throw new Error("ICasStorage.readBlob() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Checks whether a blob exists in CAS.
   *
   * @param {string} _hash
   * @returns {string}
   */
  exists(_hash) {
    throw new Error("ICasStorage.exists() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Detaches strings larger than `threshold` bytes/chars into `CAS:<sha256>`.
   *
   * @param {string} _content
   * @param {number} [_threshold=1024]
   * @returns {string} Original string or `"CAS:<sha256>"`
   */
  scaleContent(_content, _threshold = 1024) {
    throw new Error("ICasStorage.scaleContent() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Hydrates a `"CAS:<sha256>"` pointer back into its full string content with SHA-256 verification.
   *
   * @param {string} _value
   * @returns {string}
   */
  hydrateContent(_value) {
    throw new Error("ICasStorage.hydrateContent() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Prunes unreferenced blobs from the CAS directory.
   *
   * @param {Set<string> | string[]} _referencedHashes
   * @returns {number} Count of pruned blobs
   */
  pruneUnreferencedBlobs(_referencedHashes) {
    throw new Error("ICasStorage.pruneUnreferencedBlobs() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Compresses a payload into an RFC 1952 multi-member GZIP stream using content-addressed chunk caching.
   *
   * @param {string | Uint8Array} _payload
   * @param {object} [_options]
   */
  compressWirePayload(_payload, _options = {}) {
    throw new Error("ICasStorage.compressWirePayload() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Decompresses an RFC 1952 GZIP stream back into UTF-8 text.
   *
   * @param {Uint8Array} _compressedBuffer
   * @returns {string}
   */
  decompressWirePayload(_compressedBuffer) {
    throw new Error("ICasStorage.decompressWirePayload() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Persists a verified `RuntimeSnapshot` to durable storage.
   *
   * @param {object} _snapshot
   * @returns {string} Snapshot ID or path
   */
  saveSnapshot(_snapshot) {
    throw new Error("ICasStorage.saveSnapshot() must be implemented by an INFRASTRUCTURE adapter.");
  }

  /**
   * Loads the latest (or specified) `RuntimeSnapshot` for a session.
   *
   * @param {string} _sessionId
   * @param {string} [_snapshotId]
   * @returns {object | null}
   */
  loadSnapshot(_sessionId, _snapshotId) {
    throw new Error("ICasStorage.loadSnapshot() must be implemented by an INFRASTRUCTURE adapter.");
  }
}
