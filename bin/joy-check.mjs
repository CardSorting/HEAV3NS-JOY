#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * Zero-dependency CLI reference validator, architectural doctor, self-healer,
 * and Spider Agent Toolkit for HEAV3NS-JOY.
 *
 * Usage:
 *   node bin/joy-check.mjs [target-dir] [options]
 *
 * Options:
 *   --heal                   Stamp or align missing/mismatched [LAYER: <ZONE>] headers
 *   --heal-stateless         Convert un-reassigned top-level let/var in PLUMBING to const
 *   --dry-run                Preview --heal or --heal-stateless changes without writing to disk
 *   --doctor, --pulse        Render the StabilityDoctor architectural health & hotspot report
 *   --explain <CODE|ZONE>    Explain a diagnostic code (e.g., SPI-206, RTG-003, BROCCOLIDB)
 *   --phase <phase>          Spider check phase: pre-edit | post-edit | ci | delta
 *   --scope <files>          Comma-separated relative file paths for neighborhood-scoped audit
 *   --neighborhood <depth>   N-hop dependency radius around --scope files (default: 1)
 *   --skeleton <file>        Distill a file into its structural AST/signature skeleton
 *   --keep-symbol <name>     Preserve the full body of <name> during --skeleton distillation
 *   --format <fmt>           Output format: text | compact | json | sarif | github | markdown | lsp | tap | junit | ndjson
 *   --json                   Alias for --format json
 *   --sarif                  Alias for --format sarif
 *   --mermaid                Include a Mermaid dependency flowchart in text/markdown output
 *   --theme <mode>           Enforcement leniency: strict (default), relaxed, safety
 *   --help, -h               Show CLI usage help
 *   --version, -v            Print version
 */

import { createRequire } from "node:module";
import fs from "node:fs";
import {
  runJoyAudit,
  runJoyCheckPhase,
  runJoySkeleton,
  runJoyHeal,
  runJoyHealStatelessness,
  runJoyInit,
  formatTerminalReport,
  formatDoctorReport,
  formatSarifReport,
  formatGithubAnnotations,
  formatMarkdownReport,
  formatExplainOutput,
  formatCompactReport,
  formatLspDiagnostics,
  formatTapReport,
  formatJUnitReport,
  formatNdjsonReport,
  exportProblemMatcherConfig,
  formatStatsReport
} from "../src/index.mjs";

const require = createRequire(import.meta.url);
const CLI_VERSION = require("../package.json").version;

/** Exit codes: 0 = conforms, 1 = blocking violations, 2 = usage or environment error. */
const EXIT_USAGE = 2;
const VALID_FORMATS = ["text", "compact", "json", "sarif", "github", "markdown", "lsp", "tap", "junit", "ndjson"];
const VALID_THEMES = ["strict", "relaxed", "safety"];

function usageError(message) {
  console.error(`[HEAV3NS-JOY] error: ${message}`);
  console.error("Run `joy-check --help` for usage.");
  process.exitCode = EXIT_USAGE;
}

function printHelp() {
  console.log(
    [
      "HEAV3NS-JOY (joy-check) — Agent-Native Joyzoning, Spider, JoyRide & BroccoliDB Validator",
      "",
      "Usage:",
      "  joy-check [target-dir] [options]",
      "",
      "Options:",
      "  --init                   Scaffold stability.config.json & .joyignore in target directory",
      "  --heal                   Stamp or align [LAYER: <ZONE>] headers with folder geography",
      "  --heal-stateless         Convert un-reassigned top-level let/var in PLUMBING to const",
      "  --dry-run                Preview --init, --heal, or --heal-stateless without writing to disk",
      "  --doctor, --pulse        Run StabilityDoctor health checkup (hotspots, Gini, contracts)",
      "  --stats                  Render multivariate workspace statistics (mean, stdDev, >2σ outliers)",
      "  --explain <CODE|ZONE>    Show rule rationale & fix examples (e.g., SPI-206, RTG-003, BROCCOLIDB)",
      "  --phase <phase>          Unified Spider phase: pre-edit | post-edit | ci | delta",
      "  --scope <files>          Scope check to target file(s) and their N-hop neighborhood",
      "  --neighborhood <depth>   Dependency hop radius for --scope (default: 1)",
      "  --skeleton <file>        Print structural signature skeleton & token reduction metrics",
      "  --keep-symbol <name>     Preserve full method/function body of <name> in --skeleton",
      "  --problem-matcher        Export VS Code / GitHub Actions Problem Matcher v2 JSON",
      "  --format <fmt>           text | compact | json | sarif | github | markdown | lsp | tap | junit | ndjson",
      "  --json                   Shorthand for --format json",
      "  --sarif                  Shorthand for --format sarif (SARIF 2.1.0)",
      "  --mermaid                Append Mermaid dependency topology graph",
      "  --theme <mode>           Policy theme: strict (default) | relaxed | safety",
      "  --help, -h               Display this help message",
      "  --version, -v            Display CLI version"
    ].join("\n")
  );
}

