/** [LAYER: UI] */
/**
 * Advanced verification test suite for HEAV3NS-JOY:
 * Polyglot resolution (Python/Go/Rust), Transitive Re-Exports, Levenshtein hints,
 * Symbol Resonance (SPI-106), Contractual Sovereignty (SPI-107), Unused Imports (SPI-112),
 * RefactorHealer (dry-run, statelessness healing, import rewiring), JoyRideCache,
 * and SARIF / GitHub Actions / Markdown / StabilityDoctor formatters.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { extractImports } from "../src/plumbing/sourceScanner.mjs";
import {
  runJoyAudit,
  runJoyHeal,
  runJoyHealStatelessness,
  runJoyPlanMove,
  JoyRideCache,
  formatDoctorReport,
  formatSarifReport,
  formatGithubAnnotations,
  formatMarkdownReport,
  formatExplainOutput
} from "../src/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function withTempWorkspace(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "heav3ns-joy-adv-test-"));
  try {
    return fn(tmpDir);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function writeFixture(root, relPath, content) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

test("11. Polyglot Deep Resolution: Python TYPE_CHECKING & multi-line imports, Go go.mod packages, Rust crate::/super::", () => {
  // 1. Python multi-line parenthesized import + TYPE_CHECKING block
  const pySource = `# [LAYER: DOMAIN]
from typing import TYPE_CHECKING
from ..plumbing.text_utils import (
    slugify,
    sanitize_title, # inline comment inside parens
)
if TYPE_CHECKING:
    from ..infrastructure.sql_repo import SqlRepo
`;
  const pyImports = extractImports(pySource, ".py");
  assert.equal(pyImports.length, 3);
  const relPy = pyImports.find((i) => i.specifier === "../plumbing/text_utils");
  assert.ok(relPy);
  assert.deepEqual(relPy.symbols, ["slugify", "sanitize_title"]);
  assert.equal(relPy.isTypeOnly, false);

  const typeCheckedPy = pyImports.find((i) => i.specifier === "../infrastructure/sql_repo");
  assert.ok(typeCheckedPy);
  assert.equal(typeCheckedPy.isTypeOnly, true, "Imports inside if TYPE_CHECKING: should be type-only");

  // 2. Go module-prefixed local package resolution + Rust crate::/super:: resolution
  withTempWorkspace((tmpDir) => {
    writeFixture(tmpDir, "go.mod", "module github.com/acme/billing\n");
    writeFixture(
      tmpDir,
      "internal/domain/order.go",
      `// [LAYER: DOMAIN]
package domain
import "github.com/acme/billing/internal/infrastructure"
type Order struct {}
`
    );
    writeFixture(
      tmpDir,
      "internal/infrastructure/db.go",
      `// [LAYER: INFRASTRUCTURE]
package infrastructure
type DbClient struct {}
`
    );
    writeFixture(
      tmpDir,
      "src/domain/policy.rs",
      `// [LAYER: DOMAIN]
use crate::infrastructure::repo::SqlRepo;
pub struct Policy {}
`
    );
    writeFixture(
      tmpDir,
      "src/infrastructure/repo.rs",
      `// [LAYER: INFRASTRUCTURE]
pub struct SqlRepo {}
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(report.conforms, false);
    // Both Go domain->infrastructure and Rust domain->infrastructure should be caught as SPI-206
    const domainLeaks = report.violations.filter((v) => v.code === "SPI-206");
    assert.equal(domainLeaks.length, 2);
  });
});

test("12. Advanced Forensics: Transitive Re-Exports & Levenshtein Hint (SPI-102), Symbol Resonance (SPI-106), Contractual Sovereignty (SPI-107), Unused Import (SPI-112)", () => {
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      "src/domain/OrderPolicy.mjs",
      `/** [LAYER: DOMAIN] */
export class OrderPolicy {}
export const sharedCollisionName = 1;
`
    );
    writeFixture(
      tmpDir,
      "src/domain/index.mjs",
      `/** [LAYER: DOMAIN] */
export { OrderPolicy } from "./OrderPolicy.mjs";
`
    );
    writeFixture(
      tmpDir,
      "src/infrastructure/SqlOrderGateway.mjs",
      `/** [LAYER: INFRASTRUCTURE] */
