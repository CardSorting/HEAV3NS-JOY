/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`ISwarmAgentEngine`) describing the host agent
 * engine that `AgentSwarmDispatcher` delegates specialist work to. The swarm is
 * host-agnostic: any LLM agent loop can participate by implementing this shape.
 *
 * @typedef {Object} SwarmTickResult
 * @property {"completed" | "failed" | "deferred"} outcome
 * @property {string} [response] - final natural-language report from the child
 * @property {Array<unknown>} [toolResults] - tool invocations that already ran
 * @property {boolean} [safeToRetry] - true only when no side effects can have occurred
 *
 * @typedef {Object} SwarmSessionStore
 * @property {() => Array<{ role: string, content: string, timestamp: number }>} getTranscript
 * @property {() => Array<Object>} getMessages
 * @property {() => string} exportJsonl
 *
 * @typedef {Object} SwarmChildEngine
 * @property {(request: { prompt: string, shouldDefer?: () => boolean, deferBoundary?: string, signal?: AbortSignal }) => Promise<SwarmTickResult>} tick
 * @property {SwarmSessionStore} sessionStore
 * @property {{ deferHierarchy: () => Promise<unknown> }} [swarmDispatcher] - child dispatcher, when it can itself delegate
 *
 * @typedef {Object} SwarmParentEngine
 * @property {{ sessionId?: string, cwd?: string }} [sessionContext]
 * @property {() => unknown} createSnapshot - opaque parent state captured before each delegation
 * @property {(childSessionId: string, checkpoint?: { activeJsonl: string, transcriptJsonl: string }) => SwarmChildEngine} forkSession
 */

export class ISwarmAgentEngine {
  /** @returns {unknown} */
  createSnapshot() {
    throw new Error("ISwarmAgentEngine.createSnapshot must be implemented by the host agent engine.");
  }

  /**
   * @param {string} _childSessionId
   * @param {{ activeJsonl: string, transcriptJsonl: string }} [_checkpoint]
   * @returns {SwarmChildEngine}
   */
  forkSession(_childSessionId, _checkpoint) {
    throw new Error("ISwarmAgentEngine.forkSession must be implemented by the host agent engine.");
  }
}
