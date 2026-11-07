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
}
