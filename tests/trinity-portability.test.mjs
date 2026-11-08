/** [LAYER: UI] */
/**
 * Automated Verification Suites (17–20) for the Portable Substrate Trinity:
 * - Suite 17: Pure Canonical Hashing, Summarization, & Structural AST Skeletonization
 * - Suite 18: JoyRide Full Spec (Typed Keys, 11-Point Validation, Single-Flight, Stale Guard, Priority Eviction)
 * - Suite 19: Spider Agent Ergonomics (Merkle Shield SPI-006, Semantic Footprints, N-Hop Scope, Formatters)
 * - Suite 20: BroccoliDB Portable Substrate (Sharded CAS, Quarantine, RFC 1952 WireEngine, RuntimeStateGraph RTG-001..008)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  sha256Hex,
  stableStringify,
  summarizeCommandOutput,
  distillSourceSkeleton,
  extractSymbolFootprints,
  JoyRideCache,
  createCommandResultCacheKey,
  createGrepResultCacheKey,
  createFileMetadataCacheKey,
  createVerificationCacheKey,
  createDiffCacheKey,
  createScratchArtifactCacheKey,
  NodeWorkspaceScanner,
  NodeCasStorage,
  SpiderEngine,
  computeMerkleRoot,
  verifyDiskParity,
  trackSymbolMoves,
  getNeighborhood,
  skeletonizeFile,
  applyBundleBudget,
  serializeSpiderWire,
  restoreSpiderFromWire,
  runSpiderCheck,
  BroccoliRuntime,
  GuidedError,
  verifyRuntimeGraphIntegrity,
  explainJoyRule,
  formatCompactReport,
  formatLspDiagnostics,
  formatTapReport,
  formatJUnitReport,
  formatNdjsonReport,
  exportProblemMatcherConfig,
  formatStatsReport,
  computeWorkspaceStatistics,
  detectGhostCoupling,
  migrateRuntimeGraph,
  runJoyInit,
  runJoyDocsCheck
} from "../src/index.mjs";

describe("Suite 17: Pure Canonical Hashing, Summarization, & AST Skeletonization", () => {
  it("computes FIPS 180-4 SHA-256 digests identical to node:crypto across empty, ASCII, and multi-block inputs", () => {
    const samples = [
      "",
      "abc",
      "Sovereign Swarm Memory Content",
      "a".repeat(2048) + "🚀🌐"
    ];
    for (const input of samples) {
      const expected = crypto.createHash("sha256").update(input, "utf8").digest("hex");
      assert.equal(sha256Hex(input), expected);
    }
  });

  it("normalizes key order, BigInt, and circular references in stableStringify", () => {
    const a = { z: 1, a: { d: 4n, c: 3 } };
    const b = { a: { c: 3, d: 4n }, z: 1 };
    assert.equal(stableStringify(a), stableStringify(b));

    const circular = { name: "root" };
    circular.self = circular;
    const serialized = stableStringify(circular);
    assert.ok(serialized.includes('"[Circular]"'));
  });

  it("summarizes long command output with 65% head / 35% tail windowing", () => {
    const longText = "HEAD_MARKER_" + "x".repeat(3000) + "_TAIL_MARKER";
    const result = summarizeCommandOutput(longText, 400);
    assert.equal(result.truncated, true);
    assert.ok(result.summary.startsWith("HEAD_MARKER_"));
    assert.ok(result.summary.endsWith("_TAIL_MARKER"));
    assert.ok(result.summary.includes("[truncated "));
  });

  it("distills source files into structural skeletons with >50% reduction while optionally keeping a target symbol body", () => {
    const sampleCode = [
      "/** [LAYER: CORE] */",
      'import { helper } from "../plumbing/helper.mjs";',
      "",
      "export class OrderController {",
      "  executeOrder(order) {",
      "    const validated = helper(order);",
      "    const step1 = validated.items.map((x) => x.price * x.qty);",
      "    const total = step1.reduce((a, b) => a + b, 0);",
      "    return { ok: true, total };",
      "  }",
      "",
      "  cancelOrder(orderId) {",
      "    const token = String(orderId).trim();",
      "    if (!token) throw new Error('Invalid orderId');",
      "    return { cancelled: token, timestamp: Date.now() };",
      "  }",
      "}"
    ].join("\n");

    const fullSkel = distillSourceSkeleton(sampleCode);
    assert.ok(fullSkel.skeleton.includes("/** [LAYER: CORE] */"));
    assert.ok(fullSkel.skeleton.includes("executeOrder(order) { /* ... */ }"));
    assert.ok(fullSkel.skeleton.includes("cancelOrder(orderId) { /* ... */ }"));
    assert.ok(fullSkel.reductionRatio > 0.35);

    const focusedSkel = distillSourceSkeleton(sampleCode, { keepSymbol: "cancelOrder" });
    assert.ok(focusedSkel.skeleton.includes("executeOrder(order) { /* ... */ }"));
    assert.ok(focusedSkel.skeleton.includes("if (!token) throw new Error('Invalid orderId');"));
  });
});

