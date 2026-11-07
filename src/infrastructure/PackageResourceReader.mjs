/** [LAYER: INFRASTRUCTURE] */
/**
 * Reads documents shipped inside the installed package (AGENTS.md, spec/, docs/) for MCP resources.
 * Paths come from a fixed catalog, but the reader still refuses anything that escapes the package.
 */

import { readFile } from "node:fs/promises";
import * as path from "node:path";

/**
 * @param {string} packageRoot
 * @returns {(relativePath: string) => Promise<string | null>}
 */
export function createPackageResourceReader(packageRoot) {
  const root = path.resolve(packageRoot);
  return async (relativePath) => {
    const full = path.resolve(root, relativePath);
    const rel = path.relative(root, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
    try {
      return await readFile(full, "utf8");
    } catch {
      return null;
    }
  };
}
