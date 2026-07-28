import type { ExpoConfig } from "expo/config";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regression guard for the WS-mode wiring: `app.config.ts` must map
// `EXPO_PUBLIC_SERVER_URL` into `extra.serverUrl`, which `buildNativePorts`
// reads to choose the WS-real vs simulator branch. This mapping was silently
// dropped once (commit d17c6cf2), leaving the RN app stuck in simulator mode —
// it never opened a WebSocket regardless of env. These cases fail if that
// wiring ever regresses again.
//
// `app.config.ts` reads `process.env` at module-eval time, so each case sets
// the env, resets the module registry, and re-imports.

const DEPLOYED = "wss://rtc-clone-server.fly.dev";

describe("app.config serverUrl resolution", () => {
  const original = process.env.EXPO_PUBLIC_SERVER_URL;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_SERVER_URL;
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.EXPO_PUBLIC_SERVER_URL;
    } else {
      process.env.EXPO_PUBLIC_SERVER_URL = original;
    }
  });

  it("defaults to the deployed endpoint when the env var is unset", async () => {
    await expect(resolveServerUrl()).resolves.toBe(DEPLOYED);
  });

  it("uses an explicit local server URL (dev:ios:ws:local)", async () => {
    process.env.EXPO_PUBLIC_SERVER_URL = "ws://localhost:4000";
    await expect(resolveServerUrl()).resolves.toBe("ws://localhost:4000");
  });

  it("uses an explicit deployed URL (dev:ios:ws:remote)", async () => {
    process.env.EXPO_PUBLIC_SERVER_URL = DEPLOYED;
    await expect(resolveServerUrl()).resolves.toBe(DEPLOYED);
  });

  it("treats an empty string as force-simulator, not the default (dev:ios:sim)", async () => {
    // `??` only catches null/undefined, so "" must survive as "" — that's how
    // `dev:ios:sim` forces the offline branch. If this collapsed to the
    // default, `:sim` would connect live.
    process.env.EXPO_PUBLIC_SERVER_URL = "";
    await expect(resolveServerUrl()).resolves.toBe("");
  });
});

describe("app.config react compiler", () => {
  it("enables the React Compiler experiment", async () => {
    const config = await loadConfig();

    expect(config.experiments?.reactCompiler).toBe(true);
  });
});

async function resolveServerUrl(): Promise<unknown> {
  vi.resetModules();
  const mod = await import("./app.config");
  return mod.default.extra?.serverUrl;
}

async function loadConfig(): Promise<ExpoConfig> {
  vi.resetModules();

  const mod = await import("./app.config");

  return mod.default;
}
