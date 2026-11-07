/** [LAYER: UI] */
/**
 * Declarative CLI toolkit shared by `joy` and `joy-trinity`: one command model drives parsing,
 * validation, per-command help, "did you mean" suggestions, and shell completion, following the
 * conventions people already know from `git`, `docker`, and `npm`
 * (`tool <command> <subcommand> [args] [--options]`, `--help` at any depth, `--opt value` or
 * `--opt=value`, `--` to end options, exit `2` for usage errors).
 *
 * @typedef {{ type: "string" | "int" | "flag" | "multi", description: string, required?: boolean, values?: string[] }} OptionSpec
 * @typedef {{ name: string, description?: string, required?: boolean, variadic?: boolean }} ArgSpec
 * @typedef {{ summary: string, args?: ArgSpec[], options?: Record<string, OptionSpec>, examples?: string[], subcommands?: Record<string, CommandSpec>, hidden?: boolean }} CommandSpec
 * @typedef {{ name: string, tagline: string, commands: Record<string, CommandSpec>, globalOptions: Record<string, OptionSpec>, gettingStarted?: string[], outputNotes?: string[], exitCodes?: string }} CliConfig
 */

import { levenshteinDistance } from "../plumbing/pathUtils.mjs";

export class UsageError extends Error {
  /** @param {string} message @param {string} [hint] */
  constructor(message, hint) {
    super(message);
    this.name = "UsageError";
    this.hint = hint;
  }
}

/**
 * Suggests the closest candidate to `input`, or undefined when nothing is plausibly meant.
 * @param {string} input @param {Iterable<string>} candidates
 */
