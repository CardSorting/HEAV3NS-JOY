/** [LAYER: CORE] */
/**
 * Durable, step-wise swarm formations (`SwarmFormationLedger`) for agents that cannot be
 * integrated with a dispatcher: the *calling agent* (or any of its own subagents) performs each
 * specialist's work and reports back. The ledger supplies everything else — roster planning,
 * dependency ordering, claim/exclusion, ready-to-use specialist prompts (with prior reports and
 * workspace heuristics), failure cascade, retry, and a final handoff — persisted in a `BufferedDb`
 * so every call may be a separate process.
 *
 * Protocol: `create` → loop { `next` (claims ready specialists) → do the work → `report` } → `finish`.
 */

import { AsyncMutex } from "../plumbing/AsyncMutex.mjs";
import { newUuid } from "../plumbing/ids.mjs";
import { classifyTaskForLegion } from "../domain/swarmClassifier.mjs";
import { buildSpecialistPrompt, validateAndOrderFormation } from "../domain/swarmFormation.mjs";
import { extractLegionHeuristics, formatLegionKnowledgeContext } from "../domain/swarmKnowledge.mjs";
import { formatLegionHandoffText } from "../domain/swarmHandoff.mjs";

export const SWARM_FORMATION_TABLE = "swarm_formations";
const TERMINAL = new Set(["completed", "failed", "skipped"]);
const MAX_SUMMARY = 12_000;
const FORMATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;

export class SwarmFormationLedger {
  #db;
  #knowledge;
  #now;
  #mutex = new AsyncMutex();

  /**
   * @param {{
   *   db: import("./BufferedDb.mjs").BufferedDb,
   *   knowledge?: { recall: (cwd: string) => Promise<Array<{content:string,createdAt:number,expiresAt:number}>>, store: (cwd: string, streamId: string, notes: readonly string[]) => Promise<number> },
   *   now?: () => number
   * }} options
   */
  constructor(options) {
    if (!options || !options.db) throw new Error("SwarmFormationLedger requires a BufferedDb `db` option");
    this.#db = options.db;
    this.#knowledge = options.knowledge;
    this.#now = options.now ?? Date.now;
  }

