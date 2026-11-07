/** [LAYER: PLUMBING] */
/**
 * Stateless path manipulation and relative depth primitives.
 * Zero external dependencies, zero I/O, zero upward zone imports.
 */

/**
 * Normalizes any Windows or POSIX path string to forward slashes without trailing slash.
 * @param {string} rawPath
 * @returns {string}
 */
export function normalizeSlashes(rawPath) {
  if (typeof rawPath !== "string" || rawPath.length === 0) {
    return "";
  }
  const unified = rawPath.replace(/\\/g, "/");
  if (unified.length > 1 && unified.endsWith("/")) {
    return unified.slice(0, -1);
  }
  return unified;
}

/**
 * Computes directory nesting depth of a project-relative file path.
 * Example: "src/domain/Order.js" -> directory depth is 2 ("src", "domain").
 * @param {string} relativeFilePath
 * @returns {number}
 */
export function computeDirectoryDepth(relativeFilePath) {
  const clean = normalizeSlashes(relativeFilePath).replace(/^\.\//, "");
  if (!clean) return 0;
  const segments = clean.split("/").filter(Boolean);
  return Math.max(0, segments.length - 1);
}

/**
 * Counts how many parent directory traversals (`../`) appear at the start of an import specifier.
 * Example: "../../../domain/Order.js" -> 3
 * @param {string} importSpecifier
 * @returns {number}
 */
export function countParentTraversals(importSpecifier) {
  if (typeof importSpecifier !== "string" || !importSpecifier.startsWith(".")) {
    return 0;
  }
  const clean = normalizeSlashes(importSpecifier);
  const parts = clean.split("/");
  let count = 0;
  for (const part of parts) {
    if (part === "..") {
      count += 1;
    } else if (part === ".") {
      continue;
    } else {
      break;
    }
  }
  return count;
}

/**
 * Extracts the lowercase file extension (including leading dot) or basename for extensionless files.
 * @param {string} filePath
 * @returns {string}
 */
export function getFileExtension(filePath) {
  const clean = normalizeSlashes(filePath);
  const base = clean.split("/").pop() || "";
  const lowerBase = base.toLowerCase();
  if (lowerBase === "dockerfile" || lowerBase === "containerfile") {
    return ".dockerfile";
  }
  if (lowerBase === "makefile" || lowerBase === "justfile") {
    return ".makefile";
  }
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) {
    return "";
  }
  return base.slice(dotIndex).toLowerCase();
}

/**
 * Checks if a file is a TypeScript declaration file (`*.d.ts` or `*.d.mts`).
 * @param {string} filePath
 * @returns {boolean}
 */
export function isDeclarationFile(filePath) {
  const clean = normalizeSlashes(filePath).toLowerCase();
  return clean.endsWith(".d.ts") || clean.endsWith(".d.mts") || clean.endsWith(".d.cts");
}

/**
 * Resolves a POSIX relative import path against a source file's project-relative path.
 * Pure string math; does not touch the filesystem.
 * @param {string} importerRelativePath
 * @param {string} specifier
 * @returns {string}
 */
export function resolveRelativeSpecifier(importerRelativePath, specifier) {
  const cleanImporter = normalizeSlashes(importerRelativePath);
  const importerSegments = cleanImporter.split("/").filter(Boolean);
  importerSegments.pop(); // remove filename

  const specSegments = normalizeSlashes(specifier).split("/").filter(Boolean);
  const stack = [...importerSegments];

  for (const seg of specSegments) {
    if (seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0) stack.pop();
    } else {
      stack.push(seg);
    }
  }
  return stack.join("/");
}

/**
 * Computes a normalized POSIX relative import specifier from `fromFilePath` to `toFilePath`.
 * Always starts with `./` or `../`.
 * Pure string math; does not touch the filesystem.
 * @param {string} fromFilePath
 * @param {string} toFilePath
 * @returns {string}
 */
export function computeRelativeImportSpecifier(fromFilePath, toFilePath) {
  const fromDir = normalizeSlashes(fromFilePath)
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);
  fromDir.pop(); // remove filename

  const toSegments = normalizeSlashes(toFilePath)
    .replace(/^\.\//, "")
    .split("/")
    .filter(Boolean);

  let common = 0;
  while (
    common < fromDir.length &&
    common < toSegments.length - 1 &&
    fromDir[common] === toSegments[common]
  ) {
    common += 1;
  }

  const upCount = fromDir.length - common;
  const downSegments = toSegments.slice(common);
  if (upCount === 0) {
    return `./${downSegments.join("/")}`;
  }
  return `${"../".repeat(upCount)}${downSegments.join("/")}`;
}

/**
 * Computes the Levenshtein edit distance between two strings for fuzzy symbol matching.
 * Pure algorithm, zero allocations beyond two row arrays.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b ? b.length : 0;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }
  return prev[n];
}

/**
 * Resolves a local, path-aliased, or polyglot (`crate::`, `super::`, Go module) import specifier
 * against a known Map or Set of workspace file paths.
 * Pure string/map lookup; zero I/O.
 * @param {string} importerPath
 * @param {string} specifier
 * @param {Map<string, any>|Set<string>} fileMap
 * @param {Record<string, string>} [customAliases]
 * @param {string} [goModulePrefix]
 * @returns {string|null}
 */
