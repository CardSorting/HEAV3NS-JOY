/** [LAYER: INFRASTRUCTURE] */
/**
 * Concrete filesystem adapter implementing `IWorkspaceScanner` from `src/domain/interfaces/IWorkspaceScanner.mjs`.
 * Handles directory traversal, exemption filtering, config loading (`stability.config.json` / `spider.spec.json`),
 * and bounded Tier-1 file caching (JoyRide).
 */

import { AGENT_CONFIG_EXCLUDES } from "../plumbing/agentConfigPaths.mjs";
import fs from "node:fs";
import path from "node:path";
import { IWorkspaceScanner } from "../domain/interfaces/IWorkspaceScanner.mjs";
import {
  normalizeSlashes,
  getFileExtension,
  isDeclarationFile
} from "../plumbing/pathUtils.mjs";
import { isSupportedSourceExtension, normalizeResourceZone } from "../plumbing/commentStyles.mjs";

const EXEMPT_FILENAMES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "tsconfig.json",
  "jsconfig.json",
  "cargo.toml",
  "cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "requirements.txt",
  ".gitignore",
  ".prettierrc",
  "biome.json",
  "stability.config.json",
  "spider.spec.json"
]);

const DEFAULT_IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".turbo",
  "__pycache__",
  "target"
]);

export class NodeWorkspaceScanner extends IWorkspaceScanner {
  constructor() {
    super();
    /** @type {Map<string, { mtimeMs: number, content: string }>} */
    this.fileCache = new Map();
  }

  /**
   * Loads `stability.config.json` and/or `spider.spec.json` from the target root directory,
   * merging them with default settings.
   * @param {string} rootDir
   * @param {Object} baseDefaults
   * @returns {Object}
   */
  loadConfig(rootDir, baseDefaults = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const merged = structuredClone(baseDefaults);

    const stabilityPath = path.join(resolvedRoot, "stability.config.json");
    if (fs.existsSync(stabilityPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(stabilityPath, "utf8"));
        this.#mergeConfig(merged, raw);
      } catch {
        // Malformed JSON config falls back safely to defaults
      }
    }

