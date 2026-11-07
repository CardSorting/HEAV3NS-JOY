/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`IProjectFiles`): project-relative, root-confined file access
 * used by the agent installer. Paths are POSIX-style and relative to the project root; adapters
 * must reject anything that resolves outside it. Concrete adapter: `NodeProjectFiles`.
 */
export class IProjectFiles {
  /** @param {string} _rel @returns {Promise<boolean>} */
  async exists(_rel) {
    throw new Error("IProjectFiles.exists must be implemented by an Infrastructure adapter.");
  }

  /** @param {string} _rel @returns {Promise<string | null>} file text, or null when absent */
  async read(_rel) {
    throw new Error("IProjectFiles.read must be implemented by an Infrastructure adapter.");
  }

  /** Atomically writes `content`, creating parent directories. @param {string} _rel @param {string} _content @returns {Promise<void>} */
  async write(_rel, _content) {
    throw new Error("IProjectFiles.write must be implemented by an Infrastructure adapter.");
  }

  /** Deletes a file (no error if absent) and prunes parent directories left empty. @param {string} _rel @returns {Promise<boolean>} */
  async remove(_rel) {
    throw new Error("IProjectFiles.remove must be implemented by an Infrastructure adapter.");
  }
}
