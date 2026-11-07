/** [LAYER: CORE] */
/**
 * Transport-agnostic MCP server (`McpServer`): implements the Model Context Protocol request
 * handling — initialize/ping, tools, resources, prompts, cancellation — over injected ports, so
 * the same logic serves stdio today and any other transport tomorrow.
 *
 * Hardening
 *  - strict JSON-RPC envelope validation; tools/prompts/resources are refused before `initialize`;
 *  - tool arguments are validated against each tool's JSON Schema (unknown arguments rejected) and
 *    validation failures come back as `isError` results so the model can self-correct;
 *  - every filesystem path argument must resolve inside the project (`isInsideProject` port);
 *  - tools map to fixed CLI argv arrays: no shell, no arbitrary code execution;
 *  - tool output is size-capped; each call has a timeout and honors `notifications/cancelled`.
 *
 * Ports: `runCli(cli, argv, { signal, timeoutMs }) → { code, stdout, stderr }`,
 * `readResource(path) → string | null`, `isInsideProject(path) → boolean`.
 */

import {
  ERROR_CODES,
  MCP_PROMPTS,
  MCP_RESOURCES,
  MCP_TOOLS,
  SERVER_INSTRUCTIONS,
  negotiateProtocolVersion,
  rpcError,
  rpcResult,
  validateEnvelope
} from "../domain/mcpProtocol.mjs";
import { validateAgainstSchema } from "../domain/jsonSchemaLite.mjs";

const MAX_TEXT = 60_000;
const MAX_ARGUMENT_BYTES = 120_000;

