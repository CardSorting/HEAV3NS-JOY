/** [LAYER: CORE] */
/**
 * Spider Forensic Engine & Sovereign Audit Orchestrator.
 * Coordinates `domain` rules/formulas and `infrastructure` via `IWorkspaceScanner`.
 * Zero direct I/O, zero `ui` imports.
 */

import {
  DEFAULT_STABILITY_CONFIG,
  inferZoneFromPath,
  suggestZoneFromContent,
  isForbiddenDomainIOSpecifier,
  evaluateZoneDependency,
  explainJoyRule
} from "../domain/joyRules.mjs";
import {
  computeMartinMetrics,
  computeMaintainabilityIndex,
  computeStructuralEntropy,
  detectGraphCycles,
  findArticulationBridges,
  computeNodeBlastRadius
} from "../domain/entropyFormulas.mjs";
import { buildDoctorReport } from "./StabilityDoctor.mjs";
import {
  normalizeSlashes,
  computeDirectoryDepth,
  countParentTraversals,
  resolveRelativeSpecifier,
  resolveWorkspaceImportTarget,
  levenshteinDistance
} from "../plumbing/pathUtils.mjs";
import { extractHeaderTag } from "../plumbing/commentStyles.mjs";
import {
  extractBypassDirectives,
  extractImports,
  extractExportsAndClasses,
  analyzeCodeMetrics,
  stripCommentsAndStrings
} from "../plumbing/sourceScanner.mjs";

export class SpiderEngine {
  /**
   * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
   */
  constructor(scanner) {
    this.scanner = scanner;
  }

