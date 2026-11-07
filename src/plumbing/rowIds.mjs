/** [LAYER: PLUMBING] */
/**
 * Stateless row-key derivation helpers shared by `IBufferedStore` adapters.
 */

/**
 * Default row-id derivation for stores that key rows by an `id` column.
 * @param {string} table
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
export function defaultRowId(table, row) {
  if (row.id === undefined || row.id === null) {
    throw new Error(`BUFFERED_DB_ROW_ID_MISSING: row for table '${table}' has no 'id'; supply a rowId resolver`);
  }
  return String(row.id);
}