export class SqlOrderGateway {
  saveOrder(order) { return order; }
}
export const sharedCollisionName = 2;
`
    );
    writeFixture(
      tmpDir,
      "src/core/OrderController.mjs",
      `/** [LAYER: CORE] */
import { OrderPolcy } from "../domain/index.mjs";
import { SqlOrderGateway } from "../infrastructure/SqlOrderGateway.mjs";
import { sharedCollisionName } from "../domain/OrderPolicy.mjs";
export class OrderController {
  run() { return new SqlOrderGateway(); }
}
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    // 1. SPI-102 with Levenshtein suggestion ("Did you mean 'OrderPolicy'?") across transitive barrel re-export
    const ghostSym = report.advisories.find((a) => a.code === "SPI-102");
    assert.ok(ghostSym, "Should detect typo OrderPolcy via transitive barrel export");
    assert.equal(ghostSym.suggestion, "OrderPolicy");
    assert.ok(ghostSym.message.includes("Did you mean 'OrderPolicy'?"));

    // 2. SPI-106 Symbol Resonance on `sharedCollisionName` exported in both domain and infrastructure
    assert.ok(report.advisories.some((a) => a.code === "SPI-106"));

    // 3. SPI-107 Contractual Sovereignty Breach (Core importing SqlOrderGateway without ISqlOrderGateway)
    assert.ok(report.advisories.some((a) => a.code === "SPI-107"));

    // 4. SPI-112 Unused Import (`sharedCollisionName` is imported in OrderController.mjs but never used)
    assert.ok(report.advisories.some((a) => a.code === "SPI-112"));

    // 5. Doctor report should synthesize `ISqlOrderGateway` contract
    assert.ok(
      report.doctor.optimizations.some(
        (opt) =>
          opt.type === "SYNTHESIZE_INTERFACE" &&
          opt.synthesizedContract.includes("export class ISqlOrderGateway")
      )
    );
  });
});

test("13. RefactorHealer: Dry-Run Tag Healing, Statelessness Healing (SOP 6), and Import Rewiring Plan (SOP 2 MOVE)", () => {
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      "src/plumbing/mathUtils.mjs",
      `export let DEFAULT_SCALE = 2;
export var MAX_PRECISION = 10;
export let mutatedCounter = 0;
export function tick() {
  mutatedCounter += 1;
  return DEFAULT_SCALE * MAX_PRECISION;
}
`
    );
    writeFixture(
      tmpDir,
      "src/domain/Price.mjs",
      `/** [LAYER: DOMAIN] */
import { tick } from "../plumbing/mathUtils.mjs";
export function calc() { return tick(); }
`
    );

    // 1. Dry-run tag healing should NOT modify disk
    const dryTagResult = runJoyHeal(tmpDir, { dryRun: true });
    assert.equal(dryTagResult.dryRun, true);
    assert.equal(dryTagResult.healedCount, 1);
    const rawBefore = fs.readFileSync(path.join(tmpDir, "src/plumbing/mathUtils.mjs"), "utf8");
    assert.equal(rawBefore.includes("[LAYER: PLUMBING]"), false);

    // Apply tag healing for real
    runJoyHeal(tmpDir, { dryRun: false });

    // 2. Heal statelessness: should convert DEFAULT_SCALE and MAX_PRECISION to `const`,
    // while leaving `mutatedCounter` as `let` because it is reassigned (`mutatedCounter += 1`).
    const statelessResult = runJoyHealStatelessness(tmpDir, { dryRun: false });
    assert.equal(statelessResult.healedCount, 1);
    assert.deepEqual(statelessResult.healedFiles[0].identifiers, [
      "DEFAULT_SCALE",
      "MAX_PRECISION"
    ]);
    const healedSource = fs.readFileSync(path.join(tmpDir, "src/plumbing/mathUtils.mjs"), "utf8");
    assert.ok(healedSource.includes("export const DEFAULT_SCALE = 2;"));
    assert.ok(healedSource.includes("export const MAX_PRECISION = 10;"));
    assert.ok(healedSource.includes("export let mutatedCounter = 0;"));

    // 3. Plan Move (rewiring relative imports when moving `src/plumbing/mathUtils.mjs` -> `src/plumbing/deep/math/mathUtils.mjs`)
    const movePlan = runJoyPlanMove(
      tmpDir,
      "src/plumbing/mathUtils.mjs",
      "src/plumbing/deep/math/mathUtils.mjs"
    );
    assert.equal(movePlan.targetZone, "plumbing");
    assert.equal(movePlan.rewiredImports.length, 1);
    assert.equal(movePlan.rewiredImports[0].file, "src/domain/Price.mjs");
    assert.equal(movePlan.rewiredImports[0].oldSpecifier, "../plumbing/mathUtils.mjs");
    assert.equal(movePlan.rewiredImports[0].newSpecifier, "../plumbing/deep/math/mathUtils.mjs");
  });
});

