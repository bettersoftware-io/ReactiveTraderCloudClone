import { describe, expect, test } from "vitest";

import { resolveActiveModule } from "./moduleRoutes";

describe("resolveActiveModule", () => {
  test("resolves the index route to rates", () => {
    expect(resolveActiveModule("/").key).toBe("rates");
  });

  test("resolves an exact match to blotter", () => {
    expect(resolveActiveModule("/blotter").key).toBe("blotter");
  });

  test("resolves a nested route via prefix match to credit", () => {
    expect(resolveActiveModule("/credit/detail").key).toBe("credit");
  });

  test("falls back to rates for an unknown pathname", () => {
    expect(resolveActiveModule("/nope").key).toBe("rates");
  });
});
