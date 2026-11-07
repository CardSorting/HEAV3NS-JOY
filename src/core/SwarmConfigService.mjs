/** [LAYER: CORE] */
/**
 * Agent Swarm configuration service: merges the persisted document (via an injected
 * `ISwarmConfigStore`) with environment overrides (via an injected `env` map).
 * Environment-controlled keys are never written back to disk.
 */

import {
  failClosedAgentSwarmConfig,
  defaultAgentSwarmConfig,
  getAgentSwarmEnvironmentOverrides,
  sanitizeAgentSwarmConfig
} from "../domain/swarmConfig.mjs";

export class SwarmConfigService {
  #store;
  #env;

  /**
   * @param {{
   *   store: import("../domain/interfaces/ISwarmConfigStore.mjs").ISwarmConfigStore,
   *   env?: Record<string, string | undefined>
   * }} options
   */
  constructor(options) {
    if (!options || !options.store) throw new Error("SwarmConfigService requires an ISwarmConfigStore `store` option");
    this.#store = options.store;
    this.#env = options.env ?? {};
  }

  async #readPersisted() {
    try {
      const document = await this.#store.read();
      if (document === undefined) return { ...defaultAgentSwarmConfig };
      return sanitizeAgentSwarmConfig(document);
    } catch {
      return failClosedAgentSwarmConfig();
    }
  }

  /** @returns {Promise<import("../domain/swarmConfig.mjs").AgentSwarmConfig>} */
  async read() {
    return { ...(await this.#readPersisted()), ...getAgentSwarmEnvironmentOverrides(this.#env) };
  }

  /**
   * Persists `config`, preserving the on-disk value for any key an environment variable owns.
   * @param {import("../domain/swarmConfig.mjs").AgentSwarmConfig} config
   * @returns {Promise<void>}
   */
  async write(config) {
    const persisted = await this.#readPersisted();
    const overridden = Object.keys(getAgentSwarmEnvironmentOverrides(this.#env));
    const next = { ...config };
    for (const key of overridden) next[key] = persisted[key];
    await this.#store.write(next);
  }
}