export function resolveWorkspaceImportTarget(
  importerPath,
  specifier,
  fileMap,
  customAliases = {},
  goModulePrefix = ""
) {
  let candidateBase = null;
  if (specifier.startsWith(".")) {
    candidateBase = resolveRelativeSpecifier(importerPath, specifier);
  } else if (
    specifier.startsWith("crate::") ||
    specifier.startsWith("super::") ||
    specifier.startsWith("self::")
  ) {
    const cleanRust = specifier.replace(/::\*$/, "");
    const parts = cleanRust.split("::");
    const lastSegment = parts[parts.length - 1] || "";
    const stripLastSymbol = parts.length > 2 && /^[A-Z]/.test(lastSegment);
    const candidatePartLists = [parts];
    if (stripLastSymbol) {
      candidatePartLists.unshift(parts.slice(0, -1));
    } else if (parts.length > 2) {
      candidatePartLists.push(parts.slice(0, -1));
    }

    const buildRustCandidate = (moduleParts) => {
      if (moduleParts[0] === "crate") {
        const importerRoot = importerPath.startsWith("src/") ? "src" : "";
        const relRust = moduleParts.slice(1).join("/");
        return importerRoot ? `${importerRoot}/${relRust}` : relRust;
      }
      if (moduleParts[0] === "super") {
        let supers = 0;
        while (moduleParts[supers] === "super") supers += 1;
        const relSpec = `${"../".repeat(supers)}${moduleParts.slice(supers).join("/")}`;
        return resolveRelativeSpecifier(importerPath, relSpec);
      }
      if (moduleParts[0] === "self") {
        const relSpec = `./${moduleParts.slice(1).join("/")}`;
        return resolveRelativeSpecifier(importerPath, relSpec);
      }
      return null;
    };

    for (const partList of candidatePartLists) {
      const base = buildRustCandidate(partList);
      if (base && (fileMap.has(`${base}.rs`) || fileMap.has(`${base}/mod.rs`) || fileMap.has(base))) {
        candidateBase = base;
        break;
      }
    }
    if (!candidateBase) {
      candidateBase = buildRustCandidate(candidatePartLists[0]);
    }
  } else if (
    goModulePrefix &&
    (specifier === goModulePrefix || specifier.startsWith(`${goModulePrefix}/`))
  ) {
    const relPkgDir = specifier.slice(goModulePrefix.length).replace(/^\/+/, "");
    for (const fileKey of fileMap.keys()) {
      if (fileKey.endsWith(".go") && fileKey !== importerPath) {
        const dir = fileKey.includes("/") ? fileKey.slice(0, fileKey.lastIndexOf("/")) : "";
        if (dir === relPkgDir) {
          return fileKey;
        }
      }
    }
  } else if (customAliases && typeof customAliases === "object") {
    for (const [aliasPrefix, targetPrefix] of Object.entries(customAliases)) {
      if (specifier === aliasPrefix) {
        candidateBase = targetPrefix;
        break;
      }
      if (specifier.startsWith(`${aliasPrefix}/`)) {
        candidateBase = `${targetPrefix}/${specifier.slice(aliasPrefix.length + 1)}`;
        break;
      }
    }
  }

  if (!candidateBase) {
    if (specifier.startsWith("@/") || specifier.startsWith("#/")) {
      candidateBase = `src/${specifier.slice(2)}`;
    } else if (specifier.startsWith("@domain/") || specifier.startsWith("#domain/")) {
      candidateBase = `src/domain/${specifier.replace(/^[@#]domain\//, "")}`;
    } else if (specifier.startsWith("@core/") || specifier.startsWith("#core/")) {
      candidateBase = `src/core/${specifier.replace(/^[@#]core\//, "")}`;
    } else if (
      specifier.startsWith("@infrastructure/") ||
      specifier.startsWith("#infrastructure/")
    ) {
      candidateBase = `src/infrastructure/${specifier.replace(/^[@#]infrastructure\//, "")}`;
    } else if (
      specifier.startsWith("@plumbing/") ||
      specifier.startsWith("@utils/") ||
      specifier.startsWith("#plumbing/") ||
      specifier.startsWith("#utils/")
    ) {
      const rest = specifier.replace(/^[@#](?:plumbing|utils)\//, "");
      candidateBase = `src/plumbing/${rest}`;
    } else if (specifier.startsWith("@ui/") || specifier.startsWith("#ui/")) {
      candidateBase = `src/ui/${specifier.replace(/^[@#]ui\//, "")}`;
    } else {
      return null;
    }
  }

  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.tsx`,
    `${candidateBase}.mts`,
    `${candidateBase}.cts`,
    `${candidateBase}.mjs`,
    `${candidateBase}.js`,
    `${candidateBase}.py`,
    `${candidateBase}.go`,
    `${candidateBase}.rs`,
    `${candidateBase}/index.ts`,
    `${candidateBase}/index.mjs`,
    `${candidateBase}/index.js`,
    `${candidateBase}/__init__.py`,
    `${candidateBase}/mod.rs`
  ];

  if (candidateBase.endsWith(".js") || candidateBase.endsWith(".mjs")) {
    const extLen = candidateBase.endsWith(".mjs") ? 4 : 3;
    const stem = candidateBase.slice(0, -extLen);
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mjs`, `${stem}.js`);
  }

  for (const c of candidates) {
    if (fileMap.has(c)) {
      return c;
    }
  }
  return null;
}



