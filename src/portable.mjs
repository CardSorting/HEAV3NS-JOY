/** [LAYER: UI] */
/**
 * Portable Broccoli Trinity composition root: BroccoliQueue, BufferedDb, and AgentSwarm,
 * wired with zero npm dependencies (Node built-ins only).
 *
 *   import { createPortableBroccoli, createAgentSwarm } from "heav3ns-joy/portable";
 *
 *   const broccoli = createPortableBroccoli({ workspaceRoot: "./state" });
 *   await broccoli.start();
 *   const queue = broccoli.createQueue({ namespace: "jobs" });
 *   const swarm = createAgentSwarm({ db: broccoli.db });   // dispatcher + step-wise ledger
 *
 * Kept separate from `src/index.mjs` so the frozen 84-symbol Joyzoning API is unchanged.
 */

import * as path from "node:path";
import { BroccoliDatabaseKernel } from "./infrastructure/broccolidb/index.mjs";
import { BroccoliQueue } from "./infrastructure/broccoliqueue/index.mjs";
import { BroccoliBufferedStore } from "./infrastructure/BroccoliBufferedStore.mjs";
import { MemoryBufferedStore } from "./infrastructure/MemoryBufferedStore.mjs";
import { acquireRootLock, RootLockedError, LOCK_FILE_NAME } from "./infrastructure/FileRootLock.mjs";
import { NodeProjectFiles } from "./infrastructure/NodeProjectFiles.mjs";
import { ProcessToolRunner } from "./infrastructure/ProcessToolRunner.mjs";
import { StdioMcpTransport } from "./infrastructure/StdioMcpTransport.mjs";
import { createProjectPathGuard } from "./infrastructure/ProjectPathGuard.mjs";
import { createPackageResourceReader } from "./infrastructure/PackageResourceReader.mjs";
import { FileSwarmConfigStore } from "./infrastructure/FileSwarmConfigStore.mjs";
import { MemorySwarmConfigStore } from "./infrastructure/MemorySwarmConfigStore.mjs";
import { IBufferedStore } from "./domain/interfaces/IBufferedStore.mjs";
import { ISwarmLeaseService } from "./domain/interfaces/ISwarmLeaseService.mjs";
import { ISwarmAgentEngine } from "./domain/interfaces/ISwarmAgentEngine.mjs";
import { ISwarmConfigStore } from "./domain/interfaces/ISwarmConfigStore.mjs";
import {
  LAYER_PRIORITY,
  createMonomorphicWriteOp,
  increment,
  matches,
  applyValues,
  applyOperationToRows,
  sortOperationsForFlush
} from "./domain/bufferedDbOps.mjs";
import { defaultRowId } from "./plumbing/rowIds.mjs";
import {
  PRIORITY_LATTICE,
  ConvergenceEngineSubstrate
} from "./domain/swarmConvergence.mjs";
import { BroccoliTaskDagScheduler } from "./domain/swarmDag.mjs";
import { BroccoliInterAgentMailbox } from "./domain/swarmMailbox.mjs";
import {
  LEGION_STRATEGIES,
  classifyTaskForLegion
} from "./domain/swarmClassifier.mjs";
import {
  escapeSwarmHandoffText,
  formatLegionHandoffText,
  legionHandoffStatus
} from "./domain/swarmHandoff.mjs";
import { completedSwarmReports } from "./domain/swarmResume.mjs";
import {
  defaultAgentSwarmConfig,
  AGENT_SWARM_ENVIRONMENT_VARIABLES,
  agentSwarmFeatureEnabled,
  disableAgentSwarmFeatures,
  getAgentSwarmEnvironmentOverrides,
  sanitizeAgentSwarmConfig
} from "./domain/swarmConfig.mjs";
import {
  LEGION_KNOWLEDGE_TTL_MS,
  MAX_LEGION_KNOWLEDGE_ITEMS,
  isReusableLegionObservation,
  extractLegionHeuristics,
  formatLegionKnowledgeContext,
  legionWorkspaceScope
} from "./domain/swarmKnowledge.mjs";
import { BufferedDb, BufferedDbPool, ShadowCommitError } from "./core/BufferedDb.mjs";
import { SwarmKnowledgeService } from "./core/SwarmKnowledgeService.mjs";
import { SwarmConfigService } from "./core/SwarmConfigService.mjs";
import { BroccoliTaskCoordinator } from "./core/SwarmTaskCoordinator.mjs";
import { InMemorySwarmLeaseService } from "./core/InMemorySwarmLeaseService.mjs";
import { AgentSwarmDispatcher } from "./core/AgentSwarmDispatcher.mjs";
import { SwarmFormationLedger } from "./core/SwarmFormationLedger.mjs";
import { ProcessAgentEngine } from "./infrastructure/ProcessAgentEngine.mjs";
import { AgentInstaller, MANIFEST_PATH } from "./core/AgentInstaller.mjs";
import { McpServer } from "./core/McpServer.mjs";
import { AGENT_TARGETS, resolveLauncher } from "./domain/agentTargets.mjs";
import { LEGION_CORE_RULES, validateAndOrderFormation, buildSpecialistPrompt } from "./domain/swarmFormation.mjs";

