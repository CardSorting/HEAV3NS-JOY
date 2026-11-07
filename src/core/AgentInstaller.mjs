/** [LAYER: CORE] */
/**
 * Agent-native installer (`AgentInstaller`): detects which coding agents a project uses and
 * installs, updates, audits, and removes the matching instruction files, skills, commands, MCP
 * entries, and hooks — idempotently and without ever clobbering user content.
 *
 * Safety model
 *  - Shared files (AGENTS.md, CLAUDE.md, `.mcp.json` …) receive only a *managed block* or a single
 *    JSON entry; everything else in them is preserved.
 *  - Files joy owns outright are updated only if they still match what joy last wrote (tracked by
 *    SHA-256 in `.joy/install.json`); a user-edited file is reported as a conflict and left alone
 *    unless `force` is given, in which case the old copy is backed up first.
 *  - `plan()` is pure with respect to the filesystem (no writes), so `--dry-run` is exact.
 *  - Removal deletes only what the manifest proves joy created or last wrote.
 *
 * Persistence is delegated to an `IProjectFiles` port (Hard Invariant: no raw I/O in CORE).
 */

import { sha256Hex, stableStringify } from "../plumbing/canonicalHash.mjs";
import { upsertBlock, removeBlock, findBlock, upsertJsonPath, setJsonPath, removeJsonPath, readJsonPath, upsertJsonArrayItem, removeJsonArrayItem } from "../domain/managedBlock.mjs";
import { AGENT_TARGETS, PACKAGE_NAME, isTargetId, isJoyHookEntry, planArtifacts, resolveLauncher } from "../domain/agentTargets.mjs";

export const MANIFEST_PATH = ".joy/install.json";
const MANIFEST_SCHEMA = 1;
const BACKUP_DIR = ".joy/backup";

const entryKey = (artifact) => `${artifact.path}#${artifact.kind === "block" ? `block:${artifact.blockId}` : artifact.kind === "file" ? "file" : `${artifact.kind}:${artifact.jsonPath.join(".")}`}`;
const valueSha = (value) => sha256Hex(stableStringify(value));

export class AgentInstaller {
  #files;
  #version;

  /** @param {{ files: import("../domain/interfaces/IProjectFiles.mjs").IProjectFiles, version: string }} options */
  constructor(options) {
    if (!options?.files) throw new Error("AgentInstaller requires an IProjectFiles `files` option");
    this.#files = options.files;
    this.#version = options.version;
  }