test("14. JoyRide Bounded Execution Cache: 5 kinds, secret/token rejection, TTL, fingerprint/hash invalidation, and emergencyTrim", () => {
  let now = 1000;
  const cache = new JoyRideCache({
    maxTotalBytes: 2048,
    maxTaskBytes: 1024,
    clock: () => now
  });

  // 1. Key prefix enforcement
  assert.equal(cache.set("invalid:key", { a: 1 }).stored, false);
  const validKey = JoyRideCache.formatKey("taskLocal", "plan-1");
  assert.equal(validKey, "joyride:taskLocal:plan-1");

  // 2. Secret & credential admission guard
  assert.equal(
    cache.set(JoyRideCache.formatKey("hotExecution", "sec1"), {
      apiKey: "super-secret-value"
    }).reason,
    "SECRET_DETECTED"
  );
  assert.equal(
    cache.set(JoyRideCache.formatKey("hotExecution", "sec2"), {
      header: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    }).reason,
    "SECRET_DETECTED"
  );

  // 3. Store & retrieve with workspaceFingerprint and relevantFileHashes
  const storeRes = cache.set(
    validKey,
    { summary: "Cached Triad Audit" },
    {
      ttlMs: 5000,
      taskId: "task-42",
      workspaceFingerprint: "fp-v1",
      relevantFileHashes: { "src/domain/Order.mjs": "hash-1" }
    }
  );
  assert.equal(storeRes.stored, true);
  assert.deepEqual(
    cache.get(validKey, {
      workspaceFingerprint: "fp-v1",
      currentFileHashes: { "src/domain/Order.mjs": "hash-1" }
    }),
    { summary: "Cached Triad Audit" }
  );

  // Inspect via explain()
  const info = cache.explain(validKey);
  assert.equal(info.kind, "taskLocal");
  assert.equal(info.hitCount, 1);

  // 4. Stale file hash invalidates entry automatically on get()
  assert.equal(
    cache.get(validKey, {
      workspaceFingerprint: "fp-v1",
      currentFileHashes: { "src/domain/Order.mjs": "hash-2-modified" }
    }),
    null
  );

  // 5. TTL expiration & emergencyTrim
  const scratchKey = JoyRideCache.formatKey("scratchArtifact", "temp-1");
  const indexKey = JoyRideCache.formatKey("workspaceIndex", "graph-1");
  cache.set(scratchKey, { data: "volatile" }, { ttlMs: 1000 });
  cache.set(indexKey, { nodes: 37 }, { ttlMs: 60000 });

  now += 2000;
  assert.equal(cache.get(scratchKey), null, "Expired TTL entry should return null");

  cache.set(scratchKey, { data: "volatile-2" });
  cache.emergencyTrim();
  assert.equal(cache.get(scratchKey), null, "emergencyTrim should evict scratchArtifact tier");
  assert.deepEqual(cache.get(indexKey), { nodes: 37 }, "workspaceIndex survives emergencyTrim");
});