  async #load(id) {
    const row = await this.#db.selectOne(SWARM_FORMATION_TABLE, { column: "id", value: String(id) });
    if (!row) throw new Error(`FORMATION_NOT_FOUND: no formation '${id}'`);
    return { ...row, assignments: JSON.parse(row.assignments) };
  }

  async #save(formation) {
    await this.#db.push({
      type: "upsert",
      table: SWARM_FORMATION_TABLE,
      values: { ...formation, assignments: JSON.stringify(formation.assignments), updatedAt: this.#now() },
      conflictTarget: "id",
      layer: "domain"
    });
  }

  /** Serialized: concurrent callers in one process can never interleave a read-modify-write. */
  create(input) { return this.#mutex.runExclusive(() => this.#create(input)); }

  /** Serialized claim of ready specialists (see `#next`). */
  next(id, options) { return this.#mutex.runExclusive(() => this.#next(id, options)); }

  /** Serialized outcome recording (see `#report`). */
  report(id, assignmentId, input) { return this.#mutex.runExclusive(() => this.#report(id, assignmentId, input)); }

  /** Serialized reset of a failed, skipped, or abandoned specialist. */
  retry(id, assignmentId) { return this.#mutex.runExclusive(() => this.#retry(id, assignmentId)); }

  /**
   * Deletes finished formations (completed or partial_failure) last updated before `olderThanMs` ago.
   * @param {{ olderThanMs?: number, includeOpen?: boolean }} [options]
   * @returns {Promise<{ removed: string[] }>}
   */
  prune(options = {}) {
    return this.#mutex.runExclusive(async () => {
      const cutoff = this.#now() - (options.olderThanMs ?? 7 * 24 * 60 * 60 * 1000);
      const removed = [];
      for (const row of await this.#db.selectAllFrom(SWARM_FORMATION_TABLE)) {
        const formation = { ...row, assignments: JSON.parse(row.assignments) };
        const finished = !formation.assignments.some((a) => !TERMINAL.has(a.status));
        if ((finished || options.includeOpen) && row.updatedAt < cutoff) {
          await this.#db.push({ type: "delete", table: SWARM_FORMATION_TABLE, where: { column: "id", value: row.id }, layer: "domain" });
          removed.push(row.id);
        }
      }
      return { removed };
    });
  }

  static #assignment(a) {
    return { id: a.id, role: a.role, objective: a.objective, dependsOn: [...(a.dependsOn ?? [])], status: "pending", attempts: 0 };
  }

  #statusOf(formation) {
    const all = formation.assignments;
    if (all.some((a) => !TERMINAL.has(a.status))) return all.some((a) => a.status === "running") ? "running" : "pending";
    return all.every((a) => a.status === "completed") ? "completed" : "partial_failure";
  }

  #view(formation) {
    return {
      id: formation.id,
      objective: formation.objective,
      cwd: formation.cwd ?? null,
      status: this.#statusOf(formation),
      assignments: formation.assignments.map(({ id, role, objective, dependsOn, status, attempts, reason }) => ({ id, role, objective, dependsOn, status, attempts, ...(reason ? { reason } : {}) })),
      createdAt: formation.createdAt,
      updatedAt: formation.updatedAt
    };
  }

  /**
   * Plans and persists a formation. Supply explicit `assignments`, or a `task` to classify.
   * @param {{ objective?: string, task?: string, assignments?: Array<{id:string,role:string,objective:string,dependsOn?:string[]}>, cwd?: string, strategy?: string, maxSpecialists?: number, targetFiles?: string[], id?: string }} input
   */
  async #create(input) {
    const objective = String(input.objective ?? input.task ?? "").trim();
    if (!objective) throw new Error("INVALID_FORMATION: an objective or task is required");
    if (input.id !== undefined && !FORMATION_ID.test(String(input.id))) throw new Error("INVALID_FORMATION: id must be 1-128 characters of letters, digits, _ . : - and start with a letter or digit");
    const max = Math.max(1, Math.min(8, Math.trunc(input.maxSpecialists ?? 4)));
    const planned = input.assignments ?? classifyTaskForLegion({
      taskDescription: objective,
      maxSpecialists: max,
      ...(input.strategy ? { strategy: input.strategy } : {}),
      ...(input.targetFiles ? { targetFiles: input.targetFiles } : {})
    }).assignments;
    const ordered = validateAndOrderFormation(planned, input.assignments ? 8 : max);
    const id = input.id ?? `formation-${newUuid()}`;
    if (await this.#db.selectOne(SWARM_FORMATION_TABLE, { column: "id", value: id })) throw new Error(`FORMATION_EXISTS: '${id}' already exists`);
    const now = this.#now();
    const formation = { id, objective, cwd: input.cwd ?? null, assignments: ordered.map(SwarmFormationLedger.#assignment), createdAt: now, updatedAt: now };
    await this.#save(formation);
    return this.#view(formation);
  }

  /**
   * Returns specialists whose dependencies are complete, each with a ready-to-use `prompt`.
   * With `claim` (default) they move to `running` so concurrent callers never double-take work.
   */
  async #next(id, options = {}) {
    const formation = await this.#load(id);
    const byId = new Map(formation.assignments.map((a) => [a.id, a]));
    for (const a of formation.assignments) {
      if (a.status === "pending" && a.dependsOn.some((d) => ["failed", "skipped"].includes(byId.get(d).status))) {
        a.status = "skipped";
        a.reason = "Skipped because an upstream specialist did not complete";
      }
    }
    const ready = formation.assignments.filter((a) => a.status === "pending" && a.dependsOn.every((d) => byId.get(d).status === "completed"));
    const blackboard = formation.cwd && this.#knowledge ? await this.#knowledge.recall(formation.cwd).catch(() => []) : [];
    const knowledgeContext = formatLegionKnowledgeContext(blackboard);
    const claimed = ready.map((a) => ({
      id: a.id,
      role: a.role,
      objective: a.objective,
      dependsOn: a.dependsOn,
      prompt: buildSpecialistPrompt({
        objective: formation.objective,
        role: a.role,
        assignmentObjective: a.objective,
        priorReports: a.dependsOn.map((d) => byId.get(d)).map((d) => ({ id: d.id, role: d.role, summary: d.summary ?? "" })),
        knowledgeContext,
        priorFailure: a.reason && a.attempts > 0 ? a.reason : undefined
      })
    }));
    const stale = formation.assignments
      .filter((a) => a.status === "running" && this.#now() - (a.claimedAt ?? 0) > (options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS))
      .map((a) => ({ id: a.id, claimedAt: a.claimedAt ?? null, hint: `no report after ${Math.round((this.#now() - (a.claimedAt ?? 0)) / 60000)} min; if its worker is gone run retry for '${a.id}'` }));
    if (options.claim !== false) for (const a of ready) { a.status = "running"; a.attempts += 1; a.claimedAt = this.#now(); }
    // `claim: false` (peek) is strictly read-only: neither claims nor the skip cascade are persisted.
    if (options.claim !== false) await this.#save(formation);
    const view = this.#view(formation);
    return { formationId: id, status: view.status, ready: claimed, stale, waitingOn: formation.assignments.filter((a) => a.status === "running").map((a) => a.id), done: view.status === "completed" || view.status === "partial_failure" };
  }

  /** Records a specialist's outcome. Completed reports may carry `Heuristic:` lines that are persisted for future runs. */
  async #report(id, assignmentId, input) {
    if (!["completed", "failed"].includes(input?.status)) throw new Error("INVALID_REPORT: status must be 'completed' or 'failed'");
    const formation = await this.#load(id);
    const a = formation.assignments.find((x) => x.id === assignmentId);
    if (!a) throw new Error(`INVALID_REPORT: unknown specialist '${assignmentId}'`);
    if (a.status !== "running") throw new Error(`INVALID_REPORT: specialist '${assignmentId}' is '${a.status}', not running; call next() to claim it first`);
    const summary = String(input.summary ?? "").slice(0, MAX_SUMMARY);
    if (input.status === "completed" && !summary.trim()) throw new Error("INVALID_REPORT: a completed report needs a non-empty summary");
    a.status = input.status;
    a.summary = summary;
    if (input.status === "failed") a.reason = summary || "reported failed";
    else delete a.reason;
    let learned = 0;
    if (input.status === "completed" && formation.cwd && this.#knowledge) {
      const notes = extractLegionHeuristics(summary);
      if (notes.length) learned = await this.#knowledge.store(formation.cwd, formation.id, notes).catch(() => 0);
    }
    await this.#save(formation);
    return { formationId: id, assignmentId, status: a.status, learned, formationStatus: this.#statusOf(formation) };
  }

  /** Returns a failed/skipped (or stuck running) specialist and its skipped dependents to `pending`. */
  async #retry(id, assignmentId) {
    const formation = await this.#load(id);
    const a = formation.assignments.find((x) => x.id === assignmentId);
    if (!a) throw new Error(`INVALID_RETRY: unknown specialist '${assignmentId}'`);
    if (!["failed", "running", "skipped"].includes(a.status)) throw new Error(`INVALID_RETRY: specialist '${assignmentId}' is '${a.status}'`);
    const reset = new Set([assignmentId]);
    for (let changed = true; changed;) {
      changed = false;
      for (const x of formation.assignments) {
        if (x.status === "skipped" && !reset.has(x.id) && x.dependsOn.some((d) => reset.has(d))) { reset.add(x.id); changed = true; }
      }
    }
    for (const x of formation.assignments) if (reset.has(x.id)) { x.status = "pending"; if (x.id !== assignmentId) delete x.reason; }
    await this.#save(formation);
    return { formationId: id, reset: [...reset], formationStatus: this.#statusOf(formation) };
  }

  /** Current state of one formation. */
  async status(id) {
    return this.#view(await this.#load(id));
  }

  /** All formations, newest first. */
  async list() {
    const rows = await this.#db.selectAllFrom(SWARM_FORMATION_TABLE);
    return rows.map((r) => this.#view({ ...r, assignments: JSON.parse(r.assignments) })).sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Requires every specialist to be terminal and returns the escaped handoff and per-specialist reports. */
  async finish(id) {
    const formation = await this.#load(id);
    const open = formation.assignments.filter((a) => !TERMINAL.has(a.status)).map((a) => a.id);
    if (open.length) throw new Error(`FORMATION_INCOMPLETE: specialists still open: ${open.join(", ")}`);
    const status = this.#statusOf(formation);
    const reports = formation.assignments.map((a) => ({ id: a.id, role: a.role, status: a.status, summary: a.summary ?? null, ...(a.reason ? { reason: a.reason } : {}) }));
    const handoff = formatLegionHandoffText(
      [`Objective: ${formation.objective}`, `Status: ${status}`, ...reports.map((r) => `## ${r.role} (${r.id}) — ${r.status}\n${r.summary ?? r.reason ?? ""}`)].join("\n\n"),
      24_000
    );
    return { formationId: id, status, reports, handoff };
  }
}
