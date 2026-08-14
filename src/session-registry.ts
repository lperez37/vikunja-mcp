import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const SESSION_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastAccessedAt: number;
}

export async function expireIdleSessions(
  sessions: Map<string, SessionEntry>,
  now = Date.now()
): Promise<number> {
  const expired = Array.from(sessions.entries()).filter(
    ([, session]) => now - session.lastAccessedAt >= SESSION_IDLE_TIMEOUT_MS
  );

  for (const [sessionId, session] of expired) {
    sessions.delete(sessionId);
    await session.server.close();
  }

  return expired.length;
}