describe("Suite 18: JoyRide Full Spec Portability", () => {
  it("builds deterministic typed keys and enforces 11-point fingerprint validation & stale marking", async () => {
    const cache = new JoyRideCache({ maxArtifactCount: 2 });
    const cmdKey1 = createCommandResultCacheKey({ command: "npm test", cwd: "/repo" });
    const cmdKey2 = createCommandResultCacheKey({ command: "npm test", cwd: "/repo" });
    assert.equal(cmdKey1, cmdKey2);

    assert.ok(createGrepResultCacheKey({ pattern: "TODO" }).startsWith("joyride:taskLocal:grep:"));
    assert.ok(createFileMetadataCacheKey({ filePath: "src/a.mjs" }).startsWith("joyride:workspaceIndex:file-meta:"));
    assert.ok(createVerificationCacheKey({ suite: "unit", target: "all" }).startsWith("joyride:verification:verify:"));
    assert.ok(createDiffCacheKey({ baseRef: "HEAD~1", headRef: "HEAD" }).startsWith("joyride:taskLocal:diff:"));

    // Store with 11-point metadata and duplicate fingerprint deduplication
    const res1 = cache.set(cmdKey1, { stdout: "ok" }, {
      gitHead: "abc1234",
      approvalBoundaryId: "boundary-1",
      dependencyFingerprint: "dep-v1"
    });
    assert.equal(res1.stored, true);
    assert.equal(res1.deduplicated, false);

    const res2 = cache.set(cmdKey1, { stdout: "ok" }, {
      gitHead: "abc1234",
      approvalBoundaryId: "boundary-1",
      dependencyFingerprint: "dep-v1"
    });
    assert.equal(res2.stored, true);
    assert.equal(res2.deduplicated, true);
    assert.equal(cache.getStats().duplicateArtifactDeduplicationCount, 1);

    // Valid read with matching gitHead & approvalBoundaryId
    assert.deepEqual(
      cache.get(cmdKey1, { gitHead: "abc1234", approvalBoundaryId: "boundary-1" }),
      { stdout: "ok" }
    );

    // Mismatched gitHead invalidates and increments staleReusePreventionCount
    assert.equal(cache.get(cmdKey1, { gitHead: "def5678" }), null);
    assert.equal(cache.getStats().staleReusePreventionCount, 1);

    // markStale preserves diagnostic explain() until read
    const vKey = createVerificationCacheKey({ suite: "spider", target: "src" });
    cache.set(vKey, { passed: true });
    cache.markStale(vKey, "DEPENDENCY_UPDATED");
    const info = cache.explain(vKey);
    assert.equal(info.validity, "stale");
    assert.equal(info.staleReason, "DEPENDENCY_UPDATED");
    assert.equal(cache.get(vKey), null);

    // Single-flight deduplication coalesces concurrent getOrCompute calls
    let invocations = 0;
    const sfKey = createGrepResultCacheKey({ pattern: "Layer" });
    const [rA, rB] = await Promise.all([
      cache.getOrCompute(sfKey, async () => {
        invocations += 1;
        await new Promise((r) => setTimeout(r, 15));
        return { matches: 5 };
      }),
      cache.getOrCompute(sfKey, async () => {
        invocations += 1;
        return { matches: 99 };
      })
    ]);
    assert.equal(invocations, 1);
    assert.deepEqual(rA, { matches: 5 });
    assert.deepEqual(rB, { matches: 5 });
    assert.equal(cache.getStats().singleFlightHits, 1);

    // Scratch artifact count cap & cleanupHandler invocation
    let cleanedReason = null;
    const s1 = createScratchArtifactCacheKey({ taskId: "t1", label: "a1" });
    const s2 = createScratchArtifactCacheKey({ taskId: "t1", label: "a2" });
    const s3 = createScratchArtifactCacheKey({ taskId: "t1", label: "a3" });
    assert.equal(
      cache.set(s1, { temp: 1 }, { cleanupHandler: ({ reason }) => { cleanedReason = reason; } }).stored,
      true
    );
    assert.equal(cache.set(s2, { temp: 2 }).stored, true);
    assert.equal(cache.set(s3, { temp: 3 }).reason, "ARTIFACT_COUNT_EXCEEDED");

    cache.dispose(s1);
    assert.equal(cleanedReason, "disposed");

    // Circular object with secret is safely rejected without stack overflow
    const circSecret = { token: "ghp_1234567890abcdefghijklmnopqrstuv" };
    circSecret.self = circSecret;
    assert.equal(cache.set(s2, circSecret).reason, "SECRET_DETECTED");
  });
});

