/** [LAYER: PLUMBING] */
/**
 * Stateless multi-language comment style registry and `[LAYER: <ZONE>]` header manipulation.
 * Zero I/O, zero upward zone imports.
 */

const EXTENSION_TO_STYLE = Object.freeze({
  ".ts": "JSDOC",
  ".tsx": "JSDOC",
  ".mts": "JSDOC",
  ".cts": "JSDOC",
  ".js": "JSDOC",
  ".jsx": "JSDOC",
  ".mjs": "JSDOC",
  ".cjs": "JSDOC",
  ".java": "JSDOC",
  ".scala": "JSDOC",
  ".groovy": "JSDOC",
  ".css": "JSDOC",
  ".scss": "JSDOC",
  ".less": "JSDOC",
  ".go": "SLASH",
  ".rs": "SLASH",
  ".c": "SLASH",
  ".cpp": "SLASH",
  ".cc": "SLASH",
  ".h": "SLASH",
  ".hpp": "SLASH",
  ".proto": "SLASH",
  ".grit": "SLASH",
  ".swift": "SLASH",
  ".kt": "SLASH",
  ".kts": "SLASH",
  ".cs": "SLASH",
  ".dart": "SLASH",
  ".zig": "SLASH",
  ".py": "HASH",
  ".sh": "HASH",
  ".bash": "HASH",
  ".zsh": "HASH",
  ".rb": "HASH",
  ".yaml": "HASH",
  ".yml": "HASH",
  ".toml": "HASH",
  ".env": "HASH",
  ".dockerfile": "HASH",
  ".makefile": "HASH",
  ".tf": "HASH",
  ".hcl": "HASH",
  ".graphql": "HASH",
  ".gql": "HASH",
  ".r": "HASH",
  ".jl": "HASH",
  ".pl": "HASH",
  ".pm": "HASH",
  ".ex": "HASH",
  ".exs": "HASH",
  ".sql": "DASH",
  ".lua": "DASH",
  ".hs": "DASH",
  ".elm": "DASH",
  ".md": "HTML",
  ".html": "HTML",
  ".htm": "HTML",
  ".xml": "HTML",
  ".vue": "HTML",
  ".svelte": "HTML",
  ".svg": "HTML"
});

const HEADER_TAG_REGEX = /\[LAYER:\s*(DOMAIN|CORE|INFRASTRUCTURE|PLUMBING|UI|UTILS)\s*\]/i;
const HEADER_SCAN_WINDOW_CHARS = 10000;

/**
 * Returns the comment style family for a file extension, or null if unsupported/exempt.
 * @param {string} extension
 * @returns {"JSDOC"|"SLASH"|"HASH"|"DASH"|"HTML"|null}
 */
export function getCommentStyleForExtension(extension) {
  if (!extension) return null;
  const key = extension.toLowerCase();
  return EXTENSION_TO_STYLE[key] || null;
}

/**
 * Returns true if the file extension supports `[LAYER: <ZONE>]` header tags.
 * @param {string} extension
 * @returns {boolean}
 */
export function isSupportedSourceExtension(extension) {
  return getCommentStyleForExtension(extension) !== null;
}

/**
 * Normalizes a parsed layer string (`UTILS` -> `plumbing`, etc.).
 * @param {string|null|undefined} rawZone
 * @returns {"domain"|"core"|"infrastructure"|"plumbing"|"ui"|null}
 */
export function normalizeZoneName(rawZone) {
  if (typeof rawZone !== "string") return null;
  const lower = rawZone.trim().toLowerCase();
  if (lower === "utils") return "plumbing";
  if (
    lower === "domain" ||
    lower === "core" ||
    lower === "infrastructure" ||
    lower === "plumbing" ||
    lower === "ui"
  ) {
    return lower;
  }
  return null;
}

/**
 * Normalizes a zone or LUMI resource domain name (including `api`/`admin`/`adapters`/`services` -> `infrastructure`).
 * @param {string|null|undefined} raw
 * @returns {"domain"|"core"|"infrastructure"|"plumbing"|"ui"|null}
 */