function clip(text) {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n…[output truncated at ${MAX_TEXT} characters; narrow the request]` : text;
}

export class McpServer {
  #info;
  #runCli;
  #readResource;
  #isInside;
  #root;
  #timeoutMs;
  #logger;
  #tools;
  #initialized = false;
  #inFlight = new Map();

  /**
   * @param {{
   *   info: { name: string, version: string },
   *   runCli: (cli: "check" | "trinity", argv: string[], options: { signal: AbortSignal, timeoutMs: number }) => Promise<{ code: number, stdout: string, stderr: string }>,
   *   readResource: (relativePath: string) => Promise<string | null>,
   *   isInsideProject: (path: string) => boolean,
   *   stateRoot?: string,
   *   toolTimeoutMs?: number,
   *   logger?: { warn: Function },
   *   tools?: import("../domain/mcpProtocol.mjs").McpTool[]
   * }} options
   */
  constructor(options) {
    this.#info = options.info;
    this.#runCli = options.runCli;
    this.#readResource = options.readResource;
    this.#isInside = options.isInsideProject;
    this.#root = options.stateRoot;
    this.#timeoutMs = options.toolTimeoutMs ?? 120_000;
    this.#logger = options.logger ?? { warn() {} };
    this.#tools = new Map((options.tools ?? MCP_TOOLS).map((tool) => [tool.name, tool]));
  }

  /** Aborts the in-flight request with this id (MCP `notifications/cancelled`). */
  cancel(requestId) {
    this.#inFlight.get(requestId)?.abort(new Error("cancelled by client"));
  }

  /** Aborts everything (transport shutdown). */
  shutdown() {
    for (const controller of this.#inFlight.values()) controller.abort(new Error("server shutting down"));
  }

  /**
   * Handles one decoded message (request, notification, or batch).
   * @param {unknown} message
   * @returns {Promise<object | object[] | null>} a response, a batch of responses, or null for notifications
   */
  async handle(message) {
    if (Array.isArray(message)) {
      if (message.length === 0) return rpcError(null, ERROR_CODES.INVALID_REQUEST, "empty batch");
      const responses = (await Promise.all(message.map((m) => this.#handleOne(m)))).filter(Boolean);
      return responses.length ? responses : null;
    }
    return this.#handleOne(message);
  }

  async #handleOne(message) {
    const envelope = validateEnvelope(message);
    if (!envelope.ok) return rpcError(message?.id, envelope.code, envelope.text);
    const { id, method, params = {} } = message;
    const isNotification = id === undefined;
    try {
      const result = await this.#dispatch(method, params, id);
      if (isNotification) return null;
      return result?.__error ? rpcError(id, result.code, result.message, result.data) : rpcResult(id, result);
    } catch (error) {
      this.#logger.warn(`[mcp] ${method} failed: ${error.stack ?? error.message}`);
      return isNotification ? null : rpcError(id, ERROR_CODES.INTERNAL, "internal error");
    }
  }

  #fail(code, message, data) {
    return { __error: true, code, message, data };
  }

  async #dispatch(method, params, id) {
    switch (method) {
      case "initialize":
        this.#initialized = true;
        return {
          protocolVersion: negotiateProtocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false }, prompts: { listChanged: false } },
          serverInfo: this.#info,
          instructions: SERVER_INSTRUCTIONS
        };
      case "notifications/initialized":
      case "initialized":
        return null;
      case "notifications/cancelled":
        if (params.requestId !== undefined) this.cancel(params.requestId);
        return null;
      case "ping":
        return {};
      default:
        break;
    }
    if (method.startsWith("notifications/")) return null;
    if (!this.#initialized) return this.#fail(ERROR_CODES.NOT_INITIALIZED, "server not initialized: send `initialize` first");
    switch (method) {
      case "tools/list":
        return { tools: [...this.#tools.values()].map(({ name, title, description, inputSchema, annotations }) => ({ name, title, description, inputSchema, annotations })) };
      case "tools/call":
        return this.#callTool(params, id);
      case "resources/list":
        return { resources: MCP_RESOURCES.map(({ uri, name, description, mimeType }) => ({ uri, name, description, mimeType })) };
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "resources/read":
        return this.#readResourceRequest(params);
      case "prompts/list":
        return { prompts: MCP_PROMPTS.map(({ name, description, arguments: args }) => ({ name, description, arguments: args })) };
      case "prompts/get":
        return this.#getPrompt(params);
      case "logging/setLevel":
        return {};
      default:
        return this.#fail(ERROR_CODES.METHOD_NOT_FOUND, `method not found: ${method}`);
    }
  }

  #toolError(text) {
    return { content: [{ type: "text", text }], isError: true };
  }

  #pathsOutsideProject(tool, args) {
    for (const name of tool.pathArgs ?? []) {
      const value = args[name];
      if (typeof value === "string" && !this.#isInside(value)) return `${name} '${value}' is outside the project directory`;
    }
    for (const name of ["scope", "files"]) {
      for (const value of args[name] ?? []) if (typeof value === "string" && !this.#isInside(value)) return `${name} entry '${value}' is outside the project directory`;
    }
    if (typeof args.file === "string" && !this.#isInside(args.file)) return `file '${args.file}' is outside the project directory`;
    return null;
  }

  async #callTool(params, id) {
    const tool = this.#tools.get(params.name);
    if (!tool) return this.#fail(ERROR_CODES.INVALID_PARAMS, `unknown tool '${params.name}'`);
    const args = params.arguments ?? {};
    const problems = validateAgainstSchema(tool.inputSchema, args);
    if (problems.length) return this.#toolError(`Invalid arguments for ${tool.name}:\n- ${problems.join("\n- ")}`);
    if (JSON.stringify(args).length > MAX_ARGUMENT_BYTES) return this.#toolError(`Arguments for ${tool.name} exceed ${MAX_ARGUMENT_BYTES} bytes`);
    const outside = this.#pathsOutsideProject(tool, args);
    if (outside) return this.#toolError(`${outside}. Tools are confined to the project directory.`);
    const controller = new AbortController();
    if (id !== undefined) this.#inFlight.set(id, controller);
    try {
      const argv = tool.argv(args, { root: this.#root });
      const run = await this.#runCli(tool.cli, argv, { signal: controller.signal, timeoutMs: this.#timeoutMs });
      return tool.cli === "trinity" ? this.#trinityResult(run) : this.#checkResult(run);
    } catch (error) {
      return this.#toolError(`${tool.name} failed: ${error.message}`);
    } finally {
      if (id !== undefined) this.#inFlight.delete(id);
    }
  }

  #trinityResult(run) {
    let envelope = null;
    try { envelope = JSON.parse(run.stdout); } catch { /* not a JSON envelope */ }
    if (envelope && typeof envelope.ok === "boolean") {
      const text = clip(JSON.stringify(envelope.ok ? envelope.result : envelope.error, null, 2));
      return envelope.ok
        ? { content: [{ type: "text", text }], structuredContent: { result: envelope.result }, isError: false }
        : { content: [{ type: "text", text: `${envelope.error.code}: ${envelope.error.message}${envelope.error.hint ? `\nhint: ${envelope.error.hint}` : ""}` }], structuredContent: { error: envelope.error }, isError: true };
    }
    return this.#toolError(clip(`joy-trinity exited ${run.code} without a JSON result.\n${run.stderr || run.stdout}`.trim()));
  }

  #checkResult(run) {
    const text = clip([run.stdout, run.stderr].filter((s) => s.trim()).join("\n").trim() || "(no output)");
    // Exit 1 means "violations found": a valid, actionable result. Only exit >= 2 is a tool error.
    return { content: [{ type: "text", text }], structuredContent: { exitCode: run.code, conforms: run.code === 0 }, isError: run.code >= 2 };
  }

  async #readResourceRequest(params) {
    const resource = MCP_RESOURCES.find((r) => r.uri === params.uri);
    if (!resource) return this.#fail(ERROR_CODES.RESOURCE_NOT_FOUND, `resource not found: ${params.uri}`);
    const text = await this.#readResource(resource.path);
    if (text === null) return this.#fail(ERROR_CODES.RESOURCE_NOT_FOUND, `resource unavailable: ${params.uri}`);
    return { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] };
  }

  #getPrompt(params) {
    const prompt = MCP_PROMPTS.find((p) => p.name === params.name);
    if (!prompt) return this.#fail(ERROR_CODES.INVALID_PARAMS, `unknown prompt '${params.name}'`);
    const args = params.arguments ?? {};
    for (const spec of prompt.arguments) {
      if (spec.required && (typeof args[spec.name] !== "string" || args[spec.name].trim() === "")) return this.#fail(ERROR_CODES.INVALID_PARAMS, `missing required argument '${spec.name}'`);
    }
    return { description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.render(args) } }] };
  }
}
