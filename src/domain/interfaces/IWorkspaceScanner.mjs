/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`IWorkspaceScanner`) for reading project files and configuration.
 * Zero I/O inside Domain. Concrete implementation resides in `src/infrastructure/NodeWorkspaceScanner.mjs`.
 */

/**
 * @typedef {Object} WorkspaceFileRecord
 * @property {string} relativePath - POSIX normalized path relative to project root
 * @property {string} absolutePath - Full path on disk
 * @property {string} extension - Lowercase extension (e.g., ".mjs", ".ts", ".py")
 * @property {string} content - UTF-8 text content of the file
 */

/**
 * Formal contract for workspace file discovery, configuration loading, and tag healing writes.
 * Concrete implementations must provide:
 * - `loadConfig(rootDir): Object`
 * - `scanFiles(rootDir, config): WorkspaceFileRecord[]`
 * - `writeFile(absolutePath, content): void`
 */
export class IWorkspaceScanner {
  /**
   * @param {string} _rootDir
   * @returns {Object}
   */
  loadConfig(_rootDir) {
    throw new Error("IWorkspaceScanner.loadConfig must be implemented by an Infrastructure adapter.");
  }

  /**
   * @param {string} _rootDir
   * @param {Object} _config
   * @returns {WorkspaceFileRecord[]}
   */
  scanFiles(_rootDir, _config) {
    throw new Error("IWorkspaceScanner.scanFiles must be implemented by an Infrastructure adapter.");
  }

  /**
   * @param {string} _absolutePath
   * @param {string} _content
   */
  writeFile(_absolutePath, _content) {
    throw new Error("IWorkspaceScanner.writeFile must be implemented by an Infrastructure adapter.");
  }
}

