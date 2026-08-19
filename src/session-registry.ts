import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export const SESSION_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
export const MAX_SESSION_COUNT = 100;
export const MAX_SESSIONS_PER_SOURCE = 20;
export const MAX_CONCURRENT_POST_REQUESTS = 16;

export interface SessionEntry {
  transport: StreamableHTTPServerTransport;
  server: McpServer;
  lastAccessedAt: number;
  source: string;
  activeRequests: number;
}

export function isUnknownSession(
  sessions: Map<string, SessionEntry>,
  sessionId: string | undefined
): boolean {
  return sessionId !== undefined && !sessions.has(sessionId);
}

export function hasSessionCapacity(
  sessions: Map<string, SessionEntry>,
  pendingSessions = 0,
  source?: string,
  pendingForSource = 0,
  maxSessions = MAX_SESSION_COUNT,
  maxSessionsPerSource = MAX_SESSIONS_PER_SOURCE
): boolean {
  if (sessions.size + pendingSessions >= maxSessions) return false;
  if (!source) return true;

  const sourceSessions = Array.from(sessions.values()).filter(
    (session) => session.source === source
  ).length;
  return sourceSessions + pendingForSource < maxSessionsPerSource;
}

export interface SessionLease {
  entry: SessionEntry;
  release: () => void;
}

export function acquireSession(
  sessions: Map<string, SessionEntry>,
  sessionId: string,
  now = Date.now()
): SessionLease | undefined {
  const entry = sessions.get(sessionId);
  if (!entry) return undefined;

  entry.lastAccessedAt = now;
  entry.activeRequests += 1;
  let released = false;
  return {
    entry,
    release: () => {
      if (released) return;
      released = true;
      entry.activeRequests = Math.max(0, entry.activeRequests - 1);
    },
  };
}

export class RequestAdmissionGate {
  private activeRequests = 0;

  constructor(private readonly limit = MAX_CONCURRENT_POST_REQUESTS) {}

  tryAcquire(): (() => void) | undefined {
    if (this.activeRequests >= this.limit) return undefined;
    this.activeRequests += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRequests -= 1;
    };
  }
}

export async function expireIdleSessions(
  sessions: Map<string, SessionEntry>,
  now = Date.now()
): Promise<number> {
  let expiredCount = 0;
  const expired = Array.from(sessions.entries()).filter(
    ([, session]) =>
      session.activeRequests === 0 && now - session.lastAccessedAt >= SESSION_IDLE_TIMEOUT_MS
  );

  for (const [sessionId, session] of expired) {
    if (
      sessions.get(sessionId) !== session ||
      session.activeRequests !== 0 ||
      now - session.lastAccessedAt < SESSION_IDLE_TIMEOUT_MS
    ) {
      continue;
    }
    sessions.delete(sessionId);
    await session.server.close();
    expiredCount += 1;
  }

  return expiredCount;
}
