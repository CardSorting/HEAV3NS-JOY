/** [LAYER: DOMAIN] */
/**
 * Pure domain equations for the 5-Factor Structural Entropy Score ($E_S$),
 * Robert C. Martin Coupling Metrics ($C_a, C_e, I, A, D$), Maintainability Index ($MI$),
 * and Weighted Blast Radius.
 * Zero I/O.
 */

/**
 * Computes Robert C. Martin package stability metrics for a single graph node.
 * @param {Object} params
 * @param {number} params.afferentCoupling - Incoming edges ($C_a$)
 * @param {number} params.efferentCoupling - Outgoing edges ($C_e$)
 * @param {number} params.abstractExportCount - Interfaces / abstract exports
 * @param {number} params.totalExportCount - Total exported symbols
 * @returns {{ instability: number, abstractness: number, distanceFromMainSequence: number }}
 */
export function computeMartinMetrics({
  afferentCoupling,
  efferentCoupling,
  abstractExportCount,
  totalExportCount
}) {
  const totalCoupling = afferentCoupling + efferentCoupling;
  const instability =
    totalCoupling === 0 ? 0 : Number((efferentCoupling / totalCoupling).toFixed(4));
  const abstractness =
    totalExportCount === 0 ? 0 : Number((abstractExportCount / totalExportCount).toFixed(4));
  const distanceFromMainSequence = Number(Math.abs(abstractness + instability - 1).toFixed(4));

  return {
    instability,
    abstractness,
    distanceFromMainSequence
  };
}

/**
 * Computes the Maintainability Index ($MI \in [0, 100]$).
 * @param {number} lineCount
 * @param {number} cognitiveComplexity
 * @returns {number}
 */
export function computeMaintainabilityIndex(lineCount, cognitiveComplexity) {
  const loc = Math.max(1, lineCount);
  const halsteadVolume = Math.max(1, loc * 4.5);
  const raw =
    171 -
    5.2 * Math.log(halsteadVolume) -
    0.23 * Math.max(0, cognitiveComplexity) -
    16.2 * Math.log(loc);
  return Number(Math.max(0, Math.min(100, raw)).toFixed(2));
}

/**
 * Computes the project-wide 5-Factor Structural Entropy Score ($E_S \in [0, 1]$)
 * and Stability Index ($SI \in [0, 100]$).
 *
 * Weights:
 * - Depth Score (10%): files exceeding maxPathDepth
 * - Naming/Alignment Score (15%): files missing tags or geographically misaligned
 * - Orphan Score (15%): unreachable internal modules
 * - Coupling Score (40%): cross-layer violations & coupling ratio
 * - Complexity Score (20%): normalized cognitive complexity vs budget
 * - Cycle Penalty: +0.05 per runtime cycle (up to +0.30)
 *
 * @param {Object} params
 * @param {number} params.totalFiles
 * @param {number} params.deepFileCount
 * @param {number} params.misalignedFileCount
 * @param {number} params.orphanFileCount
 * @param {number} params.totalEdges
 * @param {number} params.crossZoneViolationEdges
 * @param {number} params.avgNormalizedComplexity
 * @param {number} params.runtimeCycleCount
 * @returns {{
 *   entropyScore: number,
 *   stabilityIndex: number,
 *   status: "SOVEREIGN"|"DRIFTING"|"CRITICAL",
 *   pillars: {
 *     depthScore: number,
 *     namingScore: number,
 *     orphanScore: number,
 *     couplingScore: number,
 *     complexityScore: number,
 *     cyclePenalty: number
 *   }
 * }}
 */
