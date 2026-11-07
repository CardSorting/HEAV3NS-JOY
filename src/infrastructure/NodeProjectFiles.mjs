/** [LAYER: INFRASTRUCTURE] */
/**
 * `IProjectFiles` adapter over the local filesystem, confined to one project root.
 *
 * Hardening: relative paths that escape the root (`..`, absolute paths, NUL bytes) are rejected;
 * writes refuse to pass through a symlink that resolves outside the root; every write is a
 * temp-file + rename so a crash can never leave a half-written config; file modes are preserved.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { IProjectFiles } from "../domain/interfaces/IProjectFiles.mjs";
import { newUuid } from "../plumbing/ids.mjs";

export class NodeProjectFiles extends IProjectFiles {
  #root;
  #realRoot;

  /** @param {string} root absolute or relative project root (must exist) */
  constructor(root) {
    super();
    this.#root = path.resolve(root);
  }

  get root() {
    return this.#root;
  }

  async #real() {
    this.#realRoot ??= await fs.realpath(this.#root);
    return this.#realRoot;
  }

  #resolve(rel) {
    if (typeof rel !== "string" || rel === "" || rel.includes("\0") || path.isAbsolute(rel)) throw new Error(`PATH_REJECTED: '${rel}' is not a valid project-relative path`);
    const full = path.resolve(this.#root, rel);
    const within = path.relative(this.#root, full);
    if (within === "" || within.startsWith("..") || path.isAbsolute(within)) throw new Error(`PATH_REJECTED: '${rel}' escapes the project root`);
    return full;
  }

  async #assertConfined(full) {
    // Resolve the deepest existing ancestor and make sure symlinks do not lead out of the project.
    const realRoot = await this.#real();
    let probe = full;
    for (;;) {
      try {
        const real = await fs.realpath(probe);
        const rel = path.relative(realRoot, real);
        if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`PATH_REJECTED: '${path.relative(this.#root, full)}' resolves outside the project root through a symlink`);
        return;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const parent = path.dirname(probe);
        if (parent === probe) return;
        probe = parent;
      }
    }
  }

  async exists(rel) {
    try {
      await fs.lstat(this.#resolve(rel));
      return true;
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
      throw error;
    }
  }

  async read(rel) {
    const full = this.#resolve(rel);
    await this.#assertConfined(full);
    try {
      return await fs.readFile(full, "utf8");
    } catch (error) {
      if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
      throw error;
    }
  }

  async write(rel, content) {
    const full = this.#resolve(rel);
    await this.#assertConfined(full);
    await fs.mkdir(path.dirname(full), { recursive: true });
    let mode = 0o644;
    try {
      mode = (await fs.stat(full)).mode & 0o777;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    const temporary = path.join(path.dirname(full), `.${path.basename(full)}.${newUuid().slice(0, 8)}.tmp`);
    try {
      await fs.writeFile(temporary, content, { mode, flag: "wx" });
      await fs.rename(temporary, full);
    } finally {
      await fs.unlink(temporary).catch(() => undefined);
    }
  }

  async remove(rel) {
    const full = this.#resolve(rel);
    await this.#assertConfined(full);
    let removed = false;
    try {
      await fs.unlink(full);
      removed = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    // Prune directories left empty, never touching the project root itself.
    let dir = path.dirname(full);
    while (dir !== this.#root && dir.startsWith(this.#root)) {
      try {
        await fs.rmdir(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
    return removed;
  }
}