test("15. Industry-Standard Formatters: SARIF 2.1.0, GitHub Actions Annotations, Markdown Summary, Doctor & Explain Catalog", () => {
  const selfReport = runJoyAudit(REPO_ROOT, { theme: "strict" });

  // SARIF 2.1.0 schema verification
  const sarif = formatSarifReport(selfReport);
  assert.equal(sarif.version, "2.1.0");
  assert.ok(Array.isArray(sarif.runs));
  assert.equal(sarif.runs[0].tool.driver.name, "HEAV3NS-JOY (Joyzoning & Spider Engine)");

  // GitHub Actions annotations verification
  const ghOut = formatGithubAnnotations(selfReport);
  assert.ok(ghOut.includes("::notice title=HEAV3NS-JOY Stability Index::"));

  // Markdown summary verification
  const mdOut = formatMarkdownReport(selfReport, { showMermaid: true });
  assert.ok(mdOut.includes("## HEAV3NS-JOY Sovereign Audit — PASS (SOVEREIGN)"));
  assert.ok(mdOut.includes("```mermaid"));

  // Doctor report verification
  const docOut = formatDoctorReport(selfReport);
  assert.ok(docOut.includes("HEAV3NS-JOY STABILITY DOCTOR"));
  assert.ok(docOut.includes("Gravity Center"));

  // Explain catalog verification for both SPI codes and canonical zones
  const explain206 = formatExplainOutput("SPI-206");
  assert.ok(explain206.includes("[SPI-206] Axiomatic Layer Leakage"));
  const explainUtils = formatExplainOutput("utils");
  assert.ok(explainUtils.includes("[PLUMBING] Zone 4: [LAYER: PLUMBING]"));
});

test("16. Reviewer Edge Cases: Multi-line Destructured Exports, Rust Nested Lowercase Module Paths, Ripple Probability & Canonical SPI Explain Alignment", () => {
  // 1. Multi-line destructured object & array exports + Rust nested module path without UpperCamelCase symbol
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      "src/domain/apiFactory.mjs",
      `/** [LAYER: DOMAIN] */
export const {
  alpha,
  rawBeta: beta = 42,
  ...restApi
} = { alpha: 1, rawBeta: 2, gamma: 3 };
export const [firstItem, secondItem] = [10, 20];
`
    );
    writeFixture(
      tmpDir,
      "src/core/consumer.mjs",
      `/** [LAYER: CORE] */
import { alpha, beta, restApi, firstItem, secondItem } from "../domain/apiFactory.mjs";
export const total = [alpha, beta, restApi, firstItem, secondItem].length;
`
    );
    // Rust nested lowercase module import: `use crate::infrastructure::postgres;`
    writeFixture(
      tmpDir,
      "src/infrastructure/postgres.rs",
      `// [LAYER: INFRASTRUCTURE]
pub fn connect() {}
`
    );
    writeFixture(
      tmpDir,
      "src/domain/bad_rust_domain.rs",
      `// [LAYER: DOMAIN]
use crate::infrastructure::postgres;
pub struct BadDomain {}
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    // Destructured exports should all resolve with 0 Ghost Symbol (SPI-102) advisories
    const ghostSymbols = report.advisories.filter((a) => a.code === "SPI-102");
    assert.equal(ghostSymbols.length, 0, "Destructured exports should not trigger SPI-102");

    // Rust `use crate::infrastructure::postgres;` (3 segments, all lowercase) must resolve to `src/infrastructure/postgres.rs` and catch SPI-206
    const rustLeak = report.violations.find(
      (v) => v.code === "SPI-206" && v.file === "src/domain/bad_rust_domain.rs"
    );
    assert.ok(rustLeak, "Rust 3-segment lowercase module import should resolve and trigger SPI-206");

    // Ripple probability must be > 0 when nodes have incoming dependencies
    assert.ok(report.rippleProbability > 0, `Expected rippleProbability > 0, got ${report.rippleProbability}`);
    assert.equal(report.rippleProbability, report.doctor.rippleProbability);
  });

  // 2. Verify canonical SPI code alignment between spec/03, SpiderEngine, and EXPLAIN_CATALOG
  assert.ok(formatExplainOutput("SPI-111").includes("Domain Drift"));
  assert.ok(formatExplainOutput("SPI-202").includes("Systemic Risk"));
  assert.ok(formatExplainOutput("SPI-203").includes("Structural Load"));
  assert.ok(formatExplainOutput("SPI-204").includes("Orphaned Module"));
  assert.ok(formatExplainOutput("SPI-208").includes("Geographic Misalignment"));
  assert.ok(formatExplainOutput("SPI-209").includes("Import Depth Exceeded"));
  assert.ok(formatExplainOutput("SPI-300").includes("Ripple Prophecy"));
});


