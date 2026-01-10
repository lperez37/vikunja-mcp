import { describe, it, expect } from "vitest";

describe("Vitest Setup", () => {
  it("should run tests successfully", () => {
    expect(true).toBe(true);
  });

  it("should support basic assertions", () => {
    const sum = (a: number, b: number) => a + b;
    expect(sum(2, 2)).toBe(4);
  });

  it("should support async tests", async () => {
    const asyncFunction = async () => {
      return Promise.resolve("success");
    };
    await expect(asyncFunction()).resolves.toBe("success");
  });
});
