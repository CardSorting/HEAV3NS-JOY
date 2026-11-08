/** [LAYER: UI] */
/**
 * Command model for `joy-trinity` (queue, db, swarm). Parsing, validation, help, suggestions, and
 * completion come from the shared `cliKit`; this file is only the declarative command table.
 */

import { createCli, UsageError, suggest } from "./cliKit.mjs";

export { UsageError, suggest };

const DATA_OPTIONS = {
  data: { type: "string", description: "JSON document, or `-` to read it from stdin" },
  "data-file": { type: "string", description: "path of a file containing the JSON document" }
};

export const GLOBAL_OPTIONS = /** @type {Record<string, OptionSpec>} */ ({
  root: { type: "string", description: "state directory (default $JOY_STATE_ROOT or ./.joy-state)" },
  format: { type: "string", values: ["json", "ndjson", "text"], description: "output format (default $JOY_FORMAT or json)" },
  "lock-timeout-ms": { type: "int", description: "how long to wait for another process using the same --root (default 10000)" },
  help: { type: "flag", description: "show help for the command" },
  version: { type: "flag", description: "print the version" }
});

/** @type {Record<string, CommandSpec>} */
export const COMMANDS = {
  selftest: {
    summary: "Prove queue, BufferedDb, and swarm planning work in a throwaway directory",
    examples: ["joy-trinity selftest"]
  },
  doctor: {
    summary: "Diagnose the environment and a state directory, with fixes for anything wrong",
    examples: ["joy-trinity doctor", "joy-trinity doctor --root ./.joy-state"]
  },
  completion: {
    summary: "Print a shell completion script",
    args: [{ name: "shell", description: "bash | zsh", required: true }],
    examples: ["source <(joy-trinity completion bash)"]
  },
  help: {
    summary: "Show help for a command",
    args: [{ name: "command", description: "e.g. `queue` or `queue add`" }]
  },
  queue: {
    summary: "Durable job queue (BroccoliQueue): enqueue, inspect, manage, drain",
    subcommands: {
      add: {
        summary: "Enqueue a durable job (idempotent with --key)",
        args: [{ name: "name", description: "queue/job name", required: true }],
        options: {
          ...DATA_OPTIONS,
          key: { type: "string", description: "idempotency key: re-adding the same key returns the original job" },
          attempts: { type: "int", description: "maximum delivery attempts" },
          "delay-ms": { type: "int", description: "delay before the job becomes ready" },
          priority: { type: "int", description: "higher runs first" }
        },
        examples: [`joy-trinity queue add email --data '{"to":"ada"}' --key welcome:ada`]
      },
      list: {
        summary: "List jobs",
        options: {
          name: { type: "string", description: "only this queue" },
          state: { type: "string", description: "comma list of waiting,delayed,active,completed,failed,cancelled" },
          limit: { type: "int", description: "page size (default 50, max 500)" }
        },
        examples: ["joy-trinity queue list --state failed --limit 10"]
      },
      get: { summary: "Show one job", args: [{ name: "id", required: true }] },
      retry: { summary: "Move a failed or cancelled job back to waiting", args: [{ name: "id", required: true }] },
      cancel: { summary: "Cancel a job", args: [{ name: "id", required: true }] },
      delete: { summary: "Delete a terminal job record", args: [{ name: "id", required: true }] },
      overview: { summary: "Counts per state, queue, and worker" },
      pause: { summary: "Stop claiming jobs from a queue", args: [{ name: "name", required: true }] },
      resume: { summary: "Resume a paused queue", args: [{ name: "name", required: true }] },
      prune: {
        summary: "Delete old terminal jobs",
        options: { "retention-ms": { type: "int", description: "keep terminal jobs newer than this" } }
      },
      drain: {
        summary: "Process jobs with a handler module until the queue is empty",
        args: [{ name: "name", required: true }],
        options: {
          handler: { type: "string", required: true, description: "module whose default export is `async (job, { signal }) => result`" },
          "timeout-ms": { type: "int", description: "give up after this long (default 60000)" },
          concurrency: { type: "int", description: "parallel handlers (default 4)" }
        },
        examples: ["joy-trinity queue drain email --handler ./handler.mjs"]
      }
    }
  },
  db: {
    summary: "Buffered tables (BufferedDb): write and read rows",
    subcommands: {
      push: {
        summary: "Write a row (default upsert by id) and flush it",
        args: [{ name: "table", required: true }],
        options: {
          ...DATA_OPTIONS,
          type: { type: "string", values: ["insert", "upsert", "update", "delete"], description: "operation (default upsert)" },
          where: { type: "multi", description: "col=val (also != < <= > >=); repeatable; required for update/delete" },
          conflict: { type: "string", description: "upsert conflict column (default id)" }
        },
        examples: [`joy-trinity db push docs --data '{"id":"1","title":"hi"}'`, "joy-trinity db push docs --type delete --where id=1"]
      },
      select: {
        summary: "Read rows",
        args: [{ name: "table", required: true }],
        options: {
          where: { type: "multi", description: "col=val (also != < <= > >=); repeatable" },
          limit: { type: "int", description: "maximum rows" },
          order: { type: "string", description: "column or column:desc" }
        },
        examples: ["joy-trinity db select docs --where id=1 --order title:desc --limit 10"]
      }
    }
  },
  swarm: {
    summary: "Specialist swarm: plan, drive step by step, or run external agents",
    subcommands: {
      classify: {
        summary: "Choose a specialist roster for a task (no state is written)",
        options: {
          task: { type: "string", required: true, description: "what to achieve" },
          strategy: { type: "string", values: ["adaptive", "tactical_strike", "balanced_squad", "full_legion", "verification_heavy"], description: "roster strategy (default adaptive)" },
          max: { type: "int", description: "maximum specialists (1-8, default 4)" },
          file: { type: "multi", description: "relevant file path; repeatable" }
        },
        examples: [`joy-trinity swarm classify --task "fix the flaky test in src/a.ts"`]
      },
      config: { summary: "Show the effective swarm configuration" },
      plan: {
        summary: "Create a durable, dependency-ordered formation",
        options: {
          task: { type: "string", description: "what to achieve (or pass --data with objective/assignments)" },
          cwd: { type: "string", description: "workspace the formation belongs to (scopes learned heuristics)" },
          strategy: { type: "string", values: ["adaptive", "tactical_strike", "balanced_squad", "full_legion", "verification_heavy"], description: "roster strategy" },
          max: { type: "int", description: "maximum specialists" },
          file: { type: "multi", description: "relevant file path; repeatable" },
          id: { type: "string", description: "formation id (default generated)" },
          ...DATA_OPTIONS
        },
        examples: [`joy-trinity swarm plan --task "add retry to the uploader" --cwd . --id f1`]
      },
      next: {
        summary: "Claim ready specialists; each comes with a complete prompt",
        args: [{ name: "formation", required: true }],
        options: {
          peek: { type: "flag", description: "look without claiming or changing anything" },
          "stale-after-ms": { type: "int", description: "flag running specialists with no report after this long (default 1800000)" }
        },
        examples: ["joy-trinity swarm next f1"]
      },
      report: {
        summary: "Record a claimed specialist's outcome",
        args: [{ name: "formation", required: true }],
        options: {
          assignment: { type: "string", required: true, description: "specialist id from `next`" },
          status: { type: "string", required: true, values: ["completed", "failed"], description: "outcome" },
          summary: { type: "string", description: "findings and evidence; `-` reads stdin. Add `Heuristic: <fact>` lines to teach later runs" }
        },
        examples: [`joy-trinity swarm report f1 --assignment legion_architect --status completed --summary "Design done"`]
      },
      retry: {
        summary: "Reset a failed, skipped, or abandoned specialist (and skipped dependents)",
        args: [{ name: "formation", required: true }],
        options: { assignment: { type: "string", required: true, description: "specialist id" } }
      },
      status: { summary: "Show one formation", args: [{ name: "formation", required: true }] },
      list: { summary: "List formations, newest first" },
      finish: { summary: "Close a formation: escaped handoff plus every report", args: [{ name: "formation", required: true }] },
      prune: {
        summary: "Delete finished formations",
        options: {
          "older-than-ms": { type: "int", description: "age threshold (default 7 days)" },
          "include-open": { type: "flag", description: "also delete unfinished formations past the threshold" }
        }
      },
      run: {
        summary: "Run specialists as external processes (prompt on stdin; stdout is the report)",
        options: {
          task: { type: "string", required: true, description: "what to achieve" },
          exec: { type: "string", required: true, description: 'JSON argv array, e.g. \'["my-agent","--print"]\' (no shell is used)' },
          cwd: { type: "string", description: "working directory for specialists (default .)" },
          max: { type: "int", description: "maximum specialists" },
          strategy: { type: "string", values: ["adaptive", "tactical_strike", "balanced_squad", "full_legion", "verification_heavy"], description: "roster strategy" },
          "timeout-ms": { type: "int", description: "per-specialist timeout (default 600000)" }
        },
        examples: [`joy-trinity swarm run --task "audit the auth module" --exec '["my-agent","--print"]'`]
      },
      knowledge: {
        summary: "Store, recall, search, or prune workspace heuristics",
        args: [{ name: "action", description: "store | recall | search | prune", required: true }],
        options: {
          cwd: { type: "string", required: true, description: "workspace directory" },
          note: { type: "multi", description: "heuristic to store; repeatable" },
          query: { type: "string", description: "case-insensitive filter substring for recall, search, or prune" },
          all: { type: "flag", description: "with prune, remove all heuristics for this workspace" }
        },
        examples: [
          `joy-trinity swarm knowledge store --cwd . --note "run npm run verify before committing"`,
          `joy-trinity swarm knowledge search --cwd . --query "verify"`,
          `joy-trinity swarm knowledge prune --cwd .`
        ]
      }
    }
  }
};

const cli = createCli({
  name: "joy-trinity",
  tagline: "durable queue, buffered tables, and specialist swarms from any shell (zero dependencies)",
  commands: COMMANDS,
  globalOptions: GLOBAL_OPTIONS,
  gettingStarted: ["joy-trinity selftest        confirm everything works here", "joy-trinity doctor          diagnose the environment and state directory", "joy-trinity <command> --help   details and examples for any command"],
  outputNotes: ["json (default): exactly one JSON document on stdout; ndjson: one document per line; text: human-readable.", "Errors never go to stdout as prose in json mode: {\"ok\":false,\"error\":{\"code\",\"message\",\"hint\"}}."],
  exitCodes: "0 success   1 runtime failure (read error.message)   2 usage error (fix the command; never treat as success)"
});

export const { parseArgv, validateInvocation, renderHelp, renderCompletion } = cli;
