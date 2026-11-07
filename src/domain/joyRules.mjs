/** [LAYER: DOMAIN] */
/**
 * Canonical Joyzoning invariants, zone rules, I/O purity definitions, and dependency coupling matrix.
 * Pure Domain module: 0% I/O, depends only on `plumbing`.
 */

import { normalizeSlashes } from "../plumbing/pathUtils.mjs";
import { normalizeZoneName, normalizeResourceZone } from "../plumbing/commentStyles.mjs";
import { RTG_DIAGNOSTICS } from "./broccoliRules.mjs";

export const CANONICAL_ZONES = Object.freeze([
  "domain",
  "core",
  "infrastructure",
  "plumbing",
  "ui"
]);

export const DEFAULT_STABILITY_CONFIG = Object.freeze({
  version: "1.0.0",
  theme: "strict",
  layers: {
    domain: {
      optimalLogicDensity: 0.15,
      maxIOEntropy: 0.0,
      maxComplexity: 5000,
      paths: ["src/domain", "domain"]
    },
    core: {
      optimalLogicDensity: 0.05,
      maxIOEntropy: 0.0,
      maxComplexity: 3000,
      paths: ["src/core", "core"]
    },
    infrastructure: {
      optimalLogicDensity: 0.05,
      maxIOEntropy: 1.0,
      maxComplexity: 10000,
      paths: [
        "src/infrastructure",
        "infrastructure",
        "src/adapters",
        "src/services",
        "src/integrations",
        "src/hosts"
      ]
    },
    plumbing: {
      optimalLogicDensity: 0.0,
      maxIOEntropy: 0.0,
      maxComplexity: 500,
      paths: ["src/plumbing", "plumbing", "src/utils", "utils", "src/shared/utils"]
    },
    ui: {
      optimalLogicDensity: 0.0,
      maxIOEntropy: 1.0,
      maxComplexity: 15000,
      paths: ["src/ui", "ui", "src/cli", "webview-ui", "frontend", "src/views", "src/components"]
    }
  },
  global: {
    maxPathDepth: 4,
    maxRelativeImportDepth: 3,
    integrityAlertThreshold: 0.7,
    fileSizeTiers: {
      fatModuleWarning: 800,
      tier1Max: 1000,
      tier2Max: 1500,
      hardSimplicityCap: 2500
    }
  },
  compositionRoots: [
    "src/index.ts",
    "src/index.mjs",
    "src/main.ts",
    "bin/joy-check.mjs",
    "bin/docs-check.mjs"
  ],
  exclude: ["node_modules", "dist", "build", "out", "coverage", ".git", "*.d.ts"]
});

const FORBIDDEN_DOMAIN_IO_SPECIFIERS = Object.freeze([
  "fs",
  "node:fs",
  "fs/promises",
  "node:fs/promises",
  "http",
  "node:http",
  "https",
  "node:https",
  "net",
  "node:net",
  "dgram",
  "node:dgram",
  "child_process",
  "node:child_process",
  "tls",
  "node:tls",
  "dns",
  "node:dns",
  "axios",
  "node-fetch",
  "undici",
  "pg",
  "mysql",
  "mysql2",
  "sqlite3",
  "better-sqlite3",
  "redis",
  "ioredis",
  "mongodb",
  "mongoose",
  "prisma",
  "@prisma/client",
  "requests",
  "urllib",
  "httpx",
  "aiohttp",
  "psycopg2",
  "sqlalchemy",
  "net/http",
  "database/sql",
  "os/exec",
  "java.io",
  "java.nio",
  "java.net",
  "java.sql",
  "javax.sql",
  "std::fs",
  "std::net",
  "std::process",
  "tokio::fs",
  "tokio::net",
  "reqwest",
  "sqlx",
  "subprocess",
  "socket",
  "shutil"
]);

/**
 * Matches a path against a prefix that may contain `*` single-segment or `**` multi-segment wildcards.
 * @param {string} cleanPath
 * @param {string} patternPrefix
 * @returns {boolean}
 */
