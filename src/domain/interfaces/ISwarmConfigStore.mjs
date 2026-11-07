/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`ISwarmConfigStore`) for persisting the raw
 * Agent Swarm configuration document. Concrete adapters live in `src/infrastructure/`
 * (`FileSwarmConfigStore`, `MemorySwarmConfigStore`).
 */
export class ISwarmConfigStore {
  /**
   * Reads the persisted document. Resolves `undefined` when none exists and
   * rejects (or resolves a non-object) when the stored content is unreadable.
   * @returns {Promise<unknown | undefined>}
   */
  async read() {
    throw new Error("ISwarmConfigStore.read must be implemented by an Infrastructure adapter.");
  }

  /**
   * Atomically replaces the persisted document.
   * @param {Object} _document
   * @returns {Promise<void>}
   */
  async write(_document) {
    throw new Error("ISwarmConfigStore.write must be implemented by an Infrastructure adapter.");
  }
}
