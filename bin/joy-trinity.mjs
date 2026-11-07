#!/usr/bin/env node
/** [LAYER: UI] */
/**
 * Harness-agnostic shell interface to the Portable Broccoli Trinity (BroccoliQueue, BufferedDb,
 * AgentSwarm). Any agent that can run a shell command can operate durable jobs, buffered tables,
 * and specialist swarms without MCP, plugins, or in-process imports.
 *
 * Output contract (default `--format json`): exactly one JSON document on stdout,
 * `{ "ok": true, "command": "...", "result": ... }` or
 * `{ "ok": false, "command": "...", "error": { "code", "message", "hint"? } }`.
 * Exit codes: 0 success, 1 runtime failure, 2 usage error (never treat 2 as success).
 *
 * State safety: every state-touching command takes an exclusive cross-process lock on `--root`,
 * so concurrent invocations queue up (or fail with ROOT_LOCKED) instead of corrupting shared data.
 *
 * Usage: node bin/joy-trinity.mjs <command> [subcommand] [args] [options]   (see --help)
 */

import { readFileSync, mkdirSync, writeFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";
import {
  createPortableBroccoli,
  createAgentSwarm,
  ProcessAgentEngine,
  AgentSwarmDispatcher,
  FileSwarmConfigStore,
  defaultAgentSwarmConfig,
  classifyTaskForLegion,
  RootLockedError,
  LOCK_FILE_NAME
} from "../src/portable.mjs";
import {
  COMMANDS,
  UsageError,
  parseArgv,
  validateInvocation,
  renderHelp,
  renderCompletion
} from "../src/ui/trinityCli.mjs";
import { formatSuccess, formatFailure } from "../src/ui/trinityRenderer.mjs";

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const FORMATS = ["json", "ndjson", "text"];

// ---------------------------------------------------------------- input helpers

function readStdin() {
  return readFileSync(0, "utf8");
}

function loadJson(options, required = false) {
  let raw;
  if (options["data-file"]) raw = readFileSync(options["data-file"], "utf8");
  else if (options.data === "-") raw = readStdin();
  else if (options.data !== undefined) raw = options.data;
  if (raw === undefined) {
    if (required) throw new UsageError("this command requires --data, --data-file, or --data -", "pass a JSON document, e.g. --data '{\"id\":\"1\"}'");
    return undefined;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new UsageError(`data is not valid JSON: ${error.message}`);
  }
}

function coerce(text) {
  if (text === "null") return null;
  if (text === "true") return true;
  if (text === "false") return false;
  return text !== "" && Number.isFinite(Number(text)) ? Number(text) : text;
}

function parseWhere(list = []) {
  return list.map((entry) => {
    const match = /^([^=<>!]+)(=|!=|<=|>=|<|>)(.*)$/.exec(entry);
    if (!match) throw new UsageError(`--where expects column=value (operators: = != < <= > >=), got '${entry}'`);
    const value = coerce(match[3]);
    // A numeric literal could be a stored number or a stored numeric string; match either for equality.
    if (match[2] === "=" && typeof value === "number") return { column: match[1], value: [match[3], value], operator: "IN" };
    return { column: match[1], value, ...(match[2] === "=" ? {} : { operator: match[2] }) };
  });
}

function stateRoot(options) {
  return resolve(options.root ?? process.env.JOY_STATE_ROOT ?? ".joy-state");
}

// ---------------------------------------------------------------- lifecycle

/** Runs `fn` against an exclusively locked, started trinity; always flushes, stops, and unlocks. */
async function withBroccoli(options, fn) {
  const broccoli = createPortableBroccoli({
    workspaceRoot: stateRoot(options),
    exclusive: true,
    ...(options["lock-timeout-ms"] !== undefined ? { lockTimeoutMs: options["lock-timeout-ms"] } : {})
  });
  let interrupted = false;
  const onSignal = (signal) => {
    if (interrupted) return;
    interrupted = true;
    // Persist what was accepted and release the lock before exiting, so a Ctrl-C never strands state.
    broccoli.stop({ drainTimeoutMs: 2000 }).catch(() => undefined).finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  await broccoli.start();
  try {
    return await fn(broccoli);
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    await broccoli.stop({ drainTimeoutMs: 5000 });
  }
}

async function withQueue(options, fn) {
  return withBroccoli(options, async (broccoli) => {
    const queue = broccoli.createQueue({ namespace: "joy" });
    await queue.start();
    return fn(queue, broccoli);
  });
}

// ---------------------------------------------------------------- queue

async function runQueue(sub, positional, options) {
  const target = positional[0];
  if (sub === "drain") return drain(target, options);
  return withQueue(options, async (queue) => {
    switch (sub) {
      case "add": {
        const addOptions = {};
        if (options.key) addOptions.idempotencyKey = options.key;
        if (options.attempts !== undefined) addOptions.attempts = options.attempts;
        if (options["delay-ms"] !== undefined) addOptions.delayMs = options["delay-ms"];
        if (options.priority !== undefined) addOptions.priority = options.priority;
        return queue.add(target, loadJson(options) ?? {}, addOptions);
      }
      case "list": {
        const query = { limit: options.limit ?? 50 };
        if (options.name) query.queueName = options.name;
        if (options.state) query.state = options.state.split(",");
        return queue.getJobs(query);
      }
      case "get": {
        const job = queue.getJob(target);
        if (!job) throw notFound(`no job '${target}'`, "list jobs with: joy-trinity queue list");
        return job;
      }
      case "retry": return queue.retry(target);
      case "cancel": return queue.cancel(target);
      case "delete": return queue.delete(target);
      case "overview": return queue.getOverview();
      case "pause": return { changed: await queue.pause(target) };
      case "resume": return { changed: await queue.resume(target) };
      case "prune": return queue.prune(options["retention-ms"] === undefined ? {} : { retentionMs: options["retention-ms"] });
      default: throw new UsageError(`unknown queue subcommand '${sub}'`);
    }
  });
}

function notFound(message, hint) {
  const error = new Error(message);
  error.code = "NOT_FOUND";
  error.hint = hint;
  return error;
}

async function drain(name, options) {
  const handlerPath = resolve(options.handler);
  if (!existsSync(handlerPath)) throw new UsageError(`--handler file not found: ${handlerPath}`);
  const imported = await import(pathToFileURL(handlerPath).href);
  const handler = imported.default;
  if (typeof handler !== "function") throw new UsageError("--handler module must default-export a function", "e.g. `export default async (job) => ({ ok: true })`");
  const timeoutMs = options["timeout-ms"] ?? 60_000;
  return withQueue(options, async (queue) => {
    const worker = queue.process(name, handler, { concurrency: options.concurrency ?? 4 });
    await worker.start();
    const deadline = Date.now() + timeoutMs;
    const pending = () => {
      const counts = queue.getQueue(name)?.counts ?? {};
      return (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0);
    };
    while (pending() > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 25));
    return { drained: pending() === 0, counts: queue.getQueue(name)?.counts ?? {} };
  });
}

// ---------------------------------------------------------------- db

async function runDb(sub, positional, options) {
  const table = positional[0];
  return withBroccoli(options, async (broccoli) => {
    if (sub === "push") {
      const type = options.type ?? "upsert";
      const where = parseWhere(options.where);
      if ((type === "update" || type === "delete") && !where.length) throw new UsageError(`--type ${type} requires at least one --where`, "refusing to touch every row; pass e.g. --where id=1");
      const values = type === "delete" ? undefined : loadJson(options, true);
      if (values !== undefined && (values === null || typeof values !== "object" || Array.isArray(values))) throw new UsageError("row data must be a JSON object");
      await broccoli.db.push({
        type,
        table,
        ...(values ? { values } : {}),
        ...(where.length ? { where } : {}),
        ...(options.conflict ? { conflictTarget: options.conflict } : type === "upsert" ? { conflictTarget: "id" } : {})
      });
      await broccoli.db.flush();
      return { flushed: true, metrics: broccoli.db.getMetrics() };
    }
    const order = options.order ? options.order.split(":") : undefined;
    return broccoli.db.selectWhere(table, parseWhere(options.where), undefined, {
      ...(order ? { orderBy: { column: order[0], direction: order[1] === "desc" ? "desc" : "asc" } } : {}),
      ...(options.limit !== undefined ? { limit: options.limit } : {})
    });
  });
}

// ---------------------------------------------------------------- swarm

function readText(options, key) {
  return options[key] === "-" ? readStdin() : options[key];
}

async function runLedger(sub, positional, options) {
  return withBroccoli(options, async (broccoli) => {
    const { ledger } = createAgentSwarm({ db: broccoli.db, persistConfig: false });
    const formationId = positional[0];
    let result;
    switch (sub) {
      case "plan": {
        const data = loadJson(options) ?? {};
        const task = options.task ?? data.task ?? data.objective;
        if (!task) throw new UsageError("swarm plan requires --task (or --data with objective/task)");
        result = await ledger.create({
          ...data,
          task,
          ...(options.cwd ? { cwd: resolve(options.cwd) } : {}),
          ...(options.strategy ? { strategy: options.strategy } : {}),
          ...(options.max !== undefined ? { maxSpecialists: options.max } : {}),
          ...(options.file ? { targetFiles: options.file } : {}),
          ...(options.id ? { id: options.id } : {})
        });
        break;
      }
      case "next": result = await ledger.next(formationId, { claim: !options.peek, ...(options["stale-after-ms"] !== undefined ? { staleAfterMs: options["stale-after-ms"] } : {}) }); break;
      case "report": result = await ledger.report(formationId, options.assignment, { status: options.status, summary: readText(options, "summary") ?? "" }); break;
      case "retry": result = await ledger.retry(formationId, options.assignment); break;
      case "status": result = await ledger.status(formationId); break;
      case "list": result = await ledger.list(); break;
      case "finish": result = await ledger.finish(formationId); break;
      case "prune": result = await ledger.prune({ ...(options["older-than-ms"] !== undefined ? { olderThanMs: options["older-than-ms"] } : {}), includeOpen: Boolean(options["include-open"]) }); break;
      default: throw new UsageError(`unknown swarm subcommand '${sub}'`);
    }
    await broccoli.db.flush();
    return result;
  });
}

async function runSwarmProcesses(options) {
  let command;
  try {
    command = JSON.parse(options.exec);
  } catch {
    throw new UsageError("--exec must be a JSON array of strings", `e.g. --exec '["my-agent","--print"]'`);
  }
  if (!Array.isArray(command) || !command.length || command.some((part) => typeof part !== "string")) throw new UsageError("--exec must be a non-empty JSON array of strings");
  const cwd = resolve(options.cwd ?? ".");
  return withBroccoli(options, async (broccoli) => {
    const { knowledge } = createAgentSwarm({ db: broccoli.db, persistConfig: false });
    const engine = new ProcessAgentEngine({ command, cwd, ...(options["timeout-ms"] !== undefined ? { timeoutMs: options["timeout-ms"] } : {}) });
    const dispatcher = new AgentSwarmDispatcher({
      configService: { read: async () => ({ ...defaultAgentSwarmConfig, enabled: true }) },
      workspaceKnowledge: knowledge
    });
    const plan = classifyTaskForLegion({
      taskDescription: options.task,
      maxSpecialists: options.max ?? 4,
      ...(options.strategy ? { strategy: options.strategy } : {})
    });
    const outcome = await dispatcher.delegateSpecialistFormation(options.task, plan.assignments, engine);
    await broccoli.db.flush();
    return {
      status: outcome.status,
      reports: outcome.reports.map((r) => ({ id: r.id, role: r.role, status: r.status, ...(r.result ? { summary: r.result.tickResult.response } : {}), ...(r.reason ? { reason: r.reason } : {}), ...(r.attempts ? { attempts: r.attempts } : {}) }))
    };
  });
}

async function runKnowledge(positional, options) {
  const action = positional[0];
  if (action !== "store" && action !== "recall") throw new UsageError(`unknown knowledge action '${action}'`, "use: store | recall");
  if (action === "store" && !options.note?.length) throw new UsageError("swarm knowledge store requires at least one --note");
  return withBroccoli(options, async (broccoli) => {
    const { knowledge } = createAgentSwarm({ db: broccoli.db, persistConfig: false });
    const cwd = resolve(options.cwd);
    if (action === "store") {
      const stored = await knowledge.store(cwd, "joy-trinity", options.note);
      await broccoli.db.flush();
      return { stored, rejected: options.note.length - stored, hint: stored < options.note.length ? "notes are skipped when they look like secrets, contain control characters, exceed 500 characters, or already exist" : undefined };
    }
    return knowledge.recall(cwd);
  });
}

async function runSwarm(sub, positional, options) {
  if (sub === "classify") {
    return classifyTaskForLegion({
      taskDescription: options.task,
      ...(options.strategy ? { strategy: options.strategy } : {}),
      ...(options.max !== undefined ? { maxSpecialists: options.max } : {}),
      ...(options.file ? { targetFiles: options.file } : {})
    });
  }
  if (sub === "config") return createAgentSwarm({ persistConfig: true }).config.read();
  if (sub === "knowledge") return runKnowledge(positional, options);
  if (sub === "run") return runSwarmProcesses(options);
  return runLedger(sub, positional, options);
}

// ---------------------------------------------------------------- selftest & doctor

async function selftest() {
  const root = mkdtempSync(join(tmpdir(), "joy-trinity-"));
  const checks = {};
  const broccoli = createPortableBroccoli({ workspaceRoot: root, exclusive: true });
  try {
    await broccoli.start();
    const queue = broccoli.createQueue({ namespace: "selftest" });
    await queue.start();
    const worker = queue.process("ping", async (job) => ({ pong: job.data.n }), { concurrency: 1 });
    await worker.start();
    const job = await queue.add("ping", { n: 1 });
    const end = Date.now() + 5000;
    while (queue.getJob(job.id).state !== "completed" && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    checks.queue = queue.getJob(job.id).state === "completed";
    await broccoli.db.push({ type: "upsert", table: "t", values: { id: "a", n: 1 }, conflictTarget: "id" });
    await broccoli.db.flush();
    checks.bufferedDb = (await broccoli.db.selectOne("t", { column: "id", value: "a" }))?.n === 1;
    checks.agentSwarm = classifyTaskForLegion({ taskDescription: "fix the failing test in src/a.ts" }).assignments.length >= 1;
    const { ledger } = createAgentSwarm({ db: broccoli.db, persistConfig: false });
    await ledger.create({ objective: "selftest", task: "fix the failing test in src/a.ts", id: "selftest" });
    checks.formationLedger = (await ledger.next("selftest")).ready.length >= 1;
  } finally {
    await broccoli.stop({ drainTimeoutMs: 2000 }).catch(() => undefined);
    rmSync(root, { recursive: true, force: true });
  }
  if (!Object.values(checks).every(Boolean)) throw new Error(`selftest failed: ${JSON.stringify(checks)}`);
  return { checks, node: process.version };
}

async function doctor(options) {
  const checks = [];
  const add = (name, status, detail, fix) => checks.push({ name, status, detail, ...(fix ? { fix } : {}) });
  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 18 ? "ok" : "fail", `Node.js ${process.version}`, major >= 18 ? undefined : "install Node.js 18 or newer");
  const root = stateRoot(options);
  try {
    mkdirSync(root, { recursive: true });
    const probe = join(root, `.doctor-${process.pid}`);
    writeFileSync(probe, "ok");
    rmSync(probe);
    add("state-directory", "ok", `${root} is writable`);
  } catch (error) {
    add("state-directory", "fail", `${root}: ${error.message}`, "choose a writable directory with --root or $JOY_STATE_ROOT");
    return { ok: false, root, checks };
  }
  const lockFile = join(root, LOCK_FILE_NAME);
  if (existsSync(lockFile)) {
    let holder = null;
    try { holder = JSON.parse(readFileSync(lockFile, "utf8")); } catch { /* unreadable */ }
    let alive = false;
    if (holder?.pid) { try { process.kill(holder.pid, 0); alive = true; } catch (error) { alive = error.code === "EPERM"; } }
    if (alive) add("lock", "warn", `held by live pid ${holder.pid} since ${new Date(holder.startedAt).toISOString()}`, "wait for it to finish, or stop that process");
    else add("lock", "warn", "stale lock from a process that no longer exists", "nothing to do: the next command reclaims it automatically");
  } else add("lock", "ok", "no other process is using this state directory");
  try {
    await withBroccoli({ ...options, "lock-timeout-ms": options["lock-timeout-ms"] ?? 1000 }, async (broccoli) => {
      const health = await broccoli.kernel.health();
      add("storage", String(health.status ?? "healthy").toLowerCase() === "healthy" ? "ok" : "warn", `BroccoliDB: ${JSON.stringify(health).slice(0, 200)}`);
    });
  } catch (error) {
    if (error instanceof RootLockedError) add("storage", "warn", "skipped: state directory is in use", "re-run when the other process finishes");
    else add("storage", "fail", error.message, "if the message mentions a checkpoint or WAL integrity error, restore the directory from a backup or move it aside to start fresh");
  }
  try {
    const store = new FileSwarmConfigStore();
    const raw = await store.read();
    if (raw === undefined) add("swarm-config", "ok", `no config file (defaults apply): ${store.file}`);
    else if (raw === null || typeof raw !== "object" || Array.isArray(raw)) add("swarm-config", "warn", `${store.file} is unreadable; the swarm fails closed (disabled)`, `fix or delete ${store.file}`);
    else add("swarm-config", "ok", `${store.file} is valid`);
  } catch (error) {
    add("swarm-config", "warn", error.message);
  }
  return { ok: !checks.some((c) => c.status === "fail"), root, checks };
}

// ---------------------------------------------------------------- dispatch

function resolveFormat(options) {
  const format = options.format ?? process.env.JOY_FORMAT ?? "json";
  if (!FORMATS.includes(format)) throw new UsageError(`--format must be one of ${FORMATS.join(", ")}, got '${format}'`);
  return format;
}

async function main(argv) {
  const { path, spec, positionals, options } = parseArgv(argv);
  const format = resolveFormat(options);
  if (options.version) return { format, command: "version", result: createRequire(import.meta.url)("../package.json").version };
  if (path[0] === "help") {
    const tokens = positionals.slice(0, 2);
    const resolved = [];
    let level = { subcommands: COMMANDS };
    for (const token of tokens) {
      if (!level.subcommands?.[token]) throw new UsageError(`no help topic '${token}'`, `commands: ${Object.keys(COMMANDS).join(", ")}`);
      resolved.push(token);
      level = level.subcommands[token];
    }
    return { format, help: renderHelp(resolved) };
  }
  if (options.help || path.length === 0) return { format, help: renderHelp(path) };
  if (spec.subcommands) throw new UsageError(`'${path.join(" ")}' needs a subcommand`, `available: ${Object.keys(spec.subcommands).join(", ")} (see: joy-trinity ${path.join(" ")} --help)`);
  validateInvocation(spec, path, positionals, options);
  const command = path.join(" ");
  const [top, sub] = path;
  let result;
  switch (top) {
    case "selftest": result = await selftest(); break;
    case "doctor": result = await doctor(options); break;
    case "completion": return { format, raw: renderCompletion(positionals[0]) };
    case "queue": result = await runQueue(sub, positionals, options); break;
    case "db": result = await runDb(sub, positionals, options); break;
    case "swarm": result = await runSwarm(sub, positionals, options); break;
    default: throw new UsageError(`unknown command '${top}'`);
  }
  return { format, command, result };
}

const requestedFormat = (() => {
  const index = process.argv.indexOf("--format");
  const value = index !== -1 ? process.argv[index + 1] : process.env.JOY_FORMAT;
  return FORMATS.includes(value) ? value : "json";
})();

try {
  const outcome = await main(process.argv.slice(2));
  if (outcome.help !== undefined) process.stdout.write(`${outcome.help}\n`);
  else if (outcome.raw !== undefined) process.stdout.write(outcome.raw);
  else {
    process.stdout.write(formatSuccess(outcome.format, outcome.command, outcome.result));
    if (outcome.command === "doctor" && outcome.result.ok === false) process.exitCode = EXIT_FAILURE;
  }
} catch (error) {
  const usage = error instanceof UsageError;
  // Machine-readable codes: explicit `error.code`, else a leading `CODE:` prefix on the message, else FAILURE.
  const prefix = /^([A-Z][A-Z0-9_]{2,}): /.exec(error.message ?? "")?.[1];
  const code = usage ? "USAGE" : error instanceof RootLockedError ? "ROOT_LOCKED" : typeof error.code === "string" && /^[A-Z][A-Z0-9_]+$/.test(error.code) ? error.code : prefix ?? "FAILURE";
  const failure = formatFailure(requestedFormat, process.argv.slice(2).filter((a) => !a.startsWith("-")).slice(0, 2).join(" "), code, error.message, error.hint);
  process[failure.stream].write(failure.text);
  process.exitCode = usage ? EXIT_USAGE : EXIT_FAILURE;
}
