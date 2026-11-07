/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`IBufferedStore`) for the durable backing store
 * behind `BufferedDb`. Zero I/O inside Domain; concrete adapters live in
 * `src/infrastructure/` (`MemoryBufferedStore`, `BroccoliBufferedStore`).
 *
 * Rows are plain JSON-compatible objects addressed by `(table, rowId)`. The store only
 * needs synchronous reads from its in-memory working set; durability is expressed
 * through `transaction`, which must resolve only after the batch is persisted.
 */

/**
 * @typedef {Record<string, unknown>} BufferedRow
 */

export class IBufferedStore {
  /** Prepares the store for use (idempotent). @returns {Promise<void>} */
  async start() {
    throw new Error("IBufferedStore.start must be implemented by an Infrastructure adapter.");
  }

  /** Flushes and releases store resources (idempotent). @returns {Promise<void>} */
  async stop() {
    throw new Error("IBufferedStore.stop must be implemented by an Infrastructure adapter.");
  }

  /**
   * Returns a snapshot (safe to mutate) of every row in `table`.
   * @param {string} _table
   * @returns {BufferedRow[]}
   */
  rows(_table) {
    throw new Error("IBufferedStore.rows must be implemented by an Infrastructure adapter.");
  }

  /**
   * Inserts or replaces a row, keyed by the store's row-id derivation.
   * @param {string} _table
   * @param {BufferedRow} _row
   * @returns {void}
   */
  putRow(_table, _row) {
    throw new Error("IBufferedStore.putRow must be implemented by an Infrastructure adapter.");
  }

  /**
   * Deletes a row previously returned by `rows`.
   * @param {string} _table
   * @param {BufferedRow} _row
   * @returns {boolean}
   */
  deleteRow(_table, _row) {
    throw new Error("IBufferedStore.deleteRow must be implemented by an Infrastructure adapter.");
  }

  /**
   * Runs `fn` as one atomic, durably flushed batch.
   * @template T
   * @param {() => Promise<T> | T} _fn
   * @returns {Promise<T>}
   */
  async transaction(_fn) {
    throw new Error("IBufferedStore.transaction must be implemented by an Infrastructure adapter.");
  }

  /**
   * Optionally hints that `column` is queried frequently on `table`.
   * @param {string} _table
   * @param {string} _column
   * @returns {void}
   */
  createIndex(_table, _column) {
    // Optional capability; the default is a no-op.
  }
}
