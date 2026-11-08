<!-- [LAYER: UI] -->
# Portable Broccoli Trinity

**BroccoliQueue**, **BufferedDb**, and **AgentSwarm** — portable building blocks
in HEAV3NS-JOY with **zero npm dependencies** (Node ≥ 18 built-ins only; `BufferedDb` and
the swarm need no Node-specific APIs beyond timers, and the queue/kernel use `node:fs`,
`node:crypto`, and `node:http`).

```js
import { createPortableBroccoli, createAgentSwarm } from "heav3ns-joy/portable";

const broccoli = createPortableBroccoli({ workspaceRoot: "./state" });
await broccoli.start();

const queue = broccoli.createQueue({ namespace: "jobs" });   // BroccoliQueue on the shared kernel
await queue.start();
queue.process("email.send", async (job) => ({ sent: job.data.to })).start();
await queue.add("email.send", { to: "ada@example.com" }, { idempotencyKey: "welcome:ada" });

await broccoli.db.push({ type: "upsert", table: "stats", values: { id: "emails", sent: 1 }, conflictTarget: "id" }); // BufferedDb

const swarm = createAgentSwarm({ db: broccoli.db });          // AgentSwarmDispatcher + durable heuristics
// swarm.dispatcher.delegateSpecialistFormation(objective, assignments, hostAgentEngine)

await broccoli.stop({ drainTimeoutMs: 30_000 });
```

## Operating it from any agent harness

