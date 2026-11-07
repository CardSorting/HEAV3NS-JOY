/** [LAYER: UI] */
/**
 * Public programmatic Composition Root for HEAV3NS-JOY reference tooling.
 * Wires `NodeWorkspaceScanner` and `NodeCasStorage` (`infrastructure`) into
 * `SpiderEngine`, `SpiderToolkit`, `RefactorHealer`, `StabilityDoctor`,
 * `JoyRideCache`, and `BroccoliRuntime` (`core`).
 */

import { NodeWorkspaceScanner } from "./infrastructure/NodeWorkspaceScanner.mjs";
import { NodeCasStorage } from "./infrastructure/NodeCasStorage.mjs";
import { IWorkspaceScanner } from "./domain/interfaces/IWorkspaceScanner.mjs";
import { ICasStorage, GuidedError, formatErrorGuidance } from "./domain/interfaces/ICasStorage.mjs";
import { SpiderEngine } from "./core/SpiderEngine.mjs";
import {
  computeMerkleRoot,
  verifyDiskParity,
  computeProjectFootprints,
  trackSymbolMoves,
  getNeighborhood,
  skeletonizeFile,
  applyBundleBudget,
  serializeSpiderWire,
  restoreSpiderFromWire,
  runSpiderCheck,
  scaffoldWorkspaceConfig,
  verifyWorkspaceDocs
} from "./core/SpiderToolkit.mjs";
import {
  computeWorkspaceStatistics,
  detectGhostCoupling
} from "./domain/entropyFormulas.mjs";
import { RefactorHealer } from "./core/RefactorHealer.mjs";
import {
  JoyRideCache,
  JOYRIDE_KINDS,
  createJoyRideFingerprint,
  createJoyRideKey,
  createCommandResultCacheKey,
  createGrepResultCacheKey,
  createFileMetadataCacheKey,
  createVerificationCacheKey,
  createDiffCacheKey,
  createScratchArtifactCacheKey
} from "./core/JoyRideCache.mjs";
import {
  RuntimeStateGraph,
  migrateRuntimeGraph,
  projectReplayForMode
} from "./core/RuntimeStateGraph.mjs";
import { BroccoliRuntime } from "./core/BroccoliRuntime.mjs";
import { buildDoctorReport } from "./core/StabilityDoctor.mjs";
import { explainJoyRule, EXPLAIN_CATALOG } from "./domain/joyRules.mjs";
import {
  RUNTIME_MODES,
  APPROVAL_POLICIES,
  DEFAULT_MODE_BUDGETS,
  GRAPH_NODE_KINDS,
  GRAPH_EDGE_KINDS,
  RTG_DIAGNOSTICS,
  verifyRuntimeGraphIntegrity,
  stableFindingId,
  clusterFindingsByCause,
  buildPriorityQueue,
  buildAgentPlaybook,
  evaluateSpiderGate,
  diffSpiderReports,
  compareSemanticFootprints
} from "./domain/broccoliRules.mjs";
import {
  sha256Hex,
  normalizeForHash,
  stableStringify,
  computeDeterministicFingerprint,
  utf8ByteLength,
  summarizeCommandOutput,
  normalizeAstTokens,
  extractSymbolFootprints,
  distillSourceSkeleton
} from "./plumbing/canonicalHash.mjs";
import {
  formatTerminalReport,
  formatDoctorReport,
  formatSarifReport,
  formatGithubAnnotations,
  formatMarkdownReport,
  formatExplainOutput,
  renderMermaidGraph
} from "./ui/CliFormatter.mjs";
import {
  formatCompactReport,
  formatLspDiagnostics,
  formatTapReport,
  formatJUnitReport,
  formatNdjsonReport,
  exportProblemMatcherConfig,
  formatStatsReport
} from "./ui/AgentFormatters.mjs";

/**
 * Runs a complete Joyzoning & Spider forensic audit on `targetDir`.
 * @param {string} targetDir
 * @param {{ theme?: "strict"|"relaxed"|"safety" }} options
 */
export function runJoyAudit(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  const engine = new SpiderEngine(scanner);
  return engine.auditProject(targetDir, options);
}

/**
 * Runs a unified Spider Agent Check (`pre-edit`, `post-edit`, `ci`, `delta`) with optional scoping.
 * @param {string} targetDir
 * @param {Object} [options]
 */
export function runJoyCheckPhase(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  const engine = new SpiderEngine(scanner);
  return runSpiderCheck(engine, targetDir, options);
}