  /** Reads the install manifest, or `null`. Throws a coded error when it is corrupt. */
  async manifest() {
    const text = await this.#files.read(MANIFEST_PATH);
    if (text === null) return null;
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || parsed.schema !== MANIFEST_SCHEMA || typeof parsed.entries !== "object") throw new Error("unsupported schema");
      return parsed;
    } catch (error) {
      const failure = new Error(`MANIFEST_CORRUPT: ${MANIFEST_PATH} is unreadable (${error.message}); fix or delete it, then re-run init`);
      failure.code = "MANIFEST_CORRUPT";
      throw failure;
    }
  }

  /** Which agents does this project appear to use? */
  async detect() {
    const out = [];
    for (const target of AGENT_TARGETS) {
      const evidence = [];
      for (const hint of target.detect) if (await this.#files.exists(hint)) evidence.push(hint);
      out.push({ id: target.id, label: target.label, detected: evidence.length > 0, evidence, note: target.note });
    }
    return out;
  }

  /** Environment facts that decide how the project should invoke joy. */
  async facts() {
    let name = null;
    const pkgText = await this.#files.read("package.json");
    if (pkgText) {
      try { name = JSON.parse(pkgText).name ?? null; } catch { /* ignore malformed package.json */ }
    }
    return {
      projectName: name,
      isSelf: name === PACKAGE_NAME && (await this.#files.exists("bin/joy.mjs")),
      hasLocalBin: await this.#files.exists("node_modules/.bin/joy"),
      version: this.#version
    };
  }

  /**
   * Computes (without writing) what installing would do.
   * @param {{ targets: string[], mcp?: boolean, hooks?: boolean, force?: boolean, runner?: string }} options
   */
  async plan(options) {
    for (const id of options.targets) if (!isTargetId(id)) throw new Error(`UNKNOWN_AGENT: '${id}' (known: ${AGENT_TARGETS.map((t) => t.id).join(", ")})`);
    const facts = await this.facts();
    const launcher = resolveLauncher({ ...facts, ...(options.runner ? { runner: options.runner } : {}) });
    const ctx = { run: launcher.run, version: this.#version, ...(facts.projectName ? { project: facts.projectName } : {}) };
    const mcp = options.mcp !== false;
    const hooks = Boolean(options.hooks);
    const artifacts = planArtifacts({ targets: options.targets, mcp, hooks, ctx, launcher });
    const manifest = await this.manifest();
    const cache = new Map();
    const read = async (p) => {
      if (!cache.has(p)) cache.set(p, await this.#files.read(p));
      return cache.get(p);
    };
    const operations = [];
    for (const artifact of artifacts) {
      const current = await read(artifact.path);
      const op = await this.#planOne(artifact, current, manifest, Boolean(options.force));
      // Later artifacts targeting the same file must build on this one's result.
      if (op.nextText !== undefined && op.action !== "conflict") cache.set(artifact.path, op.nextText);
      operations.push(op);
    }
    return { targets: [...options.targets], mcp, hooks, launcher, runner: options.runner, facts, operations, manifestBefore: manifest, manual: this.#manualSteps(options.targets, mcp) };
  }

  #manualSteps(targets, mcp) {
    if (!mcp) return [];
    return AGENT_TARGETS.filter((t) => targets.includes(t.id) && t.manual?.length).flatMap((t) => t.manual.map((m) => `${t.label}: ${m}`));
  }

  async #planOne(artifact, current, manifest, force) {
    const key = entryKey(artifact);
    const prior = manifest?.entries?.[key];
    const base = { key, path: artifact.path, kind: artifact.kind, target: artifact.target, artifact, createdFile: current === null };
    if (artifact.kind === "block") {
      const merged = upsertBlock(current ?? "", artifact.blockId, artifact.content);
      if (merged.conflict) return { ...base, action: "conflict", reason: merged.conflict };
      return { ...base, action: current === null ? "create" : merged.changed ? "update" : "unchanged", nextText: merged.text };
    }
    if (artifact.kind === "file") {
      if (current === null) return { ...base, action: "create", nextText: artifact.content };
      if (current === artifact.content) return { ...base, action: "unchanged", nextText: current };
      if (prior && prior.sha === sha256Hex(current)) return { ...base, action: "update", nextText: artifact.content };
      if (force) return { ...base, action: "overwrite", nextText: artifact.content, backup: current };
      return { ...base, action: "conflict", reason: prior ? "modified since joy wrote it (use --force to replace; a backup is kept)" : "already exists and was not created by joy (use --force to replace; a backup is kept)" };
    }
    if (artifact.kind === "json") {
      const merged = upsertJsonPath(current ?? "", artifact.jsonPath, artifact.value);
      if (merged.conflict) return { ...base, action: "conflict", reason: merged.conflict };
      if (merged.existing !== undefined) {
        const wroteIt = prior && prior.entrySha === valueSha(merged.existing);
        if (wroteIt || force) {
          const forced = setJsonPath(current ?? "", artifact.jsonPath, artifact.value);
          return { ...base, action: force && !wroteIt ? "overwrite" : "update", nextText: forced.text };
        }
        return { ...base, action: "conflict", reason: `'${artifact.jsonPath.join(".")}' already exists with different settings (use --force to replace)` };
      }
      return { ...base, action: current === null ? "create" : merged.changed ? "update" : "unchanged", nextText: merged.text };
    }
    const merged = upsertJsonArrayItem(current ?? "", artifact.jsonPath, artifact.value, isJoyHookEntry);
    if (merged.conflict) return { ...base, action: "conflict", reason: merged.conflict };
    return { ...base, action: current === null ? "create" : merged.changed ? "update" : "unchanged", nextText: merged.text };
  }

  /**
   * Writes a plan. Conflicting operations are skipped and reported; everything else is applied,
   * then the manifest is rewritten. Safe to re-run after a partial failure.
   * @param {Awaited<ReturnType<AgentInstaller["plan"]>>} plan
   */
  async apply(plan) {
    const entries = { ...(plan.manifestBefore?.entries ?? {}) };
    const applied = [];
    const backups = [];
    for (const op of plan.operations) {
      if (op.action === "conflict") {
        applied.push(op);
        continue;
      }
      if (op.action !== "unchanged") {
        if (op.action === "overwrite" && op.kind !== "json" && op.backup !== undefined) backups.push(await this.#backup(op.path, op.backup));
        await this.#files.write(op.path, op.nextText);
      }
      const prior = plan.manifestBefore?.entries?.[op.key];
      entries[op.key] = this.#entryFor(op, prior);
      applied.push(op);
    }
    const manifest = {
      schema: MANIFEST_SCHEMA,
      version: this.#version,
      targets: [...new Set([...(plan.manifestBefore?.targets ?? []), ...plan.targets])].sort(),
      features: { mcp: plan.mcp || Boolean(plan.manifestBefore?.features?.mcp), hooks: plan.hooks || Boolean(plan.manifestBefore?.features?.hooks) },
      launcher: { ...plan.launcher, ...(plan.runner ? { runner: plan.runner } : {}) },
      entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))
    };
    await this.#files.write(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    await this.#files.write(".joy/.gitignore", "backup/\n");
    return { manifest, operations: applied, backups };
  }

  #entryFor(op, prior) {
    const a = op.artifact;
    const createdFile = prior ? Boolean(prior.createdFile) : op.createdFile;
    if (a.kind === "file") return { kind: "file", target: a.target, sha: sha256Hex(op.nextText), createdFile };
    if (a.kind === "block") return { kind: "block", target: a.target, blockId: a.blockId, createdFile };
    if (a.kind === "json") return { kind: "json", target: a.target, jsonPath: a.jsonPath, entrySha: valueSha(a.value), createdFile };
    return { kind: "jsonArray", target: a.target, jsonPath: a.jsonPath, entrySha: valueSha(a.value), createdFile };
  }

  async #backup(rel, text) {
    let n = 0;
    let target = `${BACKUP_DIR}/${rel}.bak`;
    while (await this.#files.exists(target)) target = `${BACKUP_DIR}/${rel}.${++n}.bak`;
    await this.#files.write(target, text);
    return target;
  }

  /**
   * Audits the installation: drift (user edits), missing pieces, and outdated content.
   * @returns {Promise<{ installed: boolean, version?: string, outdated: boolean, entries: Array<{ key: string, path: string, status: "ok"|"missing"|"modified"|"outdated", detail?: string }> }>}
   */
  async status() {
    const manifest = await this.manifest();
    if (!manifest) return { installed: false, outdated: false, entries: [] };
    const entries = [];
    for (const [key, entry] of Object.entries(manifest.entries)) {
      const p = key.split("#")[0];
      const text = await this.#files.read(p);
      if (text === null) { entries.push({ key, path: p, status: "missing", detail: "file is gone; run `joy init` to restore" }); continue; }
      if (entry.kind === "file") {
        entries.push(sha256Hex(text) === entry.sha ? { key, path: p, status: "ok" } : { key, path: p, status: "modified", detail: "edited since joy wrote it" });
      } else if (entry.kind === "block") {
        const found = findBlock(text, entry.blockId);
        entries.push(found && !("conflict" in found) ? { key, path: p, status: "ok" } : { key, path: p, status: "missing", detail: `managed block '${entry.blockId}' not found` });
      } else if (entry.kind === "json") {
        const value = readJsonPath(text, entry.jsonPath);
        entries.push(value === undefined ? { key, path: p, status: "missing", detail: `'${entry.jsonPath.join(".")}' not found` } : valueSha(value) === entry.entrySha ? { key, path: p, status: "ok" } : { key, path: p, status: "modified", detail: "entry changed since joy wrote it" });
      } else {
        const array = readJsonPath(text, entry.jsonPath);
        entries.push(Array.isArray(array) && array.some(isJoyHookEntry) ? { key, path: p, status: "ok" } : { key, path: p, status: "missing", detail: "hook entry not found" });
      }
    }
    let outdated = manifest.version !== this.#version;
    if (!outdated) {
      const plan = await this.plan({ targets: manifest.targets, mcp: manifest.features.mcp, hooks: manifest.features.hooks, runner: manifest.launcher?.runner });
      outdated = plan.operations.some((op) => op.action === "update");
    }
    if (outdated) for (const e of entries) if (e.status === "ok") e.status = "outdated";
    return { installed: true, version: manifest.version, outdated, targets: manifest.targets, features: manifest.features, launcher: manifest.launcher, entries };
  }

  /**
   * Removes what joy installed. Modified files and changed entries are kept (and reported) unless `force`.
   * @param {{ force?: boolean }} [options]
   */
  async remove(options = {}) {
    const manifest = await this.manifest();
    if (!manifest) return { removed: [], kept: [], installed: false };
    const removed = [];
    const kept = [];
    for (const [key, entry] of Object.entries(manifest.entries)) {
      const p = key.split("#")[0];
      const text = await this.#files.read(p);
      if (text === null) { removed.push({ path: p, detail: "already gone" }); continue; }
      if (entry.kind === "file") {
        if (sha256Hex(text) === entry.sha || options.force) { await this.#files.remove(p); removed.push({ path: p }); }
        else kept.push({ path: p, detail: "modified since install; left in place (use --force to delete)" });
      } else if (entry.kind === "block") {
        const r = removeBlock(text, entry.blockId);
        if (r.conflict) { kept.push({ path: p, detail: r.conflict }); continue; }
        if (r.empty && entry.createdFile) await this.#files.remove(p);
        else if (r.changed) await this.#files.write(p, r.text);
        removed.push({ path: p, detail: `block '${entry.blockId}'` });
      } else if (entry.kind === "json") {
        const value = readJsonPath(text, entry.jsonPath);
        if (value === undefined) { removed.push({ path: p, detail: "already gone" }); continue; }
        if (valueSha(value) !== entry.entrySha && !options.force) { kept.push({ path: p, detail: `'${entry.jsonPath.join(".")}' was changed after install; left in place` }); continue; }
        const r = removeJsonPath(text, entry.jsonPath);
        if (r.empty && entry.createdFile) await this.#files.remove(p);
        else await this.#files.write(p, r.text);
        removed.push({ path: p, detail: `'${entry.jsonPath.join(".")}'` });
      } else {
        const r = removeJsonArrayItem(text, entry.jsonPath, isJoyHookEntry);
        if (r.conflict) { kept.push({ path: p, detail: r.conflict }); continue; }
        if (r.empty && entry.createdFile) await this.#files.remove(p);
        else if (r.changed) await this.#files.write(p, r.text);
        removed.push({ path: p, detail: "hook entry" });
      }
    }
    await this.#files.remove(".joy/.gitignore");
    await this.#files.remove(MANIFEST_PATH);
    return { installed: true, removed, kept };
  }
}

