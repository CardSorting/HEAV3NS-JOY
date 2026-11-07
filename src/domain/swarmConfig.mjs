/** [LAYER: DOMAIN] */
/**
 * Pure Agent Swarm configuration model: defaults, feature gates, environment
 * overrides (from an injected `env` map), and sanitization of persisted documents.
 *
 * @typedef {"before_turn" | "safe_boundary"} AgentSwarmDeferBoundary
 *
 * @typedef {Object} AgentSwarmConfig
 * @property {boolean} enabled
 * @property {boolean} criticalCompletionReview
 * @property {number} maxInitialReviews
 * @property {number} maxCorrectivePasses
 * @property {boolean} autoDeferOnCompletionReview
 * @property {boolean} hierarchicalDefer
 * @property {boolean} legion
 * @property {AgentSwarmDeferBoundary} deferBoundary
 * @property {import("./swarmClassifier.mjs").LegionStrategy} strategy
 * @property {number} maxSpecialists
 */

import { LEGION_STRATEGIES } from "./swarmClassifier.mjs";

/** @type {Readonly<AgentSwarmConfig>} */
export const defaultAgentSwarmConfig = Object.freeze({
  enabled: false,
  criticalCompletionReview: false,
  maxInitialReviews: 1,
  maxCorrectivePasses: 1,
  autoDeferOnCompletionReview: true,
  hierarchicalDefer: false,
  legion: true,
  deferBoundary: "safe_boundary",
  strategy: "adaptive",
  maxSpecialists: 4
});

export const AGENT_SWARM_ENVIRONMENT_VARIABLES = Object.freeze([
  "JOY_SWARM_ENABLED",
  "JOY_SWARM_CRITICAL_COMPLETION_REVIEW",
  "JOY_SWARM_AUTO_DEFER_ON_REVIEW",
  "JOY_SWARM_MAX_INITIAL_REVIEWS", "JOY_SWARM_MAX_CORRECTIVE_PASSES",
  "JOY_SWARM_HIERARCHICAL_DEFER",
  "JOY_SWARM_LEGION",
  "JOY_SWARM_DEFER_BOUNDARY", "JOY_SWARM_LEGION_STRATEGY", "JOY_SWARM_LEGION_MAX_SPECIALISTS"
]);

const BOOLEAN_VALUES = Object.freeze({
  "1": true, true: true, yes: true, on: true, enabled: true,
  "0": false, false: false, no: false, off: false, disabled: false
});

/**
 * @param {AgentSwarmConfig} config
 * @param {"criticalCompletionReview" | "hierarchicalDefer" | "legion"} feature
 * @returns {boolean}
 */
export function agentSwarmFeatureEnabled(config, feature) {
  return config.enabled || config[feature];
}

/**
 * Turns off execution while retaining the user's strategy, bounds, and boundary choices.
 * @param {AgentSwarmConfig} config
 * @returns {AgentSwarmConfig}
 */
export function disableAgentSwarmFeatures(config) {
  return { ...config, enabled: false, criticalCompletionReview: false, hierarchicalDefer: false, legion: false };
}

/**
 * Safe-by-default config used when the persisted document is corrupt.
 * @returns {AgentSwarmConfig}
 */
export function failClosedAgentSwarmConfig() {
  return { ...defaultAgentSwarmConfig, enabled: false, legion: false };
}

function environmentValue(env, primary, twin) {
  const primaryValue = env[primary];
  const value = typeof primaryValue === "string" && primaryValue.trim() ? primaryValue : (twin ? env[twin] : undefined);
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

function boundedInteger(raw, min, max) {
  return Math.max(min, Math.min(max, Number(raw)));
}

/**
 * Parses environment overrides from an injected variable map.
 * @param {Record<string, string | undefined>} [env]
 * @returns {Partial<AgentSwarmConfig>}
 */
export function getAgentSwarmEnvironmentOverrides(env = {}) {
  const overrides = {};
  const booleanSettings = [
    ["enabled", "JOY_SWARM_ENABLED", undefined],
    ["criticalCompletionReview", "JOY_SWARM_CRITICAL_COMPLETION_REVIEW", undefined],
    ["autoDeferOnCompletionReview", "JOY_SWARM_AUTO_DEFER_ON_REVIEW", undefined],
    ["hierarchicalDefer", "JOY_SWARM_HIERARCHICAL_DEFER", undefined],
    ["legion", "JOY_SWARM_LEGION", undefined]
  ];
  for (const [key, primary, twin] of booleanSettings) {
    const value = environmentValue(env, primary, twin);
    if (value !== undefined && Object.hasOwn(BOOLEAN_VALUES, value)) overrides[key] = BOOLEAN_VALUES[value];
  }
  const boundary = environmentValue(env, "JOY_SWARM_DEFER_BOUNDARY");
  if (boundary === "before_turn" || boundary === "safe_boundary") overrides.deferBoundary = boundary;
  const strategy = environmentValue(env, "JOY_SWARM_LEGION_STRATEGY");
  if (strategy && LEGION_STRATEGIES.includes(strategy)) overrides.strategy = strategy;
  const cap = environmentValue(env, "JOY_SWARM_LEGION_MAX_SPECIALISTS");
  if (cap && /^\d+$/.test(cap)) overrides.maxSpecialists = boundedInteger(cap, 1, 8);
  const reviews = environmentValue(env, "JOY_SWARM_MAX_INITIAL_REVIEWS");
  if (reviews && /^\d+$/.test(reviews)) overrides.maxInitialReviews = boundedInteger(reviews, 1, 5);
  const passes = environmentValue(env, "JOY_SWARM_MAX_CORRECTIVE_PASSES");
  if (passes && /^\d+$/.test(passes)) overrides.maxCorrectivePasses = boundedInteger(passes, 1, 5);
  return overrides;
}

/**
 * Sanitizes an untrusted persisted document into a complete config. A non-object
 * document fails closed (feature execution disabled).
 * @param {unknown} parsed
 * @returns {AgentSwarmConfig}
 */
export function sanitizeAgentSwarmConfig(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return failClosedAgentSwarmConfig();
  const value = /** @type {Record<string, unknown>} */ (parsed);
  const integer = (candidate, min, max, fallback) =>
    typeof candidate === "number" && Number.isInteger(candidate) ? boundedInteger(candidate, min, max) : fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : defaultAgentSwarmConfig.enabled,
    criticalCompletionReview: value.criticalCompletionReview === true,
    maxInitialReviews: integer(value.maxInitialReviews, 1, 5, defaultAgentSwarmConfig.maxInitialReviews),
    maxCorrectivePasses: integer(value.maxCorrectivePasses, 1, 5, defaultAgentSwarmConfig.maxCorrectivePasses),
    autoDeferOnCompletionReview: typeof value.autoDeferOnCompletionReview === "boolean"
      ? value.autoDeferOnCompletionReview
      : defaultAgentSwarmConfig.autoDeferOnCompletionReview,
    hierarchicalDefer: value.hierarchicalDefer === true,
    legion: typeof value.legion === "boolean" ? value.legion : defaultAgentSwarmConfig.legion,
    deferBoundary: value.deferBoundary === "before_turn" ? "before_turn" : "safe_boundary",
    strategy: LEGION_STRATEGIES.includes(value.strategy) ? value.strategy : defaultAgentSwarmConfig.strategy,
    maxSpecialists: integer(value.maxSpecialists, 1, 8, defaultAgentSwarmConfig.maxSpecialists)
  };
}
