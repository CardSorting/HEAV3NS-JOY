/** [LAYER: INFRASTRUCTURE] */
/**
 * Volatile `IBufferedStore` adapter: tables live in process memory only. Ideal for
 * tests, ephemeral swarms, and hosts that bring their own persistence.
 */

import { IBufferedStore } from "../domain/interfaces/IBufferedStore.mjs";
import { defaultRowId } from "../plumbing/rowIds.mjs";

export class MemoryBufferedStore extends IBufferedStore {
  #tables = new Map();
  #rowId;

  /** @param {{ rowId?: (table: string, row: Record<string, unknown>) => string }} [options] */
  constructor(options = {}) {
    super();
    this.#rowId = options.rowId ?? defaultRowId;
  }

  async start() {}

  async stop() {}

  rows(table) {
    return Array.from(this.#tables.get(table)?.values() ?? [], (row) => ({ ...row }));
  }

  putRow(table, row) {
    let rows = this.#tables.get(table);
    if (!rows) {
      rows = new Map();
      this.#tables.set(table, rows);
    }
    rows.set(this.#rowId(table, row), { ...row });
  }

  deleteRow(table, row) {
    return this.#tables.get(table)?.delete(this.#rowId(table, row)) ?? false;
  }

  async transaction(fn) {
    return fn();
  }
}
