import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("DEV_CREDENTIALS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock("expo-constants");
  });

  it("parses a valid extra.devAuth JSON username->password map", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({
      devAuth: JSON.stringify({ astark: "secret1", demo: "secret2" }),
    });
    expect(DEV_CREDENTIALS).toEqual({ astark: "secret1", demo: "secret2" });
  });

  it("falls back to the four roster users when extra.devAuth is unset", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({});
    expect(DEV_CREDENTIALS).toEqual({
      astark: "mcdc2026",
      nromanoff: "mcdc2026",
      tchalla: "mcdc2026",
      demo: "mcdc2026",
    });
  });

  it("falls back to the roster default when extra.devAuth is an empty string", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({ devAuth: "" });
    expect(DEV_CREDENTIALS).toEqual({
      astark: "mcdc2026",
      nromanoff: "mcdc2026",
      tchalla: "mcdc2026",
      demo: "mcdc2026",
    });
  });

  it("falls back to the roster default when extra.devAuth is malformed JSON", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({
      devAuth: "{not valid json",
    });
    expect(DEV_CREDENTIALS).toEqual({
      astark: "mcdc2026",
      nromanoff: "mcdc2026",
      tchalla: "mcdc2026",
      demo: "mcdc2026",
    });
  });

  it("falls back to the roster default when extra.devAuth is a JSON array, not {'0':...}", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({
      devAuth: JSON.stringify(["astark", "demo"]),
    });
    expect(DEV_CREDENTIALS).toEqual({
      astark: "mcdc2026",
      nromanoff: "mcdc2026",
      tchalla: "mcdc2026",
      demo: "mcdc2026",
    });
    expect(DEV_CREDENTIALS).not.toHaveProperty("0");
  });

  it("drops non-string values from a mixed-type extra.devAuth object", async () => {
    const { DEV_CREDENTIALS } = await loadWithExtra({
      devAuth: JSON.stringify({ astark: "secret1", demo: 12345 }),
    });
    expect(DEV_CREDENTIALS).toEqual({ astark: "secret1" });
  });
});

// `nativeAuthConfig.ts` computes `DEV_CREDENTIALS` once at module load from
// `Constants.expoConfig?.extra.devAuth`, so each case needs its own fresh
// module instance seeded with a different `extra` — `vi.resetModules()` +
// `vi.doMock` + a dynamic import per test, rather than a single top-level
// `vi.mock`.
async function loadWithExtra(
  extra: Record<string, unknown>,
): Promise<typeof import("#/app/nativeAuthConfig")> {
  vi.resetModules();
  vi.doMock("expo-constants", () => {
    return { default: { expoConfig: { extra } } };
  });
  return import("#/app/nativeAuthConfig");
}