/**
 * Wires a durable BroccoliDB kernel, a `BufferedDb` write buffer on top of it, and a
 * `BroccoliQueue` factory that shares the same kernel.
 *
 * @param {{
 *   workspaceRoot?: string,
 *   kernel?: BroccoliDatabaseKernel,
 *   volatile?: boolean,
 *   rowId?: (table: string, row: Record<string, unknown>) => string,
 *   logger?: { error: Function, warn?: Function },
 *   flushIntervalMs?: number,
 *   exclusive?: boolean,
 *   lockTimeoutMs?: number
 * }} [options] `exclusive: true` takes a cross-process lock on `workspaceRoot` (`.joy-lock`) for the
 *   lifetime of the instance, so concurrent processes cannot corrupt shared state; `volatile: true` keeps `BufferedDb` in memory only (no files are written
 *   by it); queues always require a kernel and therefore a `workspaceRoot`.
 */
export function createPortableBroccoli(options = {}) {
  const kernel = options.kernel ?? new BroccoliDatabaseKernel(options.workspaceRoot ? { workspaceRoot: options.workspaceRoot } : {});
  const store = options.volatile
    ? new MemoryBufferedStore(options.rowId ? { rowId: options.rowId } : {})
    : new BroccoliBufferedStore({ kernel, ...(options.rowId ? { rowId: options.rowId } : {}) });
  const db = new BufferedDb({
    store,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.flushIntervalMs ? { flushIntervalMs: options.flushIntervalMs } : {})
  });
  const queues = new Set();
  let kernelStarted = false;
  let lock = null;
  const ownsKernel = !options.kernel;

  return {
    kernel,
    store,
    db,
    /** Starts the kernel (WAL replay) so queues and the buffer share one durable base. */
    async start() {
      if (kernelStarted) return;
      if (options.exclusive) {
        if (!options.workspaceRoot) throw new Error("createPortableBroccoli({ exclusive: true }) requires a workspaceRoot");
        lock = await acquireRootLock(options.workspaceRoot, options.lockTimeoutMs === undefined ? {} : { timeoutMs: options.lockTimeoutMs });
      }
      try {
        await kernel.start();
      } catch (error) {
        await lock?.release();
        lock = null;
        throw error;
      }
      kernelStarted = true;
    },
    /** Creates a queue on the shared kernel; call `start()` first. */
    createQueue(queueOptions = {}) {
      const queue = new BroccoliQueue({ ...queueOptions, db: kernel });
      queues.add(queue);
      return queue;
    },
    /** Closes queues, drains the buffer, and stops the kernel (when this factory created it). */
    async stop(closeOptions = {}) {
      // Every step is attempted and the lock is always released, even if an earlier step throws.
      const failures = [];
      const attempt = async (step) => {
        try {
          await step();
        } catch (error) {
          failures.push(error);
        }
      };
      for (const queue of queues) await attempt(() => queue.close(closeOptions));
      queues.clear();
      await attempt(() => db.stop());
      if (kernelStarted && ownsKernel) await attempt(() => kernel.stop());
      kernelStarted = false;
      await attempt(async () => {
        await lock?.release();
        lock = null;
      });
      if (failures.length) throw failures[0];
    }
  };
}

/**
 * Builds an `AgentSwarmDispatcher` with durable (or in-memory) knowledge, file-backed
 * (or in-memory) configuration, and an in-process lease service.
 *
 * @param {{
 *   db?: BufferedDb,
 *   configFile?: string,
 *   persistConfig?: boolean,
 *   env?: Record<string, string | undefined>,
 *   leaseService?: ISwarmLeaseService,
 *   logger?: { warn: Function, error?: Function }
 * }} [options] Omit `db` to run without cross-run workspace heuristics.
 */
