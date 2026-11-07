#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * Zero-dependency CLI verifier for HEAV3NS-JOY documentation guardrails (`npm run docs:check`).
 * Mirrors LUMI's `docs:check-agent-links`, `docs:check-docs-readme`, and `docs:check-readme-metrics`.
 */

import { runJoyDocsCheck } from "../src/index.mjs";

const targetDir = process.argv[2] || ".";
const result = runJoyDocsCheck(targetDir);

if (!result.passed) {
  console.error("======================================================================");
  console.error("  HEAV3NS-JOY DOCUMENTATION GUARDRAILS — FAILED");
  console.error("======================================================================");
  for (const m of result.missingDocs) {
    console.error(`  [MISSING DOC]     ${m}`);
  }
  for (const h of result.missingHeaders) {
    console.error(`  [MISSING HEADER]  ${h} (expected <!-- [LAYER: <ZONE>] -->)`);
  }
  for (const s of result.missingSections) {
    console.error(`  [SECTION/LINK]    ${s}`);
  }
  for (const b of result.brokenLinks) {
    console.error(`  [BROKEN LINK]     ${b.file} -> ${b.target} (resolved: ${b.resolved})`);
  }
  for (const mm of result.metricMismatches) {
    console.error(`  [METRIC DRIFT]    ${mm}`);
  }
  console.error("======================================================================");
  process.exit(1);
}

console.log(
  `docs:check OK — ${result.requiredDocsChecked} required docs, ${result.markdownFilesScanned} markdown files (100% [LAYER] tagged), ${result.linksChecked} relative links verified, live metrics in sync`
);