function matchesPathPattern(cleanPath, patternPrefix) {
  if (!patternPrefix.includes("*")) {
    return cleanPath === patternPrefix || cleanPath.startsWith(`${patternPrefix}/`);
  }
  const segments = patternPrefix.split("/");
  let regexStr = "^";
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === "**") {
      regexStr += i === segments.length - 1 ? "(?:.+)?" : "(?:.+/)?";
    } else {
      regexStr +=
        seg.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+") +
        (i < segments.length - 1 ? "/" : "");
    }
  }
  regexStr += "(?:/|$)";
  return new RegExp(regexStr).test(cleanPath);
}

/**
 * Infers the expected canonical zone from a file's relative path using configured mappings
 * (`layers.<zone>.paths`, wildcard patterns, or LUMI `resources`) and canonical path segment rules.
 * @param {string} relativePath
 * @param {Object} config
 * @returns {"domain"|"core"|"infrastructure"|"plumbing"|"ui"|null}
 */
export function inferZoneFromPath(relativePath, config = DEFAULT_STABILITY_CONFIG) {
  const clean = normalizeSlashes(relativePath).replace(/^\.\//, "");
  const layersConfig = (config && config.layers) || DEFAULT_STABILITY_CONFIG.layers;

  // 1. Check explicit configured path prefixes or glob patterns (most specific pattern wins)
  let bestZone = null;
  let bestSpecificity = -1;

  for (const [rawZone, layerDef] of Object.entries(layersConfig)) {
    const zone = normalizeResourceZone(rawZone);
    if (!zone) continue;
    const paths = Array.isArray(layerDef)
      ? layerDef
      : Array.isArray(layerDef?.paths)
        ? layerDef.paths
        : [];
    for (const rawPrefix of paths) {
      const prefix = normalizeSlashes(rawPrefix).replace(/^\.\//, "").replace(/\/+$/, "");
      if (!prefix) continue;
      if (matchesPathPattern(clean, prefix)) {
        const specificity = prefix.replace(/\*/g, "").length;
        if (specificity > bestSpecificity) {
          bestSpecificity = specificity;
          bestZone = zone;
        }
      }
    }
  }

  // Also check LUMI-style `config.resources` object if provided directly
  if (config && config.resources && typeof config.resources === "object") {
    for (const res of Object.values(config.resources)) {
      if (!res || typeof res !== "object" || !res.path || !res.domain) continue;
      const zone = normalizeResourceZone(res.domain);
      if (!zone) continue;
      const prefix = normalizeSlashes(res.path).replace(/^\.\//, "").replace(/\/+$/, "");
      if (!prefix) continue;
      if (matchesPathPattern(clean, prefix)) {
        const specificity = prefix.replace(/\*/g, "").length;
        if (specificity > bestSpecificity) {
          bestSpecificity = specificity;
          bestZone = zone;
        }
      }
    }
  }

  if (bestZone) return bestZone;

  // 2. Fallback to canonical segment matching anywhere in path
  const segments = clean.toLowerCase().split("/");
  if (segments.includes("domain") || segments.includes("domains")) return "domain";
  if (segments.includes("core") || segments.includes("controllers") || segments.includes("usecases")) {
    return "core";
  }
  if (
    segments.includes("infrastructure") ||
    segments.includes("adapters") ||
    segments.includes("services") ||
    segments.includes("integrations") ||
    segments.includes("hosts")
  ) {
    return "infrastructure";
  }
  if (segments.includes("plumbing") || segments.includes("utils") || segments.includes("helpers")) {
    return "plumbing";
  }
  if (
    segments.includes("ui") ||
    segments.includes("webview-ui") ||
    segments.includes("frontend") ||
    segments.includes("views") ||
    segments.includes("components") ||
    segments.includes("cli")
  ) {
    return "ui";
  }

  return null;
}

/**
 * Infers a suggested zone from file contents when path geography is ambiguous (e.g., root files).
 * @param {string} content
 * @param {string} extension
 * @returns {"domain"|"core"|"infrastructure"|"plumbing"|"ui"}
 */
export function suggestZoneFromContent(content, extension) {
  const ext = (extension || "").toLowerCase();
  if (ext === ".md" || ext === ".html" || ext === ".vue" || ext === ".svelte") {
    return "ui";
  }
  if (/\b(?:React|useState|useEffect|document\.|window\.|console\.table)\b/.test(content)) {
    return "ui";
  }
  if (
    /\b(?:fs|readFileSync|writeFileSync|http|https|fetch|child_process|execSync|sqlite|postgres)\b/.test(
      content
    )
  ) {
    return "infrastructure";
  }
  if (/\bexport\s+interface\s+I[A-Z]/.test(content)) {
    return "domain";
  }
  if (/\bclass\s+[A-Za-z0-9_]+(?:Controller|Engine|Service|Orchestrator)\b/.test(content)) {
    return "core";
  }
  return "plumbing";
}

/**
 * Checks whether an import specifier is a forbidden raw I/O module when imported inside `DOMAIN`.
 * @param {string} specifier
 * @returns {boolean}
 */
export function isForbiddenDomainIOSpecifier(specifier) {
  if (typeof specifier !== "string") return false;
  const trimmed = specifier.trim().toLowerCase();
  if (FORBIDDEN_DOMAIN_IO_SPECIFIERS.includes(trimmed)) {
    return true;
  }
  return FORBIDDEN_DOMAIN_IO_SPECIFIERS.some((io) => trimmed.startsWith(`${io}/`));
}

/**
 * Evaluates whether a cross-zone dependency edge `sourceZone -> targetZone` is permitted.
 * Enforces the Sovereign Dependency Matrix and the documented `INFRASTRUCTURE -> DOMAIN` interface rule.
 * @param {Object} params
 * @param {string} params.sourceZone
 * @param {string} params.targetZone
 * @param {string} params.targetPath
 * @param {boolean} params.isTypeOnly
 * @param {boolean} params.isCompositionRoot
 * @returns {{ allowed: boolean, code?: string, reason?: string }}
 */
export function evaluateZoneDependency({
  sourceZone,
  targetZone,
  targetPath = "",
  isTypeOnly = false,
  isCompositionRoot = false
}) {
  if (isCompositionRoot) {
    return { allowed: true };
  }
  const src = normalizeZoneName(sourceZone);
  const dst = normalizeZoneName(targetZone);
  if (!src || !dst || src === dst) {
    return { allowed: true };
  }

  // Rule 1: PLUMBING is a leaf layer and cannot import from any higher zone.
  if (src === "plumbing") {
    return {
      allowed: false,
      code: "SPI-206",
      reason: `Plumbing Contamination: [LAYER: PLUMBING] cannot import from [LAYER: ${dst.toUpperCase()}].`
    };
  }

  // Rule 2: DOMAIN can only import from DOMAIN or PLUMBING.
  if (src === "domain" && dst !== "plumbing") {
    return {
      allowed: false,
      code: "SPI-206",
      reason: `Domain Impurity: [LAYER: DOMAIN] cannot import from [LAYER: ${dst.toUpperCase()}].`
    };
  }

  // Rule 3: CORE cannot import from UI.
  if (src === "core" && dst === "ui") {
    return {
      allowed: false,
      code: "SPI-206",
      reason: "Core -> UI Leak: [LAYER: CORE] must not depend on [LAYER: UI]. Use events, callbacks, or Domain interfaces."
    };
  }

  // Rule 4: INFRASTRUCTURE cannot import from UI or CORE, and may only import interfaces/types from DOMAIN.
  if (src === "infrastructure") {
    if (dst === "ui" || dst === "core") {
      return {
        allowed: false,
        code: "SPI-206",
        reason: `Infrastructure Leak: [LAYER: INFRASTRUCTURE] must not import from [LAYER: ${dst.toUpperCase()}].`
      };
    }
    if (dst === "domain") {
      const cleanTarget = normalizeSlashes(targetPath).toLowerCase();
      const isInterfaceOrTypeTarget =
        isTypeOnly ||
        cleanTarget.includes("/interfaces/") ||
        cleanTarget.includes("/types/") ||
        /\/I[A-Z][A-Za-z0-9_]*\.[a-z]+$/.test(normalizeSlashes(targetPath));
      if (!isInterfaceOrTypeTarget) {
        return {
          allowed: false,
          code: "SPI-206",
          reason:
            "Axiomatic Layer Leakage: [LAYER: INFRASTRUCTURE] may implement Domain contracts (`domain/interfaces/I*`), but must not import concrete Domain logic directly."
        };
      }
    }
  }

  // Rule 5: UI cannot directly import INFRASTRUCTURE.
  if (src === "ui" && dst === "infrastructure") {
    return {
      allowed: false,
      code: "SPI-206",
      reason:
        "UI -> Infrastructure Leak: [LAYER: UI] must not directly import [LAYER: INFRASTRUCTURE]. Route through [LAYER: CORE] or [LAYER: DOMAIN] contracts."
    };
  }

  return { allowed: true };
}

/**
 * Built-in operational encyclopedia for `joy-check --explain <CODE|ZONE>`.
 * Maps every `SPI-101..403` forensic diagnostic and every canonical zone to its formal definition,
 * SOP remediation recipe, and concrete before/after code example.
 */
export const EXPLAIN_CATALOG = Object.freeze({
  "SPI-101": {
    code: "SPI-101",
    title: "Broken Link (Unresolvable Relative Import)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ERROR",
    sop: "SOP: FIX_IMPORTS",
    rationale:
      "A relative import (`./` or `../`) points to a file that does not exist on disk. This causes immediate runtime/compile failures and breaks topological graph analysis.",
    remediation:
      "Verify the target file path and extension, or run `RefactorHealer.simulateMove` when relocating modules.",
    example: `// Before (Broken):\nimport { Order } from "./missingOrder.mjs";\n\n// After (Resolved):\nimport { Order } from "./Order.mjs";`
  },
  "SPI-102": {
    code: "SPI-102",
    title: "Ghost Symbol (Missing Export on Target Module)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ERROR",
    sop: "SOP: FIX_IMPORTS",
    rationale:
      "An import requests a named symbol that is neither directly exported nor transitively re-exported by the target file.",
    remediation:
      "Export the symbol from the target file, or update the imported symbol name (check the 'Did you mean?' suggestion).",
    example: `// Target (Order.mjs):\nexport class Order {}\n\n// Importer (Fixed):\nimport { Order } from "./Order.mjs";`
  },
  "SPI-103": {
    code: "SPI-103",
    title: "Zombie Export (Unreferenced Internal Export)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ADVISORY",
    sop: "SOP: PRUNE_EXPORTS",
    rationale:
      "A symbol is exported by a non-barrel internal module (`core`, `infrastructure`, `plumbing`) and never imported anywhere in the workspace.",
    remediation:
      "Remove the `export` keyword if the helper is file-private, or wire it into its intended consumer.",
    example: `// Before:\nexport function internalHelper() {}\n\n// After:\nfunction internalHelper() {}`
  },
  "SPI-104": {
    code: "SPI-104",
    title: "Circular Type Dependency (`import type` Loop)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ADVISORY",
    sop: "SOP: DECOUPLE",
    rationale:
      "While `import type` erases at compile time and does not crash runtime module loaders, circular type definitions increase cognitive coupling.",
    remediation: "Extract shared types or interfaces into `src/domain/interfaces/`.",
    example: `// Move shared contract into src/domain/interfaces/IShared.ts`
  },
  "SPI-105": {
    code: "SPI-105",
    title: "High Logic Density in Non-Domain Layer",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ADVISORY",
    sop: "SOP: EXTRACT_DOMAIN",
    rationale:
      "A `PLUMBING`, `INFRASTRUCTURE`, or `UI` module has control-flow logic density > 0.30, indicating business rules leaking outside `DOMAIN`/`CORE`.",
    remediation:
      "Extract pure decision trees and policy predicates into `src/domain/` and keep adapters thin.",
    example: `// Extract complex branching from Infrastructure adapter into a Domain policy class.`
  },
  "SPI-106": {
    code: "SPI-106",
    title: "Symbol Resonance (Cross-Zone Naming Collision)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ADVISORY",
    sop: "SOP: RENAME_DISAMBIGUATE",
    rationale:
      "Two modules in different architectural zones export the exact same symbol name, causing ambiguity for coding agents and auto-importers.",
    remediation:
      "Suffix the symbol by role (e.g., `OrderEntity` in `domain`, `OrderRepository` in `infrastructure`, `OrderView` in `ui`).",
    example: `// Domain: OrderPolicy | Infrastructure: SqlOrderAdapter | UI: OrderPresenter`
  },
  "SPI-107": {
    code: "SPI-107",
    title: "Implicit Interface (Contractual Sovereignty Breach)",
    series: "Series 100 — Structural & Link Integrity",
    defaultSeverity: "ADVISORY",
    sop: "SOP: SYNTHESIZE_INTERFACE",
    rationale:
      "A concrete `INFRASTRUCTURE` class is imported across zone boundaries without a corresponding formal `I<ClassName>` contract in `src/domain/interfaces/`.",
    remediation:
      "Define `I<ClassName>` in `src/domain/interfaces/` and depend on the interface inside `CORE`.",
    example: `// Define src/domain/interfaces/IUserRepository.mjs and implement it in src/infrastructure/SqlUserRepository.mjs`
  },
  "SPI-108": {
    code: "SPI-108",
    title: "Ghost Coupling (Implicit Cross-Zone Co-Mutation)",
    series: "Series 100 — Transient Integrity Advisories (TIA)",
    defaultSeverity: "ADVISORY",
    sop: "SOP: EXTRACT_CONTRACT",
    rationale:
      "Two modules across different zones co-mutate or share hardcoded constants without an explicit Domain contract.",
    remediation:
      "Extract shared constants, schemas, or protocol types into `src/domain/`.",
    example: `// Move shared status codes or event names into src/domain/`
  },
  "SPI-109": {
    code: "SPI-109",
    title: "Silent Clone (Duplicate Logic Across Modules)",
    series: "Series 100 — Transient Integrity Advisories (TIA)",
    defaultSeverity: "ADVISORY",
    sop: "SOP: EXTRACT",
    rationale:
      "Duplicate pure helper functions across multiple files inflate maintenance surface and cause divergent bug fixes.",
    remediation: "Consolidate duplicate stateless helpers into `src/plumbing/`.",
    example: `// Extract shared pure helper into src/plumbing/`
  },
  "SPI-110": {
    code: "SPI-110",
    title: "Asymmetric Lifecycle (`init`/`connect` without `dispose`/`close`)",
    series: "Series 100 — Transient Integrity Advisories (TIA)",
    defaultSeverity: "ADVISORY",
    sop: "SOP: SYMMETRIC_LIFECYCLE",
    rationale:
      "A class acquires resources (`init()`, `connect()`, `subscribe()`) without a matching teardown method (`dispose()`, `close()`, `unsubscribe()`), risking leaks.",
    remediation: "Add a deterministic `dispose()` or `close()` method to release handles.",
    example: `class DbClient {\n  connect() {}\n  close() {}\n}`
  },
  "SPI-111": {
    code: "SPI-111",
    title: "Domain Drift (High Pure Logic Density in Infrastructure)",
    series: "Series 100 — Transient Integrity Advisories (TIA)",
    defaultSeverity: "ADVISORY",
    sop: "SOP: EXTRACT_DOMAIN",
    rationale:
      "An `INFRASTRUCTURE` module has high pure control-flow logic density (> 0.30) and 0% external I/O, indicating business rules trapped in an adapter.",
    remediation: "Extract pure business rules and calculations into `src/domain/`.",
    example: `// Move pure pricing/validation rules from src/infrastructure/ to src/domain/`
  },
  "SPI-112": {
    code: "SPI-112",
    title: "Unused Import Binding",
    series: "Series 100 — Transient Integrity Advisories (TIA)",
    defaultSeverity: "ADVISORY",
    sop: "SOP: CLEAN_IMPORTS",
    rationale:
      "An imported identifier is never referenced in the module body, inflating efferent coupling ($C_e$) and graph noise.",
    remediation: "Remove the unused import specifier.",
    example: `// Remove unused named import from the import declaration.`
  },
  "SPI-201": {
    code: "SPI-201",
    title: "Circular Dependency (Runtime Import Cycle)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ERROR",
    sop: "SOP: DECOUPLE",
    rationale:
      "A runtime directed cycle (`A -> B -> A`) violates topological ordering, risks undefined bindings during module initialization, and adds +0.05 cycle penalty to Structural Entropy.",
    remediation:
      "Extract shared contracts into `src/domain/interfaces/` or pure helpers into `src/plumbing/`, or convert type references to `import type`.",
    example: `// Break A <-> B cycle by moving shared interface IContract into src/domain/interfaces/IContract.ts`
  },
  "SPI-202": {
    code: "SPI-202",
    title: "Systemic Risk (High Node Blast Radius > 60%)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ADVISORY",
    sop: "SOP: SPLIT_HUB",
    rationale:
      "Modifying this module impacts more than 60% of the workspace graph across 1st- and 2nd-degree dependents.",
    remediation:
      "Decompose wide hub interfaces into smaller role-specific contracts so callers depend only on narrow slices.",
    example: `// Split a monolithic God-module into focused domain contracts.`
  },
  "SPI-203": {
    code: "SPI-203",
    title: "Structural Load (Fat Module / Monolith / Domain Class Density)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ADVISORY / WARNING",
    sop: "SOP: DECOMPOSE",
    rationale:
      "Files exceeding Tier 1 (800-1000 LOC) or packing > 3 classes into a single Domain file degrade agent context efficiency and single-responsibility clarity.",
    remediation:
      "Extract stateless helper islands into `src/plumbing/` or split multi-class Domain files into one entity per file.",
    example: `// Keep modules Small & Sharp (Tier 1: 0-800 lines, 1 primary class per Domain file).`
  },
  "SPI-204": {
    code: "SPI-204",
    title: "Orphaned Module (Zero Incoming Dependents Ca = 0)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ADVISORY",
    sop: "SOP: PRUNE",
    rationale:
      "An internal module has $C_a = 0$ (no incoming edges) and is not a composition root, barrel, or test suite, increasing Orphan Entropy ($S_{orphan}$).",
    remediation: "Wire the module into its intended consumer or prune dead code.",
    example: `// Import the module from its caller or delete obsolete file.`
  },
  "SPI-205": {
    code: "SPI-205",
    title: "Mutable Plumbing State (`let`/`var` in `[LAYER: PLUMBING]`)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ERROR",
    sop: "SOP: HEAL_STATELESSNESS",
    rationale:
      "`PLUMBING` (`UTILS`) is the stateless leaf foundation of the architecture. Mutable module-scope `let`/`var` bindings introduce hidden global state.",
    remediation:
      "Replace `let`/`var` with `const` (or run `joy-check --heal-stateless`), or move stateful services to `CORE` / `INFRASTRUCTURE`.",
    example: `// Before (in src/plumbing/):\nlet cacheCount = 0;\n\n// After:\nconst DEFAULT_COUNT = 0;`
  },
  "SPI-206": {
    code: "SPI-206",
    title: "Axiomatic Layer Leakage (Cross-Zone Boundary or Barrel Bypass)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ERROR",
    sop: "SOP: INVERT_DEPENDENCY",
    rationale:
      "A module imports across a forbidden zone boundary (e.g., `DOMAIN` importing I/O or `INFRASTRUCTURE`, `PLUMBING` importing `DOMAIN`, `UI` importing `INFRASTRUCTURE`, or `CORE` importing `UI`).",
    remediation:
      "Invert the dependency using an interface in `src/domain/interfaces/I*.ts` and inject the `INFRASTRUCTURE` adapter from the Composition Root.",
    example: `// UI -> CORE -> DOMAIN <- INFRASTRUCTURE (Dependency Inversion)`
  },
  "SPI-207": {
    code: "SPI-207",
    title: "Structural Bridge (Tarjan Articulation Point)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ADVISORY",
    sop: "SOP: HARDEN_BRIDGE",
    rationale:
      "This module is an undirected Tarjan articulation point connecting distinct subgraphs. A breaking change here severs communication between subsystems.",
    remediation: "Stabilize its public contract and maintain comprehensive unit tests around this bridge.",
    example: `// Lock bridge contract behind a formal interface.`
  },
  "SPI-208": {
    code: "SPI-208",
    title: "Geographic Misalignment (Missing or Mismatched `[LAYER]` Header Tag)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ERROR",
    sop: "SOP: ALIGN_TAGS",
    rationale:
      "A file is either missing its top-of-file `[LAYER: <ZONE>]` header within the first 10KB or its declared tag contradicts its physical directory path (Principle of Geographic Alignment).",
    remediation:
      "Run `joy-check --heal` to synchronize `[LAYER: <ZONE>]` headers with physical folder geography, or move the file to the matching zone directory.",
    example: `// File in src/domain/Order.ts must begin with:\n/** [LAYER: DOMAIN] */`
  },
  "SPI-209": {
    code: "SPI-209",
    title: "Import Depth Exceeded (`> 3` `../` Parent Traversals)",
    series: "Series 200 — Architectural & Zone Sovereignty",
    defaultSeverity: "ERROR",
    sop: "SOP: FLATTEN_OR_ALIAS",
    rationale:
      "Relative imports with 4 or more parent traversals (`../../../../`) create brittle path coupling that breaks during refactoring.",
    remediation:
      "Configure path aliases (`@domain/*`, `@core/*`, `#domain/*`) or flatten directory nesting depth (`<= 4`).",
    example: `// Before:\nimport { x } from "../../../../domain/x.js";\n\n// After:\nimport { x } from "@domain/x.js";`
  },
  "SPI-300": {
    code: "SPI-300",
    title: "Ripple Prophecy Alert (Blast Radius > 80%)",
    series: "Series 300 — Predictive & Evolutionary Alerts",
    defaultSeverity: "ADVISORY",
    sop: "SOP: TRIAD_AUDIT",
    rationale:
      "Changes to this module propagate to over 80% of the repository. Uncoordinated edits risk widespread regressions.",
    remediation: "Perform a full Triad Audit (Architect, Critic, SRE) before modifying this file.",
    example: `// Run joy-check --doctor to inspect downstream dependents before editing.`
  },
  "SPI-301": {
    code: "SPI-301",
    title: "Vocabulary Drift (Zone Naming Mismatch)",
    series: "Series 300 — Predictive & Evolutionary Alerts",
    defaultSeverity: "ADVISORY",
    sop: "SOP: RENAME_DISAMBIGUATE",
    rationale:
      "Module or class naming contradicts its architectural zone (e.g., UI component naming inside `DOMAIN` or database driver naming inside `UI`).",
    remediation: "Align symbol names with their canonical zone role.",
    example: `// Use *Entity/*Policy in DOMAIN, *Controller/*Engine in CORE, *Adapter/*Repository in INFRASTRUCTURE.`
  },
  "SPI-302": {
    code: "SPI-302",
    title: "Refactoring Fatigue / Structural Fission Needed",
    series: "Series 300 — Predictive & Evolutionary Alerts",
    defaultSeverity: "ADVISORY",
    sop: "SOP: DECOMPOSE",
    rationale:
      "Repeatedly patching a complex file without reducing its cognitive complexity or class density leads to structural fatigue.",
    remediation: "Split cohesive responsibilities into dedicated modules.",
    example: `// Split multi-concern modules along domain/plumbing boundaries.`
  },
  "SPI-303": {
    code: "SPI-303",
    title: "Low Maintainability Index ($MI < 50$)",
    series: "Series 300 — Complexity & Maintainability",
    defaultSeverity: "ADVISORY",
    sop: "SOP: SIMPLIFY_CONTROL_FLOW",
    rationale:
      "High cognitive complexity combined with high line count pushes the Maintainability Index below 50.",
    remediation: "Use guard clauses, early returns, and pure helper extraction to flatten nested conditionals.",
    example: `// Replace 4-level nested if/else blocks with early guard returns.`
  },
  "SPI-401": {
    code: "SPI-401",
    title: "Dynamic Code Execution (`eval` / `new Function`)",
    series: "Series 400 — Security & Runtime Hygiene",
    defaultSeverity: "ERROR",
    sop: "SOP: ELIMINATE_EVAL",
    rationale:
      "Dynamic code evaluation introduces arbitrary code execution vulnerabilities and defeats static analysis.",
    remediation: "Replace `eval()` / `new Function()` with structured parsers or explicit dispatch tables.",
    example: `// Use JSON.parse() or a static handler lookup map instead of eval().`
  },
  "SPI-402": {
    code: "SPI-402",
    title: "Unsanitized DOM Assignment (`innerHTML` / `outerHTML` / `document.write`)",
    series: "Series 400 — Security & Runtime Hygiene",
    defaultSeverity: "ERROR",
    sop: "SOP: SANITIZE_DOM",
    rationale: "Direct HTML string injection into DOM nodes enables Cross-Site Scripting (XSS).",
    remediation: "Use `textContent`, safe DOM APIs, or sanitize explicitly before assignment.",
    example: `element.textContent = untrustedInput;`
  },
  "SPI-403": {
    code: "SPI-403",
    title: "Unverified `dangerouslySetInnerHTML`",
    series: "Series 400 — Security & Runtime Hygiene",
    defaultSeverity: "ERROR",
    sop: "SOP: SANITIZE_DOM",
    rationale: "Using `dangerouslySetInnerHTML` without adjacent `DOMPurify` or `sanitize` calls risks XSS.",
    remediation: "Pass HTML through `DOMPurify.sanitize()` before rendering.",
    example: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(rawHtml) }}`
  },
  DOMAIN: {
    code: "DOMAIN",
    title: "Zone 1: [LAYER: DOMAIN] (`src/domain/`)",
    series: "Canonical Architectural Zone",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "0% I/O, Pure Business Logic & Contracts (`I<ClassName>`)",
    rationale:
      "Houses pure business entities, value objects, domain equations, and formal `src/domain/interfaces/I*` contracts. Must never import I/O modules or depend on `CORE`, `INFRASTRUCTURE`, or `UI`.",
    remediation: "Place in `src/domain/` and add `/** [LAYER: DOMAIN] */` at line 1.",
    example: `/** [LAYER: DOMAIN] */\nexport class OrderPolicy {}`
  },
  CORE: {
    code: "CORE",
    title: "Zone 2: [LAYER: CORE] (`src/core/`)",
    series: "Canonical Architectural Zone",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "Use-Case Orchestration & Policy Engines",
    rationale:
      "Coordinates `DOMAIN` logic and `INFRASTRUCTURE` ports via `I<ClassName>` interfaces. Must never import `UI`.",
    remediation: "Place in `src/core/` and add `/** [LAYER: CORE] */` at line 1.",
    example: `/** [LAYER: CORE] */\nexport class CheckoutController {}`
  },
  INFRASTRUCTURE: {
    code: "INFRASTRUCTURE",
    title: "Zone 3: [LAYER: INFRASTRUCTURE] (`src/infrastructure/`)",
    series: "Canonical Architectural Zone",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "Concrete I/O Adapters & SDK Bridges",
    rationale:
      "Implements `src/domain/interfaces/I*` contracts using concrete filesystem, network, database, or OS APIs. Must never import `CORE` or `UI`, and may only import interfaces/types from `DOMAIN`.",
    remediation: "Place in `src/infrastructure/` and add `/** [LAYER: INFRASTRUCTURE] */` at line 1.",
    example: `/** [LAYER: INFRASTRUCTURE] */\nexport class SqlOrderRepository {}`
  },
  PLUMBING: {
    code: "PLUMBING",
    title: "Zone 4: [LAYER: PLUMBING] (`src/plumbing/` or `src/utils/`)",
    series: "Canonical Architectural Zone",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "Stateless Leaf Primitives (`UTILS` Alias)",
    rationale:
      "Pure, context-free helper functions. Leaf layer: 0% upward imports (`domain`, `core`, `infrastructure`, `ui`) and 0% mutable top-level `let`/`var` state.",
    remediation: "Place in `src/plumbing/` and add `/** [LAYER: PLUMBING] */` at line 1.",
    example: `/** [LAYER: PLUMBING] */\nexport const clamp = (x, min, max) => Math.max(min, Math.min(max, x));`
  },
  UI: {
    code: "UI",
    title: "Zone 5: [LAYER: UI] (`src/ui/`)",
    series: "Canonical Architectural Zone",
    defaultSeverity: "SOVEREIGN INVARIANT",
    sop: "Presenters, CLI Formatters, & Views",
    rationale:
      "Renders state and captures user intent, routing actions through `CORE` controllers. Must never import directly from `INFRASTRUCTURE`.",
    remediation: "Place in `src/ui/` and add `/** [LAYER: UI] */` at line 1.",
    example: `/** [LAYER: UI] */\nexport function renderOrderSummary(dto) {}`
  }
});

/**
 * Looks up an operational explanation for a diagnostic code (`SPI-206`) or zone (`domain`).
 * @param {string} query
 * @returns {Object|null}
 */
export function explainJoyRule(query) {
  if (!query || typeof query !== "string") return null;
  const upper = query.trim().toUpperCase();
  if (upper === "UTILS") return EXPLAIN_CATALOG.PLUMBING;
  return EXPLAIN_CATALOG[upper] || RTG_DIAGNOSTICS[upper] || null;
}