    const spiderSpecPath = path.join(resolvedRoot, "spider.spec.json");
    if (fs.existsSync(spiderSpecPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(spiderSpecPath, "utf8"));
        this.#mergeConfig(merged, raw);
      } catch {
        // Malformed JSON config falls back safely to defaults
      }
    }

    // Load TypeScript / JavaScript compilerOptions.paths aliases (including `extends` chains)
    for (const cfgName of ["tsconfig.json", "jsconfig.json"]) {
      const cfgPath = path.join(resolvedRoot, cfgName);
      if (fs.existsSync(cfgPath)) {
        this.#loadTsConfigAliases(resolvedRoot, cfgPath, merged, new Set());
      }
    }

    // Load Node package.json `"imports"` (`#*` subpath aliases)
    const pkgJsonPath = path.join(resolvedRoot, "package.json");
    if (fs.existsSync(pkgJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
        if (pkg && pkg.imports && typeof pkg.imports === "object") {
          merged.pathAliases = merged.pathAliases || {};
          for (const [aliasKey, targetVal] of Object.entries(pkg.imports)) {
            const rawTarget =
              typeof targetVal === "string"
                ? targetVal
                : targetVal?.default || targetVal?.import || targetVal?.node || null;
            if (typeof rawTarget === "string") {
              const cleanAlias = aliasKey.replace(/\/?\*$/, "");
              const cleanTarget = normalizeSlashes(rawTarget)
                .replace(/^\.\//, "")
                .replace(/\/?\*$/, "");
              if (cleanAlias && cleanTarget) {
                merged.pathAliases[cleanAlias] = cleanTarget;
              }
            }
          }
        }
      } catch {
        // Ignore malformed package.json
      }
    }

    // Load Go module prefix from `go.mod` if present
    const goModPath = path.join(resolvedRoot, "go.mod");
    if (fs.existsSync(goModPath)) {
      try {
        const goModText = fs.readFileSync(goModPath, "utf8");
        const modMatch = goModText.match(/^\s*module\s+([^\s\r\n]+)/m);
        if (modMatch && modMatch[1]) {
          merged.goModulePrefix = modMatch[1].trim();
        }
      } catch {
        // Ignore unreadable go.mod
      }
    }

    // Load `.joyignore` exclusion rules if present
    const joyIgnorePath = path.join(resolvedRoot, ".joyignore");
    if (fs.existsSync(joyIgnorePath)) {
      try {
        const lines = fs
          .readFileSync(joyIgnorePath, "utf8")
          .split(/\r?\n/)
          .map((l) => l.replace(/#.*$/, "").trim())
          .filter(Boolean);
        merged.exclude = Array.from(new Set([...(merged.exclude || []), ...lines]));
      } catch {
        // Ignore unreadable .joyignore
      }
    }

    // Agent instruction/tool configuration is not architecture-bearing source: exempt it by default.
    if (merged.scanAgentConfig !== true) {
      merged.exclude = Array.from(new Set([...(merged.exclude || []), ...AGENT_CONFIG_EXCLUDES]));
    }

    return merged;
  }

  /**
   * Recursively scans `rootDir` for supported source files that are not excluded.
   * Guards against symlink loops, binary files (`\0`), and `@generated` files.
   * @param {string} rootDir
   * @param {Object} config
   * @returns {Array<{ relativePath: string, absolutePath: string, extension: string, content: string }>}
   */
  scanFiles(rootDir, config = {}) {
    const resolvedRoot = path.resolve(rootDir);
    const excludePatterns = Array.isArray(config.exclude) ? config.exclude : [];
    const results = [];
    const visitedDirs = new Set();

    const walk = (currentDir) => {
      try {
        const realDir = fs.realpathSync(currentDir);
        if (visitedDirs.has(realDir)) {
          return;
        }
        visitedDirs.add(realDir);
      } catch {
        return;
      }

      let entries;
      try {
        entries = fs.readdirSync(currentDir, { withFileTypes: true });
      } catch {
        return;
      }

      // Sort deterministically
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        const relPath = normalizeSlashes(path.relative(resolvedRoot, fullPath));

        if (this.#isExcluded(relPath, entry.name, excludePatterns)) {
          continue;
        }

        let isDir = entry.isDirectory();
        let isFile = entry.isFile();
        if (entry.isSymbolicLink()) {
          try {
            const targetStat = fs.statSync(fullPath);
            isDir = targetStat.isDirectory();
            isFile = targetStat.isFile();
          } catch {
            continue;
          }
        }

        if (isDir) {
          if (DEFAULT_IGNORED_DIRS.has(entry.name)) {
            continue;
          }
          walk(fullPath);
          continue;
        }

        if (!isFile) {
          continue;
        }

        if (EXEMPT_FILENAMES.has(entry.name.toLowerCase()) || isDeclarationFile(relPath)) {
          continue;
        }

        const ext = getFileExtension(entry.name);
        if (!isSupportedSourceExtension(ext)) {
          continue;
        }

        const content = this.#readFileCached(fullPath);
        if (content === null || this.#isBinaryContent(content) || this.#isGeneratedCode(content, ext)) {
          continue;
        }

        results.push({
          relativePath: relPath,
          absolutePath: fullPath,
          extension: ext,
          content
        });
      }
    };

    walk(resolvedRoot);
    return results;
  }

  /**
   * Reports whether a path (file or directory) exists on disk. Lets doc link checks
   * resolve extensionless/non-source files (e.g. `LICENSE`) that `scanFiles` skips.
   * @param {string} absolutePath
   * @returns {boolean}
   */
  pathExists(absolutePath) {
    try {
      fs.statSync(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Atomically writes updated content to disk (preserving executable permissions if present)
   * and updates the Tier-1 JoyRide file cache.
   * @param {string} absolutePath
   * @param {string} content
   */
  writeFile(absolutePath, content) {
    let existingMode = null;
    try {
      existingMode = fs.statSync(absolutePath).mode;
    } catch {
      existingMode = null;
    }
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    const tmpPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpPath, content, "utf8");
    if (existingMode !== null) {
      try {
        fs.chmodSync(tmpPath, existingMode);
      } catch {
        // Ignore chmod errors on non-POSIX filesystems
      }
    }
    fs.renameSync(tmpPath, absolutePath);
    try {
      const stat = fs.statSync(absolutePath);
      this.fileCache.set(absolutePath, { mtimeMs: stat.mtimeMs, content });
    } catch {
      this.fileCache.delete(absolutePath);
    }
  }

  /**
   * @param {string} fullPath
   * @returns {string|null}
   */
  #readFileCached(fullPath) {
    try {
      const stat = fs.statSync(fullPath);
      // Skip files > 1MB (JoyRide bounded cache invariant)
      if (stat.size > 1024 * 1024) {
        return fs.readFileSync(fullPath, "utf8");
      }
      const cached = this.fileCache.get(fullPath);
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        return cached.content;
      }
      const content = fs.readFileSync(fullPath, "utf8");
      if (this.fileCache.size >= 2000) {
        const oldestKey = this.fileCache.keys().next().value;
        if (oldestKey) this.fileCache.delete(oldestKey);
      }
      this.fileCache.set(fullPath, { mtimeMs: stat.mtimeMs, content });
      return content;
    } catch {
      return null;
    }
  }

  /**
   * @param {string} relPath
   * @param {string} baseName
   * @param {string[]} excludePatterns
   * @returns {boolean}
   */
  #isExcluded(relPath, baseName, excludePatterns) {
    for (const rawPattern of excludePatterns) {
      const pattern = normalizeSlashes(String(rawPattern)).replace(/^\.\//, "").replace(/\/+$/, "");
      if (!pattern) continue;
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(1).toLowerCase();
        if (relPath.toLowerCase().endsWith(suffix) || baseName.toLowerCase().endsWith(suffix)) {
          return true;
        }
      } else if (pattern.includes("*")) {
        const segments = pattern.split("/");
        let regexStr = "^";
        for (let i = 0; i < segments.length; i += 1) {
          const seg = segments[i];
          if (seg === "**") {
            if (i === segments.length - 1) {
              regexStr += "(?:.+)?";
            } else {
              regexStr += "(?:.+/)?";
            }
          } else {
            regexStr +=
              seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*") +
              (i < segments.length - 1 ? "/" : "");
          }
        }
        regexStr += "(?:/|$)";
        if (new RegExp(regexStr, "i").test(relPath)) {
          return true;
        }
      } else if (
        relPath === pattern ||
        relPath.startsWith(`${pattern}/`) ||
        baseName === pattern
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Recursively loads `compilerOptions.paths` from `tsconfig.json` and any parent `extends` file.
   * @param {string} workspaceRoot
   * @param {string} tsConfigFile
   * @param {Object} merged
   * @param {Set<string>} visited
   */
  #loadTsConfigAliases(workspaceRoot, tsConfigFile, merged, visited) {
    const absPath = path.resolve(tsConfigFile);
    if (visited.has(absPath) || !fs.existsSync(absPath)) return;
    visited.add(absPath);

    try {
      const rawText = fs.readFileSync(absPath, "utf8");
      const cleanJson = this.#stripJsonComments(rawText);
      const parsed = JSON.parse(cleanJson);
      const configDir = path.dirname(absPath);

      if (typeof parsed?.extends === "string" && parsed.extends.trim()) {
        let parentCandidate = path.resolve(configDir, parsed.extends.trim());
        if (!parentCandidate.endsWith(".json") && fs.existsSync(`${parentCandidate}.json`)) {
          parentCandidate = `${parentCandidate}.json`;
        }
        this.#loadTsConfigAliases(workspaceRoot, parentCandidate, merged, visited);
      }

      const pathsObj = parsed?.compilerOptions?.paths;
      const rawBaseUrl = parsed?.compilerOptions?.baseUrl || ".";
      const resolvedBaseDir = path.resolve(configDir, rawBaseUrl);
      const relBaseUrl = normalizeSlashes(path.relative(workspaceRoot, resolvedBaseDir)) || ".";

      if (pathsObj && typeof pathsObj === "object") {
        merged.pathAliases = merged.pathAliases || {};
        for (const [aliasKey, targets] of Object.entries(pathsObj)) {
          if (Array.isArray(targets) && targets.length > 0) {
            const cleanAlias = aliasKey.replace(/\/?\*$/, "");
            const cleanTarget = normalizeSlashes(
              path.posix.join(
                relBaseUrl,
                normalizeSlashes(String(targets[0])).replace(/\/?\*$/, "")
              )
            ).replace(/^\.\//, "");
            if (cleanAlias) {
              merged.pathAliases[cleanAlias] = cleanTarget;
            }
          }
        }
      }
    } catch {
      // Ignore malformed tsconfig
    }
  }

  /**
   * @param {Object} target
   * @param {Object} source
   */
  #mergeConfig(target, source) {
    if (!source || typeof source !== "object") return;
    if (source.theme) target.theme = source.theme;
    if (typeof source.scanAgentConfig === "boolean") target.scanAgentConfig = source.scanAgentConfig;
    const rawExcludes = [
      ...(Array.isArray(source.exclude) ? source.exclude : []),
      ...(Array.isArray(source.excludePaths) ? source.excludePaths : [])
    ];
    if (rawExcludes.length > 0) {
      target.exclude = Array.from(new Set([...(target.exclude || []), ...rawExcludes]));
    }
    if (Array.isArray(source.compositionRoots)) {
      target.compositionRoots = Array.from(
        new Set([...(target.compositionRoots || []), ...source.compositionRoots])
      );
    }
    if (source.global && typeof source.global === "object") {
      target.global = { ...(target.global || {}), ...source.global };
    }
    if (source.layers && typeof source.layers === "object") {
      target.layers = target.layers || {};
      for (const [zone, val] of Object.entries(source.layers)) {
        const canonicalZone = normalizeResourceZone(zone) || zone;
        if (Array.isArray(val)) {
          target.layers[canonicalZone] = {
            ...(target.layers[canonicalZone] || {}),
            paths: val
          };
        } else if (val && typeof val === "object") {
          target.layers[canonicalZone] = {
            ...(target.layers[canonicalZone] || {}),
            ...val
          };
        }
      }
    }
    // Support LUMI-native `spider.spec.json` `resources` map (`{ key: { path, domain } }`)
    if (source.resources && typeof source.resources === "object") {
      target.layers = target.layers || {};
      for (const res of Object.values(source.resources)) {
        if (!res || typeof res !== "object" || !res.path || !res.domain) continue;
        const canonicalZone = normalizeResourceZone(res.domain);
        if (!canonicalZone) continue;
        const existingPaths = Array.isArray(target.layers[canonicalZone]?.paths)
          ? target.layers[canonicalZone].paths
          : [];
        target.layers[canonicalZone] = {
          ...(target.layers[canonicalZone] || {}),
          paths: Array.from(new Set([...existingPaths, res.path]))
        };
      }
    }
  }

  /**
   * Checks if file content is binary (contains `\0` in first 1KB).
   * @param {string} content
   * @returns {boolean}
   */
  #isBinaryContent(content) {
    return Boolean(content && content.slice(0, 1024).includes("\0"));
  }

  /**
   * Checks if a non-markdown code file has an auto-generated header marker in its first 1KB.
   * @param {string} content
   * @param {string} ext
   * @returns {boolean}
   */
  #isGeneratedCode(content, ext) {
    if (!content || ext === ".md") return false;
    const head = content.slice(0, 1024);
    return /(?:\/\/|#|\/\*|--|<!--)\s*(?:@generated\b|Code generated by\b|DO NOT EDIT\b|Automatically generated\b)/i.test(
      head
    );
  }

  /**
   * Strips `//` and `/*` comments and trailing commas from JSON-with-comments (`tsconfig.json`).
   * @param {string} text
   * @returns {string}
   */
  #stripJsonComments(text) {
    let out = "";
    let inString = false;
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const next = text[i + 1];
      if (inString) {
        out += ch;
        if (ch === "\\" && i + 1 < text.length) {
          out += text[i + 1];
          i += 2;
          continue;
        }
        if (ch === '"') inString = false;
        i += 1;
        continue;
      }
      if (ch === '"') {
        inString = true;
        out += ch;
        i += 1;
        continue;
      }
      if (ch === "/" && next === "/") {
        i += 2;
        while (i < text.length && text[i] !== "\n") i += 1;
        continue;
      }
      if (ch === "/" && next === "*") {
        i += 2;
        while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
        i += 2;
        continue;
      }
      out += ch;
      i += 1;
    }
    return out.replace(/,\s*([}\]])/g, "$1");
  }
}

