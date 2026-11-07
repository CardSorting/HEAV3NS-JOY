/** [LAYER: UI] */
/**
 * Human-readable output for `joy`: change trees with +/~/=/! markers, status tables, and next
 * steps. Color is enabled only on a TTY and honors NO_COLOR; JSON envelopes are produced by the
 * entry point from the same data.
 */

export function createStyle(enabled) {
  const wrap = (code) => (text) => (enabled ? `\u001b[${code}m${text}\u001b[0m` : text);
  return { bold: wrap("1"), dim: wrap("2"), green: wrap("32"), yellow: wrap("33"), red: wrap("31"), cyan: wrap("36") };
}

const MARK = { create: ["+", "green"], update: ["~", "cyan"], overwrite: ["~", "yellow"], unchanged: ["=", "dim"], conflict: ["!", "red"] };
const VERB = { create: "create", update: "update", overwrite: "replace", unchanged: "unchanged", conflict: "conflict" };

function describe(op) {
  const what = op.kind === "block" ? " (managed block)" : op.kind === "json" ? ` (${op.artifact.jsonPath.join(".")})` : op.kind === "jsonArray" ? " (hook)" : "";
  return `${op.path}${what}`;
}

/** Renders the operations of a plan or apply result as a change tree. */
export function renderOperations(operations, style) {
  const width = Math.max(...operations.map((op) => describe(op).length), 0);
  return operations.map((op) => {
    const [symbol, color] = MARK[op.action];
    const note = op.action === "conflict" ? `  ${style.red(op.reason)}` : op.action === "unchanged" ? "" : `  ${style.dim(VERB[op.action])}`;
    return `  ${style[color](symbol)} ${describe(op).padEnd(width)}${note}`;
  }).join("\n");
}

export function summarize(operations) {
  const count = (action) => operations.filter((op) => op.action === action).length;
  return { created: count("create"), updated: count("update") + count("overwrite"), unchanged: count("unchanged"), conflicts: count("conflict") };
}

/** Plan or applied-result text. */
export function renderChange(plan, { applied, style, dryRun }) {
  const lines = [];
  const labels = plan.targets.length ? plan.targets.join(", ") : "universal files only";
  lines.push(`${style.bold(dryRun ? "Dry run — nothing was written" : applied ? "Joyzoning is set up" : "Planned changes")} ${style.dim(`(${labels})`)}`, "");
  lines.push(renderOperations(plan.operations, style), "");
  const s = summarize(plan.operations);
  lines.push(style.dim(`${s.created} created, ${s.updated} updated, ${s.unchanged} unchanged${s.conflicts ? `, ${s.conflicts} conflict${s.conflicts > 1 ? "s" : ""}` : ""}`));
  if (s.conflicts) lines.push(style.yellow("Conflicting files were left untouched. Review them, or re-run with --force (a backup is kept)."));
  return lines.join("\n");
}

export function renderNextSteps(plan, style) {
  const steps = [];
  if (plan.mcp && plan.targets.some((t) => ["claude", "gemini", "cursor", "copilot", "antigravity"].includes(t))) steps.push("Restart your agent and approve the “joy” MCP server when prompted.");
  steps.push(`Verify everything: ${style.cyan(`${plan.launcher.run} doctor`)}`);
  steps.push(`Try an audit: ${style.cyan(`${plan.launcher.run} check . --format compact`)}`);
  if (plan.manual.length) steps.push(...plan.manual);
  steps.push("Commit AGENTS.md, SOUL.md, .joy/install.json and the agent folders so your whole team and CI share them.");
  return [style.bold("Next steps"), ...steps.map((s) => `  • ${s}`)].join("\n");
}

export function renderStatus(status, style) {
  if (!status.installed) return `${style.yellow("joy is not installed in this project.")} Run ${style.cyan("joy init")}.`;
  const icon = { ok: style.green("✔"), outdated: style.yellow("↑"), modified: style.yellow("~"), missing: style.red("✖") };
  const lines = [`${style.bold("Installation")} ${style.dim(`v${status.version} · agents: ${status.targets.join(", ") || "none"} · mcp: ${status.features.mcp ? "on" : "off"} · hooks: ${status.features.hooks ? "on" : "off"}`)}`, ""];
  for (const e of status.entries) lines.push(`  ${icon[e.status]} ${e.path}${e.detail ? `  ${style.dim(e.detail)}` : ""}`);
  if (status.outdated) lines.push("", style.yellow(`Newer content is available: run \`joy update\`.`));
  return lines.join("\n");
}

export function renderChecks(checks, style) {
  const icon = { ok: style.green("✔"), warn: style.yellow("!"), fail: style.red("✖") };
  return checks.map((c) => `  ${icon[c.status]} ${c.name.padEnd(14)} ${c.detail}${c.fix ? `\n    ${style.dim(`fix: ${c.fix}`)}` : ""}`).join("\n");
}

export function renderAgents(list, style) {
  const width = Math.max(...list.map((a) => a.label.length));
  return list.map((a) => `  ${a.detected ? style.green("●") : style.dim("○")} ${a.id.padEnd(12)} ${a.label.padEnd(width)}  ${style.dim(a.detected ? `detected: ${a.evidence.join(", ")}` : a.note)}`).join("\n");
}
