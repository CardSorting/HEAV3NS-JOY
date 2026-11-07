/** [LAYER: UI] */
/** Portability guarantees (see docs/PORTABLE_TRINITY.md). */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { IBufferedStore, ISwarmConfigStore, ISwarmLeaseService, REPO_ROOT } from "./support/trinity.mjs";

describe("Suite 23: Zero-Dependency Portability Guarantee", () => {
  it("declares no runtime or dev dependencies and imports only relative or node: specifiers", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      assert.equal(pkg[field], undefined, `${field} must not be declared`);
    }
    const bare = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".mjs")) {
          const text = fs.readFileSync(full, "utf8");
          for (const match of text.matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
            const spec = match[1] ?? match[2];
            if (!spec.startsWith(".") && !spec.startsWith("node:")) bare.push(`${path.relative(REPO_ROOT, full)} -> ${spec}`);
          }
        }
      }
    };
    walk(path.join(REPO_ROOT, "src"));
    assert.deepEqual(bare, []);
  });

  it("exposes the trinity through the ./portable and subpath package exports", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
    assert.equal(pkg.exports["./portable"], "./src/portable.mjs");
    assert.ok(pkg.exports["./broccolidb"]);
    assert.ok(pkg.exports["./broccoliqueue"]);
  });

  it("keeps abstract store contracts abstract", async () => {
    await assert.rejects(new IBufferedStore().start(), /must be implemented/);
    assert.throws(() => new IBufferedStore().rows("t"), /must be implemented/);
    await assert.rejects(new ISwarmLeaseService().acquireLease("r", "o"), /must be implemented/);
    await assert.rejects(new ISwarmConfigStore().read(), /must be implemented/);
  });
});
