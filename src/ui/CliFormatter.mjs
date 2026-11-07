/** [LAYER: UI] */
/**
 * CLI, CI/CD, SARIF, GitHub Actions, Doctor, and Markdown Report Presenter for Joyzoning Audits.
 * Renders human/agent-readable Sovereign Audit reports, JSON/SARIF telemetry, and Mermaid dependency graphs.
 * Zero direct `infrastructure` imports.
 */

import { EXPLAIN_CATALOG, explainJoyRule } from "../domain/joyRules.mjs";

/**
 * Formats an audit report into a concise, high-signal terminal summary.
 * @param {Object} report
 * @param {{ showMermaid?: boolean }} options
 * @returns {string}
 */
export function formatTerminalReport(report, options = {}) {
  const lines = [];
  const statusBanner = report.conforms ? "PASS (SOVEREIGN)" : "FAIL (VIOLATIONS DETECTED)";

  lines.push("======================================================================");
  lines.push(`  HEAV3NS-JOY SOVEREIGN AUDIT REPORT — ${statusBanner}`);
  lines.push("======================================================================");
  lines.push(`Target Root     : ${report.rootDir}`);
  lines.push(`Theme           : ${report.theme}`);
  lines.push(`Files Scanned   : ${report.totalFiles} (${report.totalEdges} local dependency edges)`);
  lines.push(
    `Zone Breakdown  : DOMAIN=${report.zoneSummary.domain} | CORE=${report.zoneSummary.core} | INFRA=${report.zoneSummary.infrastructure} | PLUMBING=${report.zoneSummary.plumbing} | UI=${report.zoneSummary.ui}`
  );
  lines.push(
    `Stability Index : ${report.entropy.stabilityIndex}% (Entropy Score: ${report.entropy.entropyScore} — ${report.entropy.status})`
  );
  if (report.buildHealth) {
    lines.push(
      `Build Health    : ${report.buildHealth.score}% [Grade: ${report.buildHealth.grade} — ${report.buildHealth.label}] | Gini Hubbiness: ${report.giniCoefficient ?? 0}`
    );
  }
  lines.push(
    `Entropy Pillars : Depth=${report.entropy.pillars.depthScore} | Naming=${report.entropy.pillars.namingScore} | Orphan=${report.entropy.pillars.orphanScore} | Coupling=${report.entropy.pillars.couplingScore} | Complexity=${report.entropy.pillars.complexityScore} | CyclePenalty=${report.entropy.pillars.cyclePenalty}`
  );
  lines.push("----------------------------------------------------------------------");

  if (report.violations.length === 0) {
    lines.push("Blocking Violations (0): None. 100% Joyzoning Conformance.");
  } else {
    lines.push(`Blocking Violations (${report.violations.length}):`);
    for (const v of report.violations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      lines.push(`  [ERROR] [${v.code}] ${loc} — ${v.message}`);
      if (v.remediation) {
        lines.push(`          ↳ Fix (${v.sop || "SOP"}): ${v.remediation}`);
      }
    }
  }

  if (report.advisories.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push(`Non-Blocking Advisories (${report.advisories.length}):`);
    for (const a of report.advisories.slice(0, 15)) {
      const loc = a.line ? `${a.file}:${a.line}` : a.file;
      lines.push(`  [${a.severity.toUpperCase()}] [${a.code}] ${loc} — ${a.message}`);
    }
    if (report.advisories.length > 15) {
      lines.push(`  ... and ${report.advisories.length - 15} more advisories.`);
    }
  }

  if (report.bypassedItems.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push(`Audited Bypasses (${report.bypassedItems.length}):`);
    for (const b of report.bypassedItems) {
      lines.push(`  [BYPASS] [${b.code}] ${b.file} (${b.bypassReason})`);
    }
  }

  if (options.showMermaid) {
    lines.push("----------------------------------------------------------------------");
    lines.push("Mermaid Dependency Graph:");
    lines.push(renderMermaidGraph(report));
  }

  lines.push("======================================================================");
  return lines.join("\n");
}

/**
 * Formats a `StabilityDoctor` / `--doctor` architectural health checkup report.
 * @param {Object} report
 * @returns {string}
 */
