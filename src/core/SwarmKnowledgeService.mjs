/** [LAYER: CORE] */
/**
 * Durable Legion workspace-heuristic memory (`SwarmKnowledgeService`) layered on a
 * `BufferedDb`. Observations are validated by `domain/swarmKnowledge.mjs`, scoped by
 * workspace hash, expire after 30 days, and are always replayed as untrusted data.
 *
 * Implements the `LegionWorkspaceKnowledgeStore` shape consumed by `AgentSwarmDispatcher`
 * (`recall(cwd)` / `store(cwd, streamId, observations)`).
 */

import { sha256Hex } from "../plumbing/canonicalHash.mjs";
import {
  LEGION_KNOWLEDGE_TABLE,
  LEGION_KNOWLEDGE_TTL_MS,
  LEGION_WORKSPACE_HEURISTIC_TYPE,
  MAX_LEGION_KNOWLEDGE_ITEMS,
  diagnoseLegionObservation,
  isReusableLegionObservation,
  legionWorkspaceScope
} from "../domain/swarmKnowledge.mjs";

export class SwarmKnowledgeService {
  #db;
  #resolvePath;

  /**
   * @param {{
   *   db: import("./BufferedDb.mjs").BufferedDb,
   *   resolveWorkspacePath?: (cwd: string) => string
   * }} options `resolveWorkspacePath` should canonicalize paths (e.g. `path.resolve`);
   *   the default only normalizes slashes so CORE stays I/O free.
   */
  constructor(options) {
    if (!options || !options.db) throw new Error("SwarmKnowledgeService requires a BufferedDb `db` option");
    this.#db = options.db;
    this.#resolvePath = options.resolveWorkspacePath ?? ((cwd) => cwd);
  }

  #scope(cwd) {
    return legionWorkspaceScope(this.#resolvePath(cwd));
  }

  /**
   * Persists new observations for a workspace, skipping unsafe or still-live duplicates.
   * @param {string} cwd
   * @param {string} streamId
   * @param {readonly string[]} observations
   * @param {number} [now]
   * @returns {Promise<number>} number of observations written
   */
  async store(cwd, streamId, observations, now = Date.now()) {
    const scope = this.#scope(cwd);
    let stored = 0;
    for (const raw of observations.slice(0, MAX_LEGION_KNOWLEDGE_ITEMS)) {
      const content = String(raw).trim();
      if (!isReusableLegionObservation(content)) continue;
      const id = sha256Hex(`${scope}\n${content.toLowerCase()}`);
      const prior = await this.#db.selectOne(LEGION_KNOWLEDGE_TABLE, [{ column: "id", value: id }]);
      if (prior && Number(prior.expiresAt) > now) continue;
      await this.#db.push({
        type: "upsert",
        table: LEGION_KNOWLEDGE_TABLE,
        values: {
          id,
          userId: "local",
          streamId,
          type: LEGION_WORKSPACE_HEURISTIC_TYPE,
          content,
          tags: JSON.stringify(["legion", "workspace-heuristic", scope]),
          embedding: null,
          confidence: 0.5,
          hubScore: 0,
          expiresAt: now + LEGION_KNOWLEDGE_TTL_MS,
          metadata: JSON.stringify({ workspaceScope: scope, unverified: true, source: "specialist_heuristic" }),
          createdAt: now
        },
        conflictTarget: "id",
        layer: "domain"
      });
      stored++;
    }
    return stored;
  }

  /**
   * Recalls live, scope-verified observations for a workspace, newest first.
   * @param {string} cwd
   * @param {number} [now]
   * @returns {Promise<import("../domain/swarmKnowledge.mjs").LegionWorkspaceObservation[]>}
   */
  async recall(cwd, now = Date.now()) {
    const scope = this.#scope(cwd);
    const rows = await this.#db.selectWhere(
      LEGION_KNOWLEDGE_TABLE,
      [
        { column: "type", value: LEGION_WORKSPACE_HEURISTIC_TYPE },
        { column: "expiresAt", value: now, operator: ">" },
        { column: "tags", value: JSON.stringify(["legion", "workspace-heuristic", scope]) }
      ],
      undefined,
      { orderBy: { column: "createdAt", direction: "desc" }, limit: MAX_LEGION_KNOWLEDGE_ITEMS }
    );
    const observations = [];
    for (const row of rows) {
      if (observations.length >= MAX_LEGION_KNOWLEDGE_ITEMS) break;
      if (!isReusableLegionObservation(row.content)) continue;
      let metadata;
      try {
        metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
      } catch {
        continue;
      }
      if (!metadata || typeof metadata !== "object" || metadata.workspaceScope !== scope) continue;
      if (metadata.unverified !== true) continue;
      observations.push({ content: row.content, createdAt: Number(row.createdAt), expiresAt: Number(row.expiresAt) });
    }
    return observations;
  }

  /**
   * Diagnoses whether a raw note is admissible as a reusable heuristic.
   * @param {unknown} raw
   * @returns {{ ok: boolean, reason?: string }}
   */
  diagnose(raw) {
    return diagnoseLegionObservation(typeof raw === "string" ? raw.trim() : raw);
  }

  /**
   * Searches live, scope-verified observations for a workspace by case-insensitive substring.
   * @param {string} cwd
   * @param {string} [query]
   * @param {number} [now]
   * @returns {Promise<import("../domain/swarmKnowledge.mjs").LegionWorkspaceObservation[]>}
   */
  async search(cwd, query = "", now = Date.now()) {
    const all = await this.recall(cwd, now);
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) return all;
    return all.filter((obs) => obs.content.toLowerCase().includes(needle));
  }

  /**
   * Prunes expired, query-matched, or all observations for a workspace.
   * @param {string} cwd
   * @param {{ query?: string, all?: boolean }} [options]
   * @param {number} [now]
   * @returns {Promise<{ removed: number }>}
   */
  async prune(cwd, options = {}, now = Date.now()) {
    const scope = this.#scope(cwd);
    const rows = await this.#db.selectWhere(LEGION_KNOWLEDGE_TABLE, [
      { column: "type", value: LEGION_WORKSPACE_HEURISTIC_TYPE },
      { column: "tags", value: JSON.stringify(["legion", "workspace-heuristic", scope]) }
    ]);
    const needle = options.query ? String(options.query).trim().toLowerCase() : "";
    let removed = 0;
    for (const row of rows) {
      const expired = Number(row.expiresAt) <= now;
      const matchesQuery = needle ? String(row.content ?? "").toLowerCase().includes(needle) : false;
      const shouldRemove = Boolean(options.all) || (needle ? matchesQuery : expired);
      if (!shouldRemove) continue;
      await this.#db.push({
        type: "delete",
        table: LEGION_KNOWLEDGE_TABLE,
        where: [{ column: "id", value: row.id }],
        layer: "domain"
      });
      removed++;
    }
    return { removed };
  }
}
