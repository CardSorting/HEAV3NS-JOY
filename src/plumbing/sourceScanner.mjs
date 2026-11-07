/** [LAYER: PLUMBING] */
/**
 * Stateless polyglot source code scanner for imports, exports, logic density,
 * cognitive complexity, security anti-patterns, and bypass directives.
 * Zero I/O, zero upward zone imports.
 */

import {
  stripCommentsAndStrings,
  scanCodeTokens,
  extractBypassDirectives
} from "./codeTokenizer.mjs";

export { stripCommentsAndStrings, scanCodeTokens, extractBypassDirectives };

/**
 * Extracts import records across JS/TS, Python, Go, and Rust files.
 * Supports static `import ... from`, side-effect `import "..."`, barrel re-exports
 * `export * from` / `export { ... } from`, `require(...)`, and dynamic `import(...)`.
 * @param {string} source
 * @param {string} extension
 * @returns {Array<{ specifier: string, isTypeOnly: boolean, isReExport?: boolean, symbols: string[], line: number }>}
 */
export function extractImports(source, extension) {
  if (typeof source !== "string" || source.length === 0) return [];
  const ext = (extension || "").toLowerCase();
  if (ext === ".md" || ext === ".html" || ext === ".sql" || ext === ".yaml" || ext === ".yml") {
    return [];
  }

  const imports = [];
  const lines = source.split(/\r?\n/);

  if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    const cleanSource = scanCodeTokens(source, { preserveImportStrings: true });
    // Extract static imports & barrel re-exports (`import ... from "..."`, `import "..."`, `export ... from "..."`)
    const stmtRegex =
      /(?:^|[\n;])\s*(import|export)\s+(type\s+)?(?:(\*\s+as\s+[A-Za-z0-9_$]+|\*|\{[^{}]*\}|[A-Za-z0-9_$]+(?:\s*,\s*\{[^{}]*\})?)\s+from\s+)?["']([^"']+)["']/g;
    for (const match of cleanSource.matchAll(stmtRegex)) {
      const offset = match.index || 0;
      const line = cleanSource.slice(0, offset).split("\n").length;
      const keyword = match[1];
      const isReExport = keyword === "export";
      const clause = (match[3] || "").trim();
      if (isReExport && !clause) {
        continue;
      }
      let isTypeOnly = Boolean(match[2]);
      const specifier = match[4];
      const symbols = [];
      const localIdentifiers = [];

      if (clause === "*") {
        symbols.push("*");
      } else if (clause.startsWith("* as ")) {
        symbols.push("*");
        const nsIdent = clause.slice(5).trim();
        if (nsIdent && !isReExport) localIdentifiers.push(nsIdent);
      } else {
        const namedMatch = clause.match(/\{([^}]+)\}/);
        if (namedMatch) {
          const rawElements = namedMatch[1]
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          let allElementsTypeOnly = rawElements.length > 0;
          for (const rawSym of rawElements) {
            const isElementType = /^type\s+/.test(rawSym);
            if (!isElementType) {
              allElementsTypeOnly = false;
            }
            const withoutType = rawSym.replace(/^type\s+/, "").trim();
            const parts = withoutType.split(/\s+as\s+/);
            const importedName = parts[0].trim();
            const localName = (parts[1] || parts[0]).trim();
            if (importedName) symbols.push(importedName);
            if (localName && !isReExport && !isElementType && !isTypeOnly) {
              localIdentifiers.push(localName);
            }
          }
          const beforeBrace = clause.slice(0, clause.indexOf("{")).replace(/,/g, "").trim();
          if (beforeBrace) {
            symbols.push("default");
            if (!isReExport && !isTypeOnly) localIdentifiers.push(beforeBrace);
            allElementsTypeOnly = false;
          }
          if (!isTypeOnly && allElementsTypeOnly) {
            isTypeOnly = true;
          }
        } else if (clause) {
          const localDefault = clause.split(/\s+as\s+/)[0].trim();
          symbols.push(isReExport ? localDefault : "default");
          if (localDefault && !isReExport && !isTypeOnly) {
            localIdentifiers.push(localDefault);
          }
        }
      }

      imports.push({ specifier, isTypeOnly, isReExport, symbols, localIdentifiers, line });
    }

    // Extract dynamic `import("...")` and CommonJS `require("...")`
    const callRegex = /\b(?:require|import)\s*\(\s*["']([^"']+)["']\s*\)/g;
    for (const match of cleanSource.matchAll(callRegex)) {
      const offset = match.index || 0;
      const line = cleanSource.slice(0, offset).split("\n").length;
      imports.push({
        specifier: match[1],
        isTypeOnly: false,
        isReExport: false,
        symbols: ["*"],
        localIdentifiers: [],
        line
      });
    }
    return imports;
  }

  if (ext === ".py") {
    let inTypeCheckingIndent = -1;
    for (let idx = 0; idx < lines.length; idx += 1) {
      const rawLine = lines[idx];
      const lineWithoutComment = rawLine.replace(/(["'])(?:\\.|(?!\1).)*\1|(#.*$)/g, (m, q, comment) =>
        comment ? "" : m
      );
      const trimmed = lineWithoutComment.trim();
      if (!trimmed) continue;

      const indent = rawLine.match(/^\s*/)[0].length;
      if (inTypeCheckingIndent >= 0 && indent <= inTypeCheckingIndent) {
        inTypeCheckingIndent = -1;
      }
      if (/^if\s+(?:typing\.)?TYPE_CHECKING\s*:/.test(trimmed)) {
        inTypeCheckingIndent = indent;
        continue;
      }
      const isTypeOnly = inTypeCheckingIndent >= 0;

      // Support multi-line parenthesized `from ... import (\n  ...\n)`
      let combinedLine = trimmed;
      const startLineNum = idx + 1;
      if (/^from\s+[A-Za-z0-9_.]+\s+import\s*\(/.test(combinedLine) && !combinedLine.includes(")")) {
        while (idx + 1 < lines.length && !combinedLine.includes(")")) {
          idx += 1;
          const nextClean = lines[idx]
            .replace(/(["'])(?:\\.|(?!\1).)*\1|(#.*$)/g, (m, q, comment) => (comment ? "" : m))
            .trim();
          combinedLine += ` ${nextClean}`;
        }
      }

      const fromMatch = combinedLine.match(/^from\s+([A-Za-z0-9_.]+)\s+import\s+\(?([^)]+)\)?$/);
      if (fromMatch) {
        const rawSpec = fromMatch[1];
        let spec = rawSpec;
        if (rawSpec.startsWith(".")) {
          const leadingDotsMatch = rawSpec.match(/^(\.+)(.*)$/);
          if (leadingDotsMatch) {
            const dots = leadingDotsMatch[1];
            const rest = leadingDotsMatch[2].replace(/\./g, "/");
            const prefix = dots.length === 1 ? "./" : "../".repeat(dots.length - 1);
            spec = `${prefix}${rest}`;
          }
        }
        const symbols = fromMatch[2]
          .split(",")
          .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
          .filter(Boolean);
        imports.push({ specifier: spec, isTypeOnly, isReExport: false, symbols, line: startLineNum });
        continue;
      }
      const directMatch = combinedLine.match(/^import\s+([A-Za-z0-9_.,\s]+)$/);
      if (directMatch) {
        for (const mod of directMatch[1].split(",")) {
          const name = mod.trim().split(/\s+as\s+/)[0].trim();
          if (name) {
            imports.push({ specifier: name, isTypeOnly, isReExport: false, symbols: [], line: startLineNum });
          }
        }
      }
    }
    return imports;
  }

  if (ext === ".go") {
    const goImportBlock = /import\s*\(([\s\S]*?)\)|import\s+(?:[A-Za-z0-9_.]+\s+)?["']([^"']+)["']/g;
    for (const match of source.matchAll(goImportBlock)) {
      const offset = match.index || 0;
      const baseLine = source.slice(0, offset).split("\n").length;
      if (match[2]) {
        imports.push({ specifier: match[2], isTypeOnly: false, isReExport: false, symbols: [], line: baseLine });
      } else if (match[1]) {
        const blockLines = match[1].split(/\r?\n/);
        blockLines.forEach((bLine, idx) => {
          const strMatch = bLine.replace(/\/\/.*$/, "").match(/["']([^"']+)["']/);
          if (strMatch) {
            imports.push({
              specifier: strMatch[1],
              isTypeOnly: false,
              isReExport: false,
              symbols: [],
              line: baseLine + idx
            });
          }
        });
      }
    }
    return imports;
  }

  if (ext === ".rs") {
    lines.forEach((rawLine, idx) => {
      const lineText = rawLine.replace(/\/\/.*$/, "").trim();
      const useMatch = lineText.match(/^(?:pub\s+)?use\s+([^;]+);/);
      if (useMatch) {
        const isReExport = /^pub\s+use\s+/.test(lineText);
        const rawPath = useMatch[1].trim();
        const braceIdx = rawPath.indexOf("::{");
        if (braceIdx !== -1 && rawPath.endsWith("}")) {
          const baseSpec = rawPath.slice(0, braceIdx);
          const symbols = rawPath
            .slice(braceIdx + 3, -1)
            .split(",")
            .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
            .filter(Boolean);
          imports.push({ specifier: baseSpec, isTypeOnly: false, isReExport, symbols, line: idx + 1 });
        } else {
          const lastSep = rawPath.lastIndexOf("::");
          const sym = lastSep !== -1 ? rawPath.slice(lastSep + 2).split(/\s+as\s+/)[0].trim() : "";
          imports.push({
            specifier: rawPath,
            isTypeOnly: false,
            isReExport,
            symbols: sym && sym !== "*" ? [sym] : ["*"],
            line: idx + 1
          });
        }
      }
    });
    return imports;
  }

  if (ext === ".java" || ext === ".kt" || ext === ".kts" || ext === ".scala" || ext === ".groovy") {
    lines.forEach((rawLine, idx) => {
      const lineText = rawLine.replace(/\/\/.*$/, "").trim();
      const impMatch = lineText.match(/^import\s+(?:static\s+)?([A-Za-z0-9_.*]+)\s*;?/);
      if (impMatch) {
        imports.push({ specifier: impMatch[1], isTypeOnly: false, isReExport: false, symbols: [], line: idx + 1 });
      }
    });
    return imports;
  }

  if (ext === ".cs") {
    lines.forEach((rawLine, idx) => {
      const lineText = rawLine.replace(/\/\/.*$/, "").trim();
      const usingMatch = lineText.match(/^using\s+(?:static\s+)?([A-Za-z0-9_.]+)\s*;/);
      if (usingMatch) {
        imports.push({ specifier: usingMatch[1], isTypeOnly: false, isReExport: false, symbols: [], line: idx + 1 });
      }
    });
    return imports;
  }

  return imports;
}

/**
 * Extracts exported symbols and counts abstract vs concrete exports.
 * @param {string} source
 * @param {string} extension
 * @returns {{ exportedSymbols: string[], abstractExportCount: number, totalExportCount: number, classCount: number }}
 */
export function extractExportsAndClasses(source, extension) {
  const ext = (extension || "").toLowerCase();
  const clean = stripCommentsAndStrings(source, ext);
  if (!clean) {
    return {
      exportedSymbols: [],
      exportedClasses: [],
      hasStarReExport: false,
      abstractExportCount: 0,
      totalExportCount: 0,
      classCount: 0
    };
  }

  const exportedSymbols = [];
  const exportedClasses = [];
  let abstractExportCount = 0;

  if (ext === ".py") {
    for (const rawLine of clean.split(/\r?\n/)) {
      if (!/^[A-Za-z_]/.test(rawLine)) continue;
      const classMatch = rawLine.match(/^class\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?\s*:/);
      if (classMatch && !classMatch[1].startsWith("_")) {
        exportedSymbols.push(classMatch[1]);
        const bases = classMatch[2] || "";
        if (/\b(?:Protocol|ABC|ABCMeta)\b/.test(bases)) {
          abstractExportCount += 1;
        } else {
          exportedClasses.push(classMatch[1]);
        }
        continue;
      }
      const defMatch = rawLine.match(/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/);
      if (defMatch && !defMatch[1].startsWith("_")) {
        exportedSymbols.push(defMatch[1]);
      }
    }
    const classMatches = clean.match(/^\s*class\s+[A-Za-z0-9_]+/gm) || [];
    return {
      exportedSymbols,
      exportedClasses,
      hasStarReExport: false,
      abstractExportCount,
      totalExportCount: exportedSymbols.length,
      classCount: classMatches.length
    };
  }

  if (ext === ".go") {
    for (const m of clean.matchAll(/\btype\s+([A-Z][A-Za-z0-9_]*)\s+(interface|struct)\b/g)) {
      exportedSymbols.push(m[1]);
      if (m[2] === "interface") {
        abstractExportCount += 1;
      } else {
        exportedClasses.push(m[1]);
      }
    }
    for (const m of clean.matchAll(/\bfunc\s+(?:\([^)]+\)\s*)?([A-Z][A-Za-z0-9_]*)\s*\(/g)) {
      if (!exportedSymbols.includes(m[1])) exportedSymbols.push(m[1]);
    }
    const structMatches = clean.match(/\btype\s+[A-Za-z0-9_]+\s+struct\b/g) || [];
    return {
      exportedSymbols,
      exportedClasses,
      hasStarReExport: false,
      abstractExportCount,
      totalExportCount: exportedSymbols.length,
      classCount: structMatches.length
    };
  }

  if (ext === ".rs") {
    for (const m of clean.matchAll(/\bpub\s+(trait|struct|enum|fn|type|const)\s+([A-Za-z0-9_]+)/g)) {
      const kind = m[1];
      const name = m[2];
      if (!exportedSymbols.includes(name)) {
        exportedSymbols.push(name);
        if (kind === "trait" || kind === "type") {
          abstractExportCount += 1;
        } else if (kind === "struct") {
          exportedClasses.push(name);
        }
      }
    }
    const structMatches = clean.match(/\bstruct\s+[A-Za-z0-9_]+/g) || [];
    return {
      exportedSymbols,
      exportedClasses,
      hasStarReExport: /\bpub\s+use\s+[^;]*::\*/.test(clean),
      abstractExportCount,
      totalExportCount: exportedSymbols.length,
      classCount: structMatches.length
    };
  }

  const abstractMatches = clean.matchAll(
    /\bexport\s+(?:interface|type|abstract\s+class)\s+([A-Za-z0-9_$]+)/g
  );
  for (const m of abstractMatches) {
    if (!exportedSymbols.includes(m[1])) {
      exportedSymbols.push(m[1]);
      abstractExportCount += 1;
    }
  }

  const concreteMatches = clean.matchAll(
    /\bexport\s+(?:default\s+)?(?:async\s+)?(function|class|const|let|var|enum)\s+([A-Za-z0-9_$]+)/g
  );
  for (const m of concreteMatches) {
    const kind = m[1];
    const sym = m[2];
    if (!exportedSymbols.includes(sym)) {
      exportedSymbols.push(sym);
    }
    if (kind === "class" && !exportedClasses.includes(sym)) {
      exportedClasses.push(sym);
    }
  }

  // Destructured object/array exports (`export const { a, b: aliasB = 1 } = ...` or `export const [x, y] = ...`)
  for (const m of clean.matchAll(/\bexport\s+(?:const|let|var)\s+(\{[^}]+\}|\[[^\]]+\])\s*=/g)) {
    const inner = m[1].slice(1, -1);
    for (const part of inner.split(",")) {
      const noDefault = part.split("=")[0].trim();
      if (!noDefault || noDefault.startsWith("...")) {
        const restIdent = noDefault.replace(/^\.\.\.\s*/, "").trim();
        if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(restIdent) && !exportedSymbols.includes(restIdent)) {
          exportedSymbols.push(restIdent);
        }
        continue;
      }
      const colonParts = noDefault.split(":");
      const boundIdent = (colonParts[1] || colonParts[0]).trim();
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(boundIdent) && !exportedSymbols.includes(boundIdent)) {
        exportedSymbols.push(boundIdent);
      }
    }
  }

  for (const m of clean.matchAll(/\bexport\s+\*\s+as\s+([A-Za-z0-9_$]+)\s+from\b/g)) {
    if (!exportedSymbols.includes(m[1])) {
      exportedSymbols.push(m[1]);
    }
  }

  for (const m of clean.matchAll(/\bexport\s+(?:type\s+)?\{([^}]+)\}/g)) {
    const isTypeExport = /\bexport\s+type\s+\{/.test(m[0]);
    for (const part of m[1].split(",")) {
      const cleaned = part.trim();
      if (!cleaned) continue;
      const isPartType = isTypeExport || /^type\s+/.test(cleaned);
      const withoutType = cleaned.replace(/^type\s+/, "").trim();
      const aliasParts = withoutType.split(/\s+as\s+/);
      const exportedName = (aliasParts[1] || aliasParts[0]).trim();
      if (exportedName && !exportedSymbols.includes(exportedName)) {
        exportedSymbols.push(exportedName);
        if (isPartType) abstractExportCount += 1;
      }
    }
  }

  if (/\bexport\s+default\b/.test(clean) && !exportedSymbols.includes("default")) {
    exportedSymbols.push("default");
  }
  const hasStarReExport = /\bexport\s+\*\s+(?:as\s+[A-Za-z0-9_$]+\s+)?from\b/.test(clean);

  const classMatches = clean.match(/\bclass\s+[A-Za-z0-9_$]+/g) || [];

  return {
    exportedSymbols,
    exportedClasses,
    hasStarReExport,
    abstractExportCount,
    totalExportCount: exportedSymbols.length,
    classCount: classMatches.length
  };
}

