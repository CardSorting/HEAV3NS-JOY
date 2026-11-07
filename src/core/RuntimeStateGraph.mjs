/** [LAYER: CORE] */
/**
 * BroccoliDB Typed RuntimeStateGraph, Schema Migration Engine, and Replay Projector.
 *
 * Maintains deterministic session nodes (`GRAPH_NODE_KINDS`) and causal edges (`GRAPH_EDGE_KINDS`),
 * secondary O(1) lookup indexes, canonical SHA-256 snapshot hashing, graph compaction,
 * schema version migration (`v0` -> `v1`), and 5 replay projection modes (`forensic`, `timeline`,
 * `causal`, `verification`, `ci`).
 *
 * Hard Invariant: 0% raw I/O, 0% `ui` imports.
 */

import { sha256Hex, stableStringify } from "../plumbing/canonicalHash.mjs";
import { GuidedError } from "../domain/interfaces/ICasStorage.mjs";
import {
  GRAPH_NODE_KINDS,
  GRAPH_EDGE_KINDS
} from "../domain/broccoliRules.mjs";

/**
 * Migrates a raw or legacy serialized runtime graph (`schemaVersion < 1`) to `schemaVersion: 1`.
 *
 * @param {Object} rawGraph
 * @returns {{ sessionId: string, schemaVersion: number, nodes: Array<Object>, edges: Array<Object>, graphHash: string }}
 */
export function migrateRuntimeGraph(rawGraph = {}) {
  const sessionId = rawGraph.sessionId || "migrated-session";
  const nodes = Array.isArray(rawGraph.nodes)
    ? rawGraph.nodes.map((n, idx) => ({
        id: n.id || `node-migrated-${idx + 1}`,
        sessionId: n.sessionId || sessionId,
        kind: n.kind || "RuntimeEvent",
        label: n.label || n.kind || "Node",
        timestamp: typeof n.timestamp === "number" ? n.timestamp : 0,
        data: n.data && typeof n.data === "object" ? structuredClone(n.data) : {}
      }))
    : [];

  const edges = Array.isArray(rawGraph.edges)
    ? rawGraph.edges.map((e, idx) => ({
        id: e.id || `edge-migrated-${idx + 1}`,
        sessionId: e.sessionId || sessionId,
        from: e.from,
        to: e.to,
        kind: e.kind || "triggered",
        timestamp: typeof e.timestamp === "number" ? e.timestamp : 0
      }))
    : [];

  const canonicalPayload = {
    sessionId,
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges].sort((a, b) => a.id.localeCompare(b.id))
  };
  const graphHash = rawGraph.graphHash || sha256Hex(stableStringify(canonicalPayload));

  return {
    sessionId,
    schemaVersion: 1,
    nodes,
    edges,
    graphHash
  };
}

/**
 * Projects a hydrated replay result into one of the 5 canonical BroccoliDB replay modes:
 * `timeline`, `causal`, `verification`, `ci`, or `forensic`.
 *
 * @param {{
 *   sessionId: string,
 *   mode: string,
 *   healthy: boolean,
 *   divergenceDetected: boolean,
 *   integrity: Object,
 *   graph: { schemaVersion: number, graphHash: string, nodes: Array<Object>, edges: Array<Object> }
 * }} replayResult
 * @returns {Object}
 */
export function projectReplayForMode(replayResult) {
  const mode = replayResult.mode || "forensic";
  const nodes = replayResult.graph?.nodes || [];
  const edges = replayResult.graph?.edges || [];

  switch (mode) {
    case "timeline": {
      const sortedNodes = [...nodes].sort((a, b) => a.timestamp - b.timestamp);
      const t0 = sortedNodes[0]?.timestamp || 0;
      return {
        mode: "timeline",
        entries: sortedNodes.map((n) => ({
          nodeId: n.id,
          kind: n.kind,
          label: n.label,
          timestamp: n.timestamp,
          offsetMs: Math.max(0, n.timestamp - t0)
        })),
        edges: [...edges].sort((a, b) => a.timestamp - b.timestamp)
      };
    }
    case "causal":
      return {
        mode: "causal",
        failures: nodes.filter(
          (n) =>
            (n.kind === "Execution" && n.data?.status === "failed") ||
            n.kind === "BudgetViolation" ||
            n.kind === "PolicyViolation"
        ),
        plans: nodes.filter((n) => n.kind === "MutationPlan"),
        executions: nodes.filter((n) => n.kind === "Execution"),
        rollbacks: nodes.filter((n) => n.kind === "Rollback")
      };
    case "verification":
      return {
        mode: "verification",
        verifications: nodes.filter((n) => n.kind === "Verification"),
        findings: nodes.filter((n) => n.kind === "Finding"),
        gates: nodes.filter((n) => n.kind === "Gate")
      };
    case "ci":
      return {
        mode: "ci",
        schemaVersion: replayResult.graph?.schemaVersion ?? 1,
        graphHash: replayResult.graph?.graphHash || null,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        healthy: replayResult.healthy,
        violationCount: (replayResult.integrity?.violations || []).length
      };
    case "forensic":
    default:
      return {
        mode: "forensic",
        readonly: true,
        graph: replayResult.graph,
        integrity: replayResult.integrity
      };
  }
}

export class RuntimeStateGraph {
  constructor() {
    /** @type {Map<string, Array<Object>>} */
    this.nodesBySession = new Map();
    /** @type {Map<string, Array<Object>>} */
    this.edgesBySession = new Map();
    this.counter = 0;
  }

