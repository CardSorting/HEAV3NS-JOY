/** [LAYER: CORE] */
/**
 * Spider Agent Ergonomics & Reality Shield Toolkit (`SpiderToolkit`).
 * Provides Merkle root computation, `SPI-006` disk parity verification,
 * semantic footprint tracking across file moves, N-hop neighborhood scoping,
 * structural AST skeletonization, unified check phases (`pre-edit`, `post-edit`, `ci`, `delta`),
 * token-budgeted agent bundles, and Wire v2 session handoff.
 *
 * Hard Invariant: 0% raw I/O, 0% `ui` imports. Uses `IWorkspaceScanner` and pure `domain`/`plumbing`.
 */

import {
  sha256Hex,
  stableStringify,
  utf8ByteLength,
  extractSymbolFootprints,
  distillSourceSkeleton
} from "../plumbing/canonicalHash.mjs";
import { normalizeSlashes, resolveRelativeSpecifier } from "../plumbing/pathUtils.mjs";
import { extractHeaderTag } from "../plumbing/commentStyles.mjs";
import { CANONICAL_ZONES, DEFAULT_STABILITY_CONFIG } from "../domain/joyRules.mjs";
import {
  computeWorkspaceStatistics,
  detectGhostCoupling
} from "../domain/entropyFormulas.mjs";
import {
  RUNTIME_MODES,
  stableFindingId,
  clusterFindingsByCause,
  buildPriorityQueue,
  buildAgentPlaybook,
  evaluateSpiderGate,
  diffSpiderReports,
  compareSemanticFootprints
} from "../domain/broccoliRules.mjs";
import { JOYRIDE_KINDS } from "./JoyRideCache.mjs";

/**
 * Computes a deterministic SHA-256 Merkle root and per-file SHA-256 map across scanned files.
 *
 * @param {Array<{ relativePath: string, content: string }>} files
 * @returns {{ merkleRoot: string, fileHashes: Record<string, string> }}
 */
export function computeMerkleRoot(files = []) {
  const fileHashes = {};
  const sorted = [...files].sort((a, b) =>
    normalizeSlashes(a.relativePath).localeCompare(normalizeSlashes(b.relativePath))
  );

  const leaves = [];
  for (const f of sorted) {
    const rel = normalizeSlashes(f.relativePath);
    const hash = sha256Hex(f.content || "");
    fileHashes[rel] = hash;
    leaves.push(`${rel}:${hash}`);
  }

  return {
    merkleRoot: sha256Hex(leaves.join("\n")),
    fileHashes
  };
}

/**
 * Verifies physical disk parity against a previously captured `fileHashes` map or Merkle snapshot.
 * Detects `SPI-006` Reality Drift (`drifted` or `missing` files).
 *
 * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
 * @param {string} rootDir
 * @param {{ fileHashes?: Record<string, string>, merkleRoot?: string }} baseline
 * @returns {{
 *   synchronized: boolean,
 *   merkleRoot: string,
 *   driftedFiles: string[],
 *   missingFiles: string[],
 *   violations: Array<Object>
 * }}
 */
export function verifyDiskParity(scanner, rootDir, baseline = {}) {
  const config = scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
  const currentFiles = scanner.scanFiles(rootDir, config);
  const currentMerkle = computeMerkleRoot(currentFiles);
  const expectedHashes = baseline.fileHashes || {};

  const driftedFiles = [];
  const missingFiles = [];
  const violations = [];

  for (const [relPath, expectedHash] of Object.entries(expectedHashes)) {
    const actualHash = currentMerkle.fileHashes[relPath];
    if (!actualHash) {
      missingFiles.push(relPath);
      driftedFiles.push(relPath);
      violations.push({
        code: "SPI-006",
        findingId: stableFindingId({ code: "SPI-006", file: relPath, message: "Missing on disk" }),
        severity: "ERROR",
        file: relPath,
        line: 1,
        message: `Reality Drift: '${relPath}' existed in cached Spider graph (${expectedHash.slice(0, 8)}) but is missing on disk.`,
        sop: "Re-scan the workspace before planning or applying mutations."
      });
    } else if (actualHash !== expectedHash) {
      driftedFiles.push(relPath);
      violations.push({
        code: "SPI-006",
        findingId: stableFindingId({ code: "SPI-006", file: relPath, message: "Modified on disk" }),
        severity: "ERROR",
        file: relPath,
        line: 1,
        message: `Reality Drift: '${relPath}' disk hash (${actualHash.slice(0, 8)}) diverges from cached Spider graph (${expectedHash.slice(0, 8)}).`,
        sop: "Re-scan the workspace before planning or applying mutations."
      });
    }
  }

  const synchronized =
    driftedFiles.length === 0 &&
    (!baseline.merkleRoot || baseline.merkleRoot === currentMerkle.merkleRoot);

  return {
    synchronized,
    merkleRoot: currentMerkle.merkleRoot,
    driftedFiles,
    missingFiles,
    violations
  };
}

