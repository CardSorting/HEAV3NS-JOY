/** [LAYER: UI] */
/**
 * Industry-Standard Agent & CI/IDE Interchange Formatters (`AgentFormatters`).
 * Provides ESLint/cargo-style Compact lines, Language Server Protocol (LSP)
 * `PublishDiagnostics` + `CodeAction` payloads, TAP v13, JUnit XML, NDJSON streaming
 * lines, and VS Code / GitHub Actions Problem Matcher v2 definitions.
 *
 * Hard Invariant: 0% `infrastructure` imports.
 */

import {
  stableFindingId,
  buildAgentPlaybook
} from "../domain/broccoliRules.mjs";
import { computeWorkspaceStatistics } from "../domain/entropyFormulas.mjs";

/**
 * Formats a Spider report into a single-line cargo/compiler-style brief + ESLint-style
 * `file:line:col: severity SPI-xxx message [findingId]` lines + ordered playbook.
 *
 * @param {Object} report
 * @returns {string}
 */
export function formatCompactReport(report) {
  const errors = (report.violations || []).length;
  const warnings = (report.advisories || []).length;
  const verdict = errors > 0 ? "fail" : warnings > 0 ? "warn" : "pass";
  const lines = [
    `[spider:${verdict}] files=${report.totalFiles ?? (report.nodes || []).length} errors=${errors} warnings=${warnings} stability=${report.entropy?.stabilityIndex ?? 100}%`
  ];

  const all = [
    ...(report.violations || []),
    ...(report.advisories || [])
  ];

  for (const item of all) {
    const file = item.file || "workspace";
    const line = item.line || 1;
    const col = item.column || 1;
    const sev = (item.severity || "ERROR").toLowerCase();
    const id = item.findingId || stableFindingId(item);
    lines.push(`${file}:${line}:${col}: ${sev} ${item.code} ${item.message} [${id}]`);
  }

  const playbook = buildAgentPlaybook(report);
  if (playbook.length > 0) {
    lines.push("--- playbook ---");
    for (const step of playbook) {
      lines.push(`${step.order}. [${step.phase}] ${step.action} -> ${step.command}`);
    }
  }

  return lines.join("\n");
}

/**
 * Formats a Spider report into LSP (`textDocument/publishDiagnostics`) and `CodeAction` quick fixes.
 *
 * @param {Object} report
 * @returns {{ notifications: Array<Object>, codeActions: Array<Object> }}
 */
export function formatLspDiagnostics(report) {
  const byFile = new Map();
  const codeActions = [];

  const all = [
    ...(report.violations || []),
    ...(report.advisories || [])
  ];

  for (const item of all) {
    const file = item.file || "workspace";
    const uri = file.startsWith("file://") ? file : `file:///${file.replace(/^\/+/, "")}`;
    const lineZero = Math.max(0, (item.line || 1) - 1);
    const findingId = item.findingId || stableFindingId(item);
    const diag = {
      range: {
        start: { line: lineZero, character: 0 },
        end: { line: lineZero, character: 120 }
      },
      severity: item.severity === "ERROR" ? 1 : 2,
      code: item.code,
      source: "heav3ns-joy-spider",
      message: `${item.message}${item.sop ? ` (SOP: ${item.sop})` : ""}`,
      data: { findingId }
    };

    if (!byFile.has(uri)) byFile.set(uri, []);
    byFile.get(uri).push(diag);

    if (item.sop) {
      codeActions.push({
        title: `[${item.code}] ${item.sop}`,
        kind: "quickfix",
        isPreferred: item.severity === "ERROR",
        diagnostics: [diag],
        command: {
          title: item.sop,
          command: "joyzoning.applySop",
          arguments: [{ file, code: item.code, findingId }]
        }
      });
    }
  }

  const notifications = [...byFile.entries()].map(([uri, diagnostics]) => ({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, diagnostics }
  }));

  return { notifications, codeActions };
}

/**
 * Formats a Spider report as Test Anything Protocol v13 (`TAP version 13`).
 *
 * @param {Object} report
 * @returns {string}
 */
export function formatTapReport(report) {
  const violations = report.violations || [];
  const lines = ["TAP version 13"];

  if (violations.length === 0) {
    lines.push("1..1");
    lines.push(
      `ok 1 - Joyzoning Sovereign Audit (${report.totalFiles ?? (report.nodes || []).length} files scanned, ${report.entropy?.stabilityIndex ?? 100}% stability)`
    );
    return lines.join("\n");
  }

  lines.push(`1..${violations.length}`);
  violations.forEach((v, idx) => {
    const num = idx + 1;
    lines.push(`not ok ${num} - [${v.code}] ${v.file || "workspace"}:${v.line || 1} ${v.message}`);
    lines.push("  ---");
    lines.push(`  severity: ${v.severity || "ERROR"}`);
    lines.push(`  file: ${v.file || "workspace"}`);
    lines.push(`  line: ${v.line || 1}`);
    if (v.sop) lines.push(`  sop: ${JSON.stringify(v.sop)}`);
    lines.push("  ...");
  });

  return lines.join("\n");
}