  /**
   * Executes a full Joyzoning & Spider forensic audit on `rootDir`.
   * @param {string} rootDir
   * @param {{ theme?: "strict"|"relaxed"|"safety" }} options
   */
  auditProject(rootDir, options = {}) {
    const config = this.scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
    const theme = options.theme || config.theme || "strict";
    const files = this.scanner.scanFiles(rootDir, config);

    const fileMap = new Map();
    for (const file of files) {
      fileMap.set(file.relativePath, file);
    }

    const compositionRoots = new Set(
      (config.compositionRoots || []).map((p) => normalizeSlashes(p).replace(/^\.\//, ""))
    );

    const nodes = new Map();
    const violations = [];
    const advisories = [];
    const bypassedItems = [];

    const maxPathDepth = config.global?.maxPathDepth ?? 4;
    const maxRelativeImportDepth = config.global?.maxRelativeImportDepth ?? 3;
    const fatModuleWarning = config.global?.fileSizeTiers?.fatModuleWarning ?? 800;
    const tier1Max = config.global?.fileSizeTiers?.tier1Max ?? 1000;

    let deepFileCount = 0;
    let misalignedFileCount = 0;

    // Pass 1: Build node metadata & evaluate file-local invariants
    for (const file of files) {
      const relPath = file.relativePath;
      const dirDepth = computeDirectoryDepth(relPath);
      if (dirDepth > maxPathDepth) {
        deepFileCount += 1;
      }

      const { rawTag, normalizedZone: declaredZone } = extractHeaderTag(file.content);
      const expectedZone = inferZoneFromPath(relPath, config);
      const effectiveZone =
        declaredZone || expectedZone || suggestZoneFromContent(file.content, file.extension);

      const bypass = extractBypassDirectives(file.content);
      const isCompositionRoot =
        compositionRoots.has(relPath) ||
        /(?:^|\/)(?:src\/)?(?:index|main|app|cli)\.[a-z]+$/i.test(relPath) ||
        relPath.startsWith("bin/");

      const imports = extractImports(file.content, file.extension);
      const exportInfo = extractExportsAndClasses(file.content, file.extension);
      const codeMetrics = analyzeCodeMetrics(file.content, file.extension);

      const recordDiagnostic = (diag) => {
        const ruleInfo = explainJoyRule(diag.code);
        const enriched = {
          ...diag,
          sop: diag.sop || ruleInfo?.sop || "SOP: ALIGN_ARCHITECTURE",
          remediation: diag.remediation || ruleInfo?.remediation || ""
        };
        if (
          bypass.hasFileBypass ||
          bypass.ignoredRules.includes(enriched.code) ||
          bypass.ignoredRules.includes("ALL")
        ) {
          bypassedItems.push({
            ...enriched,
            bypassReason: bypass.bypassReason || "Inline directive"
          });
          return;
        }
        if (enriched.severity === "error") {
          violations.push(enriched);
        } else {
          advisories.push(enriched);
        }
      };

      // Check 1: Header Tag & Geographic Alignment (SPI-208)
      if (!declaredZone) {
        misalignedFileCount += 1;
        recordDiagnostic({
          code: "SPI-208",
          type: "MISSING_HEADER_TAG",
          severity: theme === "strict" ? "error" : "warning",
          file: relPath,
          expectedZone: expectedZone || effectiveZone,
          declaredZone: null,
          message: `Missing [LAYER: ${(expectedZone || effectiveZone).toUpperCase()}] header tag within first 10KB.`
        });
      } else if (expectedZone && declaredZone !== expectedZone) {
        misalignedFileCount += 1;
        recordDiagnostic({
          code: "SPI-208",
          type: "GEOGRAPHIC_MISALIGNMENT",
          severity: theme === "strict" ? "error" : "warning",
          file: relPath,
          expectedZone,
          declaredZone,
          message: `Geographic Misalignment: file resides in '${expectedZone}' geography but declares [LAYER: ${rawTag}].`
        });
      }

      // Check 2: File Size Tiers (SPI-203)
      if (codeMetrics.lineCount > tier1Max) {
        recordDiagnostic({
          code: "SPI-203",
          type: "STRUCTURAL_LOAD_MONOLITH",
          severity: "warning",
          file: relPath,
          message: `File has ${codeMetrics.lineCount} lines (> ${tier1Max} Tier 1 limit). Apply DECOMPOSE SOP.`
        });
      } else if (codeMetrics.lineCount > fatModuleWarning) {
        recordDiagnostic({
          code: "SPI-203",
          type: "FAT_MODULE",
          severity: "warning",
          file: relPath,
          message: `Fat Module warning: ${codeMetrics.lineCount} lines (> ${fatModuleWarning}).`
        });
      }

      // Check 3: Domain Class Density (SPI-203)
      if (
        effectiveZone === "domain" &&
        (exportInfo.classCount > 3 || (exportInfo.classCount > 1 && codeMetrics.lineCount > 500))
      ) {
        recordDiagnostic({
          code: "SPI-203",
          type: "DOMAIN_CLASS_DENSITY",
          severity: "warning",
          file: relPath,
          message: `Domain file defines ${exportInfo.classCount} classes across ${codeMetrics.lineCount} lines (> 3 classes or > 1 class over 500 lines). Keep Domain entities focused.`
        });
      }

      // Check 4: Plumbing Statelessness (SPI-205)
      if (effectiveZone === "plumbing" && codeMetrics.hasMutableTopLevelState) {
        recordDiagnostic({
          code: "SPI-205",
          type: "MUTABLE_PLUMBING_STATE",
          severity: theme === "safety" ? "warning" : "error",
          file: relPath,
          message:
            "Plumbing Statelessness Violation: mutable top-level `let`/`var` state found in [LAYER: PLUMBING]. Apply HEAL_STATELESSNESS SOP."
        });
      }

      // Check 5: Security Anti-Patterns (SPI-401..403)
      for (const sec of codeMetrics.securityViolations) {
        recordDiagnostic({
          code: sec.code,
          type: "SECURITY_VIOLATION",
          severity: "error",
          file: relPath,
          message: sec.message
        });
      }

      // Check 6: Asymmetric Lifecycle Contract (SPI-110)
      if (codeMetrics.hasAsymmetricLifecycle) {
        recordDiagnostic({
          code: "SPI-110",
          type: "ASYMMETRIC_CONTRACT",
          severity: "info",
          file: relPath,
          message: "Class defines `init`/`connect`/`subscribe` without a matching `dispose`/`close`/`unsubscribe` method."
        });
      }

      // Check 7: Unused Import Bindings (SPI-112) in JS/TS files
      if ([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(file.extension)) {
        const cleanBody = stripCommentsAndStrings(file.content, file.extension);
        for (const imp of imports) {
          if (imp.isReExport || !Array.isArray(imp.localIdentifiers)) continue;
          for (const localIdent of imp.localIdentifiers) {
            const escaped = localIdent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const matches = cleanBody.match(new RegExp(`\\b${escaped}\\b`, "g")) || [];
            if (matches.length <= 1) {
              recordDiagnostic({
                code: "SPI-112",
                type: "UNUSED_IMPORT",
                severity: "info",
                file: relPath,
                line: imp.line,
                message: `Unused import binding '${localIdent}' from '${imp.specifier}'.`
              });
            }
          }
        }
      }

      nodes.set(relPath, {
        path: relPath,
        extension: file.extension,
        rawContent: file.content,
        declaredZone,
        expectedZone,
        effectiveZone,
        isCompositionRoot,
        dirDepth,
        imports,
        resolvedEdges: [],
        incomingEdges: [],
        externalImportCount: 0,
        ioEntropy: 0,
        ...exportInfo,
        ...codeMetrics,
        recordDiagnostic
      });
    }

    // Pass 2: Resolve Dependency Edges, Import Depth, & Cross-Layer Rules
    let totalEdges = 0;
    let crossZoneViolationEdges = 0;

    for (const node of nodes.values()) {
      let externalCount = 0;

      for (const imp of node.imports) {
        const parentDepth = countParentTraversals(imp.specifier);
        if (parentDepth > maxRelativeImportDepth) {
          node.recordDiagnostic({
            code: "SPI-209",
            type: "IMPORT_DEPTH_EXCEEDED",
            severity: theme === "strict" ? "error" : "warning",
            file: node.path,
            line: imp.line,
            message: `Relative import '${imp.specifier}' traverses ${parentDepth} parent directories (max allowed is ${maxRelativeImportDepth}).`
          });
        }

        // Check Domain raw I/O purity
        if (node.effectiveZone === "domain" && isForbiddenDomainIOSpecifier(imp.specifier)) {
          crossZoneViolationEdges += 1;
          node.recordDiagnostic({
            code: "SPI-206",
            type: "DOMAIN_IO_VIOLATION",
            severity: "error",
            file: node.path,
            line: imp.line,
            message: `Domain I/O Impurity: [LAYER: DOMAIN] file '${node.path}' imports forbidden I/O module '${imp.specifier}'.`
          });
        }

        const resolvedTarget = resolveWorkspaceImportTarget(
          node.path,
          imp.specifier,
          fileMap,
          config.pathAliases,
          config.goModulePrefix
        );
        if (!resolvedTarget) {
          const isExistingJson =
            imp.specifier.endsWith(".json") &&
            typeof this.scanner.pathExists === "function" &&
            this.scanner.pathExists(
              `${normalizeSlashes(rootDir || ".").replace(/\/+$/, "")}/${resolveRelativeSpecifier(node.path, imp.specifier)}`
            );
          if (imp.specifier.startsWith(".") && !isExistingJson) {
            node.recordDiagnostic({
              code: "SPI-101",
              type: "GHOST_FILE",
              severity: "info",
              file: node.path,
              line: imp.line,
              message: `Local import '${imp.specifier}' could not be resolved on disk.`
            });
          } else {
            externalCount += 1;
          }
          continue;
        }

        totalEdges += 1;
        const targetNode = nodes.get(resolvedTarget);
        node.resolvedEdges.push({
          target: resolvedTarget,
          isTypeOnly: imp.isTypeOnly,
          isReExport: Boolean(imp.isReExport),
          line: imp.line,
          specifier: imp.specifier,
          symbols: imp.symbols || []
        });
        if (targetNode) {
          targetNode.incomingEdges.push({
            source: node.path,
            isTypeOnly: imp.isTypeOnly
          });
        }
      }

      node.externalImportCount = externalCount;
      const totalImports = node.imports.length;
      node.ioEntropy =
        totalImports === 0 ? 0 : Number((externalCount / totalImports).toFixed(4));

      // Check Misplaced Domain Logic in Infrastructure (SPI-111)
      if (
        node.effectiveZone === "infrastructure" &&
        node.logicDensity > 0.3 &&
        node.ioEntropy === 0 &&
        node.lineCount > 30
      ) {
        node.recordDiagnostic({
          code: "SPI-111",
          type: "DOMAIN_DRIFT",
          severity: "info",
          file: node.path,
          message: `Infrastructure module has high pure logic density (${node.logicDensity}) with 0% external I/O. Consider extracting business rules to [LAYER: DOMAIN].`
        });
      }
    }

    // Pass 2.5: Transitive Symbol Resolution (SPI-102), Barrel Sovereignty, Zone Matrix (SPI-206),
    // Contractual Sovereignty (SPI-107), & Symbol Resonance (SPI-106)
    const allInterfaceNames = new Set();
    const symbolZoneMap = new Map();

    for (const node of nodes.values()) {
      if (node.isCompositionRoot) continue;
      for (const sym of node.exportedSymbols) {
        if (/^I[A-Z][A-Za-z0-9_]*$/.test(sym)) {
          allInterfaceNames.add(sym);
        }
        if (sym === "default" || sym.length <= 2) continue;
        if (!symbolZoneMap.has(sym)) {
          symbolZoneMap.set(sym, []);
        }
        symbolZoneMap.get(sym).push({ path: node.path, zone: node.effectiveZone });
      }
    }

    // Check SPI-106: Symbol Resonance (same exported symbol name across distinct zones)
    for (const [sym, providers] of symbolZoneMap.entries()) {
      const distinctZones = new Set(providers.map((p) => p.zone));
      if (distinctZones.size > 1) {
        const primary = nodes.get(providers[0].path);
        if (primary) {
          primary.recordDiagnostic({
            code: "SPI-106",
            type: "SYMBOL_RESONANCE",
            severity: "info",
            file: primary.path,
            message: `Symbol Resonance: '${sym}' is exported across multiple zones (${providers
              .map((p) => `${p.path} [${p.zone}]`)
              .join(", ")}). Consider role-specific naming.`
          });
        }
      }
    }

    for (const node of nodes.values()) {
      for (const edge of node.resolvedEdges) {
        const targetNode = nodes.get(edge.target);
        if (!targetNode) continue;

        // Check SPI-102: Ghost Symbol with recursive re-export traversal & Levenshtein suggestion
        if (
          Array.isArray(edge.symbols) &&
          edge.symbols.length > 0 &&
          [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].includes(targetNode.extension)
        ) {
          for (const sym of edge.symbols) {
            if (sym === "*") continue;
            if (!this.#resolveSymbolTransitively(targetNode, sym, nodes, new Set())) {
              const suggestion = this.#findClosestSymbol(sym, targetNode, nodes);
              const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
              node.recordDiagnostic({
                code: "SPI-102",
                type: "GHOST_SYMBOL",
                severity: "info",
                file: node.path,
                targetFile: targetNode.path,
                line: edge.line,
                suggestion: suggestion || null,
                message: `Ghost Symbol: '${sym}' is imported from '${targetNode.path}' but is not declared in its direct or transitive exports.${hint}`
              });
            }
          }
        }

        // Check SPI-107: Contractual Sovereignty (Concrete Infrastructure class imported by Core without I<ClassName>)
        if (
          node.effectiveZone === "core" &&
          targetNode.effectiveZone === "infrastructure" &&
          !node.isCompositionRoot &&
          Array.isArray(targetNode.exportedClasses)
        ) {
          for (const clsName of targetNode.exportedClasses) {
            const expectedContract = `I${clsName}`;
            if (
              (edge.symbols.includes(clsName) || edge.symbols.includes("*")) &&
              !allInterfaceNames.has(expectedContract) &&
              !(targetNode.rawContent && targetNode.rawContent.includes("extends I")) &&
              !(targetNode.rawContent && targetNode.rawContent.includes("implements I"))
            ) {
              node.recordDiagnostic({
                code: "SPI-107",
                type: "IMPLICIT_INTERFACE_BREACH",
                severity: "info",
                file: node.path,
                targetFile: targetNode.path,
                line: edge.line,
                message: `Contractual Sovereignty Advisory: '${node.path}' [CORE] imports concrete Infrastructure class '${clsName}' without a formal '${expectedContract}' interface in 'domain/interfaces/'.`
              });
            }
          }
        }

        // Check Barrel Sovereignty: external callers should import subfolder barrel if one exists
        this.#checkBarrelBypass(node, targetNode, edge.line, fileMap);

        const zoneCheck = evaluateZoneDependency({
          sourceZone: node.effectiveZone,
          targetZone: targetNode.effectiveZone,
          targetPath: targetNode.path,
          isTypeOnly: edge.isTypeOnly,
          isCompositionRoot: node.isCompositionRoot
        });

        if (!zoneCheck.allowed) {
          crossZoneViolationEdges += 1;
          const isDomainViolation = node.effectiveZone === "domain";
          const severity =
            theme === "strict" || (theme === "relaxed" && isDomainViolation)
              ? "error"
              : "warning";
          node.recordDiagnostic({
            code: zoneCheck.code || "SPI-206",
            type: "CROSS_ZONE_LEAK",
            severity,
            file: node.path,
            targetFile: targetNode.path,
            line: edge.line,
            message: zoneCheck.reason
          });
        }
      }
    }

    // Pass 3: Graph Algorithms — Cycles (SPI-201 / SPI-104), Bridges (SPI-207), Blast Radius (SPI-202 / SPI-300), Orphans (SPI-204)
    const { runtimeCycles, typeOnlyCycles } = detectGraphCycles(nodes);
    for (const cycle of runtimeCycles) {
      const cycleHead = nodes.get(cycle[0]);
      if (cycleHead) {
        cycleHead.recordDiagnostic({
          code: "SPI-201",
          type: "CIRCULAR_DEPENDENCY",
          severity: theme === "safety" ? "warning" : "error",
          file: cycle[0],
          cycle,
          message: `Runtime Circular Dependency detected: ${cycle.join(" -> ")}`
        });
      }
    }
    for (const typeCycle of typeOnlyCycles) {
      const cycleHead = nodes.get(typeCycle[0]);
      if (cycleHead) {
        cycleHead.recordDiagnostic({
          code: "SPI-104",
          type: "TYPE_CYCLE_ADVISORY",
          severity: "info",
          file: typeCycle[0],
          cycle: typeCycle,
          message: `Compile-time type cycle detected (erased at runtime): ${typeCycle.join(" -> ")}`
        });
      }
    }

    const bridges = findArticulationBridges(nodes);
    for (const bridgePath of bridges) {
      const bNode = nodes.get(bridgePath);
      if (bNode && bNode.incomingEdges.length + bNode.resolvedEdges.length >= 2) {
        bNode.recordDiagnostic({
          code: "SPI-207",
          type: "STRUCTURAL_BRIDGE",
          severity: "info",
          file: bridgePath,
          message: `Node '${bridgePath}' is a Tarjan articulation bridge connecting distinct subgraphs.`
        });
      }
    }

    let orphanFileCount = 0;
    let totalNormalizedComplexity = 0;

    for (const node of nodes.values()) {
      const ca = node.incomingEdges.length;
      const ce = node.resolvedEdges.length;
      const martin = computeMartinMetrics({
        afferentCoupling: ca,
        efferentCoupling: ce,
        abstractExportCount: node.abstractExportCount,
        totalExportCount: node.totalExportCount
      });
      const maintainabilityIndex = computeMaintainabilityIndex(
        node.lineCount,
        node.cognitiveComplexity
      );
      const blastRadius = computeNodeBlastRadius(node.path, nodes);

      node.metrics = {
        afferentCoupling: ca,
        efferentCoupling: ce,
        ...martin,
        maintainabilityIndex,
        blastRadius,
        isBridge: bridges.has(node.path)
      };

      if (blastRadius > 80) {
        node.recordDiagnostic({
          code: "SPI-300",
          type: "RIPPLE_PROPHECY",
          severity: "info",
          file: node.path,
          message: `Ripple Prophecy: '${node.path}' impacts ${blastRadius}% of the workspace (> 80% threshold).`
        });
      }
      if (blastRadius > 60) {
        node.recordDiagnostic({
          code: "SPI-202",
          type: "SYSTEMIC_RISK_BLAST_RADIUS",
          severity: "info",
          file: node.path,
          message: `High Blast Radius (${blastRadius}% of graph affected by changes to '${node.path}').`
        });
      }

      const isCodeFile = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"].includes(
        node.extension
      );
      const isTestOrExample =
        node.path.includes("test") ||
        node.path.includes("spec/") ||
        node.path.startsWith("examples/") ||
        node.path.startsWith("workflows/");
      const isBarrelFile = /\/(?:index|__init__|mod)\.[a-z]+$/i.test(node.path);

      if (
        isCodeFile &&
        !node.isCompositionRoot &&
        !isTestOrExample &&
        !isBarrelFile &&
        ca === 0 &&
        nodes.size > 1
      ) {
        orphanFileCount += 1;
        node.recordDiagnostic({
          code: "SPI-204",
          type: "ORPHANED_MODULE",
          severity: "info",
          file: node.path,
          message: `Orphaned Module: '${node.path}' has 0 incoming dependents (Ca = 0).`
        });
      }

      const layerMaxComplexity =
        config.layers?.[node.effectiveZone]?.maxComplexity ?? 3000;
      totalNormalizedComplexity += Math.min(1, node.cognitiveComplexity / layerMaxComplexity);
    }

    const avgNormalizedComplexity =
      nodes.size === 0 ? 0 : totalNormalizedComplexity / nodes.size;

    const entropy = computeStructuralEntropy({
      totalFiles: nodes.size,
      deepFileCount,
      misalignedFileCount,
      orphanFileCount,
      totalEdges,
      crossZoneViolationEdges,
      avgNormalizedComplexity,
      runtimeCycleCount: runtimeCycles.length
    });

    const zoneSummary = {
      domain: 0,
      core: 0,
      infrastructure: 0,
      plumbing: 0,
      ui: 0
    };
    const serializedNodes = [];
    const afferentValues = [];
    for (const node of nodes.values()) {
      if (zoneSummary[node.effectiveZone] !== undefined) {
        zoneSummary[node.effectiveZone] += 1;
      }
      afferentValues.push(node.metrics.afferentCoupling);
      serializedNodes.push({
        path: node.path,
        declaredZone: node.declaredZone,
        expectedZone: node.expectedZone,
        effectiveZone: node.effectiveZone,
        lineCount: node.lineCount,
        logicDensity: node.logicDensity,
        ioEntropy: node.ioEntropy,
        cognitiveComplexity: node.cognitiveComplexity,
        dependencies: node.resolvedEdges.map((e) => e.target),
        dependents: node.incomingEdges.map((e) => e.source),
        metrics: node.metrics
      });
    }

    const doctor = buildDoctorReport(nodes, serializedNodes, {
      violationCount: violations.length,
      advisoryCount: advisories.length,
      entropyScore: entropy.entropyScore,
      runtimeCycles
    });

    return {
      rootDir,
      theme,
      totalFiles: nodes.size,
      totalEdges,
      zoneSummary,
      entropy,
      buildHealth: doctor.buildHealth,
      giniCoefficient: doctor.giniCoefficient,
      rippleProbability: doctor.rippleProbability,
      doctor,
      runtimeCycles,
      bridges: Array.from(bridges),
      violations,
      advisories,
      bypassedItems,
      nodes: serializedNodes,
      conforms: violations.length === 0
    };
  }

  /**
   * Recursively checks whether `targetNode` exports `symbol` either directly or via `export ... from` / `export * from`.
   * @param {Object} targetNode
   * @param {string} symbol
   * @param {Map<string, Object>} nodes
   * @param {Set<string>} visited
   * @returns {boolean}
   */
  #resolveSymbolTransitively(targetNode, symbol, nodes, visited) {
    if (!targetNode || visited.has(targetNode.path)) return false;
    visited.add(targetNode.path);

    if (targetNode.exportedSymbols.includes(symbol)) {
      return true;
    }

    for (const edge of targetNode.resolvedEdges) {
      if (!edge.isReExport) continue;
      if (edge.symbols.includes(symbol) || edge.symbols.includes("*")) {
        const nextNode = nodes.get(edge.target);
        if (nextNode && this.#resolveSymbolTransitively(nextNode, symbol, nodes, visited)) {
          return true;
        }
      }
    }

    // If the file has an unresolved external `export * from "pkg"`, be lenient
    if (targetNode.hasStarReExport) {
      return true;
    }
    return false;
  }

  /**
   * Finds the closest exported symbol name using Levenshtein edit distance (<= 3).
   * @param {string} symbol
   * @param {Object} targetNode
   * @param {Map<string, Object>} nodes
   * @returns {string|null}
   */
  #findClosestSymbol(symbol, targetNode, nodes) {
    const candidates = new Set(targetNode.exportedSymbols || []);
    for (const edge of targetNode.resolvedEdges) {
      if (edge.isReExport) {
        const next = nodes.get(edge.target);
        if (next) {
          for (const s of next.exportedSymbols || []) candidates.add(s);
        }
      }
    }
    let best = null;
    let bestDist = 4;
    for (const cand of candidates) {
      const dist = levenshteinDistance(symbol.toLowerCase(), cand.toLowerCase());
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    return best;
  }

  /**
   * Checks Barrel Sovereignty: if `targetNode` lives inside a directory that has an `index.*` barrel,
   * external callers outside that directory should import the barrel rather than internal files.
   * @param {Object} sourceNode
   * @param {Object} targetNode
   * @param {number} line
   * @param {Map<string, Object>} fileMap
   */
  #checkBarrelBypass(sourceNode, targetNode, line, fileMap) {
    if (sourceNode.isCompositionRoot) return;
    const targetSlash = targetNode.path.lastIndexOf("/");
    if (targetSlash <= 0) return;
    const targetDir = targetNode.path.slice(0, targetSlash);
    const targetBase = targetNode.path.slice(targetSlash + 1);
    if (/^(?:index|__init__|mod)\.[a-z]+$/i.test(targetBase)) return;

    const sourceSlash = sourceNode.path.lastIndexOf("/");
    const sourceDir = sourceSlash > 0 ? sourceNode.path.slice(0, sourceSlash) : "";
    if (sourceDir === targetDir || sourceDir.startsWith(`${targetDir}/`)) return;

    // Only enforce barrel sovereignty for cohesive feature/module subfolders (depth >= 2, e.g. `src/domain/orders`)
    // rather than top-level `src/` composition entrypoints.
    if (!targetDir.includes("/")) return;

    const barrelCandidates = [
      `${targetDir}/index.ts`,
      `${targetDir}/index.tsx`,
      `${targetDir}/index.mjs`,
      `${targetDir}/index.js`
    ];
    const existingBarrel = barrelCandidates.find((b) => fileMap.has(b));
    if (existingBarrel && existingBarrel !== sourceNode.path) {
      sourceNode.recordDiagnostic({
        code: "SPI-206",
        type: "BARREL_BYPASS",
        severity: "info",
        file: sourceNode.path,
        targetFile: targetNode.path,
        line,
        message: `Barrel Sovereignty Advisory: '${sourceNode.path}' imports internal module '${targetNode.path}' directly, bypassing barrel '${existingBarrel}'.`
      });
    }
  }
}