export function normalizeResourceZone(raw) {
  const direct = normalizeZoneName(raw);
  if (direct) return direct;
  if (typeof raw !== "string") return null;
  const clean = raw.trim().toLowerCase();
  if (clean === "api" || clean === "admin" || clean === "adapters" || clean === "services") {
    return "infrastructure";
  }
  return null;
}

/**
 * Extracts the declared `[LAYER: <ZONE>]` from the first 10,000 characters of file content.
 * @param {string} content
 * @returns {{ rawTag: string|null, normalizedZone: "domain"|"core"|"infrastructure"|"plumbing"|"ui"|null }}
 */
export function extractHeaderTag(content) {
  if (typeof content !== "string" || content.length === 0) {
    return { rawTag: null, normalizedZone: null };
  }
  const head = content.slice(0, HEADER_SCAN_WINDOW_CHARS);
  const match = head.match(HEADER_TAG_REGEX);
  if (!match) {
    return { rawTag: null, normalizedZone: null };
  }
  const rawTag = match[1].toUpperCase();
  const normalizedZone = normalizeZoneName(rawTag);
  return { rawTag, normalizedZone };
}

/**
 * Formats a canonical single-line `[LAYER: <ZONE>]` header comment for a given extension and zone.
 * @param {string} extension
 * @param {string} zone
 * @returns {string|null}
 */
export function formatHeaderComment(extension, zone) {
  const style = getCommentStyleForExtension(extension);
  const normalized = normalizeZoneName(zone);
  if (!style || !normalized) return null;
  const upper = normalized.toUpperCase();

  switch (style) {
    case "JSDOC":
      return `/** [LAYER: ${upper}] */`;
    case "SLASH":
      return `// [LAYER: ${upper}]`;
    case "HASH":
      return `# [LAYER: ${upper}]`;
    case "DASH":
      return `-- [LAYER: ${upper}]`;
    case "HTML":
      return `<!-- [LAYER: ${upper}] -->`;
    default:
      return null;
  }
}

/**
 * Stamps or updates a `[LAYER: <ZONE>]` header comment in file content, preserving shebang (`#!`)
 * on Line 1 and YAML frontmatter (`---`) blocks in Markdown files.
 * @param {string} content
 * @param {string} extension
 * @param {string} targetZone
 * @returns {string}
 */
export function applyHeaderTag(content, extension, targetZone) {
  const normalized = normalizeZoneName(targetZone);
  if (!normalized) return content;
  const upper = normalized.toUpperCase();

  const head = content.slice(0, HEADER_SCAN_WINDOW_CHARS);
  if (HEADER_TAG_REGEX.test(head)) {
    const updatedHead = head.replace(HEADER_TAG_REGEX, `[LAYER: ${upper}]`);
    return updatedHead + content.slice(HEADER_SCAN_WINDOW_CHARS);
  }

  const headerLine = formatHeaderComment(extension, normalized);
  if (!headerLine) return content;

  const hasBom = content.startsWith("\uFEFF");
  const body = hasBom ? content.slice(1) : content;
  const bomPrefix = hasBom ? "\uFEFF" : "";

  // Preserve Shebang (#!) on line 1
  if (body.startsWith("#!")) {
    const firstNewline = body.indexOf("\n");
    if (firstNewline === -1) {
      return `${bomPrefix}${body}\n${headerLine}\n`;
    }
    return `${bomPrefix}${body.slice(0, firstNewline + 1)}${headerLine}\n${body.slice(firstNewline + 1)}`;
  }

  // Preserve YAML frontmatter (--- ... ---) in Markdown/HTML files
  if (body.startsWith("---\n") || body.startsWith("---\r\n")) {
    const closeMatch = body.slice(4).match(/\r?\n---\r?\n/);
    if (closeMatch && typeof closeMatch.index === "number") {
      const insertOffset = 4 + closeMatch.index + closeMatch[0].length;
      return `${bomPrefix}${body.slice(0, insertOffset)}${headerLine}\n${body.slice(insertOffset)}`;
    }
  }

  return `${bomPrefix}${headerLine}\n${body}`;
}

