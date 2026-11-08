#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * Zero-dependency CLI verifier for HEAV3NS-JOY documentation guardrails (`npm run docs:check`).
 * Verifies required docs, ADRs, Playbooks, Wiki, Postmortems, Knowledge Base, [LAYER] headers,
 * relative links, and live codebase metric parity.
 */

import { runJoyDocsCheck } from "../src/index.mjs";

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const targetDir = args.find((a) => !a.startsWith("-")) || ".";
const result = runJoyDocsCheck(targetDir);

if (wantJson) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

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

const tc = result.taxonomyCounts || {};
console.log(
  `docs:check OK — ${result.requiredDocsChecked} required docs (${tc.adrs || 0} ADRs, ${tc.playbooks || 0} playbooks, ${tc.wikiPages || 0} wiki pages, ${tc.postmortems || 0} postmortems, ${tc.kbArticles || 0} KB articles), ${result.markdownFilesScanned} markdown files (100% [LAYER] tagged), ${result.linksChecked} relative links verified, live metrics in sync`
);