function parseArgs(argv) {
  const args = argv.slice(2);
  let targetDir = ".";
  let heal = false;
  let healStateless = false;
  let init = false;
  let dryRun = false;
  let doctor = false;
  let stats = false;
  let problemMatcher = false;
  let explain = null;
  let phase = null;
  let scope = null;
  let neighborhood = 1;
  let skeleton = null;
  let keepSymbol = null;
  let format = "text";
  let mermaid = false;
  let theme = undefined;
  let help = false;
  let version = false;
  const unknown = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--heal") {
      heal = true;
    } else if (arg === "--heal-stateless") {
      healStateless = true;
    } else if (arg === "--init") {
      init = true;
    } else if (arg === "--dry-run" || arg === "--check") {
      dryRun = true;
    } else if (arg === "--doctor" || arg === "--pulse") {
      doctor = true;
    } else if (arg === "--stats") {
      stats = true;
    } else if (arg === "--problem-matcher") {
      problemMatcher = true;
    } else if (arg === "--explain" && args[i + 1]) {
      explain = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--explain=")) {
      explain = arg.slice("--explain=".length);
    } else if (arg === "--phase" && args[i + 1]) {
      phase = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--phase=")) {
      phase = arg.slice("--phase=".length);
    } else if (arg === "--scope" && args[i + 1]) {
      scope = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--scope=")) {
      scope = arg.slice("--scope=".length);
    } else if (arg === "--neighborhood" && args[i + 1]) {
      neighborhood = Number(args[i + 1]) || 1;
      i += 1;
    } else if (arg.startsWith("--neighborhood=")) {
      neighborhood = Number(arg.slice("--neighborhood=".length)) || 1;
    } else if (arg === "--skeleton" && args[i + 1]) {
      skeleton = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--skeleton=")) {
      skeleton = arg.slice("--skeleton=".length);
    } else if (arg === "--keep-symbol" && args[i + 1]) {
      keepSymbol = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--keep-symbol=")) {
      keepSymbol = arg.slice("--keep-symbol=".length);
    } else if (arg === "--format" && args[i + 1]) {
      format = args[i + 1].toLowerCase();
      i += 1;
    } else if (arg.startsWith("--format=")) {
      format = arg.slice("--format=".length).toLowerCase();
    } else if (arg === "--json") {
      format = "json";
    } else if (arg === "--sarif") {
      format = "sarif";
    } else if (arg === "--compact") {
      format = "compact";
    } else if (arg === "--mermaid") {
      mermaid = true;
    } else if (arg === "--theme" && args[i + 1]) {
      theme = args[i + 1];
      i += 1;
    } else if (arg.startsWith("--theme=")) {
      theme = arg.slice("--theme=".length);
    } else if (!arg.startsWith("-")) {
      targetDir = arg;
    } else {
      unknown.push(arg);
    }
  }

  return {
    targetDir,
    heal,
    healStateless,
    init,
    dryRun,
    doctor,
    stats,
    problemMatcher,
    explain,
    phase,
    scope,
    neighborhood,
    skeleton,
    keepSymbol,
    format,
    mermaid,
    theme,
    help,
    version,
    unknown
  };
}

