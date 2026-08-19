import { describe, expect, it, vi } from "vitest";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  expireIdleSessions,
  acquireSession,
  hasSessionCapacity,
  isUnknownSession,
  MAX_SESSIONS_PER_SOURCE,
  RequestAdmissionGate,
  MAX_SESSION_COUNT,
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
      source: "127.0.0.1",
      activeRequests: 0,
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

  it("revalidates candidates after awaiting another session close", async () => {
    const now = Date.now();
    const first = session(now - SESSION_IDLE_TIMEOUT_MS);
    const second = session(now - SESSION_IDLE_TIMEOUT_MS);
    const sessions = new Map([
      ["first", first.entry],
      ["second", second.entry],
    ]);
    let lease: ReturnType<typeof acquireSession>;
    first.close.mockImplementation(async () => {
      lease = acquireSession(sessions, "second", now);
    });

    await expect(expireIdleSessions(sessions, now)).resolves.toBe(1);
    expect(sessions.has("first")).toBe(false);
    expect(sessions.has("second")).toBe(true);
    expect(second.close).not.toHaveBeenCalled();
    lease!.release();
  });
});

describe("isUnknownSession", () => {
  it("identifies a stale client session after the server has discarded it", () => {
    const sessions = new Map<string, SessionEntry>();

    expect(isUnknownSession(sessions, "expired-session")).toBe(true);
  });

  it("allows initialization requests without a session ID", () => {
    const sessions = new Map<string, SessionEntry>();

    expect(isUnknownSession(sessions, undefined)).toBe(false);
  });
});

describe("hasSessionCapacity", () => {
  it("rejects new and concurrent initializations at the session cap", () => {
    const entry = session(Date.now()).entry;
    const sessions = new Map<string, SessionEntry>();
    for (let index = 0; index < MAX_SESSION_COUNT - 1; index += 1) {
      sessions.set(String(index), entry);
    }

    expect(hasSessionCapacity(sessions)).toBe(true);
    expect(hasSessionCapacity(sessions, 1)).toBe(false);
  });

  it("applies a per-source session quota", () => {
    const entry = session(Date.now()).entry;
    const sessions = new Map<string, SessionEntry>();
    for (let index = 0; index < MAX_SESSIONS_PER_SOURCE; index += 1) {
      sessions.set(String(index), entry);
    }

    expect(hasSessionCapacity(sessions, 0, entry.source)).toBe(false);
    expect(hasSessionCapacity(sessions, 0, "another-client")).toBe(true);
  });
});

describe("session leases", () => {
  it("touches and protects a session from expiry while a request body is awaited", async () => {
    const now = Date.now();
    const existing = session(now - SESSION_IDLE_TIMEOUT_MS).entry;
    const sessions = new Map([["session", existing]]);

    const lease = acquireSession(sessions, "session", now);
    expect(lease?.entry).toBe(existing);
    await expect(expireIdleSessions(sessions, now + SESSION_IDLE_TIMEOUT_MS)).resolves.toBe(0);
    expect(sessions.has("session")).toBe(true);

    lease?.release();
    await expect(expireIdleSessions(sessions, now + SESSION_IDLE_TIMEOUT_MS)).resolves.toBe(1);
  });
});

describe("RequestAdmissionGate", () => {
  it("bounds concurrent requests and releases slots idempotently", () => {
    const gate = new RequestAdmissionGate(1);
    const release = gate.tryAcquire();

    expect(release).toBeTypeOf("function");
    expect(gate.tryAcquire()).toBeUndefined();
    release?.();
    release?.();
    expect(gate.tryAcquire()).toBeTypeOf("function");
  });
});
