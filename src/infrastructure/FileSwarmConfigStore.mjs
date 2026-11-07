/** [LAYER: INFRASTRUCTURE] */
/**
 * `ISwarmConfigStore` adapter persisting the Agent Swarm configuration as a JSON file
 * (default `~/.heav3ns/agent-swarm.json`). The directory is created `0700` and the file
 * is published via temp-file + atomic rename so concurrent readers never see a torn write.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ISwarmConfigStore } from "../domain/interfaces/ISwarmConfigStore.mjs";
import { newUuid } from "../plumbing/ids.mjs";

export function defaultAgentSwarmConfigPath() {
  return path.join(os.homedir(), ".heav3ns", "agent-swarm.json");
}

export class FileSwarmConfigStore extends ISwarmConfigStore {
  #file;

  /** @param {{ file?: string }} [options] */
  constructor(options = {}) {
    super();
    this.#file = options.file ?? defaultAgentSwarmConfigPath();
  }

  get file() {
    return this.#file;
  }

  async read() {
    try {
      return JSON.parse(await fs.readFile(this.#file, "utf8"));
    } catch (error) {
      if (error && error.code === "ENOENT") return undefined;
      // Corrupt or unreadable content is surfaced as a non-object so the service fails closed.
      return null;
    }
  }

  async write(document) {
    const directory = path.dirname(this.#file);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    const temporary = path.join(directory, `.agent-swarm-${newUuid()}.tmp`);
    try {
      await fs.writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, { mode: 0o600, flag: "wx" });
      await fs.rename(temporary, this.#file);
    } finally {
      await fs.unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
