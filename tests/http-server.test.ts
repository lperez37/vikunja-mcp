import {
  CallToolResultSchema,
  InitializeResultSchema,
  JSONRPCResultResponseSchema,
  ListToolsResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { once } from "node:events";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createHttpServer,
  createMcpServer,
  MAX_REQUEST_BODY_BYTES,
  type HttpServerOptions,
  type HttpServerRuntime,
} from "../src/index.js";

const AUTH_TOKEN = "test-mcp-token";
const PROTOCOL_VERSION = "2025-06-18";
const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {},
    clientInfo: { name: "http-integration-test", version: "1.0.0" },
  },
};
const LIST_TOOLS = { jsonrpc: "2.0", id: 2, method: "tools/list" };
const MCP_HEADERS = {
  Authorization: `Bearer ${AUTH_TOKEN}`,
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
};
const FOLLOWUP_HEADERS = { ...MCP_HEADERS, "MCP-Protocol-Version": PROTOCOL_VERSION };

let runtime: HttpServerRuntime | undefined;
let baseUrl: string;

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function startRuntime(options: Partial<HttpServerOptions> = {}): Promise<Server> {
  runtime = createHttpServer({ authToken: AUTH_TOKEN, ...options });
  baseUrl = await listen(runtime.server);
  return runtime.server;
}

function post(body: string | object, headers: Record<string, string> = MCP_HEADERS) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readResult(response: Response, id: number) {
  expect(response.status).toBe(200);
  expect(response.headers.has("mcp-session-id")).toBe(false);
  const text = await response.text();
  const data = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  const payload = JSONRPCResultResponseSchema.parse(JSON.parse(data ?? text));
  expect(payload.id).toBe(id);
  return payload.result;
}

async function expectOverloaded() {
  const response = await post(INITIALIZE);
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("1");
  expect(await response.json()).toMatchObject({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Too many concurrent requests" },
    id: null,
  });
}

afterEach(async () => {
  const closed = runtime?.close();
  runtime?.server.closeAllConnections();
  await closed;
  runtime = undefined;
  vi.unstubAllEnvs();
});