export function formatDoctorReport(report) {
  const doc = report.doctor || {};
  const health = doc.buildHealth || report.buildHealth || { score: 100, grade: "A+", label: "SOVEREIGN" };
  const lines = [];

  lines.push("======================================================================");
  lines.push(`  HEAV3NS-JOY STABILITY DOCTOR — GRADE ${health.grade} (${health.score}% ${health.label})`);
  lines.push("======================================================================");
  lines.push(`Workspace       : ${report.rootDir}`);
  lines.push(`Stability Index : ${report.entropy.stabilityIndex}% (Structural Entropy E_S = ${report.entropy.entropyScore})`);
  lines.push(`Gini Hubbiness  : ${doc.giniCoefficient ?? 0} | Ripple Probability: ${doc.rippleProbability ?? 0}`);

  if (doc.gravityCenter) {
    const gc = doc.gravityCenter;
    lines.push(
      `Gravity Center  : ${gc.path} [${gc.zone.toUpperCase()}] (Ca=${gc.afferentCoupling}, Ce=${gc.efferentCoupling}, Blast=${gc.blastRadius}%)`
    );
  }

  if (Array.isArray(doc.logicHotspots) && doc.logicHotspots.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push("Top Logic Density Hotspots:");
    for (const h of doc.logicHotspots) {
      lines.push(
        `  - ${h.path} [${h.zone.toUpperCase()}] : LogicDensity=${h.logicDensity} (${h.lineCount} LOC)`
      );
    }
  }

  if (Array.isArray(doc.complexitySinks) && doc.complexitySinks.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push("Top Cognitive Complexity Sinks:");
    for (const c of doc.complexitySinks) {
      lines.push(
        `  - ${c.path} [${c.zone.toUpperCase()}] : Complexity=${c.cognitiveComplexity} (MI=${c.maintainabilityIndex})`
      );
    }
  }

  if (Array.isArray(doc.optimizations) && doc.optimizations.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push(`Architectural Optimization Opportunities (${doc.optimizations.length}):`);
    for (const opt of doc.optimizations) {
      lines.push(`  [${opt.priority}] (${opt.type}) ${opt.file}: ${opt.summary}`);
      lines.push(`         ↳ Action: ${opt.action}`);
      if (opt.synthesizedContract) {
        lines.push(`         ↳ Synthesized Contract:\n${opt.synthesizedContract}`);
      }
    }
  } else {
    lines.push("----------------------------------------------------------------------");
    lines.push("Architectural Optimizations: None required. Graph is in optimal equilibrium.");
  }

  lines.push("======================================================================");
  return lines.join("\n");
}

/**
 * Formats an audit report as a SARIF 2.1.0 JSON object for GitHub Code Scanning & IDE integrations.
 * @param {Object} report
 * @returns {Object}
 */
export function formatSarifReport(report) {
  const allFindings = [...(report.violations || []), ...(report.advisories || [])];
  const ruleIds = Array.from(new Set(allFindings.map((f) => f.code)));

  const rules = ruleIds.map((code) => {
    const info = explainJoyRule(code);
    return {
      id: code,
      name: info?.title || code,
      shortDescription: { text: info?.title || `Joyzoning rule ${code}` },
      fullDescription: { text: info?.rationale || `Architectural governance check ${code}` },
      help: {
        text: info ? `${info.remediation}\n\n${info.example}` : "Run `joy-check --explain` for details."
      },
      properties: {
        tags: ["architecture", "joyzoning", info?.series || "spider"]
      }
    };
  });

  const results = allFindings.map((f) => ({
    ruleId: f.code,
    level: f.severity === "error" ? "error" : f.severity === "warning" ? "warning" : "note",
    message: {
      text: f.remediation ? `${f.message} (Fix: ${f.remediation})` : f.message
    },
    locations: [
      {
        physicalLocation: {
          artifactLocation: {
            uri: f.file,
            uriBaseId: "%SRCROOT%"
          },
          region: {
            startLine: f.line && f.line > 0 ? f.line : 1
          }
        }
      }
    ]
  }));

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "HEAV3NS-JOY (Joyzoning & Spider Engine)",
            version: "1.0.0",
            informationUri: "https://github.com/heav3ns-joy/joyzoning",
            rules
          }
        },
        results
      }
    ]
  };
}

/**
 * Formats diagnostics using GitHub Actions workflow commands (`::error` / `::warning` / `::notice`).
 * @param {Object} report
 * @returns {string}
 */
export function formatGithubAnnotations(report) {
  const lines = [];
  for (const v of report.violations || []) {
    const linePart = v.line ? `,line=${v.line}` : ",line=1";
    const title = `${v.code} (${v.type || "VIOLATION"})`;
    lines.push(`::error file=${v.file}${linePart},title=${title}::${v.message}`);
  }
  for (const a of report.advisories || []) {
    const cmd = a.severity === "warning" ? "warning" : "notice";
    const linePart = a.line ? `,line=${a.line}` : ",line=1";
    const title = `${a.code} (${a.type || "ADVISORY"})`;
    lines.push(`::${cmd} file=${a.file}${linePart},title=${title}::${a.message}`);
  }
  lines.push(
    `::notice title=HEAV3NS-JOY Stability Index::Stability=${report.entropy.stabilityIndex}% (Entropy=${report.entropy.entropyScore}, Status=${report.entropy.status}, Violations=${report.violations.length})`
  );
  return lines.join("\n");
}

