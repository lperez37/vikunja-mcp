import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  expireIdleSessions,
  SESSION_IDLE_TIMEOUT_MS,
  type SessionEntry,
} from "../src/session-registry.js";

function session(lastAccessedAt: number) {
  const close = vi.fn().mockResolvedValue(undefined);
  return {
    entry: {
      transport: {} as StreamableHTTPServerTransport,
      server: { close } as unknown as McpServer,
      lastAccessedAt,
    } satisfies SessionEntry,
    close,
  };
}

describe("expireIdleSessions", () => {
  it("keeps sessions active within the three-hour timeout", async () => {
    const now = Date.now();
    const active = session(now - SESSION_IDLE_TIMEOUT_MS + 1);
    const sessions = new Map([["active", active.entry]]);

    await expect(expireIdleSessions(sessions, now)).resolves.toBe(0);
    expect(sessions.has("active")).toBe(true);
    expect(active.close).not.toHaveBeenCalled();
  });

  it("closes and removes sessions idle for three hours", async () => {
    const now = Date.now();
    const expired = session(now - SESSION_IDLE_TIMEOUT_MS);
    const sessions = new Map([["expired", expired.entry]]);

    await expect(expireIdleSessions(sessions, now)).resolves.toBe(1);
    expect(sessions.has("expired")).toBe(false);
    expect(expired.close).toHaveBeenCalledOnce();
  });
});
