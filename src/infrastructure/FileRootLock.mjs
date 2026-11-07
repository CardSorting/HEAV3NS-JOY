/** [LAYER: INFRASTRUCTURE] */
/**
 * Cross-process exclusive lock for a state directory (`<root>/.joy-lock`).
 *
 * The embedded BroccoliDB kernel and BroccoliQueue only exclude *within* one process. Two shell
 * invocations sharing a `--root` would each replay the WAL and then append interleaved frames,
 * silently losing writes. This lock makes the single-writer rule enforceable:
 *
 *  - acquisition is an atomic `O_EXCL` create holding `{pid, host, token, startedAt}`;
 *  - a lock whose owner process no longer exists on this host is reclaimed automatically
 *    (crash safety); a lock held by a live process, or by another host, is waited on with
 *    jittered backoff and then rejected with `ROOT_LOCKED`, naming the holder;
 *  - release removes the file only if it still carries our token.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { newUuid } from "../plumbing/ids.mjs";

export const LOCK_FILE_NAME = ".joy-lock";

export class RootLockedError extends Error {
  constructor(message, holder) {
    super(message);
    this.name = "RootLockedError";
    this.code = "ROOT_LOCKED";
    this.holder = holder;
  }
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

async function readHolder(file) {
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return error.code === "ENOENT" ? undefined : null;
  }
}

/**
 * Acquires the exclusive lock for `root`, creating the directory when needed.
 * @param {string} root
 * @param {{ timeoutMs?: number, pollMs?: number, hostname?: string }} [options]
 * @returns {Promise<{ file: string, token: string, release: () => Promise<boolean> }>}
 */
export async function acquireRootLock(root, options = {}) {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const hostname = options.hostname ?? os.hostname();
  const dir = path.resolve(root);
  const file = path.join(dir, LOCK_FILE_NAME);
  await fs.mkdir(dir, { recursive: true });
  const token = newUuid();
  const record = JSON.stringify({ pid: process.pid, host: hostname, token, startedAt: Date.now(), argv: process.argv.slice(1, 4) });
  const deadline = Date.now() + timeoutMs;
  for (let attempt = 0; ; attempt++) {
    try {
      const handle = await fs.open(file, "wx", 0o600);
      try {
        await handle.writeFile(record);
      } finally {
        await handle.close();
      }
      return {
        file,
        token,
        async release() {
          const holder = await readHolder(file);
          if (!holder || holder.token !== token) return false;
          await fs.unlink(file).catch((error) => {
            if (error.code !== "ENOENT") throw error;
          });
          return true;
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
    const holder = await readHolder(file);
    if (holder === undefined) continue; // released between our create attempt and the read
    const reclaimable = holder === null /* unreadable or torn */ ? false : holder.host === hostname && !processAlive(holder.pid);
    if (reclaimable) {
      // Atomically move the stale lock aside so only one contender reclaims it, then verify we moved the stale one.
      const aside = `${file}.stale-${token}`;
      try {
        await fs.rename(file, aside);
        const moved = await readHolder(aside);
        if (moved && moved.token === holder.token) {
          await fs.unlink(aside).catch(() => undefined);
        } else {
          // We displaced a lock that was freshly created by someone else; put it back if the slot is still free.
          await fs.link(aside, file).catch(() => undefined);
          await fs.unlink(aside).catch(() => undefined);
        }
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      continue;
    }
    if (holder === null && Date.now() < deadline) {
      // A torn write is possible for a few ms; an old unreadable file is treated as stale below.
      const stat = await fs.stat(file).catch(() => null);
      if (stat && Date.now() - stat.mtimeMs > 5000) await fs.unlink(file).catch(() => undefined);
    }
    if (Date.now() >= deadline) {
      throw new RootLockedError(
        `state directory '${dir}' is locked by ${holder ? `pid ${holder.pid} on ${holder.host} (since ${new Date(holder.startedAt).toISOString()})` : "an unreadable lock file"}; wait for it to finish or remove ${file} if you are certain no process is using it`,
        holder ?? null
      );
    }
    const base = Math.min(250, 20 * 2 ** Math.min(attempt, 4));
    await new Promise((resolve) => setTimeout(resolve, options.pollMs ?? base + Math.floor(Math.random() * base)));
  }
}