/**
 * Extracts semantic footprints for all exported symbols across a workspace.
 *
 * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
 * @param {string} rootDir
 * @returns {Array<Object>}
 */
export function computeProjectFootprints(scanner, rootDir) {
  const config = scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
  const files = scanner.scanFiles(rootDir, config);
  const all = [];
  for (const file of files) {
    const rel = normalizeSlashes(file.relativePath);
    const extracted = extractSymbolFootprints(file.content, rel);
    all.push(...extracted);
  }
  return all;
}

/**
 * Tracks exported symbol moves across two workspace footprint snapshots.
 *
 * @param {Array<Object>} beforeFootprints
 * @param {Array<Object>} afterFootprints
 * @returns {Array<Object>}
 */
export function trackSymbolMoves(beforeFootprints, afterFootprints) {
  return compareSemanticFootprints(beforeFootprints, afterFootprints);
}

/**
 * Computes the N-hop bidirectional dependency neighborhood around `targetFiles` in a Spider report.
 *
 * @param {Object} report
 * @param {string | string[]} targetFiles
 * @param {number} [depth=1]
 * @returns {{
 *   targetFiles: string[],
 *   depth: number,
 *   neighborhoodFiles: string[],
 *   nodes: Object[],
 *   violations: Object[],
 *   advisories: Object[],
 *   conforms: boolean
 * }}
 */
