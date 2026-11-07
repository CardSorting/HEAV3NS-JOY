/** [LAYER: INFRASTRUCTURE] */
/**
 * `ISwarmAgentEngine` adapter that runs each specialist as an **external process**, so any
 * command-line agent (or script) can serve as the swarm's workforce without being integrated:
 * the specialist prompt is written to the process's stdin (and to a file whose path is exported as
 * `JOY_SWARM_PROMPT_FILE`); the process's stdout becomes the specialist's report.
 *
 * Outcome mapping: exit 0 → `completed`; non-zero exit, signal, or timeout → `failed` (retry safety
 * unknown, so the dispatcher will not replay it); a command that could not even be spawned →
 * `failed` with `safeToRetry: true`. `shouldDefer` is not observed: an OS process has no safe boundary
 * to yield at, so hierarchy-defer settles only after running specialists finish.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ISwarmAgentEngine } from "../domain/interfaces/ISwarmAgentEngine.mjs";

const MAX_OUTPUT_BYTES = 1_000_000;
const KILL_GRACE_MS = 5000;

export class ProcessAgentEngine extends ISwarmAgentEngine {
  #command;
  #cwd;
  #env;
  #timeoutMs;
  #killGraceMs;
  sessionContext;

  /**
   * @param {{
   *   command: string[],
   *   cwd?: string,
   *   env?: Record<string, string | undefined>,
   *   timeoutMs?: number,
   *   killGraceMs?: number,
   *   sessionId?: string
   * }} options `command` is an argv array (no shell is involved, so prompts can never be interpreted as shell syntax).
   */
  constructor(options) {
    super();
    if (!options || !Array.isArray(options.command) || options.command.length === 0 || options.command.some((part) => typeof part !== "string")) {
      throw new Error("ProcessAgentEngine requires `command` as a non-empty argv array of strings");
    }
    this.#command = options.command;
    this.#cwd = options.cwd;
    this.#env = options.env ?? process.env;
    this.#timeoutMs = options.timeoutMs ?? 600_000;
    this.#killGraceMs = options.killGraceMs ?? KILL_GRACE_MS;
    this.sessionContext = { sessionId: options.sessionId ?? `process-swarm-${Date.now()}`, ...(options.cwd ? { cwd: options.cwd } : {}) };
  }

  createSnapshot() {
    return {};
  }

  forkSession(childSessionId, checkpoint) {
    const transcript = checkpoint?.transcriptJsonl
      ? checkpoint.transcriptJsonl.split("\n").filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean)
      : [];
    const messages = [...transcript];
    const run = (request) => this.#run(childSessionId, request, messages);
    return {
      tick: run,
      sessionStore: {
        getTranscript: () => messages,
        getMessages: () => messages,
        exportJsonl: () => messages.map((m) => JSON.stringify(m)).join("\n")
      }
    };
  }

  async #run(childSessionId, request, messages) {
    messages.push({ role: "user", content: request.prompt, timestamp: Date.now() });
    const scratch = await mkdtemp(join(tmpdir(), "joy-swarm-"));
    const promptFile = join(scratch, "prompt.txt");
    try {
      await writeFile(promptFile, request.prompt, { mode: 0o600 });
      const outcome = await this.#spawn(childSessionId, request, promptFile);
      messages.push({ role: "assistant", content: outcome.response, timestamp: Date.now() });
      return outcome;
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }

  #spawn(childSessionId, request, promptFile) {
    return new Promise((resolve) => {
      const [file, ...args] = this.#command;
      let child;
      try {
        child = spawn(file, args, {
          cwd: this.#cwd,
          env: { ...this.#env, JOY_SWARM_SESSION_ID: childSessionId, JOY_SWARM_PROMPT_FILE: promptFile },
          stdio: ["pipe", "pipe", "pipe"],
          signal: request.signal
        });
      } catch (error) {
        resolve({ outcome: "failed", response: `could not start command: ${error.message}`, toolResults: [], safeToRetry: true });
        return;
      }
      let out = "";
      let err = "";
      let spawned = false;
      let timedOut = false;
      const cap = (current, chunk) => (current.length < MAX_OUTPUT_BYTES ? current + chunk : current);
      child.on("spawn", () => { spawned = true; });
      child.stdout.setEncoding("utf8").on("data", (chunk) => { out = cap(out, chunk); });
      child.stderr.setEncoding("utf8").on("data", (chunk) => { err = cap(err, chunk); });
      child.stdin.on("error", () => undefined);
      let killTimer;
      const terminate = () => {
        child.kill("SIGTERM");
        // A child that ignores SIGTERM must not hang the swarm forever.
        killTimer = setTimeout(() => child.kill("SIGKILL"), this.#killGraceMs);
        killTimer.unref?.();
      };
      const timer = setTimeout(() => { timedOut = true; terminate(); }, this.#timeoutMs);
      timer.unref?.();
      child.on("error", (error) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        resolve({ outcome: "failed", response: `command error: ${error.message}`, toolResults: [], safeToRetry: !spawned });
      });
      child.on("close", (code, signal) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        if (code === 0) resolve({ outcome: "completed", response: out.trim(), toolResults: [] });
        else resolve({
          outcome: "failed",
          response: (out.trim() || err.trim() || `command ended with ${timedOut ? "timeout" : signal ? `signal ${signal}` : `exit code ${code}`}`).slice(0, 4000),
          toolResults: [],
          safeToRetry: false
        });
      });
      child.stdin.end(request.prompt);
    });
  }
}