export function computeStructuralEntropy({
  totalFiles,
  deepFileCount,
  misalignedFileCount,
  orphanFileCount,
  totalEdges,
  crossZoneViolationEdges,
  avgNormalizedComplexity,
  runtimeCycleCount
}) {
  const n = Math.max(1, totalFiles);
  const e = Math.max(1, totalEdges);

  const depthScore = Math.min(1, deepFileCount / n);
  const namingScore = Math.min(1, misalignedFileCount / n);
  const orphanScore = Math.min(1, orphanFileCount / n);
  const couplingScore = Math.min(1, crossZoneViolationEdges / e);
  const complexityScore = Math.min(1, Math.max(0, avgNormalizedComplexity));
  const cyclePenalty = Math.min(0.3, runtimeCycleCount * 0.05);

  const rawEntropy =
    0.1 * depthScore +
    0.15 * namingScore +
    0.15 * orphanScore +
    0.4 * couplingScore +
    0.2 * complexityScore +
    cyclePenalty;

  const entropyScore = Number(Math.min(1.0, Math.max(0.0, rawEntropy)).toFixed(4));
  const stabilityIndex = Math.round((1.0 - entropyScore) * 100);

  let status = "SOVEREIGN";
  if (stabilityIndex < 70) {
    status = "CRITICAL";
  } else if (stabilityIndex < 85) {
    status = "DRIFTING";
  }

  return {
    entropyScore,
    stabilityIndex,
    status,
    pillars: {
      depthScore: Number(depthScore.toFixed(4)),
      namingScore: Number(namingScore.toFixed(4)),
      orphanScore: Number(orphanScore.toFixed(4)),
      couplingScore: Number(couplingScore.toFixed(4)),
      complexityScore: Number(complexityScore.toFixed(4)),
      cyclePenalty: Number(cyclePenalty.toFixed(4))
    }
  };
}

/**
 * Detects both runtime directed cycles (`SPI-201`) and compile-time type-only cycles (`SPI-104`).
 * @param {Map<string, Object>} nodes
 * @returns {{ runtimeCycles: string[][], typeOnlyCycles: string[][] }}
 */
export function detectGraphCycles(nodes) {
  const findCycles = (includeTypeOnly) => {
    const visited = new Set();
    const inStack = new Set();
    const stack = [];
    const cycles = [];
    const seenCycleKeys = new Set();

    const dfs = (currentPath) => {
      visited.add(currentPath);
      inStack.add(currentPath);
      stack.push(currentPath);

      const node = nodes.get(currentPath);
      if (node) {
        for (const edge of node.resolvedEdges) {
          if (!includeTypeOnly && edge.isTypeOnly) continue;
          const next = edge.target;
          if (!visited.has(next)) {
            dfs(next);
          } else if (inStack.has(next)) {
            const idx = stack.indexOf(next);
            if (idx !== -1) {
              const cyclePath = [...stack.slice(idx), next];
              const canonicalKey = [...stack.slice(idx)].sort().join("|");
              if (!seenCycleKeys.has(canonicalKey)) {
                seenCycleKeys.add(canonicalKey);
                cycles.push(cyclePath);
              }
            }
          }
        }
      }

      stack.pop();
      inStack.delete(currentPath);
    };

    for (const pathKey of nodes.keys()) {
      if (!visited.has(pathKey)) {
        dfs(pathKey);
      }
    }
    return { cycles, seenCycleKeys };
  };

  const runtimeResult = findCycles(false);
  const allResult = findCycles(true);
  const typeOnlyCycles = allResult.cycles.filter((cycle) => {
    const key = cycle.slice(0, -1).sort().join("|");
    return !runtimeResult.seenCycleKeys.has(key);
  });

  return {
    runtimeCycles: runtimeResult.cycles,
    typeOnlyCycles
  };
}

/**
 * Finds articulation points (Structural Bridges — SPI-207) using Tarjan's undirected DFS algorithm.
 * @param {Map<string, Object>} nodes
 * @returns {Set<string>}
 */
