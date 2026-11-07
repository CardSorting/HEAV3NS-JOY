/** [LAYER: INFRASTRUCTURE] */
/**
 * Durable `IBufferedStore` adapter backed by the vendored zero-dependency BroccoliDB
 * kernel (`src/infrastructure/broccolidb`): in-memory tables with a checksummed
 * write-ahead log and checkpoints under `<workspaceRoot>/.broccolidb`.
 */

import { IBufferedStore } from "../domain/interfaces/IBufferedStore.mjs";
import { defaultRowId } from "../plumbing/rowIds.mjs";
import { BroccoliDatabaseKernel } from "./broccolidb/index.mjs";

export class BroccoliBufferedStore extends IBufferedStore {
  #kernel;
  #ownsKernel;
  #rowId;

  /**
   * @param {{
   *   kernel?: BroccoliDatabaseKernel,
   *   workspaceRoot?: string,
   *   walDebounceMs?: number,
   *   rowId?: (table: string, row: Record<string, unknown>) => string
   * }} [options] Supply either an existing `kernel` (host-owned lifecycle) or a `workspaceRoot`.
   */
  constructor(options = {}) {
    super();
    this.#ownsKernel = !options.kernel;
    this.#kernel = options.kernel ?? new BroccoliDatabaseKernel({
      ...(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {}),
      ...(options.walDebounceMs !== undefined ? { walDebounceMs: options.walDebounceMs } : {})
    });
    this.#rowId = options.rowId ?? defaultRowId;
  }

  /** The underlying kernel, e.g. to share it with a `BroccoliQueue`. */
  get kernel() {
    return this.#kernel;
  }

  async start() {
    await this.#kernel.start();
  }

  async stop() {
    if (this.#ownsKernel) await this.#kernel.stop();
    else await this.#kernel.flush();
  }

  rows(table) {
    return this.#kernel.getTable(table).getAll();
  }

  putRow(table, row) {
    this.#kernel.getTable(table).put(this.#rowId(table, row), { ...row });
  }

  deleteRow(table, row) {
    return this.#kernel.getTable(table).delete(this.#rowId(table, row));
  }

  async transaction(fn) {
    return this.#kernel.transaction(fn);
  }

  createIndex(table, column) {
    this.#kernel.getTable(table).createIndex(column);
  }
}
