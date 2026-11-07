/** [LAYER: INFRASTRUCTURE] */
/**
 * Runs the joy CLIs as child processes for the MCP server. No shell is involved (argv array),
 * the environment is an allow-list (agents' secrets are not forwarded), output is size-capped,
 * and each run honors a timeout and an abort signal (SIGTERM, then SIGKILL).
 */

import { spawn } from "node:child_process";

const MAX_OUTPUT = 2_000_000;
const ENV_ALLOW = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TEMP", "TMP", "SystemRoot", "NODE_OPTIONS", "NO_COLOR", "LANG", "LC_ALL"];

export class ProcessToolRunner {
  #scripts;
  #cwd;
  #env;
  #killGraceMs;

  /**
   * @param {{ scripts: { check: string, trinity: string }, cwd: string, env?: Record<string, string | undefined>, killGraceMs?: number }} options
   */
  constructor(options) {
    this.#scripts = options.scripts;
    this.#cwd = options.cwd;
    const source = options.env ?? process.env;
    this.#env = Object.fromEntries(Object.entries(source).filter(([k, v]) => v !== undefined && (ENV_ALLOW.includes(k) || k.startsWith("JOY_"))));
    this.#killGraceMs = options.killGraceMs ?? 3000;
  }

  /** @returns {Promise<{ code: number, stdout: string, stderr: string }>} */
  run(cli, argv, { signal, timeoutMs }) {
    const script = this.#scripts[cli];
    if (!script) return Promise.reject(new Error(`unknown cli '${cli}'`));
    return new Promise((resolve, reject) => {
      const extra = cli === "trinity" ? ["--format", "json"] : [];
      const child = spawn(process.execPath, [script, ...argv, ...extra], { cwd: this.#cwd, env: this.#env, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      let killTimer;
      let reason = null;
      const stop = (why) => {
        if (reason) return;
        reason = why;
        child.kill("SIGTERM");
        killTimer = setTimeout(() => child.kill("SIGKILL"), this.#killGraceMs);
        killTimer.unref?.();
      };
      const timer = setTimeout(() => stop(`timed out after ${timeoutMs} ms`), timeoutMs);
      const onAbort = () => stop(signal.reason?.message ?? "aborted");
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
      const cap = (current, chunk) => (current.length < MAX_OUTPUT ? current + chunk : current);
      child.stdout.setEncoding("utf8").on("data", (c) => { stdout = cap(stdout, c); });
      child.stderr.setEncoding("utf8").on("data", (c) => { stderr = cap(stderr, c); });
      child.on("error", (error) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        reject(error);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        clearTimeout(killTimer);
        signal.removeEventListener("abort", onAbort);
        if (reason) reject(new Error(reason));
        else resolve({ code: code ?? 1, stdout, stderr });
      });
    });
  }
}
