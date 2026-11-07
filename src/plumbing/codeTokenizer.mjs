/** [LAYER: PLUMBING] */
/**
 * Stateless single-pass character lexer for stripping comments and string/regex literals,
 * plus bypass directive extraction (`@joyzoning-bypass` / `@sovereign-ignore`).
 * Zero I/O, zero upward zone imports.
 */

const BYPASS_FILE_REGEX = /@joyzoning-bypass\b(?:\s+([^\n*]*))?/i;
const IGNORE_RULE_REGEX = /@(?:sovereign|joyzoning)-ignore\s+(SPI-\d{3}|[A-Z0-9_-]+)/gi;

/**
 * Strips comments and string literals from code so regex token scans do not match
 * inside comments or documentation strings.
 * Uses a single-pass character scanner for C/JS/TS/Go/Rust style languages so
 * `"//"` inside string literals or `/*` inside strings never corrupts comment stripping.
 * @param {string} source
 * @param {string} extension
 * @returns {string}
 */
export function stripCommentsAndStrings(source, extension) {
  if (!source) return "";
  const ext = (extension || "").toLowerCase();
  if (ext === ".md" || ext === ".html" || ext === ".xml") {
    return "";
  }
  if (ext === ".py" || ext === ".sh" || ext === ".rb" || ext === ".yaml" || ext === ".yml") {
    return source
      .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '""')
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(#.*$)/gm, (m, comment) =>
        comment ? "" : '""'
      );
  }
  return scanCodeTokens(source, { preserveImportStrings: false });
}

/**
 * Single-pass lexical sanitizer for C/JS/TS/Go/Rust syntax.
 * Replaces comments with whitespace (preserving newlines) and either replaces string/template
 * literals with `""` (`preserveImportStrings: false`) or preserves single/double-quoted
 * string literals while blanking out template literals and comments (`preserveImportStrings: true`).
 * @param {string} source
 * @param {{ preserveImportStrings: boolean }} options
 * @returns {string}
 */
export function scanCodeTokens(source, { preserveImportStrings = false } = {}) {
  const len = source.length;
  let out = "";
  let i = 0;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    // 1. Line comment //
    if (ch === "/" && next === "/") {
      i += 2;
      while (i < len && source[i] !== "\n") {
        i += 1;
      }
      continue;
    }

    // 2. Block comment /* ... */
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < len && !(source[i] === "*" && source[i + 1] === "/")) {
        if (source[i] === "\n") out += "\n";
        i += 1;
      }
      if (i < len) i += 2;
      continue;
    }

    // 3. Single or double quoted string literal
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let raw = quote;
      let newlines = "";
      i += 1;
      while (i < len && source[i] !== quote) {
        if (source[i] === "\\") {
          raw += source[i] + (source[i + 1] || "");
          if (source[i + 1] === "\n") newlines += "\n";
          i += 2;
          continue;
        }
        if (source[i] === "\n") newlines += "\n";
        raw += source[i];
        i += 1;
      }
      if (i < len) {
        raw += quote;
        i += 1;
      }
      out += preserveImportStrings ? raw : `""${newlines}`;
      continue;
    }

    // 4. Template literal `...` (with support for nested `${...}` expressions)
    if (ch === "`") {
      let newlines = "";
      i += 1;
      let exprDepth = 0;
      while (i < len) {
        if (source[i] === "\\") {
          if (source[i + 1] === "\n") newlines += "\n";
          i += 2;
          continue;
        }
        if (source[i] === "\n") {
          newlines += "\n";
        }
        if (exprDepth === 0 && source[i] === "`") {
          i += 1;
          break;
        }
        if (source[i] === "$" && source[i + 1] === "{") {
          exprDepth += 1;
          i += 2;
          continue;
        }
        if (exprDepth > 0 && source[i] === "{") {
          exprDepth += 1;
        } else if (exprDepth > 0 && source[i] === "}") {
          exprDepth -= 1;
        }
        i += 1;
      }
      out += `""${newlines}`;
      continue;
    }

    // 5. Regex literal `/.../[gimsuy]*`
    if (ch === "/" && next !== "/" && next !== "*") {
      const prevNonSpace = out.trimEnd().slice(-1);
      const canStartRegex =
        !prevNonSpace ||
        "=(,[!:?&|;{+-*%^~<>".includes(prevNonSpace) ||
        /\b(?:return|case|throw|typeof|void|delete|await|yield)$/.test(out.trimEnd());
      if (canStartRegex) {
        let j = i + 1;
        let inCharClass = false;
        let validRegex = false;
        while (j < len && source[j] !== "\n") {
          if (source[j] === "\\") {
            j += 2;
            continue;
          }
          if (source[j] === "[") {
            inCharClass = true;
          } else if (source[j] === "]") {
            inCharClass = false;
          } else if (source[j] === "/" && !inCharClass) {
            validRegex = true;
            j += 1;
            while (j < len && /[a-z]/i.test(source[j])) j += 1;
            break;
          }
          j += 1;
        }
        if (validRegex) {
          out += '""';
          i = j;
          continue;
        }
      }
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * Extracts bypass directives (`@joyzoning-bypass` and `@sovereign-ignore <CODE>`) from comment lines only.
 * @param {string} source
 * @returns {{ hasFileBypass: boolean, bypassReason: string|null, ignoredRules: string[] }}
 */
export function extractBypassDirectives(source) {
  if (typeof source !== "string" || source.length === 0) {
    return { hasFileBypass: false, bypassReason: null, ignoredRules: [] };
  }
  const commentBlocks = [
    ...(source.match(/\/\*[\s\S]*?\*\//g) || []),
    ...(source.match(/^\s*(?:\/\/|#|--|<!--).*$/gm) || []),
    ...(source.match(/(?:^|\s)\/\/\s*@(?:joyzoning-bypass|sovereign-ignore|joyzoning-ignore).*$/gm) || []),
    ...(source.match(/(?:^|\s)#\s*@(?:joyzoning-bypass|sovereign-ignore|joyzoning-ignore).*$/gm) || [])
  ].join("\n");

  const fileMatch = commentBlocks.match(BYPASS_FILE_REGEX);
  const hasFileBypass = Boolean(fileMatch);
  const bypassReason = fileMatch && fileMatch[1] ? fileMatch[1].trim() : null;

  const ignoredSet = new Set();
  for (const match of commentBlocks.matchAll(IGNORE_RULE_REGEX)) {
    if (match[1]) {
      ignoredSet.add(match[1].toUpperCase());
    }
  }
  return {
    hasFileBypass,
    bypassReason,
    ignoredRules: Array.from(ignoredSet)
  };
}

