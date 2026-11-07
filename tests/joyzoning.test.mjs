/** [LAYER: UI] */
/**
 * Comprehensive verification test suite for HEAV3NS-JOY conventions, reference validator,
 * self-healing engine, edge cases, self-conformance dogfooding, and clean-room acquisition.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  normalizeSlashes,
  computeDirectoryDepth,
  countParentTraversals,
  resolveRelativeSpecifier
} from "../src/plumbing/pathUtils.mjs";
import {
  getCommentStyleForExtension,
  normalizeZoneName,
  extractHeaderTag,
  formatHeaderComment,
  applyHeaderTag
} from "../src/plumbing/commentStyles.mjs";
import {
  extractImports,
  analyzeCodeMetrics
} from "../src/plumbing/sourceScanner.mjs";
import {
  isForbiddenDomainIOSpecifier,
  evaluateZoneDependency
} from "../src/domain/joyRules.mjs";
import {
  computeMartinMetrics,
  computeStructuralEntropy
} from "../src/domain/entropyFormulas.mjs";
import {
  runJoyAudit,
  runJoyHeal,
  formatTerminalReport
} from "../src/index.mjs";
import { createCheckoutApp } from "../examples/typescript/src/index.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

function withTempWorkspace(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "heav3ns-joy-test-"));
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

test("1. Plumbing: comment styles, UTILS alias normalization, shebang & frontmatter preservation", () => {
  assert.equal(getCommentStyleForExtension(".ts"), "JSDOC");
  assert.equal(getCommentStyleForExtension(".go"), "SLASH");
  assert.equal(getCommentStyleForExtension(".py"), "HASH");
  assert.equal(getCommentStyleForExtension(".sql"), "DASH");
  assert.equal(getCommentStyleForExtension(".md"), "HTML");
  assert.equal(getCommentStyleForExtension(".unknown"), null);

  assert.equal(normalizeZoneName("UTILS"), "plumbing");
  assert.equal(normalizeZoneName("domain"), "domain");
  assert.equal(normalizeZoneName("invalid"), null);

  assert.equal(formatHeaderComment(".ts", "domain"), "/** [LAYER: DOMAIN] */");
  assert.equal(formatHeaderComment(".py", "utils"), "# [LAYER: PLUMBING]");

  // Shebang preservation on Line 1
  const scriptWithShebang = "#!/usr/bin/env node\nconsole.log('hi');\n";
  const stampedShebang = applyHeaderTag(scriptWithShebang, ".mjs", "ui");
  assert.ok(stampedShebang.startsWith("#!/usr/bin/env node\n/** [LAYER: UI] */\n"));
  assert.equal(extractHeaderTag(stampedShebang).normalizedZone, "ui");

  // YAML frontmatter preservation in Markdown
  const mdWithFrontmatter = "---\ntitle: Doc\n---\n# Heading\n";
  const stampedMd = applyHeaderTag(mdWithFrontmatter, ".md", "domain");
  assert.ok(stampedMd.startsWith("---\ntitle: Doc\n---\n<!-- [LAYER: DOMAIN] -->\n# Heading"));
  assert.equal(extractHeaderTag(stampedMd).normalizedZone, "domain");

  // 10KB window boundary: tag inside 10KB vs beyond 10KB
  const within10KB = "/* license */\n".repeat(100) + "/** [LAYER: CORE] */\nexport const x = 1;";
  assert.equal(extractHeaderTag(within10KB).normalizedZone, "core");

  const beyond10KB = "x".repeat(10500) + "\n/** [LAYER: CORE] */\n";
  assert.equal(extractHeaderTag(beyond10KB).normalizedZone, null);
});

test("2. Plumbing: path normalization, parent traversal counting, and relative resolution", () => {
  assert.equal(normalizeSlashes("src\\domain\\Order.ts/"), "src/domain/Order.ts");
  assert.equal(computeDirectoryDepth("src/domain/Order.ts"), 2);
  assert.equal(computeDirectoryDepth("README.md"), 0);

  assert.equal(countParentTraversals("./sibling.js"), 0);
  assert.equal(countParentTraversals("../../../domain/Order.js"), 3);
  assert.equal(countParentTraversals("../../../../plumbing/math.js"), 4);
  assert.equal(countParentTraversals("node:fs"), 0);

  assert.equal(
    resolveRelativeSpecifier("src/core/controllers/OrderController.mjs", "../../domain/Order.mjs"),
    "src/domain/Order.mjs"
  );
});