describe("HTTP MCP server", () => {
  it("enforces auth on MCP requests and exposes minimal unauthenticated health data", async () => {
    await startRuntime();
    const health = await fetch(`${baseUrl}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", auth: "required" });

    const unauthorized = await post(INITIALIZE, { "Content-Type": "application/json" });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Bearer");
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });

    await readResult(await post(INITIALIZE), INITIALIZE.id);
    for (const authorization of ["Basic abc", "Bearer wrong"]) {
      const rejected = await post(LIST_TOOLS, {
        ...FOLLOWUP_HEADERS,
        Authorization: authorization,
      });
      expect(rejected.status).toBe(401);
      expect(await rejected.json()).toEqual({ error: "Unauthorized" });
    }

    for (const method of ["GET", "DELETE"]) {
      const rejected = await fetch(`${baseUrl}/mcp`, { method });
      expect(rejected.status).toBe(401);
      expect(await rejected.json()).toEqual({ error: "Unauthorized" });
    }

    const missing = await fetch(`${baseUrl}/missing`);
    expect(missing.status).toBe(404);
  });

  it("initializes, lists the tools, and reads from Vikunja without a session ID", async ({
    onTestFinished,
  }) => {
    const projects = [{ id: 1, title: "Test Inbox" }];
    const backendToken = "test-vikunja-token";
    const recordRequest = vi.fn();
    const backend = createServer((req, res) => {
      recordRequest(req.method, req.url, req.headers.authorization);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(projects));
    });
    vi.stubEnv("VIKUNJA_URL", await listen(backend));
    vi.stubEnv("VIKUNJA_API_TOKEN", backendToken);
    onTestFinished(async () => {
      backend.close();
      backend.closeAllConnections();
      await once(backend, "close");
    });
    await startRuntime();

    const initialization = InitializeResultSchema.parse(
      await readResult(await post(INITIALIZE), INITIALIZE.id)
    );
    expect(initialization.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(initialization.serverInfo.name).toBe("vikunja");
    expect(initialization.capabilities.tools).toBeDefined();
    expect(initialization.instructions).toContain("Vikunja task management");

    const initialized = await post(
      { jsonrpc: "2.0", method: "notifications/initialized" },
      FOLLOWUP_HEADERS
    );
    expect(initialized.status).toBe(202);
    expect(initialized.headers.has("mcp-session-id")).toBe(false);
    expect(await initialized.text()).toBe("");

    const { tools } = ListToolsResultSchema.parse(
      await readResult(await post(LIST_TOOLS, FOLLOWUP_HEADERS), LIST_TOOLS.id)
    );
    expect(tools).toHaveLength(26);
    expect(tools).toContainEqual(expect.objectContaining({ name: "projects_list" }));

    const result = CallToolResultSchema.parse(
      await readResult(
        await post(
          {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: { name: "projects_list", arguments: { search: "Test Inbox" } },
          },
          FOLLOWUP_HEADERS
        ),
        3
      )
    );
    expect(result.isError).not.toBe(true);
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ projects }, null, 2) }]);
    expect(recordRequest).toHaveBeenCalledExactlyOnceWith(
      "GET",
      "/api/v1/projects?s=Test+Inbox",
      `Bearer ${backendToken}`
    );
  });

  it("accepts 105 sequential initializations from one source", async () => {
    await startRuntime();
    for (let id = 1; id <= 105; id += 1) {
      await readResult(await post({ ...INITIALIZE, id }), id);
    }
  });

  it("accepts follow-up requests from clients still carrying a pre-rollout session ID", async () => {
    await startRuntime();
    const response = await post(LIST_TOOLS, { ...FOLLOWUP_HEADERS, "Mcp-Session-Id": "old-id" });
    const { tools } = ListToolsResultSchema.parse(await readResult(response, LIST_TOOLS.id));
    expect(tools).toHaveLength(26);
  });

  it("returns JSON-RPC envelopes for malformed, empty, and unsupported requests", async () => {
    await startRuntime();
    const malformed = await post("{");
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatchObject({ code: -32700, message: "Parse error" });

    const empty = await post("");
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe(-32600);

    for (const method of ["GET", "DELETE", "OPTIONS"]) {
      const response = await fetch(`${baseUrl}/mcp`, { method, headers: MCP_HEADERS });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(await response.json()).toMatchObject({
        jsonrpc: "2.0",
        error: { code: -32600, message: "Method not allowed" },
        id: null,
      });
    }
  });

  it.each(["declared length", "chunked transfer"])(
    "rejects oversized POST bodies with %s and releases the admission slot",
    async (transfer) => {
      const serverFactory = vi.fn(createMcpServer);
      await startRuntime({ maxConcurrentPosts: 1, serverFactory });

      const bytes = Buffer.alloc(MAX_REQUEST_BODY_BYTES + 1, " ");
      const body =
        transfer === "declared length"
          ? bytes.toString()
          : new ReadableStream({
              start(controller) {
                controller.enqueue(bytes);
                controller.close();
              },
            });
      const init = { method: "POST", headers: MCP_HEADERS, body, duplex: "half" };
      const oversized = await fetch(`${baseUrl}/mcp`, init);
      expect(oversized.status).toBe(413);
      expect((await oversized.json()).error.message).toBe("Request body too large");
      expect(serverFactory).not.toHaveBeenCalled();

      await readResult(await post(INITIALIZE), INITIALIZE.id);
    }
  );

  it("counts incomplete request bodies against the concurrent POST limit", async () => {
    const server = await startRuntime({ maxConcurrentPosts: 1 });
    const received = once(server, "request");
    const body = JSON.stringify(INITIALIZE);
    const request = httpRequest(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { ...MCP_HEADERS, "Content-Length": Buffer.byteLength(body) },
    });
    try {
      request.write(body.slice(0, 1));
      await received;
      await expectOverloaded();

      const response = once(request, "response");
      request.end(body.slice(1));
      const [incoming] = await response;
      expect(incoming.statusCode).toBe(200);
      incoming.resume();
      await once(incoming, "end");
      await readResult(await post(INITIALIZE), INITIALIZE.id);
    } finally {
      request.on("error", () => {});
      request.destroy();
    }
  });

  it.each(["completion", "disconnect"])("closes the request server on %s", async (ending) => {
    let finishCall!: () => void;
    const pendingCall = new Promise<void>((resolve) => {
      finishCall = resolve;
    });
    const onClose = vi.fn();
    await startRuntime({
      maxConcurrentPosts: 1,
      serverFactory: () => {
        const server = createMcpServer();
        server.server.onclose = onClose;
        server.tool("slow_read", {}, async () => {
          await pendingCall;
          return { content: [{ type: "text", text: "finished" }] };
        });
        return server;
      },
    });

    try {
      const response = await post({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "slow_read", arguments: {} },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      await expectOverloaded();
      expect(onClose).not.toHaveBeenCalled();

      if (ending === "disconnect") {
        await response.body!.cancel();
      } else {
        finishCall();
        const result = CallToolResultSchema.parse(await readResult(response, 4));
        expect(result.content).toEqual([{ type: "text", text: "finished" }]);
      }

      await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      await readResult(await post(INITIALIZE), INITIALIZE.id);
    } finally {
      finishCall();
    }
  });

  it("contains factory failures in a JSON-RPC envelope and releases the admission slot", async () => {
    await startRuntime({
      maxConcurrentPosts: 1,
      serverFactory: vi.fn(createMcpServer).mockImplementationOnce(() => {
        throw new Error("test factory failure");
      }),
    });

    const failed = await post(INITIALIZE);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
    await readResult(await post(INITIALIZE), INITIALIZE.id);
  });
});
