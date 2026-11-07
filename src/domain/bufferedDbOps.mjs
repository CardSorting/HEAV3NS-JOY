/** [LAYER: DOMAIN] */
/**
 * Pure write-operation algebra for `BufferedDb`: operation construction, predicate
 * matching, increment application, and layer-ordered flush sorting. No I/O.
 *
 * @typedef {"domain" | "infrastructure" | "ui" | "plumbing"} DbLayer
 *
 * @typedef {Object} WhereCondition
 * @property {string} column
 * @property {string | number | null | Array<string | number>} value
 * @property {"=" | "<" | ">" | "<=" | ">=" | "!=" | "IN" | "in" | "In" | "UNSAFE_IN" | "IS" | "IS NOT" | "LIKE"} [operator]
 *
 * @typedef {{ _type: "increment", value: number }} Increment
 *
 * @typedef {Object} WriteOp
 * @property {"insert" | "update" | "delete" | "upsert"} type
 * @property {string} table
 * @property {Record<string, unknown>} [values]
 * @property {WhereCondition | WhereCondition[]} [where]
 * @property {string | string[]} [conflictTarget]
 * @property {string} [agentId]
 * @property {DbLayer} [layer]
 * @property {boolean} [hasIncrements]
 * @property {string} [dedupKey]
 */

/** Lower numbers flush first so domain facts land before dependent layers. */
export const LAYER_PRIORITY = Object.freeze({ domain: 0, infrastructure: 1, ui: 2, plumbing: 3 });

/**
 * Builds a monomorphic write operation (stable hidden-class shape for the hot path).
 * @param {WriteOp["type"]} type
 * @param {string} table
 * @param {Record<string, unknown>} [values]
 * @param {WhereCondition | WhereCondition[]} [where]
 * @param {string | string[]} [conflictTarget]
 * @param {string} [agentId]
 * @param {DbLayer} [layer]
 * @param {boolean} [hasIncrements]
 * @param {string} [dedupKey]
 * @returns {WriteOp}
 */
export function createMonomorphicWriteOp(type, table, values, where, conflictTarget, agentId, layer, hasIncrements, dedupKey) {
  return { type, table, values, where, conflictTarget, agentId, layer, hasIncrements, dedupKey };
}

/**
 * Creates an atomic numeric delta marker usable as a column value in `values`.
 * @param {number} value
 * @returns {Increment}
 */
export function increment(value) {
  return { _type: "increment", value };
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIncrement(value) {
  return typeof value === "object" && value !== null && value._type === "increment";
}

/**
 * @param {WhereCondition | WhereCondition[] | undefined} where
 * @returns {WhereCondition[]}
 */
export function normalizeWhere(where) {
  return !where ? [] : Array.isArray(where) ? where : [where];
}

/**
 * Evaluates every condition against a row (logical AND).
 * @param {Record<string, unknown>} row
 * @param {readonly WhereCondition[]} conditions
 * @returns {boolean}
 */
export function matches(row, conditions) {
  return conditions.every((condition) => {
    const actual = row[condition.column];
    const operator = String(condition.operator ?? "=").toUpperCase();
    if (operator === "IN" || operator === "UNSAFE_IN" || (Array.isArray(condition.value) && operator === "=")) {
      return Array.isArray(condition.value) && condition.value.includes(actual);
    }
    if (operator === "IS") {
      return condition.value === null ? actual === null || actual === undefined : actual === condition.value;
    }
    if (operator === "IS NOT") {
      return condition.value === null ? actual !== null && actual !== undefined : actual !== condition.value;
    }
    if (operator === "LIKE") {
      if (typeof actual !== "string") return false;
      const pattern = String(condition.value).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(actual);
    }
    if (operator === "=") return actual === condition.value;
    if (operator === "!=") return actual !== condition.value;
    if (operator === ">") return actual > condition.value;
    if (operator === ">=") return actual >= condition.value;
    if (operator === "<") return actual < condition.value;
    if (operator === "<=") return actual <= condition.value;
    return false;
  });
}

/**
 * Returns a copy of `row` with `values` applied, resolving increment markers.
 * @param {Record<string, unknown>} row
 * @param {Record<string, unknown>} values
 * @returns {Record<string, unknown>}
 */
export function applyValues(row, values) {
  const next = { ...row };
  for (const [column, value] of Object.entries(values)) {
    next[column] = isIncrement(value) ? Number(next[column] ?? 0) + value.value : value;
  }
  return next;
}

/**
 * Applies one operation to an in-memory row list and returns the resulting list.
 * @param {Array<Record<string, unknown>>} rows
 * @param {WriteOp} op
 * @returns {Array<Record<string, unknown>>}
 */
export function applyOperationToRows(rows, op) {
  const values = op.values ? { ...op.values } : undefined;
  const conditions = normalizeWhere(op.where);
  if (op.type === "insert" && values) return [...rows, values];
  if (op.type === "delete") return rows.filter((row) => !matches(row, conditions));
  if (op.type === "update" && values) return rows.map((row) => (matches(row, conditions) ? applyValues(row, values) : row));
  if (op.type === "upsert" && values) {
    const index = findUpsertIndex(rows, op, values, conditions);
    if (index >= 0) return rows.map((row, i) => (i === index ? applyValues(row, values) : row));
    return [...rows, applyValues({}, values)];
  }
  return rows;
}

/**
 * Locates the row an upsert collides with, or -1.
 * @param {Array<Record<string, unknown>>} rows
 * @param {WriteOp} op
 * @param {Record<string, unknown>} values
 * @param {WhereCondition[]} conditions
 * @returns {number}
 */
export function findUpsertIndex(rows, op, values, conditions) {
  const conflictFields = op.conflictTarget ? (Array.isArray(op.conflictTarget) ? op.conflictTarget : [op.conflictTarget]) : ["id"];
  return rows.findIndex((row) =>
    conditions.length > 0
      ? matches(row, conditions)
      : conflictFields.every((field) => row[field] !== undefined && row[field] === values[field])
  );
}

/**
 * Orders buffered operations for a flush: by layer priority, then table name.
 * Array sort is stable, so same-table operations retain their enqueue order.
 * @param {readonly WriteOp[]} ops
 * @returns {WriteOp[]}
 */
export function sortOperationsForFlush(ops) {
  return [...ops].sort((a, b) => {
    const delta = LAYER_PRIORITY[a.layer ?? "plumbing"] - LAYER_PRIORITY[b.layer ?? "plumbing"];
    return delta || String(a.table).localeCompare(String(b.table));
  });
}