/**
 * Formats a Spider report as JUnit XML for standard CI test runners.
 *
 * @param {Object} report
 * @returns {string}
 */
export function formatJUnitReport(report) {
  const esc = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const violations = report.violations || [];
  const totalTests = Math.max(1, violations.length);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuites name="heav3ns-joy-spider" tests="${totalTests}" failures="${violations.length}">`,
    `  <testsuite name="JoyzoningAudit" tests="${totalTests}" failures="${violations.length}">`
  ];

  if (violations.length === 0) {
    lines.push(`    <testcase classname="joyzoning.sovereign" name="workspace-conformance" />`);
  } else {
    for (const v of violations) {
      const file = esc(v.file || "workspace");
      const code = esc(v.code || "SPI-000");
      const msg = esc(v.message || "");
      const sop = esc(v.sop || "");
      lines.push(`    <testcase classname="${file}" name="${code}">`);
      lines.push(`      <failure type="${code}" message="${msg}">${sop}</failure>`);
      lines.push(`    </testcase>`);
    }
  }

  lines.push(`  </testsuite>`);
  lines.push(`</testsuites>`);
  return lines.join("\n");
}

/**
 * Formats a Spider report as Newline-Delimited JSON (NDJSON) streaming events.
 *
 * @param {Object} report
 * @returns {string}
 */
export function formatNdjsonReport(report) {
  const rows = [];
  rows.push(
    JSON.stringify({
      type: "summary",
      conforms: report.conforms,
      totalFiles: report.totalFiles ?? (report.nodes || []).length,
      stabilityIndex: report.entropy?.stabilityIndex ?? 100,
      violationCount: (report.violations || []).length,
      advisoryCount: (report.advisories || []).length
    })
  );

  for (const v of report.violations || []) {
    rows.push(
      JSON.stringify({
        type: "finding",
        findingId: v.findingId || stableFindingId(v),
        code: v.code,
        severity: v.severity || "ERROR",
        file: v.file || "workspace",
        line: v.line || 1,
        message: v.message,
        sop: v.sop || null
      })
    );
  }

  for (const a of report.advisories || []) {
    rows.push(
      JSON.stringify({
        type: "advisory",
        findingId: a.findingId || stableFindingId(a),
        code: a.code,
        severity: a.severity || "WARN",
        file: a.file || "workspace",
        line: a.line || 1,
        message: a.message,
        sop: a.sop || null
      })
    );
  }

  return rows.join("\n");
}

/**
 * Exports a VS Code / GitHub Actions Problem Matcher v2 configuration matching `formatCompactReport`.
 * @returns {Object}
 */
export function exportProblemMatcherConfig() {
  return {
    version: 2,
    problemMatcher: [
      {
        owner: "heav3ns-joy-spider",
        pattern: [
          {
            regexp: "^([^:]+):(\\d+):(\\d+):\\s+(error|warn|info)\\s+(SPI-\\d{3})\\s+(.*)\\s+\\[([0-9a-f]{16})\\]$",
            file: 1,
            line: 2,
            column: 3,
            severity: 4,
            code: 5,
            message: 6
          }
        ]
      }
    ]
  };
}

/**
 * Formats multivariate workspace statistics (`mean`, `stdDev`, Gini hubbiness, and `>2σ` z-score outliers).
 * @param {Object} report
 * @returns {string}
 */
export function formatStatsReport(report) {
  const stats = report.statistics || computeWorkspaceStatistics(report.nodes || []);
  const lines = [
    "======================================================================",
    "  HEAV3NS-JOY MULTIVARIATE WORKSPACE STATISTICS (V215 RESONANCE)",
    "======================================================================",
    `Files Analyzed   : ${report.totalFiles ?? (report.nodes || []).length}`,
    `Gini Hubbiness   : ${stats.giniCoefficient}`,
    `Complexity (CC)  : mean=${stats.complexity.mean} | stdDev=${stats.complexity.stdDev}`,
    `Coupling (Ca)    : mean=${stats.coupling.mean} | stdDev=${stats.coupling.stdDev}`,
    `Module Size (LOC): mean=${stats.size.mean} | stdDev=${stats.size.stdDev}`,
    "----------------------------------------------------------------------"
  ];

  if (stats.zScoreOutliers.length === 0) {
    lines.push("Outliers (> 2.0σ): None detected.");
  } else {
    lines.push(`Outliers (> 2.0σ): ${stats.zScoreOutliers.length}`);
    for (const o of stats.zScoreOutliers.slice(0, 12)) {
      lines.push(`  [+${o.zScore}σ ${o.dimension.toUpperCase()}] ${o.path} (value=${o.value})`);
    }
  }
  if (Array.isArray(report.ghostCouplings) && report.ghostCouplings.length > 0) {
    lines.push("----------------------------------------------------------------------");
    lines.push(`Ghost Couplings (SPI-108): ${report.ghostCouplings.length}`);
    for (const g of report.ghostCouplings) {
      lines.push(`  [${g.code}] ${g.fileA} <-> ${g.fileB} (Jaccard=${g.jaccardSimilarity})`);
    }
  }
  lines.push("======================================================================");
  return lines.join("\n");
}


