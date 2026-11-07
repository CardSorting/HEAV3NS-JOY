/** [LAYER: UI] */
/**
 * CLI smoke tests: every documented `--format` must exit cleanly on this repository,
 * emit parseable output where the format is structured, and `--explain` must resolve codes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(root, "bin", "joy-check.mjs");
const run = (...args) =>
  spawnSync(process.execPath, [bin, ...args], { cwd: root, encoding: "utf8", timeout: 60_000 });

describe("CLI smoke: documented output formats", () => {
  for (const format of ["compact", "lsp", "tap", "junit", "ndjson", "sarif", "github", "markdown", "json"]) {
    it(`--format ${format} exits 0 with output`, () => {
      const r = run(root, "--format", format);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(r.stdout.trim().length > 0, "expected non-empty stdout");
    });
  }

  it("--sarif emits valid SARIF 2.1.0 JSON", () => {
    const doc = JSON.parse(run(root, "--sarif").stdout);
    assert.equal(doc.version, "2.1.0");
    assert.ok(Array.isArray(doc.runs));
  });

  it("--json emits parseable JSON", () => {
    assert.doesNotThrow(() => JSON.parse(run(root, "--json").stdout));
  });

  it("--explain resolves a known violation code", () => {
    const r = run("--explain", "SPI-201");
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SPI-201/);
  });
});

describe("CLI hardening: usage errors never masquerade as a passing audit", () => {
  const cases = [
    ["missing target directory", ["/definitely/not/a/real/dir"]],
    ["unknown option", [".", "--bogus"]],
    ["invalid --format", [".", "--format", "xml"]],
    ["invalid --theme", [".", "--theme", "nope"]]
  ];
  for (const [name, args] of cases) {
    it(`${name} exits 2 with a stderr message`, () => {
      const r = run(...args);
      assert.equal(r.status, 2);
      assert.match(r.stderr, /error:/);
    });
  }

  it("--version matches package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    assert.equal(run("--version").stdout.trim(), pkg.version);
  });
});