export function findArticulationBridges(nodes) {
  const adj = new Map();
  for (const key of nodes.keys()) {
    adj.set(key, new Set());
  }
  for (const [u, node] of nodes.entries()) {
    for (const edge of node.resolvedEdges) {
      if (adj.has(edge.target) && u !== edge.target) {
        adj.get(u).add(edge.target);
        adj.get(edge.target).add(u);
      }
    }
  }

  const visited = new Set();
  const disc = new Map();
  const low = new Map();
  const parent = new Map();
  const bridges = new Set();
  let timer = 0;

  const dfs = (u) => {
    visited.add(u);
    timer += 1;
    disc.set(u, timer);
    low.set(u, timer);
    let children = 0;

    for (const v of adj.get(u) || []) {
      if (!visited.has(v)) {
        children += 1;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u), low.get(v)));

        if (!parent.has(u) && children > 1) {
          bridges.add(u);
        }
        if (parent.has(u) && low.get(v) >= disc.get(u)) {
          bridges.add(u);
        }
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u), disc.get(v)));
      }
    }
  };

  for (const key of nodes.keys()) {
    if (!visited.has(key)) {
      dfs(key);
    }
  }

  return bridges;
}

/**
 * Computes weighted 1st- and 2nd-degree Blast Radius percentage ($0..100\%$).
 * @param {string} startPath
 * @param {Map<string, Object>} nodes
 * @returns {number}
 */
export function computeNodeBlastRadius(startPath, nodes) {
  if (nodes.size <= 1) return 0;
  const impacted = new Set();
  const startNode = nodes.get(startPath);
  if (!startNode) return 0;

  for (const inc1 of startNode.incomingEdges) {
    if (inc1.source !== startPath) {
      impacted.add(inc1.source);
      const dep1Node = nodes.get(inc1.source);
      if (dep1Node) {
        for (const inc2 of dep1Node.incomingEdges) {
          if (inc2.source !== startPath) {
            impacted.add(inc2.source);
          }
        }
      }
    }
  }

  let weightedSum = 0;
  for (const depPath of impacted) {
    const depNode = nodes.get(depPath);
    const zone = depNode?.effectiveZone;
    if (zone === "domain") weightedSum += 2.0;
    else if (zone === "core") weightedSum += 1.5;
    else weightedSum += 1.0;
  }

  return Math.min(100, Math.round((weightedSum / nodes.size) * 100));
}

/**
 * Computes the Gini Coefficient ($G \in [0, 1]$) of incoming dependency concentration (Hubbiness).
 * A high Gini coefficient ($> 0.65$) indicates that architectural weight is overly concentrated
 * in a few "God-Hub" modules (LUMI `SpiderEngine.calculateGiniCoefficient`).
 * @param {number[]} values - Non-negative coupling counts per module
 * @returns {number}
 */
export function computeGiniCoefficient(values) {
  if (!Array.isArray(values) || values.length <= 1) return 0;
  const sorted = values.map((v) => Math.max(0, Number(v) || 0)).sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
  if (mean === 0) return 0;

  let diffSum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      diffSum += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return Number(Math.min(1, diffSum / (2 * n * n * mean)).toFixed(4));
}

/**
 * Computes the workspace-wide Ripple Probability ($R_P \in [0, 1]$), measuring the expected
 * fraction of the codebase impacted by a random single-module change.
 * @param {Map<string, Object>} nodes
 * @returns {number}
 */
export function computeRippleProbability(nodes) {
  if (!nodes || nodes.size === 0) return 0;
  let totalComplexityWeight = 0;
  let weightedBlastSum = 0;
  for (const node of nodes.values()) {
    const weight = Math.max(1, node.cognitiveComplexity || 1);
    const rawBlast = node.metrics?.blastRadius ?? node.blastRadiusPercent ?? 0;
    const blastRatio = rawBlast / 100;
    weightedBlastSum += blastRatio * weight;
    totalComplexityWeight += weight;
  }
  return Number(Math.min(1, weightedBlastSum / Math.max(1, totalComplexityWeight)).toFixed(4));
}