/**
 * Distills a target workspace file into a structural AST/signature skeleton.
 * @param {string} targetDir
 * @param {string} relativePath
 * @param {{ keepSymbol?: string }} [options]
 */
export function runJoySkeleton(targetDir, relativePath, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  return skeletonizeFile(scanner, targetDir, relativePath, options);
}

/**
 * Auto-heals missing or misaligned `[LAYER: <ZONE>]` tags across `targetDir`.
 * @param {string} targetDir
 * @param {{ dryRun?: boolean }} [options]
 */
export function runJoyHeal(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  const healer = new RefactorHealer(scanner);
  return healer.healTags(targetDir, options);
}

/**
 * Auto-heals un-reassigned top-level `let`/`var` bindings in `[LAYER: PLUMBING]` files to `const`.
 * @param {string} targetDir
 * @param {{ dryRun?: boolean }} [options]
 */
export function runJoyHealStatelessness(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  const healer = new RefactorHealer(scanner);
  return healer.healStatelessness(targetDir, options);
}

/**
 * Plans relative import rewiring for moving a module from `fromRelPath` to `toRelPath`.
 * @param {string} targetDir
 * @param {string} fromRelPath
 * @param {string} toRelPath
 */
export function runJoyPlanMove(targetDir, fromRelPath, toRelPath) {
  const scanner = new NodeWorkspaceScanner();
  const healer = new RefactorHealer(scanner);
  return healer.planMove(targetDir, fromRelPath, toRelPath);
}

/**
 * Scaffolds `stability.config.json` and `.joyignore` in `targetDir`.
 * @param {string} targetDir
 * @param {{ dryRun?: boolean }} [options]
 */
export function runJoyInit(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  return scaffoldWorkspaceConfig(scanner, targetDir, options);
}

/**
 * Verifies LUMI-style documentation guardrails (required docs, headers, sections, links, live metrics).
 * @param {string} targetDir
 * @param {{ expectedExportCount?: number }} [options]
 */
export function runJoyDocsCheck(targetDir, options = {}) {
  const scanner = new NodeWorkspaceScanner();
  return verifyWorkspaceDocs(scanner, targetDir, {
    expectedExportCount: 84,
    ...options
  });
}

export {
  IWorkspaceScanner,
  ICasStorage,
  GuidedError,
  formatErrorGuidance,
  NodeWorkspaceScanner,
  NodeCasStorage,
  SpiderEngine,
  computeMerkleRoot,
  verifyDiskParity,
  computeProjectFootprints,
  trackSymbolMoves,
  getNeighborhood,
  skeletonizeFile,
  applyBundleBudget,
  serializeSpiderWire,
  restoreSpiderFromWire,
  runSpiderCheck,
  scaffoldWorkspaceConfig,
  verifyWorkspaceDocs,
  computeWorkspaceStatistics,
  detectGhostCoupling,
  RefactorHealer,
  JoyRideCache,
  JOYRIDE_KINDS,
  createJoyRideFingerprint,
  createJoyRideKey,
  createCommandResultCacheKey,
  createGrepResultCacheKey,
  createFileMetadataCacheKey,
  createVerificationCacheKey,
  createDiffCacheKey,
  createScratchArtifactCacheKey,
  summarizeCommandOutput,
  RuntimeStateGraph,
  BroccoliRuntime,
  migrateRuntimeGraph,
  projectReplayForMode,
  buildDoctorReport,
  explainJoyRule,
  EXPLAIN_CATALOG,
  RUNTIME_MODES,
  APPROVAL_POLICIES,
  DEFAULT_MODE_BUDGETS,
  GRAPH_NODE_KINDS,
  GRAPH_EDGE_KINDS,
  RTG_DIAGNOSTICS,
  verifyRuntimeGraphIntegrity,
  stableFindingId,
  clusterFindingsByCause,
  buildPriorityQueue,
  buildAgentPlaybook,
  evaluateSpiderGate,
  diffSpiderReports,
  compareSemanticFootprints,
  sha256Hex,
  normalizeForHash,
  stableStringify,
  computeDeterministicFingerprint,
  utf8ByteLength,
  normalizeAstTokens,
  extractSymbolFootprints,
  distillSourceSkeleton,
  formatTerminalReport,
  formatDoctorReport,
  formatSarifReport,
  formatGithubAnnotations,
  formatMarkdownReport,
  formatExplainOutput,
  renderMermaidGraph,
  formatCompactReport,
  formatLspDiagnostics,
  formatTapReport,
  formatJUnitReport,
  formatNdjsonReport,
  exportProblemMatcherConfig,
  formatStatsReport
};