/**
 * Formats an audit report as a GitHub-flavored Markdown summary (suitable for `GITHUB_STEP_SUMMARY` or PR comments).
 * @param {Object} report
 * @param {{ showMermaid?: boolean }} [options]
 * @returns {string}
 */
export function formatMarkdownReport(report, options = {}) {
  const badge = report.conforms ? "PASS (SOVEREIGN)" : "FAIL (VIOLATIONS DETECTED)";
  const lines = [
    `## HEAV3NS-JOY Sovereign Audit — ${badge}`,
    "",
    "| Metric | Value |",
    "| :--- | :--- |",
    `| **Status** | \`${report.entropy.status}\` (${badge}) |`,
    `| **Stability Index ($SI$)** | **${report.entropy.stabilityIndex}%** ($E_S = ${report.entropy.entropyScore}$) |`,
    `| **Build Health** | **${report.buildHealth?.score ?? 100}%** (Grade \`${report.buildHealth?.grade ?? "A+"}\`) |`,
    `| **Files / Edges** | ${report.totalFiles} files / ${report.totalEdges} edges |`,
    `| **Zones** | DOMAIN: ${report.zoneSummary.domain}, CORE: ${report.zoneSummary.core}, INFRA: ${report.zoneSummary.infrastructure}, PLUMBING: ${report.zoneSummary.plumbing}, UI: ${report.zoneSummary.ui} |`,
    ""
  ];

  if (report.violations.length > 0) {
    lines.push(`### Blocking Violations (${report.violations.length})`, "");
    lines.push("| Code | File | Message | Remediation |");
    lines.push("| :--- | :--- | :--- | :--- |");
    for (const v of report.violations) {
      const loc = v.line ? `${v.file}:${v.line}` : v.file;
      lines.push(`| \`${v.code}\` | \`${loc}\` | ${v.message} | ${v.remediation || v.sop || "-"} |`);
    }
    lines.push("");
  } else {
    lines.push("### Blocking Violations (0)", "", "Zero architectural violations detected.", "");
  }

  if (options.showMermaid) {
    lines.push("### Dependency Topology", "", renderMermaidGraph(report), "");
  }

  return lines.join("\n");
}

/**
 * Formats an operational explanation for `--explain <CODE|ZONE>`.
 * @param {string} query
 * @returns {string}
 */
export function formatExplainOutput(query) {
  const entry = explainJoyRule(query);
  if (!entry) {
    const available = Object.keys(EXPLAIN_CATALOG).join(", ");
    return `[HEAV3NS-JOY] Unknown rule or zone '${query}'.\nAvailable codes & zones: ${available}`;
  }
  return [
    "======================================================================",
    `  [${entry.code}] ${entry.title}`,
    "======================================================================",
    `Category        : ${entry.series}`,
    `Default Severity: ${entry.defaultSeverity}`,
    `Tactical SOP    : ${entry.sop}`,
    "----------------------------------------------------------------------",
    `Rationale:\n  ${entry.rationale}`,
    "",
    `Remediation:\n  ${entry.remediation}`,
    "----------------------------------------------------------------------",
    `Example:\n${entry.example}`,
    "======================================================================"
  ].join("\n");
}

/**
 * Generates a Mermaid flowchart grouped by canonical Joyzoning subgraphs.
 * @param {Object} report
 * @returns {string}
 */
export function renderMermaidGraph(report) {
  const out = ["```mermaid", "flowchart TD"];
  const byZone = {
    domain: [],
    core: [],
    infrastructure: [],
    plumbing: [],
    ui: []
  };

  const idFor = (p) => "N_" + p.replace(/[^A-Za-z0-9_]/g, "_");

  for (const node of report.nodes) {
    const z = byZone[node.effectiveZone] ? node.effectiveZone : "plumbing";
    byZone[z].push(node);
  }

  for (const [zone, zoneNodes] of Object.entries(byZone)) {
    if (zoneNodes.length === 0) continue;
    out.push(`  subgraph ${zone.toUpperCase()}`);
    for (const n of zoneNodes) {
      out.push(`    ${idFor(n.path)}["${n.path}"]`);
    }
    out.push("  end");
  }

  for (const node of report.nodes) {
    for (const dep of node.dependencies) {
      out.push(`  ${idFor(node.path)} --> ${idFor(dep)}`);
    }
  }

  out.push("```");
  return out.join("\n");
}

