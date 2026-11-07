/** [LAYER: INFRASTRUCTURE] */
/**
 * Decides whether a caller-supplied path stays inside the project directory. Resolves relative
 * paths against the project root and follows symlinks on the deepest existing ancestor, so a link
 * inside the project that points outside it is rejected.
 */

import { realpathSync } from "node:fs";
import * as path from "node:path";

/**
 * @param {string} projectRoot
 * @param {{ allowOutside?: boolean }} [options]
 * @returns {(candidate: string) => boolean}
 */
export function createProjectPathGuard(projectRoot, options = {}) {
  if (options.allowOutside) return () => true;
  const root = path.resolve(projectRoot);
  let realRoot;
  try {
    realRoot = realpathSync(root);
  } catch {
    realRoot = root;
  }
  return (candidate) => {
    if (typeof candidate !== "string" || candidate.includes("\0")) return false;
    const full = path.resolve(root, candidate);
    let probe = full;
    for (;;) {
      try {
        const real = realpathSync(probe);
        const rel = path.relative(realRoot, real);
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
      } catch (error) {
        if (error.code !== "ENOENT" && error.code !== "ENOTDIR") return false;
        const parent = path.dirname(probe);
        if (parent === probe) return false;
        probe = parent;
      }
    }
  };
}
