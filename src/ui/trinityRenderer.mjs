/** [LAYER: UI] */
/**
 * Output renderers for `joy-trinity`: strict JSON envelopes for agents (default), NDJSON for
 * streaming pipelines, and compact human-readable text (tables and key/value lists).
 */

const MAX_CELL = 48;

function cell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
}

function table(rows) {
  const columns = [];
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (!columns.includes(key) && (value === null || typeof value !== "object")) columns.push(key);
    }
  }
  const shown = columns.slice(0, 7);
  const data = rows.map((row) => shown.map((c) => cell(row[c])));
  const widths = shown.map((c, i) => Math.max(c.length, ...data.map((r) => r[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ").trimEnd();
  return [line(shown.map((c) => c.toUpperCase())), ...data.map(line)].join("\n");
}

/**
 * Renders a successful result as human-readable text.
 * @param {unknown} result
 * @returns {string}
 */
export function renderText(result) {
  if (result === null || result === undefined) return "(none)";
  if (Array.isArray(result)) {
    if (result.length === 0) return "(no results)";
    return result.every((r) => r && typeof r === "object" && !Array.isArray(r)) ? table(result) : result.map(cell).join("\n");
  }
  if (typeof result === "object") {
    const entries = Object.entries(result);
    const width = Math.max(...entries.map(([k]) => k.length));
    return entries.map(([k, v]) => {
      if (Array.isArray(v) && v.length && v.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
        return `${k}:\n${table(v).split("\n").map((l) => `  ${l}`).join("\n")}`;
      }
      if (typeof v === "string" && v.includes("\n")) return `${k}:\n${v.split("\n").map((l) => `  ${l}`).join("\n")}`;
      return `${k.padEnd(width)}  ${cell(v)}`;
    }).join("\n");
  }
  return String(result);
}

/**
 * Formats a success envelope for the chosen output format.
 * @param {"json" | "ndjson" | "text"} format
 * @param {string} command
 * @param {unknown} result
 * @returns {string} text ending in a newline
 */
export function formatSuccess(format, command, result) {
  const value = result === undefined ? null : result;
  if (format === "text") return `${renderText(value)}\n`;
  if (format === "ndjson") {
    return Array.isArray(value) ? `${value.map((r) => JSON.stringify(r)).join("\n")}${value.length ? "\n" : ""}` : `${JSON.stringify(value)}\n`;
  }
  return `${JSON.stringify({ ok: true, command, result: value }, null, 2)}\n`;
}

/**
 * Formats a failure. In `text` mode the message is for humans (stderr); otherwise a JSON envelope (stdout).
 * @param {"json" | "ndjson" | "text"} format
 * @param {string} command @param {string} code @param {string} message @param {string} [hint]
 * @returns {{ stream: "stdout" | "stderr", text: string }}
 */
export function formatFailure(format, command, code, message, hint) {
  if (format === "text") return { stream: "stderr", text: `error: ${message}\n${hint ? `hint: ${hint}\n` : ""}` };
  const envelope = { ok: false, command, error: { code, message, ...(hint ? { hint } : {}) } };
  return { stream: "stdout", text: `${JSON.stringify(envelope, format === "ndjson" ? undefined : 2)}\n` };
}