test("3. Domain: Sovereign Dependency Matrix, Domain I/O purity, and Martin/Entropy math", () => {
  assert.equal(isForbiddenDomainIOSpecifier("node:fs"), true);
  assert.equal(isForbiddenDomainIOSpecifier("fs/promises"), true);
  assert.equal(isForbiddenDomainIOSpecifier("axios"), true);
  assert.equal(isForbiddenDomainIOSpecifier("../plumbing/math.mjs"), false);

  // Plumbing cannot import Domain
  assert.equal(
    evaluateZoneDependency({ sourceZone: "plumbing", targetZone: "domain" }).allowed,
    false
  );
  // Domain can import Plumbing, but cannot import Infrastructure or Core
  assert.equal(
    evaluateZoneDependency({ sourceZone: "domain", targetZone: "plumbing" }).allowed,
    true
  );
  assert.equal(
    evaluateZoneDependency({ sourceZone: "domain", targetZone: "infrastructure" }).allowed,
    false
  );
  // Core cannot import UI
  assert.equal(
    evaluateZoneDependency({ sourceZone: "core", targetZone: "ui" }).allowed,
    false
  );
  // UI cannot import Infrastructure directly
  assert.equal(
    evaluateZoneDependency({ sourceZone: "ui", targetZone: "infrastructure" }).allowed,
    false
  );
  // Infrastructure CAN import Domain interfaces (`domain/interfaces/I*`), CANNOT import concrete Domain entities
  assert.equal(
    evaluateZoneDependency({
      sourceZone: "infrastructure",
      targetZone: "domain",
      targetPath: "src/domain/interfaces/IOrderRepo.mjs"
    }).allowed,
    true
  );
  assert.equal(
    evaluateZoneDependency({
      sourceZone: "infrastructure",
      targetZone: "domain",
      targetPath: "src/domain/Order.mjs"
    }).allowed,
    false
  );

  // Martin coupling metrics
  const martin = computeMartinMetrics({
    afferentCoupling: 4,
    efferentCoupling: 1,
    abstractExportCount: 1,
    totalExportCount: 2
  });
  assert.equal(martin.instability, 0.2);
  assert.equal(martin.abstractness, 0.5);
  assert.equal(martin.distanceFromMainSequence, 0.3);

  // Entropy formula
  const zeroEntropy = computeStructuralEntropy({
    totalFiles: 10,
    deepFileCount: 0,
    misalignedFileCount: 0,
    orphanFileCount: 0,
    totalEdges: 15,
    crossZoneViolationEdges: 0,
    avgNormalizedComplexity: 0,
    runtimeCycleCount: 0
  });
  assert.equal(zeroEntropy.entropyScore, 0);
  assert.equal(zeroEntropy.stabilityIndex, 100);
  assert.equal(zeroEntropy.status, "SOVEREIGN");
});

