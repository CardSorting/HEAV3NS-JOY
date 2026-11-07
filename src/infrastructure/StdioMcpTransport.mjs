/** [LAYER: INFRASTRUCTURE] */
/**
 * Newline-delimited JSON-RPC over stdio for MCP. Protocol traffic uses stdout exclusively; all
 * diagnostics go to stderr so a stray log line can never corrupt the stream.
 *
 * Robustness: oversized lines are rejected without buffering them, malformed JSON gets a JSON-RPC
 * parse error and the stream continues, requests are handled concurrently while writes stay
 * serialized with backpressure, and end-of-input drains in-flight work before exiting.
 */

// JSON-RPC 2.0 framing errors owned by the transport itself (kept local: infrastructure must not import concrete domain logic).
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const rpcError = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

const MAX_LINE = 4 * 1024 * 1024;

export class StdioMcpTransport {
  #server;
  #input;
  #output;
  #logger;
  #pending = new Set();
  #writeChain = Promise.resolve();

  /**
   * @param {{ server: { handle: (message: unknown) => Promise<unknown>, shutdown: () => void }, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, logger?: { warn: Function } }} options
   */
  constructor(options) {
    this.#server = options.server;
    this.#input = options.input ?? process.stdin;
    this.#output = options.output ?? process.stdout;
    this.#logger = options.logger ?? { warn: (m) => process.stderr.write(`${m}\n`) };
  }

  #send(payload) {
    const line = `${JSON.stringify(payload)}\n`;
    this.#writeChain = this.#writeChain.then(() => new Promise((resolve) => {
      if (this.#output.write(line)) resolve();
      else this.#output.once("drain", resolve);
    }));
    return this.#writeChain;
  }

  #dispatch(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      void this.#send(rpcError(null, PARSE_ERROR, "parse error"));
      return;
    }
    const task = this.#server.handle(message).then((response) => (response ? this.#send(response) : undefined)).catch((error) => this.#logger.warn(`[mcp] transport error: ${error.message}`));
    this.#pending.add(task);
    task.finally(() => this.#pending.delete(task));
  }

  /** Starts reading; resolves once input ends and in-flight work has drained. */
  run() {
    return new Promise((resolve) => {
      let buffer = "";
      let discarding = false;
      this.#input.setEncoding("utf8");
      this.#input.on("data", (chunk) => {
        buffer += chunk;
        for (let index = buffer.indexOf("\n"); index !== -1; index = buffer.indexOf("\n")) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (discarding) { discarding = false; continue; }
          if (line) this.#dispatch(line);
        }
        if (buffer.length > MAX_LINE) {
          void this.#send(rpcError(null, INVALID_REQUEST, `message exceeds ${MAX_LINE} bytes`));
          buffer = "";
          discarding = true; // drop the remainder of this oversized line
        }
      });
      this.#input.on("end", async () => {
        if (buffer.trim() && !discarding) this.#dispatch(buffer.trim());
        await Promise.allSettled([...this.#pending]);
        await this.#writeChain;
        resolve();
      });
      this.#input.on("error", (error) => {
        this.#logger.warn(`[mcp] input error: ${error.message}`);
        this.#server.shutdown();
        resolve();
      });
    });
  }
}
