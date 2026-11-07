/** [LAYER: DOMAIN] */
/**
 * Pure text/JSON merge primitives for non-destructive installation into files a user also edits:
 * idempotent managed markdown blocks and surgical JSON server-entry upserts. Everything outside
 * the managed region is preserved byte for byte.
 *
 * @typedef {{ text: string, changed: boolean, conflict?: string }} MergeResult
 */

const beginMarker = (id) => `<!-- joy:begin ${id} -->`;
const endMarker = (id) => `<!-- joy:end ${id} -->`;

/**
 * Locates a managed block. Returns `null` when absent, or throws-style `{ conflict }` when markers are damaged.
 * @param {string} text @param {string} id
 * @returns {{ start: number, end: number } | { conflict: string } | null}
 */
export function findBlock(text, id) {
  const begin = beginMarker(id);
  const end = endMarker(id);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start === -1 && stop === -1) return null;
  if (start === -1 || stop === -1 || stop < start) return { conflict: `managed block '${id}' has a missing or misordered marker` };
  if (text.indexOf(begin, start + begin.length) !== -1 || text.indexOf(end, stop + end.length) !== -1) return { conflict: `managed block '${id}' appears more than once` };
  return { start, end: stop + end.length };
}

/**
 * Inserts or replaces a managed block, appending it (separated by a blank line) when absent.
 * @param {string} text existing file text ("" when the file is new)
 * @param {string} id @param {string} body markdown body without markers
 * @returns {MergeResult}
 */
export function upsertBlock(text, id, body) {
  const block = `${beginMarker(id)}\n${body.trim()}\n${endMarker(id)}`;
  const found = findBlock(text, id);
  if (found && "conflict" in found) return { text, changed: false, conflict: found.conflict };
  if (found) {
    const next = `${text.slice(0, found.start)}${block}${text.slice(found.end)}`;
    return { text: next, changed: next !== text };
  }
  const prefix = text.length === 0 ? "" : `${text.replace(/\s+$/, "")}\n\n`;
  return { text: `${prefix}${block}\n`, changed: true };
}

/**
 * Removes a managed block. `empty` reports that nothing but whitespace remains.
 * @param {string} text @param {string} id
 * @returns {MergeResult & { empty: boolean }}
 */
export function removeBlock(text, id) {
  const found = findBlock(text, id);
  if (!found) return { text, changed: false, empty: text.trim() === "" };
  if ("conflict" in found) return { text, changed: false, empty: false, conflict: found.conflict };
  const before = text.slice(0, found.start).replace(/\s+$/, "");
  const after = text.slice(found.end).replace(/^\s+/, "");
  const next = before && after ? `${before}\n\n${after}` : `${before}${after}`;
  const cleaned = next.trim() === "" ? "" : `${next.replace(/\s+$/, "")}\n`;
  return { text: cleaned, changed: true, empty: cleaned === "" };
}

/**
 * Returns the managed block body, or `null`.
 * @param {string} text @param {string} id
 */
export function readBlock(text, id) {
  const found = findBlock(text, id);
  if (!found || "conflict" in found) return null;
  return text.slice(found.start + beginMarker(id).length, found.end - endMarker(id).length).trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Stable JSON equality for config entries (key order independent).
 * @param {unknown} a @param {unknown} b
 */
export function jsonEqual(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => jsonEqual(v, b[i]));
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].every((k) => jsonEqual(a[k], b[k]));
  }
  return false;
}

/**
 * Sets `value` at `path` (e.g. `["mcpServers","joy"]`) inside a JSON document, preserving all other keys.
 * An existing, different value at the path is reported as `existing` so callers can apply their own conflict policy.
 * @param {string} text existing document text ("" for a new file)
 * @param {string[]} path @param {unknown} value
 * @returns {{ text: string, changed: boolean, conflict?: string, existing?: unknown }}
 */
export function upsertJsonPath(text, path, value) {
  let root = {};
  if (text.trim() !== "") {
    try {
      root = JSON.parse(text);
    } catch (error) {
      return { text, changed: false, conflict: `existing file is not strict JSON (${error.message}); add the entry manually` };
    }
    if (!isPlainObject(root)) return { text, changed: false, conflict: "existing JSON document is not an object" };
  }
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (cursor[key] === undefined) cursor[key] = {};
    if (!isPlainObject(cursor[key])) return { text, changed: false, conflict: `'${key}' exists but is not an object` };
    cursor = cursor[key];
  }
  const leaf = path[path.length - 1];
  if (cursor[leaf] !== undefined && !jsonEqual(cursor[leaf], value)) return { text, changed: false, existing: cursor[leaf] };
  const unchanged = cursor[leaf] !== undefined;
  cursor[leaf] = value;
  return { text: `${JSON.stringify(root, null, 2)}\n`, changed: !unchanged };
}

/**
 * Forces `value` at `path`, replacing any existing entry (used with `--force` or when the entry is known to be ours).
 * @param {string} text @param {string[]} path @param {unknown} value
 */