test("4. SpiderEngine: detects SPI-201 cycles, SPI-205 mutable plumbing, SPI-206 leaks, SPI-208 misalignment, SPI-209 depth, SPI-401 security", () => {
  withTempWorkspace((tmpDir) => {
    // 1. Mutable state + upward import in Plumbing (SPI-205, SPI-206)
    writeFixture(
      tmpDir,
      "src/plumbing/badHelper.mjs",
      `/** [LAYER: PLUMBING] */
import { Entity } from "../domain/Entity.mjs";
export let mutableCounter = 0;
export function inc() { mutableCounter += 1; return Entity; }
`
    );

    // 2. Domain importing raw I/O (SPI-206) and geographically misaligned tag (SPI-208)
    writeFixture(
      tmpDir,
      "src/domain/Entity.mjs",
      `/** [LAYER: INFRASTRUCTURE] */
import fs from "node:fs";
export class Entity {
  save() { return fs.existsSync("."); }
}
`
    );

    // 3. Runtime Circular Dependency A <-> B in Core (SPI-201) + Deep relative import > 3 (SPI-209)
    writeFixture(
      tmpDir,
      "src/core/a/b/c/ServiceA.mjs",
      `/** [LAYER: CORE] */
import { ServiceB } from "./ServiceB.mjs";
import { inc } from "../../../../plumbing/badHelper.mjs";
export function runA() { return ServiceB() + inc(); }
`
    );
    writeFixture(
      tmpDir,
      "src/core/a/b/c/ServiceB.mjs",
      `/** [LAYER: CORE] */
import { runA } from "./ServiceA.mjs";
export function ServiceB() { return runA; }
`
    );

    // 4. UI importing Infrastructure + Security eval() (SPI-206, SPI-401)
    writeFixture(
      tmpDir,
      "src/infrastructure/DbClient.mjs",
      `/** [LAYER: INFRASTRUCTURE] */
export class DbClient {}
`
    );
    writeFixture(
      tmpDir,
      "src/ui/View.mjs",
      `/** [LAYER: UI] */
import { DbClient } from "../infrastructure/DbClient.mjs";
export function render(code) {
  eval(code);
  return new DbClient();
}
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(report.conforms, false);

    const codes = new Set(report.violations.map((v) => v.code));
    assert.ok(codes.has("SPI-201"), "Expected SPI-201 circular dependency");
    assert.ok(codes.has("SPI-205"), "Expected SPI-205 mutable plumbing state");
    assert.ok(codes.has("SPI-206"), "Expected SPI-206 cross-layer/I/O leak");
    assert.ok(codes.has("SPI-208"), "Expected SPI-208 geographic misalignment");
    assert.ok(codes.has("SPI-209"), "Expected SPI-209 import depth > 3");
    assert.ok(codes.has("SPI-401"), "Expected SPI-401 dynamic eval security violation");
    assert.equal(report.runtimeCycles.length, 1);
  });
});

test("5. Leniency & Escape Hatches: type-only cycles do not block, @joyzoning-bypass & @sovereign-ignore are audited", () => {
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      "src/domain/TypeA.ts",
      `/** [LAYER: DOMAIN] */
import type { TypeB } from "./TypeB.js";
export interface TypeA { b?: TypeB; }
`
    );
    writeFixture(
      tmpDir,
      "src/domain/TypeB.ts",
      `/** [LAYER: DOMAIN] */
import type { TypeA } from "./TypeA.js";
export interface TypeB { a?: TypeA; }
`
    );
    writeFixture(
      tmpDir,
      "src/infrastructure/SandboxRunner.mjs",
      `/**
 * [LAYER: INFRASTRUCTURE]
 * @sovereign-ignore SPI-401 Controlled sandbox evaluation
 */
export function runSandboxed(expr) {
  return eval(expr);
}
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(report.conforms, true, "Type-only cycles and ignored rules should not block");
    assert.equal(report.runtimeCycles.length, 0);
    assert.equal(report.bypassedItems.length, 1);
    assert.equal(report.bypassedItems[0].code, "SPI-401");
  });
});

test("6. Clean-Room Acquisition & Self-Healing Simulation on an Unfamiliar Project", async () => {
  await withTempWorkspace(async (tmpDir) => {
    // Step 1: Create an unfamiliar legacy project with untagged files and custom folder names
    writeFixture(
      tmpDir,
      "spider.spec.json",
      JSON.stringify({
        layers: {
          domain: ["app/models"],
          core: ["app/usecases"],
          infrastructure: ["app/drivers"],
          plumbing: ["app/helpers"],
          ui: ["app/cli"]
        },
        compositionRoots: ["app/cli/main.mjs"]
      })
    );

    writeFixture(
      tmpDir,
      "app/helpers/slug.mjs",
      `export function toSlug(s) { return String(s).trim().toLowerCase().replace(/\\s+/g, "-"); }\n`
    );
    writeFixture(
      tmpDir,
      "app/models/interfaces/ITaskStore.mjs",
      `export class ITaskStore { save(_t) {} }\n`
    );
    writeFixture(
      tmpDir,
      "app/models/Task.mjs",
      `import { toSlug } from "../helpers/slug.mjs";
export class Task {
  constructor(title) { this.title = title; this.slug = toSlug(title); }
}
`
    );
    writeFixture(
      tmpDir,
      "app/drivers/MemoryTaskStore.mjs",
      `import { ITaskStore } from "../models/interfaces/ITaskStore.mjs";
export class MemoryTaskStore extends ITaskStore {
  constructor() { super(); this.items = []; }
  save(t) { this.items.push(t); }
  dispose() { this.items = []; }
}
`
    );
    writeFixture(
      tmpDir,
      "app/usecases/CreateTask.mjs",
      `import { Task } from "../models/Task.mjs";
export class CreateTask {
  constructor(store) { this.store = store; }
  execute(title) { const task = new Task(title); this.store.save(task); return task; }
}
`
    );
    writeFixture(
      tmpDir,
      "app/cli/main.mjs",
      `#!/usr/bin/env node
import { MemoryTaskStore } from "../drivers/MemoryTaskStore.mjs";
import { CreateTask } from "../usecases/CreateTask.mjs";
export function runCli(title) {
  const store = new MemoryTaskStore();
  const uc = new CreateTask(store);
  return uc.execute(title);
}
`
    );

    // Before healing: should fail strict audit with 6 SPI-208 missing header violations
    const beforeReport = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(beforeReport.conforms, false);
    assert.equal(beforeReport.violations.length, 6);

    // Step 2: Run automated tag healing (`joy-check --heal`)
    const healResult = runJoyHeal(tmpDir);
    assert.equal(healResult.healedCount, 6);

    // Step 3: Re-audit in strict mode -> 100% conformance, 100% Stability Index
    const afterReport = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(afterReport.conforms, true);
    assert.equal(afterReport.violations.length, 0);
    assert.equal(afterReport.entropy.stabilityIndex, 100);

    // Verify shebang on app/cli/main.mjs was preserved on Line 1
    const cliContent = fs.readFileSync(path.join(tmpDir, "app/cli/main.mjs"), "utf8");
    assert.ok(cliContent.startsWith("#!/usr/bin/env node\n/** [LAYER: UI] */\n"));
  });
});

test("7. Example Verification & Self-Hosting Dogfood Test (HEAV3NS-JOY audits itself)", async () => {
  // Run the TypeScript/ESM reference example end-to-end
  const app = createCheckoutApp();
  const receipt = await app.presenter.submitAndFormatReceipt({
    id: "ORD-100",
    customerTier: "VIP",
    items: [{ sku: "JOY-BOOK", unitPriceCents: 6000, quantity: 2 }]
  });
  // 2 * $60.00 = $120.00; 10% VIP discount -> $108.00
  assert.equal(receipt, "Order #ORD-100 [VIP] (1 items) — Total: $108.00");

  // Run joy-check on the HEAV3NS-JOY repository itself
  const selfReport = runJoyAudit(REPO_ROOT, { theme: "strict" });
  const formatted = formatTerminalReport(selfReport, { showMermaid: true });
  assert.ok(formatted.includes("PASS (SOVEREIGN)"));
  assert.equal(
    selfReport.conforms,
    true,
    `Expected HEAV3NS-JOY to conform 100% to its own rules, but found: ${JSON.stringify(selfReport.violations)}`
  );
  assert.equal(selfReport.violations.length, 0);
  assert.ok(selfReport.entropy.stabilityIndex >= 95);
});

test("8. Single-Pass Lexical Scanner: URLs in strings, regex literals, semicolon imports, inline type imports, UTF-8 BOM", () => {
  const trickySource = `
const apiUrl = "https://example.com//not-a-comment/*still-string*/";
const pattern = /\\/*not-a-comment*\\//gi; import { Alpha } from "./Alpha.mjs";
import { type Beta, type Gamma } from "./Beta.mjs";
export * from "./ReExported.mjs";
const lazyMod = await import("./DynamicMod.mjs");
`;
  const extracted = extractImports(trickySource, ".mjs");
  const bySpec = new Map(extracted.map((i) => [i.specifier, i]));

  assert.ok(bySpec.has("./Alpha.mjs"), "Should extract import after regex literal and semicolon");
  assert.deepEqual(bySpec.get("./Alpha.mjs").symbols, ["Alpha"]);
  assert.equal(bySpec.get("./Alpha.mjs").isTypeOnly, false);

  assert.ok(bySpec.has("./Beta.mjs"), "Should extract inline type-only named imports");
  assert.equal(bySpec.get("./Beta.mjs").isTypeOnly, true);

  assert.ok(bySpec.has("./ReExported.mjs"), "Should extract export * from barrel re-export");
  assert.equal(bySpec.get("./ReExported.mjs").isReExport, true);

  assert.ok(bySpec.has("./DynamicMod.mjs"), "Should extract dynamic import()");

  // UTF-8 BOM + Shebang preservation in applyHeaderTag
  const bomShebang = "\uFEFF#!/usr/bin/env node\nconsole.log(1);\n";
  const taggedBom = applyHeaderTag(bomShebang, ".mjs", "ui");
  assert.ok(taggedBom.startsWith("\uFEFF#!/usr/bin/env node\n/** [LAYER: UI] */\n"));
  assert.equal(extractHeaderTag(taggedBom).normalizedZone, "ui");

  // Multi-line for(let i = 0; ...) must NOT false-positive as mutable top-level state
  const multiLineFor = `/** [LAYER: PLUMBING] */
export function sum(arr) {
  for (
    let i = 0;
    i < arr.length;
    i++
  ) {
    // loop
  }
}
`;
  const metrics = analyzeCodeMetrics(multiLineFor, ".mjs");
  assert.equal(metrics.hasMutableTopLevelState, false);
});

test("9. Wildcard spider.spec.json, LUMI resources schema, tsconfig extends & paths, package.json #imports, and Barrel Bypass", () => {
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      "spider.spec.json",
      JSON.stringify({
        layers: {
          domain: ["packages/*/src/domain"]
        },
        resources: {
          adminPortal: { path: "packages/admin-api", domain: "api" }
        }
      })
    );
    writeFixture(
      tmpDir,
      "tsconfig.base.json",
      `{
        // Base tsconfig with comments and trailing comma
        "compilerOptions": {
          "baseUrl": ".",
          "paths": {
            "@pkg-domain/*": ["packages/billing/src/domain/*"],
          }
        }
      }`
    );
    writeFixture(
      tmpDir,
      "tsconfig.json",
      JSON.stringify({
        extends: "./tsconfig.base.json"
      })
    );
    writeFixture(
      tmpDir,
      "package.json",
      JSON.stringify({
        name: "alias-test",
        imports: {
          "#billing-domain/*": "./packages/billing/src/domain/*"
        }
      })
    );

    writeFixture(
      tmpDir,
      "packages/billing/src/domain/index.ts",
      `/** [LAYER: DOMAIN] */\nexport { Invoice } from "./Invoice.ts";\n`
    );
    writeFixture(
      tmpDir,
      "packages/billing/src/domain/Invoice.ts",
      `/** [LAYER: DOMAIN] */\nexport class Invoice {}\n`
    );
    writeFixture(
      tmpDir,
      "packages/admin-api/AdminAdapter.ts",
      `/** [LAYER: INFRASTRUCTURE] */
import { Invoice } from "@pkg-domain/Invoice.ts";
import { MissingSym } from "#billing-domain/index.ts";
export const x = new Invoice();
`
    );

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    // AdminAdapter [INFRASTRUCTURE] importing concrete Invoice.ts [DOMAIN] must trigger SPI-206
    assert.equal(report.conforms, false);
    assert.ok(report.violations.some((v) => v.code === "SPI-206"));
    // Importing Invoice.ts directly when packages/billing/src/domain/index.ts exists triggers BARREL_BYPASS advisory
    assert.ok(report.advisories.some((a) => a.type === "BARREL_BYPASS"));
    // Importing MissingSym from index.ts triggers SPI-102 Ghost Symbol advisory
    assert.ok(report.advisories.some((a) => a.code === "SPI-102"));
  });
});