export function getNeighborhood(report, targetFiles, depth = 1) {
  const rawTargets = Array.isArray(targetFiles)
    ? targetFiles
    : String(targetFiles || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
  const seeds = new Set(rawTargets.map((p) => normalizeSlashes(p).replace(/^\.\//, "")));
  const nodes = Array.isArray(report?.nodes) ? report.nodes : [];

  const outgoingMap = new Map();
  const incomingMap = new Map();
  for (const n of nodes) {
    outgoingMap.set(n.path, new Set(n.dependencies || []));
    if (!incomingMap.has(n.path)) incomingMap.set(n.path, new Set());
  }
  for (const n of nodes) {
    for (const dep of n.dependencies || []) {
      if (!incomingMap.has(dep)) incomingMap.set(dep, new Set());
      incomingMap.get(dep).add(n.path);
    }
  }

  const visited = new Set(seeds);
  let frontier = new Set(seeds);

  for (let hop = 0; hop < Math.max(0, depth); hop += 1) {
    const nextFrontier = new Set();
    for (const current of frontier) {
      for (const out of outgoingMap.get(current) || []) {
        if (!visited.has(out)) {
          visited.add(out);
          nextFrontier.add(out);
        }
      }
      for (const inc of incomingMap.get(current) || []) {
        if (!visited.has(inc)) {
          visited.add(inc);
          nextFrontier.add(inc);
        }
      }
    }
    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  const neighborhoodFiles = [...visited].sort();
  const scopedNodes = nodes.filter((n) => visited.has(n.path));
  const scopedViolations = (report?.violations || []).filter(
    (v) => !v.file || visited.has(normalizeSlashes(v.file))
  );
  const scopedAdvisories = (report?.advisories || []).filter(
    (a) => !a.file || visited.has(normalizeSlashes(a.file))
  );

  return {
    targetFiles: [...seeds],
    depth,
    neighborhoodFiles,
    nodes: scopedNodes,
    violations: scopedViolations,
    advisories: scopedAdvisories,
    conforms: scopedViolations.length === 0
  };
}

/**
 * Distills a workspace file into its structural AST/signature skeleton using `distillSourceSkeleton`.
 *
 * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
 * @param {string} rootDir
 * @param {string} relativePath
 * @param {{ keepSymbol?: string }} [options]
 * @returns {{
 *   file: string,
 *   skeleton: string,
 *   originalBytes: number,
 *   skeletonBytes: number,
 *   reductionRatio: number,
 *   preservedSymbols: string[]
 * }}
 */
export function skeletonizeFile(scanner, rootDir, relativePath, options = {}) {
  const cleanTarget = normalizeSlashes(relativePath).replace(/^\.\//, "");
  const config = scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
  const files = scanner.scanFiles(rootDir, config);
  const match = files.find((f) => normalizeSlashes(f.relativePath) === cleanTarget);

  if (!match) {
    throw new Error(`Cannot skeletonize '${cleanTarget}': file not found in scanned workspace.`);
  }

  const distilled = distillSourceSkeleton(match.content, options);
  return {
    file: cleanTarget,
    ...distilled
  };
}

/**
 * Enforces a token budget (~4 bytes per token) on an Agent Bundle by progressively
 * trimming non-blocking warnings, advisories, and extended node lists while preserving blockers.
 *
 * @param {Object} bundle
 * @param {number} maxTokens
 * @returns {Object}
 */
export function applyBundleBudget(bundle, maxTokens = 2000) {
  const maxBytes = Math.max(512, maxTokens * 4);
  const copy = structuredClone(bundle);
  copy.budget = {
    maxTokens,
    maxBytes,
    trimmed: false
  };

  if (utf8ByteLength(stableStringify(copy)) <= maxBytes) {
    copy.budget.estimatedTokens = Math.ceil(utf8ByteLength(stableStringify(copy)) / 4);
    return copy;
  }

  copy.budget.trimmed = true;
  // Step 1: Trim warning items from priorityQueue, keeping drift + blockers
  if (Array.isArray(copy.priorityQueue)) {
    copy.priorityQueue = copy.priorityQueue.filter((item) => item.kind !== "warning");
  }
  if (utf8ByteLength(stableStringify(copy)) <= maxBytes) {
    copy.budget.estimatedTokens = Math.ceil(utf8ByteLength(stableStringify(copy)) / 4);
    return copy;
  }

  // Step 2: Trim non-blocker clusters
  if (Array.isArray(copy.clusters)) {
    copy.clusters = copy.clusters.filter((c) => c.hasBlockers);
  }
  // Step 3: Cap priorityQueue to top 10 blockers
  if (Array.isArray(copy.priorityQueue) && copy.priorityQueue.length > 10) {
    copy.priorityQueue = copy.priorityQueue.slice(0, 10);
  }

  copy.budget.estimatedTokens = Math.ceil(utf8ByteLength(stableStringify(copy)) / 4);
  return copy;
}

/**
 * Serializes a Spider Agent Bundle into a compact Wire v2 handoff envelope.
 *
 * @param {Object} bundle
 * @returns {string}
 */
export function serializeSpiderWire(bundle) {
  const envelope = {
    wireVersion: 2,
    timestamp: Date.now(),
    merkleRoot: bundle.merkleRoot || null,
    phase: bundle.phase || "ci",
    gate: bundle.gate,
    priorityQueue: bundle.priorityQueue || [],
    clusters: bundle.clusters || [],
    playbook: bundle.playbook || []
  };
  return stableStringify(envelope);
}

/**
 * Restores a Spider Wire v2 handoff envelope and validates schema version.
 *
 * @param {string | Object} wirePayload
 * @returns {Object}
 */
export function restoreSpiderFromWire(wirePayload) {
  const parsed =
    typeof wirePayload === "string" ? JSON.parse(wirePayload) : structuredClone(wirePayload);
  if (!parsed || parsed.wireVersion !== 2) {
    throw new Error("Invalid Spider Wire payload: expected wireVersion === 2.");
  }
  return parsed;
}

/**
 * Unified Spider Agent Check entrypoint supporting `pre-edit`, `post-edit`, `ci`, and `delta` phases.
 *
 * @param {import("./SpiderEngine.mjs").SpiderEngine} engine
 * @param {string} rootDir
 * @param {{
 *   phase?: "pre-edit"|"post-edit"|"ci"|"delta",
 *   theme?: "strict"|"lean",
 *   scope?: string | string[],
 *   neighborhoodDepth?: number,
 *   previousReport?: Object,
 *   baselineHashes?: Record<string, string>,
 *   gatePolicy?: Object,
 *   budgetTokens?: number
 * }} [options]
 */
export function runSpiderCheck(engine, rootDir, options = {}) {
  const phase = options.phase || "ci";
  const config = engine.scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
  const files = engine.scanner.scanFiles(rootDir, config);
  const { merkleRoot, fileHashes } = computeMerkleRoot(files);

  const parity = options.baselineHashes
    ? verifyDiskParity(engine.scanner, rootDir, { fileHashes: options.baselineHashes })
    : { synchronized: true, driftedFiles: [], missingFiles: [], violations: [] };

  const fullReport =
    typeof engine.auditProject === "function"
      ? engine.auditProject(rootDir, { theme: options.theme })
      : engine.audit(rootDir, { theme: options.theme, includeDoctor: phase === "ci" });

  // Stamp deterministic findingIds on every violation and advisory
  for (const v of fullReport.violations) {
    v.findingId = v.findingId || stableFindingId(v);
  }
  for (const a of fullReport.advisories) {
    a.findingId = a.findingId || stableFindingId(a);
  }

  const scoped = options.scope
    ? getNeighborhood(fullReport, options.scope, options.neighborhoodDepth ?? 1)
    : null;

  const ghostCouplings = Array.isArray(options.historySnapshots)
    ? detectGhostCoupling(options.historySnapshots, fullReport.nodes)
    : [];
  const statistics = computeWorkspaceStatistics(fullReport.nodes);

  const activeReport = scoped
    ? {
        ...fullReport,
        conforms: scoped.conforms && parity.synchronized,
        violations: [...parity.violations, ...scoped.violations],
        advisories: [...scoped.advisories, ...ghostCouplings],
        nodes: scoped.nodes,
        statistics
      }
    : {
        ...fullReport,
        conforms: fullReport.conforms && parity.synchronized,
        violations: [...parity.violations, ...fullReport.violations],
        advisories: [...fullReport.advisories, ...ghostCouplings],
        statistics
      };

  const gate = evaluateSpiderGate(activeReport, {
    ...(options.gatePolicy || {}),
    driftedFiles: parity.driftedFiles
  });
  const priorityQueue = buildPriorityQueue(activeReport, parity.driftedFiles);
  const clusters = clusterFindingsByCause(activeReport);
  const playbook = buildAgentPlaybook(activeReport, parity.driftedFiles);
  const diff = options.previousReport
    ? diffSpiderReports(options.previousReport, activeReport)
    : null;

  const rawBundle = {
    phase,
    merkleRoot,
    fileHashes,
    synchronized: parity.synchronized,
    driftedFiles: parity.driftedFiles,
    gate,
    counts: {
      errors: activeReport.violations.length,
      warnings: activeReport.advisories.length,
      files: activeReport.nodes.length
    },
    statistics,
    ghostCouplings,
    priorityQueue,
    clusters,
    playbook,
    diff
  };

  const agentBundle = options.budgetTokens
    ? applyBundleBudget(rawBundle, options.budgetTokens)
    : rawBundle;

  return {
    phase,
    merkleRoot,
    fileHashes,
    parity,
    report: activeReport,
    scoped,
    statistics,
    ghostCouplings,
    gate,
    priorityQueue,
    clusters,
    playbook,
    diff,
    agentBundle
  };
}

/**
 * Scaffolds a ready-to-use `stability.config.json` and `.joyignore` in `rootDir` (`joy-check --init`).
 *
 * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
 * @param {string} rootDir
 * @param {{ dryRun?: boolean }} [options]
 * @returns {{ dryRun: boolean, files: Array<{ file: string, content: string }> }}
 */
export function scaffoldWorkspaceConfig(scanner, rootDir, options = {}) {
  const dryRun = Boolean(options.dryRun);
  const configJson = `${JSON.stringify(DEFAULT_STABILITY_CONFIG, null, 2)}\n`;
  const joyIgnoreContent = [
    "# [LAYER: INFRASTRUCTURE]",
    "# HEAV3NS-JOY (.joyignore) — Paths excluded from Joyzoning & Spider audits",
    "node_modules/**",
    "dist/**",
    "build/**",
    "coverage/**",
    ".broccolidb/**",
    "*.min.js"
  ].join("\n") + "\n";

  const cleanRoot = normalizeSlashes(rootDir || ".").replace(/\/+$/, "");
  const files = [
    { file: `${cleanRoot}/stability.config.json`, content: configJson },
    { file: `${cleanRoot}/.joyignore`, content: joyIgnoreContent }
  ];

  if (!dryRun) {
    for (const item of files) {
      scanner.writeFile(item.file, item.content);
    }
  }

  return { dryRun, files };
}

const REQUIRED_WORKSPACE_DOCS = Object.freeze([
  "README.md",
  "AGENTS.md",
  "VALIDATION_REPORT.md",
  "docs/README.md",
  "docs/DOCS_GUIDE.md",
  "docs/AGENT_STACK.md",
  "docs/PROJECT_MAP.md",
  "docs/CODE_TO_DOC_MAP.md",
  "docs/CONSTITUTION.md",
  "docs/CODEBASE_STANDARDS.md",
  "docs/MAINTAINER.md",
  "docs/architecture/current.md",
  "docs/papers/README.md",
  "docs/papers/companion-brief.md",
  "docs/papers/philosophy.md",
  "docs/papers/whitepaper.md",
  "docs/api/README.md",
  "docs/api/public-api.md",
  "docs/api/cli.md",
  "docs/api/errors.md",
  "spec/00-CANONICAL-MODEL.md",
  "spec/01-SYNTAX-AND-HEADERS.md",
  "spec/02-DEPENDENCY-AND-COMPOSITION-RULES.md",
  "spec/03-METRICS-AND-FORENSICS.md",
  "spec/04-ENFORCEMENT-AND-LENIENCY.md",
  "spec/05-PORTABLE-SUBSTRATE-TRINITY.md",
  "workflows/01-TRIAD-AUDIT-PLANNING.md",
  "workflows/02-TACTICAL-REFACTORING-SOPS.md",
  "workflows/03-ADOPTING-IN-EXISTING-PROJECTS.md",
  "workflows/04-EXECUTION-ERGONOMICS-JOYRIDE.md",
  "workflows/05-PORTABLE-SPIDER-AND-BROCCOLIDB.md"
]);

const REQUIRED_DOCS_README_SECTIONS = Object.freeze([
  "## At a glance",
  "## Project configuration",
  "## Reading paths by audience",
  "## Where to document what",
  "## Release & policy",
  "## Local development",
  "## Principles"
]);

/**
 * Verifies LUMI-style documentation guardrails across the workspace:
 * 1. Required docs inventory (`REQUIRED_WORKSPACE_DOCS`).
 * 2. Top-of-file `<!-- [LAYER: <ZONE>] -->` header tags on all markdown files.
 * 3. `docs/README.md` structural sections, required cross-links, and Mermaid diagram.
 * 4. Relative markdown link resolution across all `.md` files (`0` broken links).
 * 5. Live codebase metric parity (`docs/README.md` & `docs/papers/companion-brief.md`).
 *
 * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
 * @param {string} rootDir
 * @param {{ expectedExportCount?: number }} [options]
 * @returns {{
 *   passed: boolean,
 *   requiredDocsChecked: number,
 *   markdownFilesScanned: number,
 *   linksChecked: number,
 *   missingDocs: string[],
 *   missingHeaders: string[],
 *   missingSections: string[],
 *   brokenLinks: Array<{ file: string, target: string, resolved: string }>,
 *   metricMismatches: string[]
 * }}
 */
export function verifyWorkspaceDocs(scanner, rootDir, options = {}) {
  const config = scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
  const scannedFiles = scanner.scanFiles(rootDir, config);
  const fileMap = new Map();
  const dirSet = new Set(["", ".", "configs", "examples", "tests", "src", "bin", "docs", "spec", "workflows"]);

  for (const f of scannedFiles) {
    const rel = normalizeSlashes(f.relativePath).replace(/^\.\//, "");
    fileMap.set(rel, f.content);
    const parts = rel.split("/");
    for (let i = 1; i < parts.length; i += 1) {
      dirSet.add(parts.slice(0, i).join("/"));
    }
  }

  // Known exempt config/metadata files at repository root / configs
  const knownExemptFiles = new Set([
    "package.json",
    "commission.md",
    "configs/stability.config.json",
    "configs/spider.spec.json"
  ]);

  const missingDocs = [];
  for (const reqPath of REQUIRED_WORKSPACE_DOCS) {
    if (!fileMap.has(reqPath)) {
      missingDocs.push(reqPath);
    }
  }

  const missingHeaders = [];
  const markdownFiles = [];
  for (const [relPath, content] of fileMap.entries()) {
    if (relPath.endsWith(".md")) {
      markdownFiles.push([relPath, content]);
      const header = extractHeaderTag(content);
      if (!header.normalizedZone) {
        missingHeaders.push(relPath);
      }
    }
  }

  const missingSections = [];
  const docsReadme = fileMap.get("docs/README.md") || "";
  if (docsReadme) {
    for (const sec of REQUIRED_DOCS_README_SECTIONS) {
      if (!docsReadme.includes(sec)) {
        missingSections.push(`docs/README.md missing section: ${sec}`);
      }
    }
    for (const reqLink of [
      "AGENT_STACK.md",
      "MAINTAINER.md",
      "PROJECT_MAP.md",
      "CODE_TO_DOC_MAP.md",
      "papers/companion-brief.md",
      "papers/philosophy.md",
      "papers/whitepaper.md"
    ]) {
      if (!docsReadme.includes(reqLink)) {
        missingSections.push(`docs/README.md missing required link: ${reqLink}`);
      }
    }
    if (!docsReadme.includes("```mermaid")) {
      missingSections.push("docs/README.md missing Mermaid diagram");
    }
  }

  const brokenLinks = [];
  let linksChecked = 0;
  const linkRegex = /\[[^\]]+\]\(([^)]+)\)/g;

  for (const [relPath, rawContent] of markdownFiles) {
    // Strip fenced code blocks and inline code spans before scanning markdown links
    const stripped = rawContent
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]+`/g, "");
    let match;
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(stripped)) !== null) {
      const rawTarget = match[1].trim();
      if (
        !rawTarget ||
        rawTarget.startsWith("http://") ||
        rawTarget.startsWith("https://") ||
        rawTarget.startsWith("mailto:") ||
        rawTarget.startsWith("file://") ||
        rawTarget.startsWith("conversation://") ||
        rawTarget.startsWith("#")
      ) {
        continue;
      }
      const noAnchor = rawTarget.split("#")[0].replace(/\/+$/, "");
      if (!noAnchor) continue;
      linksChecked += 1;

      const resolved = noAnchor.startsWith("/")
        ? noAnchor.replace(/^\/+/, "")
        : resolveRelativeSpecifier(relPath, noAnchor);

      const exists =
        fileMap.has(resolved) ||
        fileMap.has(`${resolved}.md`) ||
        dirSet.has(resolved) ||
        knownExemptFiles.has(resolved);

      if (!exists) {
        brokenLinks.push({ file: relPath, target: rawTarget, resolved });
      }
    }
  }

  const metricMismatches = [];
  const brief = fileMap.get("docs/papers/companion-brief.md") || "";
  if (docsReadme && brief) {
    const expectedZones = CANONICAL_ZONES.length;
    const expectedModes = RUNTIME_MODES.length;
    const expectedCacheKinds = Object.keys(JOYRIDE_KINDS).length;
    const expectedExports = options.expectedExportCount;

    if (!docsReadme.includes(`**${expectedZones}**`) || !brief.includes(`**${expectedZones}**`)) {
      metricMismatches.push(`canonical zones count **${expectedZones}**`);
    }
    if (!docsReadme.includes(`**${expectedModes}**`) || !brief.includes(`**${expectedModes}**`)) {
      metricMismatches.push(`runtime modes count **${expectedModes}**`);
    }
    if (
      !docsReadme.includes(`**${expectedCacheKinds}**`) ||
      !brief.includes(`**${expectedCacheKinds}**`)
    ) {
      metricMismatches.push(`JoyRide cache tiers count **${expectedCacheKinds}**`);
    }
    if (
      typeof expectedExports === "number" &&
      (!docsReadme.includes(`**${expectedExports}**`) || !brief.includes(`**${expectedExports}**`))
    ) {
      metricMismatches.push(`frozen public API exports count **${expectedExports}**`);
    }
  }

  const passed =
    missingDocs.length === 0 &&
    missingHeaders.length === 0 &&
    missingSections.length === 0 &&
    brokenLinks.length === 0 &&
    metricMismatches.length === 0;

  return {
    passed,
    requiredDocsChecked: REQUIRED_WORKSPACE_DOCS.length,
    markdownFilesScanned: markdownFiles.length,
    linksChecked,
    missingDocs,
    missingHeaders,
    missingSections,
    brokenLinks,
    metricMismatches
  };
}


