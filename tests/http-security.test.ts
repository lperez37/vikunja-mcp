import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class MockMcpServer {
    tool() {}
    connect() {
      return Promise.resolve();
    }
  },
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: class MockStdioServerTransport {},
}));

let security: typeof import("../src/index.js");
const originalTransport = process.env.MCP_TRANSPORT;

beforeAll(async () => {
  process.env.MCP_TRANSPORT = "stdio";
  security = await import("../src/index.js");
});

afterAll(() => {
  if (originalTransport === undefined) delete process.env.MCP_TRANSPORT;
  else process.env.MCP_TRANSPORT = originalTransport;
});

function request(body: string, headers: Record<string, string> = {}): IncomingMessage {
  const stream = Readable.from([Buffer.from(body)]) as IncomingMessage;
  stream.headers = headers;
  return stream;
}

describe("HTTP transport security", () => {
  it("fails closed when the HTTP authentication token is missing or blank", () => {
    expect(() => security.requireHttpAuthToken(undefined)).toThrow(
      "MCP_AUTH_TOKEN is required"
    );
    expect(() => security.requireHttpAuthToken("   ")).toThrow("MCP_AUTH_TOKEN is required");
    expect(security.requireHttpAuthToken("secret")).toBe("secret");
  });

  it("parses origin-form request targets without consulting Host", () => {
    expect(security.parseRequestPath("/mcp?client=test")).toBe("/mcp");
    expect(() => security.parseRequestPath("http://attacker.example/mcp")).toThrow(
      "Malformed request URL"
    );
    expect(() => security.parseRequestPath("//attacker.example/mcp")).toThrow(
      "Malformed request URL"
    );
  });

  it("rejects oversized declared and streamed request bodies", async () => {
    await expect(
      security.readJsonRequestBody(
        request("{}", { "content-length": String(security.MAX_REQUEST_BODY_BYTES + 1) })
      )
    ).rejects.toThrow("Request body too large");

    await expect(
      security.readJsonRequestBody(request(JSON.stringify({ value: "12345" })), 8)
    ).rejects.toThrow("Request body too large");
  });

  it("classifies malformed JSON as a parse error", async () => {
    await expect(security.readJsonRequestBody(request("{"))).rejects.toThrow("Parse error");
  });
});