export function suggest(input, candidates) {
  let best;
  let bestDistance = Infinity;
  for (const candidate of candidates) {
    if (candidate.startsWith(input) && input.length >= 2) return candidate;
    const distance = levenshteinDistance(input, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best !== undefined && bestDistance <= Math.max(2, Math.floor(input.length / 3)) ? best : undefined;
}

function coerceValue(name, def, raw) {
  if (def.type === "int") {
    if (!/^-?\d+$/.test(raw)) throw new UsageError(`--${name} must be an integer, got '${raw}'`);
    return Number(raw);
  }
  if (def.values && !def.values.includes(raw)) {
    const near = suggest(raw, def.values);
    throw new UsageError(`--${name} must be one of ${def.values.join(", ")}, got '${raw}'`, near ? `did you mean '${near}'?` : undefined);
  }
  return raw;
}

function pad(rows) {
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`).join("\n");
}

function optionRow(name, def) {
  const value = def.type === "flag" ? "" : def.type === "int" ? " <n>" : def.values ? ` <${def.values.join("|")}>` : " <value>";
  const extras = [def.required ? "required" : "", def.type === "multi" ? "repeatable" : ""].filter(Boolean).join(", ");
  return [`--${name}${value}`, `${def.description}${extras ? ` (${extras})` : ""}`];
}

/**
 * Builds the parser, validator, help renderer, and completion generator for one CLI.
 * @param {CliConfig} config
 */
export function createCli(config) {
  const { name, commands, globalOptions } = config;
  const allOptions = (spec) => ({ ...globalOptions, ...(spec?.options ?? {}) });
  const helpHint = (path) => `run: ${[name, ...path, "--help"].join(" ")}`;

  function usageLine(path, spec) {
    const args = (spec.args ?? []).map((a) => (a.required ? `<${a.name}${a.variadic ? "..." : ""}>` : `[${a.name}${a.variadic ? "..." : ""}]`)).join(" ");
    const required = Object.entries(spec.options ?? {}).filter(([, d]) => d.required).map(([n, d]) => (d.type === "flag" ? `--${n}` : `--${n} <${n}>`)).join(" ");
    const hasOptional = Object.values(spec.options ?? {}).some((d) => !d.required);
    return [path.join(" "), args, required, hasOptional ? "[options]" : ""].filter(Boolean).join(" ");
  }

  /**
   * Parses `argv` against the command model.
   * @param {string[]} argv
   * @returns {{ path: string[], spec: CommandSpec | null, positionals: string[], options: Record<string, any> }}
   */
  function parseArgv(argv) {
    const options = {};
    const positionals = [];
    const path = [];
    let spec = null;
    let level = { subcommands: commands };
    let literalRest = false;

    const takeOption = (token, index) => {
      const body = token.slice(2);
      const eq = body.indexOf("=");
      const optionName = eq === -1 ? body : body.slice(0, eq);
      const known = allOptions(spec);
      const def = known[optionName];
      if (!def) {
        const near = suggest(optionName, Object.keys(known));
        throw new UsageError(`unknown option --${optionName}${path.length ? ` for '${path.join(" ")}'` : ""}`, near ? `did you mean --${near}?` : helpHint(path));
      }
      if (def.type === "flag") {
        if (eq !== -1) throw new UsageError(`--${optionName} does not take a value`);
        options[optionName] = true;
        return index;
      }
      let raw;
      let next = index;
      if (eq !== -1) raw = body.slice(eq + 1);
      else {
        raw = argv[index + 1];
        next = index + 1;
        if (raw === undefined) throw new UsageError(`option --${optionName} requires a value`);
      }
      const value = coerceValue(optionName, def, raw);
      if (def.type === "multi") (options[optionName] ??= []).push(value);
      else options[optionName] = value;
      return next;
    };

    for (let i = 0; i < argv.length; i++) {
      const token = argv[i];
      if (literalRest) { positionals.push(token); continue; }
      if (token === "--") { literalRest = true; continue; }
      if (token === "-h") { options.help = true; continue; }
      if (token === "-v") { options.version = true; continue; }
      if (token.startsWith("--")) { i = takeOption(token, i); continue; }
      if (level.subcommands && path.length < 2 && positionals.length === 0) {
        const next = level.subcommands[token];
        if (!next) {
          if (options.help || options.version) continue;
          const visible = Object.entries(level.subcommands).filter(([, c]) => !c.hidden).map(([n]) => n);
          const near = suggest(token, visible);
          throw new UsageError(`unknown ${path.length ? "subcommand" : "command"} '${token}'${path.length ? ` for '${path.join(" ")}'` : ""}`, near ? `did you mean '${[...path, near].join(" ")}'?` : helpHint(path));
        }
        path.push(token);
        spec = next;
        level = next;
        continue;
      }
      positionals.push(token);
    }
    return { path, spec, positionals, options };
  }

  /**
   * Validates positionals and required options for a resolved leaf command.
   * @param {CommandSpec} spec @param {string[]} path @param {string[]} positionals @param {Record<string, any>} options
   */
  function validateInvocation(spec, path, positionals, options) {
    const usage = `${name} ${usageLine(path, spec)}`;
    const args = spec.args ?? [];
    const required = args.filter((a) => a.required).length;
    if (positionals.length < required) throw new UsageError(`missing <${args[positionals.length].name}> for '${path.join(" ")}'`, `usage: ${usage}`);
    const variadic = args.some((a) => a.variadic);
    if (!variadic && positionals.length > args.length) throw new UsageError(`unexpected argument '${positionals[args.length]}' for '${path.join(" ")}'`, `usage: ${usage}`);
    for (const [optionName, def] of Object.entries(spec.options ?? {})) {
      if (def.required && options[optionName] === undefined) throw new UsageError(`missing required option --${optionName} for '${path.join(" ")}'`, `usage: ${usage}`);
    }
  }

  /**
   * Renders help for a command path (empty path = top-level help).
   * @param {string[]} [path]
   */
  function renderHelp(path = []) {
    let spec = { subcommands: commands };
    for (const part of path) spec = spec.subcommands[part];
    const lines = [];
    const visible = (entries) => entries.filter(([, c]) => !c.hidden);
    if (!path.length) {
      lines.push(`${name} — ${config.tagline}`, "", "USAGE", `  ${name} <command> [subcommand] [args] [options]`, "");
      lines.push("COMMANDS", pad(visible(Object.entries(commands)).map(([n, c]) => [n, c.summary])), "");
      if (config.gettingStarted?.length) lines.push("GETTING STARTED", ...config.gettingStarted.map((l) => `  ${l}`), "");
    } else if (spec.subcommands) {
      lines.push(`${name} ${path.join(" ")} — ${spec.summary}`, "", "USAGE", `  ${name} ${path.join(" ")} <subcommand> [args] [options]`, "");
      lines.push("SUBCOMMANDS", pad(visible(Object.entries(spec.subcommands)).map(([n, c]) => [n, c.summary])), "");
    } else {
      lines.push(`${name} ${path.join(" ")} — ${spec.summary}`, "", "USAGE", `  ${name} ${usageLine(path, spec)}`, "");
      if (spec.args?.length) lines.push("ARGUMENTS", pad(spec.args.map((a) => [`<${a.name}${a.variadic ? "..." : ""}>`, a.description ?? ""])), "");
      if (spec.options) lines.push("OPTIONS", pad(Object.entries(spec.options).map(([n, d]) => optionRow(n, d))), "");
      if (spec.examples?.length) lines.push("EXAMPLES", ...spec.examples.map((e) => `  ${e}`), "");
    }
    lines.push("GLOBAL OPTIONS", pad(Object.entries(globalOptions).map(([n, d]) => optionRow(n, d))), "");
    if (config.outputNotes?.length) lines.push("OUTPUT", ...config.outputNotes.map((l) => `  ${l}`), "");
    lines.push("EXIT CODES", `  ${config.exitCodes ?? "0 success   1 runtime failure (read the message)   2 usage error (fix the command; never treat as success)"}`, "");
    return lines.join("\n");
  }

  /**
   * Generates a bash (or zsh via bashcompinit) completion script.
   * @param {"bash" | "zsh"} shell
   */
  function renderCompletion(shell) {
    if (shell !== "bash" && shell !== "zsh") throw new UsageError(`unsupported shell '${shell}'`, "supported: bash, zsh");
    const fn = `_${name.replace(/[^A-Za-z0-9]/g, "_")}`;
    const globals = Object.keys(globalOptions).map((n) => `--${n}`);
    const cases = [];
    for (const [cmd, spec] of Object.entries(commands)) {
      if (spec.hidden) continue;
      if (spec.subcommands) {
        const subs = Object.keys(spec.subcommands).join(" ");
        const inner = Object.entries(spec.subcommands).map(([sub, s]) => `        ${sub}) opts="${[...Object.keys(s.options ?? {}).map((o) => `--${o}`), ...globals].join(" ")}";;`).join("\n");
        cases.push(`    ${cmd})\n      if [ "$COMP_CWORD" -eq 2 ]; then COMPREPLY=($(compgen -W "${subs}" -- "$cur")); return; fi\n      case "$sub" in\n${inner}\n        *) opts="${globals.join(" ")}";;\n      esac;;`);
      } else {
        cases.push(`    ${cmd}) opts="${[...Object.keys(spec.options ?? {}).map((o) => `--${o}`), ...globals].join(" ")}";;`);
      }
    }
    return [
      ...(shell === "zsh" ? ["autoload -U +X bashcompinit && bashcompinit"] : []),
      `${fn}() {`,
      "  local cur=\"${COMP_WORDS[COMP_CWORD]}\" cmd=\"${COMP_WORDS[1]}\" sub=\"${COMP_WORDS[2]}\" opts=\"\"",
      `  if [ "$COMP_CWORD" -eq 1 ]; then COMPREPLY=($(compgen -W "${Object.entries(commands).filter(([, c]) => !c.hidden).map(([n]) => n).join(" ")}" -- "$cur")); return; fi`,
      "  case \"$cmd\" in",
      ...cases,
      "  esac",
      "  COMPREPLY=($(compgen -W \"$opts\" -- \"$cur\"))",
      "}",
      `complete -F ${fn} ${name}`,
      ""
    ].join("\n");
  }

  return { name, commands, globalOptions, parseArgv, validateInvocation, renderHelp, renderCompletion, usageLine };
}