The same capabilities are exposed as a shell command so that an agent needs nothing but a terminal:
[`bin/joy-trinity.mjs`](../bin/joy-trinity.mjs) (`selftest`, `queue …`, `db …`, `swarm …`). Every invocation prints one JSON
document and exits `0` (ok), `1` (runtime failure), or `2` (usage error); state persists under `--root` across
processes. The README section [Operate the Portable Trinity](../README.md#operate-the-portable-trinity-any-harness) and
[CLI reference](api/cli.md) document the contract. Agents that embed Node directly use `heav3ns-joy/portable` instead.

## Three ways to run a swarm (none require touching your harness)

An agent that cannot modify its own harness still has a complete path. Pick by what the agent can do:

| Mode | The agent… | Command / API | Who does the specialist work |
|------|-----------|---------------|------------------------------|
| **Ledger** (step-wise) | only has a shell | `swarm plan` → loop `swarm next` / `swarm report` → `swarm finish` | The calling agent itself, or any subagents it already owns. The framework supplies the roster, ordering, claims, prompts, prior-report handoff, retry, and workspace heuristics |
| **External process** | can name any CLI agent or script | `swarm run --task … --exec '["cmd","arg"]'` | The framework spawns one process per specialist (prompt on stdin and in `$JOY_SWARM_PROMPT_FILE`; stdout is the report) |
| **Embedded** | runs its own Node program | `AgentSwarmDispatcher` + your `ISwarmAgentEngine` | Your engine; gives defer barriers, fenced leases, checkpoint resume |

All three share the same planning (`classifyTaskForLegion`), validation (`validateAndOrderFormation`), prompt construction
(`buildSpecialistPrompt`), handoff escaping, and persistent workspace heuristics.

### Ledger protocol

```bash
node bin/joy-trinity.mjs swarm plan --task "<what to achieve>" --cwd . --id f1        # or --data '{"objective","assignments":[...]}'
node bin/joy-trinity.mjs swarm next f1          # claims ready specialists; each entry has a complete `prompt`
#   ...perform each specialist's work (yourself or via your own subagents), then:
node bin/joy-trinity.mjs swarm report f1 --assignment <id> --status completed --summary "<findings, evidence>"
node bin/joy-trinity.mjs swarm next f1          # repeat until `done` is true (dependents receive prior reports)
node bin/joy-trinity.mjs swarm finish f1        # escaped handoff + per-specialist reports
```

Rules: `next` claims work (use `--peek` to look without claiming) so parallel callers never take the same specialist twice;
`report` is only valid for a claimed (running) specialist; a failed specialist makes its dependents `skipped` until
`swarm retry f1 --assignment <id>` resets it (and its skipped dependents); `finish` refuses while any specialist is open.
Lines of the form `Heuristic: <fact>` in a completed summary are validated (no secrets or control characters) and stored for
later formations in the same `--cwd`. The ledger is also available as `SwarmFormationLedger` in `heav3ns-joy/portable`.

### External-process mode

`--exec` is a JSON argv array (no shell is involved, so prompt text can never be interpreted as shell syntax). Exit `0` marks a
specialist completed; any other exit, signal, or timeout marks it failed and it is not blindly replayed; a command that cannot be
started is reported as safely retryable. Specialists in a dependency stage run concurrently; later stages receive earlier reports.

## Design: injected collaborators

Nothing in the swarm, buffer, or queue assumes a host application:

| Piece | Collaborator | Contract | Default adapter |
|-------|-------------|----------|-----------------|
| BufferedDb | storage | `IBufferedStore` | `BroccoliBufferedStore` (durable), `MemoryBufferedStore` |
| AgentSwarm | specialist workforce | `ISwarmAgentEngine` | `ProcessAgentEngine` (external processes) or the step-wise ledger |
| AgentSwarm | exclusive formation ownership | `ISwarmLeaseService` | `InMemorySwarmLeaseService` |
| AgentSwarm | configuration | `ISwarmConfigStore` | `FileSwarmConfigStore`, `MemorySwarmConfigStore` |
| AgentSwarm | workspace heuristics | `SwarmKnowledgeService` over `BufferedDb` | durable via the embedded kernel |
| BroccoliQueue | database | embedded BroccoliDB kernel | in-process, file-backed WAL |

## Zone map (Joyzoning)

| Zone | Files |
|------|-------|
| `PLUMBING` | [`ids.mjs`](../src/plumbing/ids.mjs), [`AsyncMutex.mjs`](../src/plumbing/AsyncMutex.mjs), [`rowIds.mjs`](../src/plumbing/rowIds.mjs), [`cliArgs.mjs`](../src/plumbing/cliArgs.mjs), [`managedBlocks.mjs`](../src/plumbing/managedBlocks.mjs) |
| `DOMAIN` interfaces | [`IBufferedStore`](../src/domain/interfaces/IBufferedStore.mjs), [`ISwarmLeaseService`](../src/domain/interfaces/ISwarmLeaseService.mjs), [`ISwarmAgentEngine`](../src/domain/interfaces/ISwarmAgentEngine.mjs), [`ISwarmConfigStore`](../src/domain/interfaces/ISwarmConfigStore.mjs), [`IProjectFiles`](../src/domain/interfaces/IProjectFiles.mjs) |
| `DOMAIN` logic | [`bufferedDbOps`](../src/domain/bufferedDbOps.mjs), [`swarmClassifier`](../src/domain/swarmClassifier.mjs), [`swarmConvergence`](../src/domain/swarmConvergence.mjs), [`swarmDag`](../src/domain/swarmDag.mjs), [`swarmMailbox`](../src/domain/swarmMailbox.mjs), [`swarmHandoff`](../src/domain/swarmHandoff.mjs), [`swarmResume`](../src/domain/swarmResume.mjs), [`swarmFormation`](../src/domain/swarmFormation.mjs), [`swarmConfig`](../src/domain/swarmConfig.mjs), [`swarmKnowledge`](../src/domain/swarmKnowledge.mjs), [`agentTargets`](../src/domain/agentTargets.mjs), [`agentTemplates`](../src/domain/agentTemplates.mjs), [`skillTemplates`](../src/domain/skillTemplates.mjs) |
| `CORE` | [`BufferedDb`](../src/core/BufferedDb.mjs), [`AgentSwarmDispatcher`](../src/core/AgentSwarmDispatcher.mjs), [`SwarmFormationLedger`](../src/core/SwarmFormationLedger.mjs), [`SwarmTaskCoordinator`](../src/core/SwarmTaskCoordinator.mjs), [`SwarmKnowledgeService`](../src/core/SwarmKnowledgeService.mjs), [`SwarmConfigService`](../src/core/SwarmConfigService.mjs), [`InMemorySwarmLeaseService`](../src/core/InMemorySwarmLeaseService.mjs), [`AgentInstaller`](../src/core/AgentInstaller.mjs), [`McpServer`](../src/core/mcp/McpServer.mjs) |
| `INFRASTRUCTURE` | [`broccolidb/`](../src/infrastructure/broccolidb/index.mjs) (including [`broccolidb-table-query.mjs`](../src/infrastructure/broccolidb/broccolidb-table-query.mjs)), [`broccoliqueue/`](../src/infrastructure/broccoliqueue/index.mjs) (including [`queue-helpers.mjs`](../src/infrastructure/broccoliqueue/queue-helpers.mjs)), [`BroccoliBufferedStore`](../src/infrastructure/BroccoliBufferedStore.mjs), [`MemoryBufferedStore`](../src/infrastructure/MemoryBufferedStore.mjs), [`ProcessAgentEngine`](../src/infrastructure/ProcessAgentEngine.mjs), [`FileSwarmConfigStore`](../src/infrastructure/FileSwarmConfigStore.mjs), [`MemorySwarmConfigStore`](../src/infrastructure/MemorySwarmConfigStore.mjs), [`FileRootLock`](../src/infrastructure/FileRootLock.mjs), [`NodeProjectFiles`](../src/infrastructure/NodeProjectFiles.mjs), [`StdioMcpTransport`](../src/infrastructure/StdioMcpTransport.mjs) |
| `UI` (composition root & CLIs) | [`portable.mjs`](../src/portable.mjs), [`bin/joy-trinity.mjs`](../bin/joy-trinity.mjs), [`bin/joy.mjs`](../bin/joy.mjs) |

`src/portable.mjs` is a second composition root (listed in `stability.config.json`) exporting 23 symbols (`createPortableBroccoli`, `createAgentSwarm`, `createAgentInstaller`, `createMcpServer`, `serveMcpOverStdio`, `SwarmFormationLedger`, `ProcessAgentEngine`, etc.) so the frozen 84-symbol `src/index.mjs` API is unchanged.

## BufferedDb

Writes are acknowledged into memory and persisted in coalesced, layer-ordered batches through
an `IBufferedStore`. Reads overlay unflushed operations so callers always see their own writes.

- `push` / `pushBatch` — buffered `insert | update | delete | upsert` operations; `increment(n)` values are atomic deltas.
- `beginWork` / `commitWork` / `rollbackWork` / `runTransaction` — per-agent shadows invisible to others until commit.
- `flush` — one atomic store transaction; on failure operations return to the buffer and the error is raised.
- `stop` — drains the buffer; rejects with `ShadowCommitError` while shadows remain uncommitted. A stopped instance restarts on next use.
- Stores: `BroccoliBufferedStore` (durable WAL/checkpoints via the embedded kernel) and `MemoryBufferedStore`. Rows are keyed by `id` unless a `rowId(table, row)` resolver is supplied.

## AgentSwarm

The embedded `AgentSwarmDispatcher.delegateSpecialistFormation(objective, assignments, parentEngine, …)` runs a bounded,
dependency-ordered formation with fenced formation leases, hierarchy defer barriers, safe single-retry
failover (only when no tool ran *and* `safeToRetry === true`), checkpointed resume, and a
blackboard of sanitized workspace heuristics. The `parentEngine` is any object matching
[`ISwarmAgentEngine`](../src/domain/interfaces/ISwarmAgentEngine.mjs) (`sessionContext`, `createSnapshot()`,
`forkSession(id, checkpoint)` → child with `tick()` and `sessionStore`).

`InMemorySwarmLeaseService` is process-local. For multi-process exclusion, provide another `ISwarmLeaseService`.

`SwarmKnowledgeService` manages workspace-scoped heuristics (`swarm knowledge store|recall|search|prune --cwd <dir> [--query <q>] [--all]`): notes are validated by `isSafeLegionObservation` / `diagnoseLegionObservation` (rejecting secrets, credentials, multiline/control characters, and notes `> 500` chars with machine-readable `rejectedReasons`), deduplicated and bounded (`<= 24` notes per workspace, 30-day TTL), and injected into specialist prompts (`<= 5` recalled notes). See [`docs/kb/knowledge-handling-architecture.md`](kb/knowledge-handling-architecture.md) for the full 3-tier knowledge-handling architecture and [`docs/playbooks/trinity-lock-and-wal-recovery.md`](playbooks/trinity-lock-and-wal-recovery.md) for operational runbooks.

Configuration comes from the `~/.heav3ns/agent-swarm.json` document and `JOY_SWARM_*` environment variables (e.g. `JOY_SWARM_ENABLED`, `JOY_SWARM_LEGION_MAX_SPECIALISTS`; see `AGENT_SWARM_ENVIRONMENT_VARIABLES`); `createAgentSwarm({ persistConfig: false })` keeps configuration in memory.

## Hardening guarantees

| Failure mode | Defense |
|--------------|---------|
| Two processes share one `--root` and interleave WAL writes | `FileRootLock` (`.joy-lock`): atomic exclusive create, waiting with jittered backoff, `ROOT_LOCKED` after the timeout. `createPortableBroccoli({ exclusive: true })` uses it; the CLI always does |
| A process crashes while holding the lock | The lock names pid and host; a lock whose pid is dead on this host is reclaimed atomically. Locks from other hosts are never assumed dead |
| Ctrl-C / SIGTERM mid-command | The CLI flushes accepted writes, stops the kernel, and releases the lock before exiting (130 / 143) |
| `stop()` throws part-way | Every shutdown step is attempted and the lock is always released |
| The store stops accepting writes | `BufferedDb` keeps operations (nothing is dropped) and applies backpressure: `BUFFER_FULL` past `hardLimitOps` (default 10× `maxBufferedOps`) |
| Two callers claim the same specialist | The ledger serializes mutations per instance and persists claims; `next --peek` is strictly read-only |
| A claimed specialist's worker dies | `next` reports it under `stale` (default after 30 min) with the retry command; `retry` resets it and its skipped dependents |
| A specialist process ignores SIGTERM | `ProcessAgentEngine` escalates to SIGKILL after a grace period |
| Unsafe ids, unscoped deletes, malformed rows | Formation ids are validated; `db push --type update\|delete` requires `--where`; row data must be a JSON object |
| Unbounded growth | `swarm prune`, `queue prune` |

## Verification

```bash
npm test          # includes the embedded BroccoliDB and BroccoliQueue suites plus suites 23–29
npm run joy-check # 0 blocking violations
```

Suite 23 statically proves the zero-dependency claim: no `dependencies` fields in `package.json`, and every
import under `src/` is relative or `node:`.