function main() {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.version) {
    console.log(CLI_VERSION);
    return;
  }
  if (opts.unknown.length > 0) {
    usageError(`unknown or incomplete option(s): ${opts.unknown.join(", ")}`);
    return;
  }
  if (!VALID_FORMATS.includes(opts.format)) {
    usageError(`invalid --format "${opts.format}" (expected one of: ${VALID_FORMATS.join(", ")})`);
    return;
  }
  if (opts.theme !== undefined && !VALID_THEMES.includes(opts.theme)) {
    usageError(`invalid --theme "${opts.theme}" (expected one of: ${VALID_THEMES.join(", ")})`);
    return;
  }
  if (opts.problemMatcher) {
    console.log(JSON.stringify(exportProblemMatcherConfig(), null, 2));
    return;
  }
  const needsTarget = !opts.explain && !opts.problemMatcher;
  if (needsTarget && !(fs.existsSync(opts.targetDir) && fs.statSync(opts.targetDir).isDirectory())) {
    usageError(`target directory not found: ${opts.targetDir}`);
    return;
  }
  if (opts.init) {
    const res = runJoyInit(opts.targetDir, { dryRun: opts.dryRun });
    const prefix = opts.dryRun ? "[DRY-RUN] Would scaffold" : "Scaffolded";
    console.log(`[HEAV3NS-JOY] ${prefix} ${res.files.length} configuration file(s):`);
    for (const f of res.files) {
      console.log(`  - ${f.file}`);
    }
    return;
  }
  if (opts.explain) {
    console.log(formatExplainOutput(opts.explain));
    return;
  }
  if (opts.skeleton) {
    const skel = runJoySkeleton(opts.targetDir, opts.skeleton, {
      keepSymbol: opts.keepSymbol
    });
    if (opts.format === "json") {
      console.log(JSON.stringify(skel, null, 2));
    } else {
      console.log(
        `// [SPIDER SKELETON] ${skel.file} | ${skel.originalBytes}B -> ${skel.skeletonBytes}B (${(skel.reductionRatio * 100).toFixed(1)}% reduction)`
      );
      console.log(skel.skeleton);
    }
    return;
  }

  const isStructuredOutput = ["json", "sarif", "lsp", "tap", "junit", "ndjson"].includes(
    opts.format
  );

  if (opts.heal) {
    const healResult = runJoyHeal(opts.targetDir, { dryRun: opts.dryRun });
    if (!isStructuredOutput) {
      const prefix = opts.dryRun ? "[DRY-RUN] Would heal" : "Auto-healed";
      console.log(
        `[HEAV3NS-JOY] ${prefix} [LAYER: ...] header tags on ${healResult.healedCount} file(s).`
      );
      for (const item of healResult.healedFiles) {
        console.log(
          `  Healed: ${item.file} (${item.previousZone || "UNTAGGED"} -> ${item.newZone.toUpperCase()})`
        );
      }
    }
  }

  if (opts.healStateless) {
    const statelessResult = runJoyHealStatelessness(opts.targetDir, { dryRun: opts.dryRun });
    if (!isStructuredOutput) {
      const prefix = opts.dryRun ? "[DRY-RUN] Would convert" : "Converted";
      console.log(
        `[HEAV3NS-JOY] ${prefix} un-reassigned top-level let/var to const in ${statelessResult.healedCount} PLUMBING file(s).`
      );
      for (const item of statelessResult.healedFiles) {
        console.log(`  Stateless Healed: ${item.file} (${item.identifiers.join(", ")})`);
      }
    }
  }

  let report;
  if (opts.phase || opts.scope) {
    const checkResult = runJoyCheckPhase(opts.targetDir, {
      phase: opts.phase || "pre-edit",
      theme: opts.theme,
      scope: opts.scope,
      neighborhoodDepth: opts.neighborhood
    });
    report = checkResult.report;
  } else {
    report = runJoyAudit(opts.targetDir, { theme: opts.theme });
  }

  if (opts.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (opts.format === "sarif") {
    console.log(JSON.stringify(formatSarifReport(report), null, 2));
  } else if (opts.format === "github") {
    console.log(formatGithubAnnotations(report));
  } else if (opts.format === "markdown") {
    console.log(formatMarkdownReport(report, { showMermaid: opts.mermaid }));
  } else if (opts.format === "compact") {
    console.log(formatCompactReport(report));
  } else if (opts.format === "lsp") {
    console.log(JSON.stringify(formatLspDiagnostics(report), null, 2));
  } else if (opts.format === "tap") {
    console.log(formatTapReport(report));
  } else if (opts.format === "junit") {
    console.log(formatJUnitReport(report));
  } else if (opts.format === "ndjson") {
    console.log(formatNdjsonReport(report));
  } else if (opts.doctor) {
    console.log(formatDoctorReport(report));
  } else if (opts.stats) {
    console.log(formatStatsReport(report));
  } else {
    console.log(formatTerminalReport(report, { showMermaid: opts.mermaid }));
  }

  process.exitCode = report.conforms ? 0 : 1;
}

main();