export function createAgentSwarm(options = {}) {
  const configStore = options.persistConfig === false
    ? new MemorySwarmConfigStore()
    : new FileSwarmConfigStore(options.configFile ? { file: options.configFile } : {});
  const config = new SwarmConfigService({ store: configStore, env: options.env ?? process.env });
  const knowledge = options.db
    ? new SwarmKnowledgeService({ db: options.db, resolveWorkspacePath: (cwd) => path.resolve(cwd) })
    : undefined;
  const dispatcher = new AgentSwarmDispatcher({
    configService: config,
    ...(knowledge ? { workspaceKnowledge: knowledge } : {}),
    ...(options.leaseService ? { leaseService: options.leaseService } : {}),
    ...(options.logger ? { logger: options.logger } : {})
  });
  const ledger = options.db ? new SwarmFormationLedger({ db: options.db, ...(knowledge ? { knowledge } : {}) }) : undefined;
  return { dispatcher, config, knowledge, configStore, ledger };
}

/**
 * Creates the agent installer for a project directory (instruction files, skills, MCP entries, hooks).
 * @param {{ root: string, version: string }} options
 */
export function createAgentInstaller(options) {
  return new AgentInstaller({ files: new NodeProjectFiles(options.root), version: options.version });
}

/**
 * Creates the MCP server wired to the joy CLIs, confined to `projectRoot`.
 * @param {{
 *   projectRoot: string,
 *   packageRoot: string,
 *   scripts: { check: string, trinity: string },
 *   version: string,
 *   stateRoot?: string,
 *   allowOutsideProject?: boolean,
 *   toolTimeoutMs?: number,
 *   logger?: { warn: Function }
 * }} options
 */
export function createMcpServer(options) {
  const runner = new ProcessToolRunner({ scripts: options.scripts, cwd: options.projectRoot });
  return new McpServer({
    info: { name: "heav3ns-joy", version: options.version },
    runCli: (cli, argv, run) => runner.run(cli, argv, run),
    readResource: createPackageResourceReader(options.packageRoot),
    isInsideProject: createProjectPathGuard(options.projectRoot, { allowOutside: options.allowOutsideProject }),
    ...(options.stateRoot ? { stateRoot: options.stateRoot } : {}),
    ...(options.toolTimeoutMs ? { toolTimeoutMs: options.toolTimeoutMs } : {}),
    ...(options.logger ? { logger: options.logger } : {})
  });
}

/** Serves `server` over stdio until input ends. */
export function serveMcpOverStdio(server, io = {}) {
  return new StdioMcpTransport({ server, ...io }).run();
}

export * from "./infrastructure/broccolidb/index.mjs";

export {
  AGENT_TARGETS,
  AgentInstaller,
  MANIFEST_PATH,
  McpServer,
  resolveLauncher,
  acquireRootLock,
  RootLockedError,
  LOCK_FILE_NAME,
  BroccoliQueue,
  BufferedDb,
  BufferedDbPool,
  ShadowCommitError,
  BroccoliBufferedStore,
  MemoryBufferedStore,
  FileSwarmConfigStore,
  MemorySwarmConfigStore,
  IBufferedStore,
  ISwarmLeaseService,
  ISwarmAgentEngine,
  ISwarmConfigStore,
  LAYER_PRIORITY,
  createMonomorphicWriteOp,
  increment,
  matches,
  applyValues,
  applyOperationToRows,
  sortOperationsForFlush,
  defaultRowId,
  PRIORITY_LATTICE,
  ConvergenceEngineSubstrate,
  BroccoliTaskDagScheduler,
  BroccoliInterAgentMailbox,
  BroccoliTaskCoordinator,
  LEGION_STRATEGIES,
  classifyTaskForLegion,
  escapeSwarmHandoffText,
  formatLegionHandoffText,
  legionHandoffStatus,
  completedSwarmReports,
  defaultAgentSwarmConfig,
  AGENT_SWARM_ENVIRONMENT_VARIABLES,
  agentSwarmFeatureEnabled,
  disableAgentSwarmFeatures,
  getAgentSwarmEnvironmentOverrides,
  sanitizeAgentSwarmConfig,
  LEGION_KNOWLEDGE_TTL_MS,
  MAX_LEGION_KNOWLEDGE_ITEMS,
  isReusableLegionObservation,
  extractLegionHeuristics,
  formatLegionKnowledgeContext,
  legionWorkspaceScope,
  SwarmKnowledgeService,
  SwarmConfigService,
  InMemorySwarmLeaseService,
  AgentSwarmDispatcher,
  SwarmFormationLedger,
  ProcessAgentEngine,
  LEGION_CORE_RULES,
  validateAndOrderFormation,
  buildSpecialistPrompt
};
