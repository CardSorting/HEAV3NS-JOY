/** [LAYER: UI] */
/** Shared fixtures for the Portable Trinity test suites: the public surface plus temp-dir and polling helpers. */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export * from "../../src/portable.mjs";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

export async function eventually(predicate, timeoutMs = 3000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("condition did not become true before timeout");
}

export function enabledConfigForProcess() {
  return { read: async () => ({ ...(await import("../../src/portable.mjs")).defaultAgentSwarmConfig, enabled: true }) };
}