export function setJsonPath(text, path, value) {
  const removed = removeJsonPath(text, path);
  if (removed.conflict) return removed;
  return upsertJsonPath(removed.text, path, value);
}

/**
 * Removes the entry at `path` and prunes now-empty parent objects. `empty` is true when the document becomes `{}`.
 * @param {string} text @param {string[]} path
 * @returns {{ text: string, changed: boolean, empty: boolean, conflict?: string, existing?: unknown }}
 */
export function removeJsonPath(text, path) {
  if (text.trim() === "") return { text, changed: false, empty: true };
  let root;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return { text, changed: false, empty: false, conflict: `existing file is not strict JSON (${error.message})` };
  }
  if (!isPlainObject(root)) return { text, changed: false, empty: false, conflict: "existing JSON document is not an object" };
  const trail = [root];
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(cursor[key])) return { text, changed: false, empty: Object.keys(root).length === 0 };
    cursor = cursor[key];
    trail.push(cursor);
  }
  const leaf = path[path.length - 1];
  if (cursor[leaf] === undefined) return { text, changed: false, empty: Object.keys(root).length === 0 };
  const existing = cursor[leaf];
  delete cursor[leaf];
  for (let i = trail.length - 1; i > 0; i--) {
    if (Object.keys(trail[i]).length === 0) delete trail[i - 1][path[i - 1]];
  }
  const empty = Object.keys(root).length === 0;
  return { text: empty ? "{}\n" : `${JSON.stringify(root, null, 2)}\n`, changed: true, empty, existing };
}

/**
 * Reads the value at `path`, or `undefined`.
 * @param {string} text @param {string[]} path
 */
export function readJsonPath(text, path) {
  try {
    let cursor = JSON.parse(text);
    for (const key of path) {
      if (!isPlainObject(cursor)) return undefined;
      cursor = cursor[key];
    }
    return cursor;
  } catch {
    return undefined;
  }
}

/**
 * Ensures an array at `path` contains `item`, identified by `isOurs`; replaces our existing item or appends.
 * Other entries in the array are preserved untouched.
 * @param {string} text @param {string[]} path @param {unknown} item @param {(entry: unknown) => boolean} isOurs
 * @returns {{ text: string, changed: boolean, conflict?: string }}
 */
export function upsertJsonArrayItem(text, path, item, isOurs) {
  let root = {};
  if (text.trim() !== "") {
    try {
      root = JSON.parse(text);
    } catch (error) {
      return { text, changed: false, conflict: `existing file is not strict JSON (${error.message}); add the entry manually` };
    }
    if (!isPlainObject(root)) return { text, changed: false, conflict: "existing JSON document is not an object" };
  }
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (cursor[key] === undefined) cursor[key] = {};
    if (!isPlainObject(cursor[key])) return { text, changed: false, conflict: `'${key}' exists but is not an object` };
    cursor = cursor[key];
  }
  const leaf = path[path.length - 1];
  if (cursor[leaf] === undefined) cursor[leaf] = [];
  if (!Array.isArray(cursor[leaf])) return { text, changed: false, conflict: `'${leaf}' exists but is not an array` };
  const index = cursor[leaf].findIndex(isOurs);
  if (index >= 0 && jsonEqual(cursor[leaf][index], item)) return { text, changed: false };
  if (index >= 0) cursor[leaf][index] = item;
  else cursor[leaf].push(item);
  return { text: `${JSON.stringify(root, null, 2)}\n`, changed: true };
}

/**
 * Removes our item from the array at `path`, pruning empty containers.
 * @param {string} text @param {string[]} path @param {(entry: unknown) => boolean} isOurs
 * @returns {{ text: string, changed: boolean, empty: boolean, conflict?: string }}
 */
export function removeJsonArrayItem(text, path, isOurs) {
  if (text.trim() === "") return { text, changed: false, empty: true };
  let root;
  try {
    root = JSON.parse(text);
  } catch (error) {
    return { text, changed: false, empty: false, conflict: `existing file is not strict JSON (${error.message})` };
  }
  const trail = [root];
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(cursor?.[key])) return { text, changed: false, empty: Object.keys(root).length === 0 };
    cursor = cursor[key];
    trail.push(cursor);
  }
  const leaf = path[path.length - 1];
  if (!Array.isArray(cursor[leaf])) return { text, changed: false, empty: Object.keys(root).length === 0 };
  const before = cursor[leaf].length;
  cursor[leaf] = cursor[leaf].filter((entry) => !isOurs(entry));
  if (cursor[leaf].length === before) return { text, changed: false, empty: false };
  if (cursor[leaf].length === 0) delete cursor[leaf];
  for (let i = trail.length - 1; i > 0; i--) if (Object.keys(trail[i]).length === 0) delete trail[i - 1][path[i - 1]];
  const empty = Object.keys(root).length === 0;
  return { text: empty ? "{}\n" : `${JSON.stringify(root, null, 2)}\n`, changed: true, empty };
}
