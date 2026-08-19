import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHttpServer,
  type HttpServerOptions,
  type HttpServerRuntime,
} from "../src/index.js";
import { expireIdleSessions, SESSION_IDLE_TIMEOUT_MS } from "../src/session-registry.js";

const AUTH_TOKEN = "integration-secret";
const INITIALIZE_BODY = JSON.stringify({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "http-integration-test", version: "1.0.0" },
  },
});

let runtime: HttpServerRuntime;
let baseUrl: string;

async function startRuntime(options: Partial<HttpServerOptions> = {}) {
  runtime = createHttpServer({ authToken: AUTH_TOKEN, ...options });
  await new Promise<void>((resolve) => runtime.server.listen(0, "127.0.0.1", resolve));
  const address = runtime.server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
}

function mcpHeaders(sessionId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${AUTH_TOKEN}`,
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
    ...(sessionId ? { "Mcp-Session-Id": sessionId } : {}),
  };
}

async function initialize(): Promise<{ response: Response; sessionId: string; payload: any }> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: mcpHeaders(),
    body: INITIALIZE_BODY,
  });
  const sessionId = response.headers.get("mcp-session-id");
  expect(response.status).toBe(200);
  expect(sessionId).toBeTruthy();
  const text = await response.text();
  const dataLine = text
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return { response, sessionId: sessionId!, payload: JSON.parse(dataLine ?? text) };
}

function partialPost(body: string, sessionId?: string) {
  const address = runtime.server.address() as AddressInfo;
  let resolveResponse!: (value: { status: number; body: string }) => void;
  const response = new Promise<{ status: number; body: string }>((resolve) => {
    resolveResponse = resolve;
  });
  const request = httpRequest(
    {
      host: "127.0.0.1",
      port: address.port,
      path: "/mcp",
      method: "POST",
      headers: {
        ...mcpHeaders(sessionId),
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (incoming) => {
      const chunks: Buffer[] = [];
      incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on("end", () => {
        resolveResponse({
          status: incoming.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    }
  );
  request.write(body.slice(0, 1));
  return { request, response, remainder: body.slice(1) };
}

beforeEach(async () => {
  await startRuntime();
});

afterEach(async () => {
  await runtime.close();
});

describe("HTTP MCP server", () => {
  it("enforces auth and exposes only minimal unauthenticated health data", async () => {
    const health = await fetch(`${baseUrl}/health`);
    expect(await health.json()).toEqual({ status: "ok", auth: "required" });

    const unauthorized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: INITIALIZE_BODY,
    });
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("www-authenticate")).toContain("Bearer");

    for (const authorization of ["Basic abc", "Bearer wrong"]) {
      const rejected = await fetch(`${baseUrl}/mcp`, {
        method: "POST",
        headers: { ...mcpHeaders(), Authorization: authorization },
        body: INITIALIZE_BODY,
      });
      expect(rejected.status).toBe(401);
    }

    const missing = await fetch(`${baseUrl}/missing`);
    expect(missing.status).toBe(404);
  });

  it("initializes, registers, follows up, rejects stale IDs, and deletes a session", async () => {
    const { payload, sessionId } = await initialize();
    expect(runtime.sessions.has(sessionId)).toBe(true);
    expect(payload.result.serverInfo.name).toBe("vikunja");

    const initialized = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(sessionId),
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(initialized.status).toBe(202);

    const stale = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders("missing-session"),
      body: "",
    });
    expect(stale.status).toBe(404);
    expect((await stale.json()).error.message).toBe("Session not found");

    const deleted = await fetch(`${baseUrl}/mcp`, {
      method: "DELETE",
      headers: mcpHeaders(sessionId),
    });
    expect(deleted.status).toBe(200);
    expect(runtime.sessions.has(sessionId)).toBe(false);
  });

  it("returns JSON-RPC envelopes for malformed, empty, and unsupported requests", async () => {
    const malformed = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: "{",
    });
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatchObject({ code: -32700, message: "Parse error" });

    const empty = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: "",
    });
    expect(empty.status).toBe(400);
    expect((await empty.json()).error.code).toBe(-32600);

    for (const method of ["GET", "DELETE"]) {
      const sessionless = await fetch(`${baseUrl}/mcp`, {
        method,
        headers: mcpHeaders(),
      });
      expect(sessionless.status).toBe(400);
      expect((await sessionless.json()).error.message).toBe("Session ID is required");
    }

    const options = await fetch(`${baseUrl}/mcp`, {
      method: "OPTIONS",
      headers: mcpHeaders(),
    });
    expect(options.status).toBe(405);
    expect((await options.json()).jsonrpc).toBe("2.0");

    const notInitialize = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "ping" }),
    });
    expect(notInitialize.status).toBe(400);
    expect((await notInitialize.json()).error.code).toBe(-32000);
  });

  it("leases an existing session before awaiting its request body", async () => {
    const { sessionId } = await initialize();
    const body = JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" });
    const partial = partialPost(body, sessionId);

    await vi.waitFor(() => expect(runtime.sessions.get(sessionId)?.activeRequests).toBe(1));
    const entry = runtime.sessions.get(sessionId)!;
    entry.lastAccessedAt = 0;
    await expect(expireIdleSessions(runtime.sessions, SESSION_IDLE_TIMEOUT_MS + 1)).resolves.toBe(0);

    partial.request.end(partial.remainder);
    await expect(partial.response).resolves.toMatchObject({ status: 202 });
    expect(runtime.sessions.has(sessionId)).toBe(true);
  });

  it("bounds concurrent body reads and applies a per-source session quota", async () => {
    await runtime.close();
    await startRuntime({ maxConcurrentPosts: 1, maxSessionsPerSource: 1 });

    const partial = partialPost(INITIALIZE_BODY);
    await new Promise((resolve) => setTimeout(resolve, 10));
    const overloaded = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: INITIALIZE_BODY,
    });
    expect(overloaded.status).toBe(429);
    expect((await overloaded.json()).error.message).toBe("Too many concurrent requests");

    partial.request.end(partial.remainder);
    await expect(partial.response).resolves.toMatchObject({ status: 200 });

    const quota = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: INITIALIZE_BODY,
    });
    expect(quota.status).toBe(429);
    expect((await quota.json()).error.message).toContain("Session capacity");
  });

  it("contains unexpected initialization failures in a JSON-RPC envelope", async () => {
    await runtime.close();
    await startRuntime({
      serverFactory: () => {
        throw new Error("test factory failure");
      },
    });

    const failed = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: mcpHeaders(),
      body: INITIALIZE_BODY,
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
  });
});
