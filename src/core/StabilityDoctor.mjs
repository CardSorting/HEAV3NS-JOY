/** [LAYER: CORE] */
/**
 * StabilityDoctor & IntegrityOptimizer Engine.
 * Synthesizes architectural health grades, Gravity Center analysis, Logic Hotspots,
 * Complexity Sinks, Martin Main Sequence Zone of Pain/Uselessness, and `I<ClassName>`
 * Contractual Sovereignty synthesis from a Spider audit graph.
 * Zero direct I/O, zero `ui` imports.
 */

import {
  computeGiniCoefficient,
  computeRippleProbability,
  computeBuildHealth
} from "../domain/entropyFormulas.mjs";
import { extractClassPublicMethods } from "../plumbing/sourceScanner.mjs";

/**
 * Computes comprehensive `StabilityDoctor` / `IntegrityOptimizer` insights for a Spider audit report.
 * @param {Map<string, Object>} nodes
 * @param {Array<Object>} serializedNodes
 * @param {Object} context
 * @param {number} context.violationCount
 * @param {number} context.advisoryCount
 * @param {number} context.entropyScore
 * @param {string[][]} context.runtimeCycles
 * @returns {Object}
 */
export function buildDoctorReport(
  nodes,
  serializedNodes,
  { violationCount, advisoryCount, entropyScore, runtimeCycles }
) {
  const codeNodes = serializedNodes.filter((n) => !String(n.path || "").endsWith(".md"));
  const afferentValues = (codeNodes.length > 0 ? codeNodes : serializedNodes).map(
    (n) => n.metrics.afferentCoupling
  );
  const giniCoefficient = computeGiniCoefficient(afferentValues);
  const rippleProbability = computeRippleProbability(nodes);
  const buildHealth = computeBuildHealth({
    violationCount,
    advisoryCount,
    entropyScore,
    totalFiles: nodes.size
  });

  const sortedByCoupling = [...serializedNodes].sort(
    (a, b) =>
      b.metrics.afferentCoupling +
      b.metrics.efferentCoupling -
      (a.metrics.afferentCoupling + a.metrics.efferentCoupling)
  );
  const gravityCenter = sortedByCoupling[0]
    ? {
        path: sortedByCoupling[0].path,
        zone: sortedByCoupling[0].effectiveZone,
        afferentCoupling: sortedByCoupling[0].metrics.afferentCoupling,
        efferentCoupling: sortedByCoupling[0].metrics.efferentCoupling,
        blastRadius: sortedByCoupling[0].metrics.blastRadius
      }
    : null;

  const logicHotspots = [...serializedNodes]
    .filter((n) => n.logicDensity > 0)
    .sort((a, b) => b.logicDensity - a.logicDensity)
    .slice(0, 5)
    .map((n) => ({
      path: n.path,
      zone: n.effectiveZone,
      logicDensity: n.logicDensity,
      lineCount: n.lineCount
    }));

  const complexitySinks = [...serializedNodes]
    .sort((a, b) => b.cognitiveComplexity - a.cognitiveComplexity)
    .slice(0, 5)
    .map((n) => ({
      path: n.path,
      zone: n.effectiveZone,
      cognitiveComplexity: n.cognitiveComplexity,
      maintainabilityIndex: n.metrics.maintainabilityIndex
    }));

  const optimizations = [];
  for (const node of nodes.values()) {
    const m = node.metrics;
    if (m.instability < 0.25 && m.abstractness < 0.15 && m.afferentCoupling >= 3) {
      optimizations.push({
        type: "ZONE_OF_PAIN",
        file: node.path,
        priority: "MEDIUM",
        summary: `Module '${node.path}' sits in Martin's Zone of Pain (I=${m.instability}, A=${m.abstractness}, Ca=${m.afferentCoupling}): highly depended-upon yet completely concrete.`,
        action: "Extract an `I<ClassName>` interface in `src/domain/interfaces/` to raise Abstractness."
      });
    }
    if (
      node.effectiveZone === "infrastructure" &&
      Array.isArray(node.exportedClasses) &&
      node.exportedClasses.length > 0 &&
      node.incomingEdges.length > 0
    ) {
      const clsName = node.exportedClasses[0];
      const rawContent = node.rawContent || "";
      const alreadyImplementsContract =
        rawContent.includes(`I${clsName}`) ||
        /\b(?:extends|implements)\s+I[A-Z][A-Za-z0-9_]*\b/.test(rawContent);
      const methods = extractClassPublicMethods(rawContent, clsName);
      if (methods.length > 0 && !alreadyImplementsContract) {
        const methodLines = methods
          .map((fn) => `  ${fn.isAsync ? "async " : ""}${fn.name}(${fn.params}) {}`)
          .join("\n");
        optimizations.push({
          type: "SYNTHESIZE_INTERFACE",
          file: node.path,
          priority: "LOW",
          summary: `Infrastructure adapter '${clsName}' can be decoupled via a formal contract 'I${clsName}'.`,
          action: `Create 'src/domain/interfaces/I${clsName}.mjs'`,
          synthesizedContract: `/** [LAYER: DOMAIN] */\nexport class I${clsName} {\n${methodLines}\n}`
        });
      }
    }
  }

  if (runtimeCycles.length > 0) {
    for (const cycle of runtimeCycles) {
      optimizations.unshift({
        type: "BREAK_CYCLE",
        file: cycle[0],
        priority: "HIGH",
        summary: `Break runtime dependency cycle: ${cycle.join(" -> ")}`,
        action: `Extract shared types/contracts between '${cycle[0]}' and '${cycle[cycle.length - 2]}' into 'src/domain/interfaces/'.`
      });
    }
  }

  return {
    buildHealth,
    giniCoefficient,
    rippleProbability,
    gravityCenter,
    logicHotspots,
    complexitySinks,
    optimizations: optimizations.slice(0, 10)
  };
}