test("10. Symlink Loop Protection, Binary File (\\0) Guard, .joyignore, and @generated Code Exemption", () => {
  withTempWorkspace((tmpDir) => {
    writeFixture(
      tmpDir,
      ".joyignore",
      `# Ignore vendor folder\nvendor/**\n`
    );
    writeFixture(
      tmpDir,
      "vendor/untaggedVendor.mjs",
      `export const v = 1;\n`
    );
    writeFixture(
      tmpDir,
      "src/domain/ValidEntity.mjs",
      `/** [LAYER: DOMAIN] */\nexport class ValidEntity {}\n`
    );
    // Binary file with .mjs extension (contains null byte \0) -> should be skipped
    writeFixture(
      tmpDir,
      "src/domain/binaryBlob.mjs",
      "some\0binary\0content"
    );
    // Auto-generated file without [LAYER] tag -> should be skipped
    writeFixture(
      tmpDir,
      "src/domain/generatedProto.ts",
      "// Code generated by protoc-gen-ts. DO NOT EDIT.\nexport interface ProtoMsg {}\n"
    );

    // Create a circular directory symlink `src/domain/loop -> src/domain`
    try {
      fs.symlinkSync(
        path.join(tmpDir, "src/domain"),
        path.join(tmpDir, "src/domain/loop"),
        "dir"
      );
    } catch {
      // Ignore if OS restricts symlink creation
    }

    const report = runJoyAudit(tmpDir, { theme: "strict" });
    assert.equal(report.conforms, true);
    assert.equal(report.totalFiles, 1);
    assert.equal(report.nodes[0].path, "src/domain/ValidEntity.mjs");
  });
});

