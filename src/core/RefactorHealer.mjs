/** [LAYER: CORE] */
/**
 * Self-Healing Tag Alignment Engine (`ALIGN_TAGS` Tactical SOP).
 * Uses `IWorkspaceScanner` and `domain`/`plumbing` rules to stamp or align `[LAYER: <ZONE>]`
 * header tags across a repository while preserving `#!` shebangs and `---` YAML frontmatter.
 */

import {
  DEFAULT_STABILITY_CONFIG,
  inferZoneFromPath,
  suggestZoneFromContent
} from "../domain/joyRules.mjs";
import { extractHeaderTag, applyHeaderTag } from "../plumbing/commentStyles.mjs";
import {
  normalizeSlashes,
  resolveRelativeSpecifier,
  computeRelativeImportSpecifier
} from "../plumbing/pathUtils.mjs";
import { extractImports, healStatelessnessInSource } from "../plumbing/sourceScanner.mjs";

export class RefactorHealer {
  /**
   * @param {import("../domain/interfaces/IWorkspaceScanner.mjs").IWorkspaceScanner} scanner
   */
  constructor(scanner) {
    this.scanner = scanner;
  }

  /**
   * Aligns missing or geographically mismatched `[LAYER: <ZONE>]` tags across `rootDir`.
   * @param {string} rootDir
   * @param {{ dryRun?: boolean }} [options]
   * @returns {{ dryRun: boolean, healedCount: number, healedFiles: Array<{ file: string, previousZone: string|null, newZone: string }> }}
   */
  healTags(rootDir, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const config = this.scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
    const files = this.scanner.scanFiles(rootDir, config);

    const healedFiles = [];

    for (const file of files) {
      const { normalizedZone: declaredZone } = extractHeaderTag(file.content);
      const expectedZone = inferZoneFromPath(file.relativePath, config);
      const targetZone =
        expectedZone || declaredZone || suggestZoneFromContent(file.content, file.extension);

      if (!declaredZone || (expectedZone && declaredZone !== expectedZone)) {
        const updatedContent = applyHeaderTag(file.content, file.extension, targetZone);
        if (updatedContent !== file.content) {
          if (!dryRun) {
            this.scanner.writeFile(file.absolutePath, updatedContent);
          }
          healedFiles.push({
            file: file.relativePath,
            previousZone: declaredZone,
            newZone: targetZone
          });
        }
      }
    }

    return {
      dryRun,
      healedCount: healedFiles.length,
      healedFiles
    };
  }

  /**
   * Safely converts un-reassigned top-level `let`/`var` bindings in `[LAYER: PLUMBING]` files
   * to `const` (SOP 6: `HEAL_STATELESSNESS`).
   * @param {string} rootDir
   * @param {{ dryRun?: boolean }} [options]
   * @returns {{ dryRun: boolean, healedCount: number, healedFiles: Array<{ file: string, identifiers: string[] }> }}
   */
  healStatelessness(rootDir, options = {}) {
    const dryRun = Boolean(options.dryRun);
    const config = this.scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
    const files = this.scanner.scanFiles(rootDir, config);
    const healedFiles = [];

    for (const file of files) {
      const { normalizedZone: declaredZone } = extractHeaderTag(file.content);
      const expectedZone = inferZoneFromPath(file.relativePath, config);
      const effectiveZone = declaredZone || expectedZone;

      if (effectiveZone !== "plumbing") continue;

      const { updatedSource, healedIdentifiers } = healStatelessnessInSource(
        file.content,
        file.extension
      );
      if (healedIdentifiers.length > 0 && updatedSource !== file.content) {
        if (!dryRun) {
          this.scanner.writeFile(file.absolutePath, updatedSource);
        }
        healedFiles.push({
          file: file.relativePath,
          identifiers: healedIdentifiers
        });
      }
    }

    return {
      dryRun,
      healedCount: healedFiles.length,
      healedFiles
    };
  }

  /**
   * Computes a deterministic import-rewiring plan (`ImportFixer` / `MOVE` SOP) for relocating
   * a module from `fromRelPath` to `toRelPath` within `rootDir`.
   * Re-calculates both outgoing relative imports inside the moved file and incoming relative
   * imports from any dependent modules in the workspace.
   * @param {string} rootDir
   * @param {string} fromRelPath
   * @param {string} toRelPath
   * @returns {{
   *   fromPath: string,
   *   toPath: string,
   *   targetZone: string|null,
   *   rewiredImports: Array<{ file: string, line: number, oldSpecifier: string, newSpecifier: string }>
   * }}
   */
  planMove(rootDir, fromRelPath, toRelPath) {
    const config = this.scanner.loadConfig(rootDir, DEFAULT_STABILITY_CONFIG);
    const files = this.scanner.scanFiles(rootDir, config);
    const cleanFrom = normalizeSlashes(fromRelPath).replace(/^\.\//, "");
    const cleanTo = normalizeSlashes(toRelPath).replace(/^\.\//, "");
    const targetZone = inferZoneFromPath(cleanTo, config);
    const rewiredImports = [];

    const fromNoExt = cleanFrom.replace(/\.[a-z0-9]+$/i, "");

    for (const file of files) {
      const imports = extractImports(file.content, file.extension);
      for (const imp of imports) {
        if (!imp.specifier.startsWith(".")) continue;

        if (file.relativePath === cleanFrom) {
          // Outgoing relative import from the moved file itself
          const resolvedOldTarget = resolveRelativeSpecifier(cleanFrom, imp.specifier);
          const newSpec = computeRelativeImportSpecifier(cleanTo, resolvedOldTarget);
          if (newSpec !== imp.specifier) {
            rewiredImports.push({
              file: cleanTo,
              line: imp.line,
              oldSpecifier: imp.specifier,
              newSpecifier: newSpec
            });
          }
        } else {
          // Incoming relative import from another file that points to `fromRelPath`
          const resolvedTarget = resolveRelativeSpecifier(file.relativePath, imp.specifier);
          const resolvedNoExt = resolvedTarget.replace(/\.[a-z0-9]+$/i, "");
          if (resolvedTarget === cleanFrom || resolvedNoExt === fromNoExt) {
            const hadExtMatch = imp.specifier.match(/(\.[a-z0-9]+)$/i);
            const targetWithOriginalExt = hadExtMatch
              ? cleanTo.replace(/\.[a-z0-9]+$/i, hadExtMatch[1])
              : cleanTo.replace(/\.[a-z0-9]+$/i, "");
            const newSpec = computeRelativeImportSpecifier(
              file.relativePath,
              targetWithOriginalExt
            );
            if (newSpec !== imp.specifier) {
              rewiredImports.push({
                file: file.relativePath,
                line: imp.line,
                oldSpecifier: imp.specifier,
                newSpecifier: newSpec
              });
            }
          }
        }
      }
    }

    return {
      fromPath: cleanFrom,
      toPath: cleanTo,
      targetZone,
      rewiredImports
    };
  }
}

