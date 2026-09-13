import { describe, expect, it } from "vitest";

import { AbortError } from "#/kernel/AbortError";
import { spawn } from "#/kernel/spawn";

describe("spawn", () => {
  it("runs the loop and swallows AbortError", async () => {
    const errors: unknown[] = [];
    await spawn(
      async () => {
        throw new AbortError();
      },
      (error) => {
        errors.push(error);
      },
    );
    expect(errors).toEqual([]);
  });

  it("routes any other error to onError", async () => {
    const errors: unknown[] = [];
    await spawn(
      async () => {
        throw new Error("boom");
      },
      (error) => {
        errors.push(error);
      },
    );
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("boom");
  });
});