describe("Suite 19: Spider Agent Ergonomics, Reality Shield, & Industry Formatters", () => {
  it("verifies Merkle disk parity (SPI-006), tracks semantic footprints across file moves, scopes N-hop neighborhoods, and formats LSP/TAP/JUnit/NDJSON/Compact outputs", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "heav3ns-spider-"));
    try {
      const domainDir = path.join(tmpRoot, "src", "domain");
      const coreDir = path.join(tmpRoot, "src", "core");
      fs.mkdirSync(domainDir, { recursive: true });
      fs.mkdirSync(coreDir, { recursive: true });

      const entityFile = path.join(domainDir, "Invoice.mjs");
      const serviceFile = path.join(coreDir, "BillingService.mjs");

      fs.writeFileSync(
        entityFile,
        '/** [LAYER: DOMAIN] */\nexport function calculateTax(amount) {\n  return amount * 0.1;\n}\n',
        "utf8"
      );
      fs.writeFileSync(
        serviceFile,
        '/** [LAYER: CORE] */\nimport { calculateTax } from "../domain/Invoice.mjs";\nexport function bill(amount) {\n  return amount + calculateTax(amount);\n}\n',
        "utf8"
      );

      const scanner = new NodeWorkspaceScanner();
      const engine = new SpiderEngine(scanner);

      // 1. Unified Spider check & Merkle baseline
      const merkleDirect = computeMerkleRoot([
        { relativePath: "src/domain/Invoice.mjs", content: fs.readFileSync(entityFile, "utf8") }
      ]);
      assert.equal(typeof merkleDirect.merkleRoot, "string");

      const check1 = runSpiderCheck(engine, tmpRoot, {
        phase: "pre-edit",
        scope: "src/core/BillingService.mjs",
        neighborhoodDepth: 1,
        budgetTokens: 1000
      });
      assert.equal(check1.gate.passed, true);
      assert.equal(check1.scoped.neighborhoodFiles.length, 2);

      const directNeighborhood = getNeighborhood(check1.report, "src/core/BillingService.mjs", 1);
      assert.equal(directNeighborhood.neighborhoodFiles.length, 2);

      const tightBundle = applyBundleBudget(check1.agentBundle, 128);
      assert.equal(typeof tightBundle.budget.estimatedTokens, "number");

      // 2. Wire v2 serialization & restoration
      const wire = serializeSpiderWire(check1.agentBundle);
      const restored = restoreSpiderFromWire(wire);
      assert.equal(restored.wireVersion, 2);
      assert.equal(restored.merkleRoot, check1.merkleRoot);

      // 3. Simulate disk drift -> verifyDiskParity emits SPI-006
      fs.writeFileSync(
        entityFile,
        '/** [LAYER: DOMAIN] */\nexport function calculateTax(amount) {\n  return amount * 0.2;\n}\n',
        "utf8"
      );
      const parity = verifyDiskParity(scanner, tmpRoot, {
        fileHashes: check1.fileHashes,
        merkleRoot: check1.merkleRoot
      });
      assert.equal(parity.synchronized, false);
      assert.deepEqual(parity.driftedFiles, ["src/domain/Invoice.mjs"]);
      assert.equal(parity.violations[0].code, "SPI-006");

      // 4. Semantic Footprint tracking across file relocation
      const beforeFp = extractSymbolFootprints(
        'export function calculateTax(amount) {\n  return amount * 0.2;\n}\n',
        "src/domain/Invoice.mjs"
      );
      const afterFpExact = extractSymbolFootprints(
        '// comment added\nexport function calculateTax(amount) {\n  return amount * 0.2;\n}\n',
        "src/domain/TaxPolicy.mjs"
      );
      const moves = trackSymbolMoves(beforeFp, afterFpExact);
      assert.equal(moves.length, 1);
      assert.equal(moves[0].moved, true);
      assert.equal(moves[0].moveConfidence, "exact");

      // 5. Skeletonize via workspace scanner
      const skel = skeletonizeFile(scanner, tmpRoot, "src/core/BillingService.mjs");
      assert.ok(skel.skeleton.includes("bill(amount) { /* ... */ }"));

      // 6. Verify all 5 new formatters
      const reportWithViolation = {
        ...check1.report,
        conforms: false,
        violations: parity.violations
      };
      const compact = formatCompactReport(reportWithViolation);
      assert.ok(compact.includes("[spider:fail]"));
      assert.ok(compact.includes("SPI-006"));

      const lsp = formatLspDiagnostics(reportWithViolation);
      assert.ok(lsp.notifications.length >= 1);
      assert.ok(
        lsp.notifications.some((n) =>
          n.params.diagnostics.some((d) => d.code === "SPI-006")
        )
      );

      const tap = formatTapReport(reportWithViolation);
      assert.ok(tap.startsWith("TAP version 13"));
      assert.ok(tap.includes("not ok 1 - [SPI-006]"));

      const junit = formatJUnitReport(reportWithViolation);
      assert.ok(junit.includes('<failure type="SPI-006"'));

      const ndjson = formatNdjsonReport(reportWithViolation);
      const ndjsonRows = ndjson.split("\n").map((line) => JSON.parse(line));
      assert.equal(ndjsonRows[0].type, "summary");
      assert.equal(ndjsonRows[1].code, "SPI-006");

      const matcher = exportProblemMatcherConfig();
      assert.equal(matcher.version, 2);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("Suite 20: BroccoliDB Portable Operational Substrate (CAS, Quarantine, WireEngine, RuntimeStateGraph)", () => {
  it("deduplicates sharded CAS blobs, quarantines corrupted blobs to .broccolidb/storage/corrupt/, and synthesizes RFC 1952 multi-member GZIP streams", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "heav3ns-broccoli-"));
    try {
      const cas = new NodeCasStorage(tmpRoot);
      const hash1 = cas.writeBlob("trusted sovereign payload");
      const hash2 = cas.writeBlob("trusted sovereign payload");
      assert.equal(hash1, hash2);
      assert.equal(cas.readBlob(hash1), "trusted sovereign payload");

      // Context scaling & hydration
      const largePayload = " CONTEXT_BLOCK ".repeat(120);
      const scaledRef = cas.scaleContent(largePayload, 256);
      assert.ok(scaledRef.startsWith("CAS:"));
      assert.equal(cas.hydrateContent(scaledRef), largePayload);

      // Corrupt the physical blob on disk -> verify quarantine + manifest.jsonl + GuidedError(STORAGE_CORRUPT)
      const shardPath = path.join(
        tmpRoot,
        ".broccolidb",
        "storage",
        "blobs",
        hash1.slice(0, 2),
        hash1
      );
      fs.writeFileSync(shardPath, "tampered payload on disk", "utf8");

      assert.throws(
        () => cas.readBlob(hash1),
        (err) => err instanceof GuidedError && err.code === "STORAGE_CORRUPT"
      );

      const corruptDir = path.join(tmpRoot, ".broccolidb", "storage", "corrupt");
      const corruptFiles = fs.readdirSync(corruptDir).filter((f) => f.endsWith(".corrupt"));
      assert.equal(corruptFiles.length, 1);

      const manifestLine = fs
        .readFileSync(path.join(corruptDir, "manifest.jsonl"), "utf8")
        .trim();
      const manifestEntry = JSON.parse(manifestLine);
      assert.equal(manifestEntry.expectedHash, hash1);
      assert.equal(manifestEntry.reason, "sha256_mismatch");

      // RFC 1952 Multi-Member GZIP Wire Engine with warm chunk reuse
      const multiChunkText = "CHUNK_A_DATA_".repeat(100) + "CHUNK_B_DATA_".repeat(100);
      const wireCold = cas.compressWirePayload(multiChunkText, { chunkSize: 512 });
      assert.ok(wireCold.chunkCount >= 4);
      assert.equal(wireCold.cacheHits, 0);
      assert.equal(cas.decompressWirePayload(wireCold.buffer), multiChunkText);

      const wireWarm = cas.compressWirePayload(multiChunkText, { chunkSize: 512 });
      assert.equal(wireWarm.cacheHits, wireCold.chunkCount);
      assert.equal(wireWarm.cacheMisses, 0);
      assert.equal(cas.decompressWirePayload(wireWarm.buffer), multiChunkText);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("governs Proof-Before-Mutation (RTG-003), automatic rollback on failure, RTG-001..008 snapshot integrity, story(), and replay()", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "heav3ns-runtime-"));
    try {
      const cas = new NodeCasStorage(tmpRoot);
      const runtime = new BroccoliRuntime({ casStorage: cas, mode: "development" });

      // Lifecycle guard before start()
      assert.throws(
        () => runtime.beginSession({ intent: "test" }),
        (err) => err instanceof GuidedError && err.code === "LIFECYCLE_STATE_ERROR"
      );

      runtime.start();
      const { sessionId } = runtime.beginSession({
        sessionId: "sess-alpha",
        intent: "Repair missing header tag"
      });

      // RTG-003: Calling planRepairs before recordAudit throws GuidedError
      assert.throws(
        () => runtime.planRepairs(sessionId),
        (err) => err instanceof GuidedError && err.code === "INVARIANT_VIOLATION"
      );

      const failingReport = {
        conforms: false,
        entropy: { stabilityIndex: 92, entropyScore: 0.08 },
        violations: [
          {
            code: "SPI-205",
            severity: "ERROR",
            file: "src/domain/Order.mjs",
            line: 1,
            message: "Missing [LAYER: DOMAIN] header",
            sop: "ALIGN_TAGS"
          }
        ],
        advisories: []
      };

      runtime.recordAudit(sessionId, failingReport);
      const plan = runtime.planRepairs(sessionId);
      assert.equal(plan.directives.length, 1);

      // Readonly mode blocks execution with POLICY_BLOCKED
      runtime.setMode("readonly");
      assert.throws(
        () => runtime.execute(sessionId, plan.planId, () => {}),
        (err) => err instanceof GuidedError && err.code === "POLICY_BLOCKED"
      );

      // Switch back to development mode; test automatic rollback when mutationFn throws
      runtime.setMode("development");
      let rolledBack = false;
      assert.throws(
        () =>
          runtime.execute(
            sessionId,
            plan.planId,
            () => {
              throw new Error("Simulated disk write failure");
            },
            {
              rollbackFn: () => {
                rolledBack = true;
              }
            }
          ),
        /Simulated disk write failure/
      );
      assert.equal(rolledBack, true);
      assert.equal(runtime.state(sessionId).status, "rolled_back");

      // Execute successful repair -> verify -> snapshot -> story -> replay
      runtime.execute(sessionId, plan.planId, () => ({ healed: 1 }));
      const cleanReport = {
        conforms: true,
        entropy: { stabilityIndex: 100, entropyScore: 0 },
        violations: [],
        advisories: []
      };
      const verification = runtime.verify(sessionId, cleanReport);
      assert.equal(verification.passed, true);
      assert.equal(verification.diff.resolved.length, 1);

      const snap = runtime.snapshot(sessionId);
      assert.equal(snap.integrity.healthy, true);

      const narrative = runtime.story(sessionId);
      assert.ok(narrative.whatChanged.includes("1 finding(s) resolved"));
      assert.equal(narrative.whatRecovered.length, 1);

      const replayed = runtime.replay(sessionId, {
        mode: "forensic",
        liveGraphHash: snap.graph.graphHash
      });
      assert.equal(replayed.healthy, true);
      assert.equal(replayed.divergenceDetected, false);

      // Verify RTG-008 detection if a session with unresolved ERROR findings is marked completed
      const corruptCheck = verifyRuntimeGraphIntegrity(
        {
          sessionId: "sess-bad",
          nodes: [
            {
              id: "n1",
              sessionId: "sess-bad",
              kind: "Finding",
              label: "Unresolved blocker",
              timestamp: 1,
              data: { severity: "ERROR", resolved: false }
            }
          ],
          edges: []
        },
        { status: "completed" }
      );
      assert.equal(corruptCheck.healthy, false);
      assert.equal(corruptCheck.violations[0].diagnosticId, "RTG-008");

      // Verify explainJoyRule resolves RTG-003 and BROCCOLIDB
      assert.equal(explainJoyRule("RTG-003").code, "RTG-003");
      assert.equal(explainJoyRule("BROCCOLIDB").code, "BROCCOLIDB");
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("Suite 21: Zenith Tier Hardening (Atomic CAS, L1/L2 JoyRide Spillover, SPI-108 Ghost Coupling, & Operator Projections)", () => {
  it("hardens NodeCasStorage against invalid SHA-256 hashes and snapshot path traversal attacks", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joy-zenith-cas-"));
    try {
      const cas = new NodeCasStorage(tmpRoot);
      assert.throws(
        () => cas.readBlob("not-a-valid-sha256"),
        (err) => err instanceof GuidedError && err.code === "INVARIANT_VIOLATION"
      );
      assert.throws(
        () => cas.hydrateContent("CAS:../../etc/passwd"),
        (err) => err instanceof GuidedError && err.code === "INVARIANT_VIOLATION"
      );
      assert.throws(
        () => cas.loadSnapshot("sess-1", "../../../etc/passwd"),
        (err) => err instanceof GuidedError && err.code === "INVARIANT_VIOLATION"
      );
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("enforces JoyRide 4-tier memory pressure valve and L2 ICasStorage spillover & re-hydration", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "joy-zenith-l2-"));
    try {
      const cas = new NodeCasStorage(tmpRoot);
      const cache = new JoyRideCache({ maxTotalBytes: 2000, casStorage: cas });

      const verKey = createVerificationCacheKey({
        workspaceRoot: "/repo",
        targetPath: "src/index.mjs",
        checkKind: "typecheck",
        contentHash: "a".repeat(64)
      });
      const cmdKey = createCommandResultCacheKey({
        workspaceRoot: "/repo",
        command: "npm test",
        args: [],
        cwd: "/repo"
      });
      const scratchKey = createScratchArtifactCacheKey({
        workspaceRoot: "/repo",
        scratchId: "temp-1",
        purpose: "probe"
      });

      cache.set(verKey, { passed: true, score: 99 });
      cache.set(cmdKey, { stdout: "x".repeat(300) });
      cache.set(scratchKey, { scratch: "y".repeat(200) });

      // Elevated memory pressure evicts hotExecution entries first
      const elevated = cache.handleMemoryPressure("elevated");
      assert.ok(elevated.evicted >= 1);
      assert.equal(cache.get(cmdKey), null);

      // High memory pressure evicts scratchArtifact entries
      const high = cache.handleMemoryPressure("high");
      assert.ok(high.evicted >= 1);
      assert.equal(cache.get(scratchKey), null);

      // Evict verification entry via budget trim, while L2 CAS retains it
      cache.trimToBudget(0);
      assert.equal(cache.entries.size, 0);

      // Re-hydrating verification entry from L2 CAS succeeds transparently
      const hydrated = cache.get(verKey);
      assert.notEqual(hydrated, null);
      assert.equal(hydrated.score, 99);
      assert.equal(cache.getStats().l2Hydrations, 1);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("computes multivariate Z-score outliers, detects SPI-108 Ghost Coupling, and scaffolds --init config", () => {
    const nodes = [
      { path: "src/a.mjs", cognitiveComplexity: 4, incomingEdges: [1], lineCount: 100, dependencies: [] },
      { path: "src/b.mjs", cognitiveComplexity: 5, incomingEdges: [1], lineCount: 110, dependencies: [] },
      { path: "src/c.mjs", cognitiveComplexity: 4, incomingEdges: [1], lineCount: 95, dependencies: [] },
      { path: "src/d.mjs", cognitiveComplexity: 5, incomingEdges: [1], lineCount: 105, dependencies: [] },
      { path: "src/e.mjs", cognitiveComplexity: 4, incomingEdges: [1], lineCount: 102, dependencies: [] },
      { path: "src/monolith.mjs", cognitiveComplexity: 65, incomingEdges: [1, 2, 3, 4, 5, 6, 7, 8], lineCount: 950, dependencies: [] }
    ];
    const stats = computeWorkspaceStatistics(nodes);
    assert.ok(stats.zScoreOutliers.some((o) => o.path === "src/monolith.mjs" && o.zScore > 2));

    // SPI-108 Ghost Coupling: src/a.mjs and src/b.mjs co-mutate across 3 transitions with 0 imports between them
    const snapshots = [
      { fileHashes: { "src/a.mjs": "h1", "src/b.mjs": "h1", "src/c.mjs": "c1" } },
      { fileHashes: { "src/a.mjs": "h2", "src/b.mjs": "h2", "src/c.mjs": "c1" } },
      { fileHashes: { "src/a.mjs": "h3", "src/b.mjs": "h3", "src/c.mjs": "c2" } },
      { fileHashes: { "src/a.mjs": "h4", "src/b.mjs": "h4", "src/c.mjs": "c2" } }
    ];
    const ghost = detectGhostCoupling(snapshots, nodes);
    assert.equal(ghost.length, 1);
    assert.equal(ghost[0].code, "SPI-108");
    assert.equal(ghost[0].jaccardSimilarity, 1);

    const statsText = formatStatsReport({
      entropy: { stabilityIndex: 99, status: "SOVEREIGN", healthScore: 95, grade: "A (Sovereign)" },
      statistics: stats,
      ghostCouplings: ghost
    });
    assert.ok(statsText.includes("MULTIVARIATE WORKSPACE STATISTICS"));
    assert.ok(statsText.includes("SPI-108"));

    // Test runJoyInit (--init)
    const tmpInit = fs.mkdtempSync(path.join(os.tmpdir(), "joy-zenith-init-"));
    try {
      const dry = runJoyInit(tmpInit, { dryRun: true });
      assert.equal(dry.files.length, 2);
      assert.equal(fs.existsSync(path.join(tmpInit, "stability.config.json")), false);

      runJoyInit(tmpInit, { dryRun: false });
      assert.equal(fs.existsSync(path.join(tmpInit, "stability.config.json")), true);
      assert.equal(fs.existsSync(path.join(tmpInit, ".joyignore")), true);
    } finally {
      fs.rmSync(tmpInit, { recursive: true, force: true });
    }
  });

  it("supports BroccoliRuntime timeline, nextActions, causalView, explainNode, schema migration, and 5 replay modes", () => {
    const runtime = new BroccoliRuntime({ mode: "development" });
    runtime.start();
    const { sessionId } = runtime.beginSession({
      sessionId: "sess-zenith",
      intent: "Verify operator projections and multi-mode replay"
    });
    runtime.recordAudit(sessionId, {
      conforms: false,
      entropy: { stabilityIndex: 90, entropyScore: 0.1 },
      violations: [{ code: "SPI-208", severity: "ERROR", file: "src/core/x.mjs", message: "Missing tag" }]
    });

    const tl = runtime.timeline(sessionId);
    assert.ok(tl.length >= 4);
    assert.equal(tl[0].offsetMs, 0);

    const actions = runtime.nextActions(sessionId);
    assert.ok(actions.length >= 1);
    assert.ok(actions[0].command.includes("--heal"));

    const causal = runtime.causalView(sessionId);
    assert.equal(causal.intents.length, 1);
    assert.equal(causal.audits.length, 1);

    const explained = runtime.explainNode(sessionId, causal.audits[0].id);
    assert.equal(explained.node.id, causal.audits[0].id);
    assert.ok(explained.outbound.length >= 1);

    for (const mode of ["timeline", "causal", "verification", "ci", "forensic"]) {
      const rep = runtime.replay(sessionId, { mode });
      assert.equal(rep.projection.mode, mode);
    }

    // Schema v0 -> v1 migration
    const migrated = migrateRuntimeGraph({
      sessionId: "legacy-s0",
      nodes: [{ id: "n1", kind: "Session", label: "Legacy" }],
      edges: []
    });
    assert.equal(migrated.schemaVersion, 1);
    assert.ok(migrated.graphHash.length === 64);

    // Multi-line class method signature skeletonization
    const multiLineClass = [
      "/** [LAYER: CORE] */",
      "export class MultiLineService {",
      "  async executeOrder(",
      "    orderId,",
      "    options = {}",
      "  ) {",
      "    const total = orderId + 1;",
      "    return total;",
      "  }",
      "}"
    ].join("\n");
    const skel = distillSourceSkeleton(multiLineClass);
    assert.ok(skel.skeleton.includes("async executeOrder("));
    assert.ok(!skel.skeleton.includes("const total = orderId + 1;"));
  });
});

describe("Suite 22: LUMI-Style Documentation Strategy & Guardrails (runJoyDocsCheck)", () => {
  it("verifies all required docs, [LAYER] headers, docs/README.md sections, relative links, and live codebase metrics", () => {
    const result = runJoyDocsCheck(".");
    assert.equal(result.passed, true, JSON.stringify(result, null, 2));
    assert.equal(result.requiredDocsChecked, 74);
    assert.ok(result.markdownFilesScanned >= 80);
    assert.ok(result.linksChecked >= 500);
    assert.deepEqual(result.taxonomyCounts, {
      adrs: 9,
      playbooks: 5,
      wikiPages: 4,
      postmortems: 5,
      kbArticles: 3
    });
    assert.equal(result.missingDocs.length, 0);
    assert.equal(result.missingHeaders.length, 0);
    assert.equal(result.missingSections.length, 0);
    assert.equal(result.brokenLinks.length, 0);
    assert.equal(result.metricMismatches.length, 0);
  });
});