/**
 * Computes the composite Build Health Score ($0..100\%$) and Gravity Center metrics
 * used by `StabilityDoctor` / `joy-check --doctor`.
 * @param {Object} params
 * @param {number} params.violationCount
 * @param {number} params.advisoryCount
 * @param {number} params.entropyScore
 * @param {number} params.totalFiles
 * @returns {{ score: number, grade: "A+"|"A"|"B"|"C"|"D"|"F", label: "SOVEREIGN"|"HEALTHY"|"DEGRADED"|"CRITICAL" }}
 */
export function computeBuildHealth({
  violationCount = 0,
  advisoryCount = 0,
  entropyScore = 0,
  totalFiles = 1
}) {
  const n = Math.max(1, totalFiles);
  const violationPenalty = Math.min(70, violationCount * Math.max(8, Math.round(40 / Math.sqrt(n))));
  const advisoryPenalty = Math.min(20, advisoryCount * 1.5);
  const entropyPenalty = Math.round(entropyScore * 25);
  const rawScore = Math.max(0, Math.min(100, Math.round(100 - violationPenalty - advisoryPenalty - entropyPenalty)));

  let grade = "A+";
  if (rawScore < 50) grade = "F";
  else if (rawScore < 65) grade = "D";
  else if (rawScore < 75) grade = "C";
  else if (rawScore < 85) grade = "B";
  else if (rawScore < 95) grade = "A";

  let label = "SOVEREIGN";
  if (violationCount > 0 && rawScore < 60) label = "CRITICAL";
  else if (violationCount > 0) label = "DEGRADED";
  else if (rawScore < 85) label = "HEALTHY";

  return { score: rawScore, grade, label };
}

/**
 * Computes multivariate workspace statistics (mean, standard deviation, and >2σ z-score outliers)
 * for cognitive complexity, afferent coupling, and line count (`MetricsEngine.getProjectStatistics`).
 *
 * @param {Array<Object> | Map<string, Object>} nodes
 * @returns {{
 *   complexity: { mean: number, stdDev: number },
 *   coupling: { mean: number, stdDev: number },
 *   size: { mean: number, stdDev: number },
 *   giniCoefficient: number,
 *   zScoreOutliers: Array<{ path: string, dimension: "complexity"|"coupling"|"size", value: number, zScore: number }>
 * }}
 */
export function computeWorkspaceStatistics(nodes) {
  const list = nodes instanceof Map ? [...nodes.values()] : Array.isArray(nodes) ? nodes : [];
  if (list.length === 0) {
    return {
      complexity: { mean: 0, stdDev: 0 },
      coupling: { mean: 0, stdDev: 0 },
      size: { mean: 0, stdDev: 0 },
      giniCoefficient: 0,
      zScoreOutliers: []
    };
  }

  const calcStats = (nums) => {
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b, 0) / n;
    const variance = nums.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);
    return {
      mean: Number(mean.toFixed(4)),
      stdDev: Number(stdDev.toFixed(4))
    };
  };

  const complexities = list.map(
    (n) => n.metrics?.cognitiveComplexity ?? n.cognitiveComplexity ?? 0
  );
  const couplings = list.map(
    (n) => n.metrics?.afferentCoupling ?? n.incomingEdges?.length ?? 0
  );
  const sizes = list.map((n) => n.metrics?.lineCount ?? n.lineCount ?? 0);

  const complexity = calcStats(complexities);
  const coupling = calcStats(couplings);
  const size = calcStats(sizes);
  const giniCoefficient = computeGiniCoefficient(couplings);

  const zScoreOutliers = [];
  list.forEach((node, idx) => {
    const path = node.path || node.relativePath || `node-${idx}`;
    if (complexity.stdDev > 0) {
      const z = (complexities[idx] - complexity.mean) / complexity.stdDev;
      if (z > 2.0) {
        zScoreOutliers.push({
          path,
          dimension: "complexity",
          value: complexities[idx],
          zScore: Number(z.toFixed(2))
        });
      }
    }
    if (coupling.stdDev > 0) {
      const z = (couplings[idx] - coupling.mean) / coupling.stdDev;
      if (z > 2.0) {
        zScoreOutliers.push({
          path,
          dimension: "coupling",
          value: couplings[idx],
          zScore: Number(z.toFixed(2))
        });
      }
    }
    if (size.stdDev > 0) {
      const z = (sizes[idx] - size.mean) / size.stdDev;
      if (z > 2.0) {
        zScoreOutliers.push({
          path,
          dimension: "size",
          value: sizes[idx],
          zScore: Number(z.toFixed(2))
        });
      }
    }
  });

  return {
    complexity,
    coupling,
    size,
    giniCoefficient,
    zScoreOutliers
  };
}

