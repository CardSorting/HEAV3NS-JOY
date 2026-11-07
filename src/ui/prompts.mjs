/** [LAYER: UI] */
/**
 * Tiny dependency-free interactive prompts (multi-select and confirm) over `node:readline`,
 * with injectable streams so the wizard is fully testable. Questions are line-based on purpose:
 * they work in every terminal, over SSH, and in agent-driven PTYs.
 */

import { createInterface } from "node:readline";

/**
 * @param {{ input: NodeJS.ReadableStream, output: NodeJS.WritableStream }} io
 */
export function createPrompter(io) {
  const rl = createInterface({ input: io.input, output: io.output, terminal: false });
  const queue = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : queue.push(line)));
  rl.on("close", () => {
    closed = true;
    while (waiters.length) waiters.shift()(null);
  });

  const nextLine = (question) => {
    io.output.write(question);
    if (queue.length) return Promise.resolve(queue.shift());
    if (closed) return Promise.resolve(null);
    return new Promise((resolve) => waiters.push(resolve));
  };

  return {
    /**
     * @param {string} question
     * @param {Array<{ id: string, label: string, hint?: string }>} items
     * @param {string[]} defaults ids selected by default
     * @returns {Promise<string[]>}
     */
    async multiSelect(question, items, defaults) {
      for (;;) {
        io.output.write(`${question}\n`);
        items.forEach((item, i) => io.output.write(`  ${String(i + 1).padStart(2)}. [${defaults.includes(item.id) ? "x" : " "}] ${item.label}${item.hint ? `  — ${item.hint}` : ""}\n`));
        const defaultText = defaults.length ? defaults.map((id) => items.findIndex((it) => it.id === id) + 1).join(",") : "none";
        const raw = await nextLine(`Choose numbers (e.g. 1,3), "all", "none", or Enter for [${defaultText}]: `);
        if (raw === null) return defaults;
        const answer = raw.trim().toLowerCase();
        if (answer === "") return defaults;
        if (answer === "all") return items.map((i) => i.id);
        if (answer === "none") return [];
        const picked = answer.split(/[\s,]+/).filter(Boolean).map(Number);
        if (picked.every((n) => Number.isInteger(n) && n >= 1 && n <= items.length)) return [...new Set(picked)].map((n) => items[n - 1].id);
        io.output.write(`Please enter numbers between 1 and ${items.length}.\n`);
      }
    },

    /** @param {string} question @param {boolean} defaultYes */
    async confirm(question, defaultYes) {
      for (;;) {
        const raw = await nextLine(`${question} ${defaultYes ? "(Y/n)" : "(y/N)"} `);
        if (raw === null) return defaultYes;
        const answer = raw.trim().toLowerCase();
        if (answer === "") return defaultYes;
        if (["y", "yes"].includes(answer)) return true;
        if (["n", "no"].includes(answer)) return false;
        io.output.write("Please answer y or n.\n");
      }
    },

    close() {
      rl.close();
    }
  };
}