  /**
   * Adds a typed node to `sessionId`.
   * @param {string} sessionId
   * @param {string} kind
   * @param {string} label
   * @param {Object} [data]
   * @returns {Object}
   */
  addNode(sessionId, kind, label, data = {}) {
    if (!GRAPH_NODE_KINDS.includes(kind)) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Invalid RuntimeStateGraph node kind '${kind}'`,
        likelyCause: "Attempted to record an unregistered node type.",
        suggestedFix: `Use one of: ${GRAPH_NODE_KINDS.join(", ")}`
      });
    }
    this.counter += 1;
    const node = {
      id: `node-${this.counter}-${sha256Hex(`${sessionId}:${kind}:${label}:${this.counter}`).slice(0, 8)}`,
      sessionId,
      kind,
      label,
      timestamp: Date.now(),
      data: structuredClone(data)
    };
    if (!this.nodesBySession.has(sessionId)) {
      this.nodesBySession.set(sessionId, []);
    }
    this.nodesBySession.get(sessionId).push(node);
    return node;
  }

  /**
   * Adds a typed directed edge between two nodes in `sessionId`.
   * @param {string} sessionId
   * @param {string} fromId
   * @param {string} toId
   * @param {string} kind
   * @returns {Object}
   */
  addEdge(sessionId, fromId, toId, kind) {
    if (!GRAPH_EDGE_KINDS.includes(kind)) {
      throw new GuidedError({
        code: "INVARIANT_VIOLATION",
        message: `Invalid RuntimeStateGraph edge kind '${kind}'`,
        likelyCause: "Attempted to record an unregistered edge relationship.",
        suggestedFix: `Use one of: ${GRAPH_EDGE_KINDS.join(", ")}`
      });
    }
    this.counter += 1;
    const edge = {
      id: `edge-${this.counter}-${sha256Hex(`${sessionId}:${fromId}:${toId}:${kind}`).slice(0, 8)}`,
      sessionId,
      from: fromId,
      to: toId,
      kind,
      timestamp: Date.now()
    };
    if (!this.edgesBySession.has(sessionId)) {
      this.edgesBySession.set(sessionId, []);
    }
    this.edgesBySession.get(sessionId).push(edge);
    return edge;
  }

  /**
   * @param {string} sessionId
   * @param {string} [kind]
   * @returns {Array<Object>}
   */
  getNodes(sessionId, kind) {
    const list = this.nodesBySession.get(sessionId) || [];
    return kind ? list.filter((n) => n.kind === kind) : [...list];
  }

  /**
   * @param {string} sessionId
   * @returns {Array<Object>}
   */
  getEdges(sessionId) {
    return [...(this.edgesBySession.get(sessionId) || [])];
  }

  /**
   * Explains a single node's inbound and outbound causal edges in `sessionId`.
   * @param {string} sessionId
   * @param {string} nodeId
   * @returns {{ node: Object, inbound: Array<Object>, outbound: Array<Object> } | null}
   */
  explainNode(sessionId, nodeId) {
    const nodes = this.nodesBySession.get(sessionId) || [];
    const edges = this.edgesBySession.get(sessionId) || [];
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const inbound = edges.filter((e) => e.to === nodeId);
    const outbound = edges.filter((e) => e.from === nodeId);
    return {
      node: structuredClone(node),
      inbound: structuredClone(inbound),
      outbound: structuredClone(outbound)
    };
  }

  /**
   * Returns a deterministic, hash-verified snapshot of `sessionId`.
   * @param {string} sessionId
   * @returns {{ sessionId: string, schemaVersion: number, nodes: Array<Object>, edges: Array<Object>, graphHash: string }}
   */
  snapshot(sessionId) {
    const nodes = structuredClone(this.getNodes(sessionId));
    const edges = structuredClone(this.getEdges(sessionId));
    const canonicalPayload = {
      sessionId,
      nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
      edges: [...edges].sort((a, b) => a.id.localeCompare(b.id))
    };
    const graphHash = sha256Hex(stableStringify(canonicalPayload));
    return {
      sessionId,
      schemaVersion: 1,
      nodes,
      edges,
      graphHash
    };
  }

  /**
   * Compacts transient `RuntimeEvent` and `HealthSnapshot` nodes while preserving
   * all causal Audit, Finding, MutationPlan, Execution, Verification, and Rollback nodes.
   *
   * @param {string} sessionId
   * @returns {{ beforeNodes: number, afterNodes: number, compactionRatio: number }}
   */
  compact(sessionId) {
    const nodes = this.nodesBySession.get(sessionId) || [];
    const edges = this.edgesBySession.get(sessionId) || [];
    const beforeNodes = nodes.length;
    if (beforeNodes === 0) {
      return { beforeNodes: 0, afterNodes: 0, compactionRatio: 1 };
    }

    const keptNodes = nodes.filter(
      (n) => n.kind !== "RuntimeEvent" && n.kind !== "HealthSnapshot"
    );
    const keptIds = new Set(keptNodes.map((n) => n.id));
    const keptEdges = edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));

    this.nodesBySession.set(sessionId, keptNodes);
    this.edgesBySession.set(sessionId, keptEdges);

    const afterNodes = keptNodes.length;
    const compactionRatio = Number((afterNodes / Math.max(1, beforeNodes)).toFixed(4));
    return { beforeNodes, afterNodes, compactionRatio };
  }
}

