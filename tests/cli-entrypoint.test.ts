import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { isEntrypoint } from "../src/index.js";

describe("CLI entrypoint", () => {
  it("starts when invoked through an npm-style symlink", async () => {
    const directory = await mkdtemp(join(tmpdir(), "vikunja-mcp-entrypoint-"));
    const entrypoint = join(directory, "vikunja-mcp");
    const modulePath = resolve("src/index.ts");
    await symlink(modulePath, entrypoint);

    expect(isEntrypoint(pathToFileURL(modulePath).href, entrypoint)).toBe(true);
    expect(isEntrypoint(pathToFileURL(modulePath).href, join(directory, "missing"))).toBe(false);
    await rm(directory, { recursive: true });
  });
});
