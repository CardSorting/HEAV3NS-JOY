#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * Generates (or, with --check, verifies) the checked-in Claude Code marketplace plugin from the
 * installer's templates:  node scripts/build-plugin.mjs [--check]
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { planPluginFiles } from "../src/domain/agentTargets.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { version } = createRequire(import.meta.url)("../package.json");
const files = planPluginFiles(version);
const check = process.argv.includes("--check");
const drift = [];

for (const [rel, content] of Object.entries(files)) {
  const full = join(root, rel);
  const current = existsSync(full) ? readFileSync(full, "utf8") : null;
  if (current === content) continue;
  if (check) { drift.push(rel); continue; }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  process.stdout.write(`wrote ${rel}\n`);
}

if (check) {
  if (drift.length) {
    process.stderr.write(`plugin is out of date; run \`npm run plugin:build\`:\n${drift.map((d) => `  ${d}`).join("\n")}\n`);
    process.exitCode = 1;
  } else process.stdout.write(`plugin up to date (${Object.keys(files).length} files)\n`);
}