/**
 * Computes AST-approximated Logic Density, Cognitive Complexity, and structural code smells.
 * @param {string} source
 * @param {string} extension
 * @returns {{
 *   lineCount: number,
 *   logicDensity: number,
 *   cognitiveComplexity: number,
 *   hasMutableTopLevelState: boolean,
 *   securityViolations: Array<{ code: string, message: string }>,
 *   hasAsymmetricLifecycle: boolean
 * }}
 */
export function analyzeCodeMetrics(source, extension) {
  const lines = typeof source === "string" ? source.split(/\r?\n/) : [];
  const lineCount = lines.length;
  const clean = stripCommentsAndStrings(source, extension);

  if (!clean) {
    return {
      lineCount,
      logicDensity: 0,
      cognitiveComplexity: 0,
      hasMutableTopLevelState: false,
      securityViolations: [],
      hasAsymmetricLifecycle: false
    };
  }

  const logicTokens =
    clean.match(/\b(?:if|else\s+if|for|while|switch|case|catch)\b|\?[^?:]+:/g) || [];
  const statementTokens = clean.split(/[;\n]/).map((s) => s.trim()).filter(Boolean);
  const totalStatements = Math.max(1, statementTokens.length);
  const logicDensity = Number(Math.min(1, logicTokens.length / totalStatements).toFixed(4));

  // Cognitive complexity with nesting estimation
  let nesting = 0;
  let cognitiveComplexity = 0;
  for (const rawLine of clean.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (/^(?:if|else\s+if|for|while|switch|catch)\b/.test(trimmed)) {
      cognitiveComplexity += 1 + Math.max(0, nesting);
    }
    const opens = (trimmed.match(/\{/g) || []).length;
    const closes = (trimmed.match(/\}/g) || []).length;
    nesting = Math.max(0, nesting + opens - closes);
  }

  // Detect mutable top-level let/var (braceDepth === 0 and parenDepth === 0)
  let braceDepth = 0;
  let parenDepth = 0;
  let hasMutableTopLevelState = false;
  const topLevelMutableBindings = [];
  const cleanLines = clean.split(/\r?\n/);

  for (let idx = 0; idx < cleanLines.length; idx += 1) {
    const rawLine = cleanLines[idx];
    const trimmed = rawLine.trim();
    if (braceDepth === 0 && parenDepth === 0) {
      const declMatch = trimmed.match(/^(?:export\s+)?(let|var)\s+([A-Za-z0-9_$]+)\b/);
      if (declMatch) {
        hasMutableTopLevelState = true;
        topLevelMutableBindings.push({
          keyword: declMatch[1],
          identifier: declMatch[2],
          line: idx + 1,
          hasInitializer: /=[^=]/.test(trimmed)
        });
      }
    }
    braceDepth += (trimmed.match(/\{/g) || []).length;
    braceDepth = Math.max(0, braceDepth - (trimmed.match(/\}/g) || []).length);
    parenDepth += (trimmed.match(/\(/g) || []).length;
    parenDepth = Math.max(0, parenDepth - (trimmed.match(/\)/g) || []).length);
  }

  // Determine which top-level let/var bindings are never reassigned in the module
  const healableMutableBindings = topLevelMutableBindings.filter((binding) => {
    if (!binding.hasInitializer) return false;
    const id = binding.identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const assignRegex = new RegExp(
      `(?:\\b${id}\\s*(?:\\+\\+|--|[+\\-*/%&|^]?=(?!=)))|(?:(?:\\+\\+|--)\\s*\\b${id}\\b)`,
      "g"
    );
    const matches = clean.match(assignRegex) || [];
    // Exactly 1 match corresponds to the initial declaration `let x = ...`
    return matches.length <= 1;
  });

  // Security anti-patterns (SPI-401..403)
  const securityViolations = [];
  if (/\beval\s*\(|new\s+Function\s*\(/.test(clean)) {
    securityViolations.push({
      code: "SPI-401",
      message: "Dynamic code execution (`eval` or `new Function`) detected."
    });
  }
  if (/\.innerHTML\s*=|\.outerHTML\s*=|document\.write\s*\(/.test(clean)) {
    securityViolations.push({
      code: "SPI-402",
      message: "Direct unsanitized DOM HTML assignment (`innerHTML`/`outerHTML`/`document.write`) detected."
    });
  }
  if (/dangerouslySetInnerHTML/.test(clean) && !/sanitize|DOMPurify/i.test(source)) {
    securityViolations.push({
      code: "SPI-403",
      message: "Unverified `dangerouslySetInnerHTML` without adjacent sanitization detected."
    });
  }

  // Asymmetric lifecycle check (SPI-110)
  const hasInit = /\b(?:init|connect|subscribe)\s*\(/.test(clean);
  const hasDispose = /\b(?:dispose|close|disconnect|unsubscribe|destroy)\s*\(/.test(clean);
  const hasAsymmetricLifecycle = hasInit && !hasDispose && /\bclass\s+/.test(clean);

  return {
    lineCount,
    logicDensity,
    cognitiveComplexity,
    hasMutableTopLevelState,
    topLevelMutableBindings,
    healableMutableBindings,
    securityViolations,
    hasAsymmetricLifecycle
  };
}

/**
 * Safely rewrites un-reassigned top-level `let`/`var` bindings to `const` (SOP 6: HEAL_STATELESSNESS).
 * Pure string transformation; only modifies lines identified as un-reassigned top-level declarations.
 * @param {string} source
 * @param {string} extension
 * @returns {{ updatedSource: string, healedIdentifiers: string[] }}
 */
export function healStatelessnessInSource(source, extension) {
  const metrics = analyzeCodeMetrics(source, extension);
  const healable = metrics.healableMutableBindings || [];
  if (healable.length === 0) {
    return { updatedSource: source, healedIdentifiers: [] };
  }

  const lines = source.split("\n");
  const healedIdentifiers = [];
  for (const item of healable) {
    const lineIdx = item.line - 1;
    if (lineIdx >= 0 && lineIdx < lines.length) {
      const originalLine = lines[lineIdx];
      const updatedLine = originalLine.replace(
        /^(\s*(?:export\s+)?)(?:let|var)(\s+[A-Za-z0-9_$]+\b)/,
        "$1const$2"
      );
      if (updatedLine !== originalLine) {
        lines[lineIdx] = updatedLine;
        healedIdentifiers.push(item.identifier);
      }
    }
  }

  return {
    updatedSource: lines.join("\n"),
    healedIdentifiers
  };
}

/**
 * Extracts public method signatures from a class in JS/TS source for `I<ClassName>` interface synthesis.
 * @param {string} source
 * @param {string} className
 * @returns {Array<{ name: string, params: string, isAsync: boolean }>}
 */
export function extractClassPublicMethods(source, className) {
  const clean = stripCommentsAndStrings(source, ".ts");
  if (!clean || !className) return [];
  const escaped = className.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const classMatch = clean.match(new RegExp(`\\bclass\\s+${escaped}\\b[^{]*\\{`));
  if (!classMatch || typeof classMatch.index !== "number") return [];

  const bodyStart = classMatch.index + classMatch[0].length;
  let depth = 1;
  let idx = bodyStart;
  while (idx < clean.length && depth > 0) {
    if (clean[idx] === "{") depth += 1;
    else if (clean[idx] === "}") depth -= 1;
    idx += 1;
  }
  const classBody = clean.slice(bodyStart, idx - 1);
  const methods = [];
  const reserved = new Set(["constructor", "if", "for", "while", "switch", "catch", "function"]);

  let memberDepth = 0;
  for (const rawLine of classBody.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (memberDepth === 0) {
      const m = trimmed.match(
        /^(?:public\s+)?(async\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/
      );
      if (m && !m[2].startsWith("_") && !reserved.has(m[2])) {
        methods.push({
          name: m[2],
          params: m[3].trim(),
          isAsync: Boolean(m[1])
        });
      }
    }
    memberDepth += (trimmed.match(/\{/g) || []).length;
    memberDepth = Math.max(0, memberDepth - (trimmed.match(/\}/g) || []).length);
  }
  return methods;
}