/**
 * Analyzes co-mutation patterns across historical workspace file-hash snapshots (`SPI-108` Ghost Coupling).
 * Identifies pairs of files that repeatedly mutate together (Jaccard similarity > 0.7 across >= 2 transitions)
 * while sharing zero direct structural dependency edges.
 *
 * @param {Array<{ fileHashes: Record<string, string> }>} snapshots - At least 3 chronological snapshots
 * @param {Array<Object>} [currentNodes=[]] - Current Spider graph nodes to check structural links
 * @returns {Array<{
 *   code: "SPI-108",
 *   severity: "WARN",
 *   fileA: string,
 *   fileB: string,
 *   jaccardSimilarity: number,
 *   coMutationCount: number,
 *   message: string,
 *   sop: string
 * }>}
 */
export function detectGhostCoupling(snapshots = [], currentNodes = []) {
  if (!Array.isArray(snapshots) || snapshots.length < 3) {
    return [];
  }

  // Build structural adjacency set so structurally linked files are excluded
  const structuralLinks = new Set();
  for (const node of currentNodes) {
    const from = node.path;
    for (const dep of node.dependencies || []) {
      structuralLinks.add(`${from}|${dep}`);
      structuralLinks.add(`${dep}|${from}`);
    }
  }

  /** @type {Map<string, Set<number>>} */
  const changeMatrix = new Map();
  for (let i = 1; i < snapshots.length; i += 1) {
    const prevHashes = snapshots[i - 1]?.fileHashes || {};
    const currHashes = snapshots[i]?.fileHashes || {};
    for (const [filePath, currHash] of Object.entries(currHashes)) {
      const prevHash = prevHashes[filePath];
      if (prevHash && prevHash !== currHash) {
        if (!changeMatrix.has(filePath)) {
          changeMatrix.set(filePath, new Set());
        }
        changeMatrix.get(filePath).add(i);
      }
    }
  }

  const files = [...changeMatrix.keys()].sort();
  const entanglements = [];

  for (let i = 0; i < files.length; i += 1) {
    for (let j = i + 1; j < files.length; j += 1) {
      const fileA = files[i];
      const fileB = files[j];
      if (structuralLinks.has(`${fileA}|${fileB}`)) continue;

      const setA = changeMatrix.get(fileA);
      const setB = changeMatrix.get(fileB);
      let intersection = 0;
      for (const step of setA) {
        if (setB.has(step)) intersection += 1;
      }
      const union = setA.size + setB.size - intersection;
      const similarity = union > 0 ? Number((intersection / union).toFixed(4)) : 0;

      if (similarity > 0.7 && intersection >= 2) {
        entanglements.push({
          code: "SPI-108",
          severity: "WARN",
          fileA,
          fileB,
          jaccardSimilarity: similarity,
          coMutationCount: intersection,
          message: `[SPI-108] GHOST COUPLING: '${fileA}' and '${fileB}' co-mutated in ${intersection} sessions (Jaccard=${similarity}) with zero structural dependency link.`,
          sop: "Extract shared constants/contracts into src/domain/ or src/plumbing/ to make hidden logical coupling explicit."
        });
      }
    }
  }

  return entanglements;
}



