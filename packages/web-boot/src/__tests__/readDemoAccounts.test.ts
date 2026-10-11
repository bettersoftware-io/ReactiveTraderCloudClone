import { describe, expect, it } from "vitest";

import { readDemoAccounts } from "#/buildBrowserPorts";
import type { WebBootEnv } from "#/env";

import { createWebBootEnv } from "./createPortsOptions";

// Which sign-ins the login screen may hint at (hardening spec §7 D9): exactly
// the ones this page verifies in the browser, so the hint can never advertise
// a login the server would have to accept.
describe("readDemoAccounts", () => {
  it("lists the simulator's dev roster when there is no server", () => {
    const env = createWebBootEnv(
      createSeededEnv({ dev: { astark: "pw-dev" } }),
    );

    expect(readDemoAccounts(env)).toEqual([
      { username: "astark", password: "pw-dev", role: "Senior FX Trader" },
    ]);
  });

  it("lists the demo roster too on a simulator-only production build", () => {
    const env = createWebBootEnv(
      createSeededEnv({ demo: { demo: "pw-demo" } }),
    );

    expect(readDemoAccounts(env)).toEqual([
      { username: "demo", password: "pw-demo", role: "Read-Only Guest" },
    ]);
  });

  it("lists only the demo roster on a hybrid build — the dev roster is not verified there", () => {
    const env = createWebBootEnv(
      createSeededEnv({
        serverUrl: WS_URL,
        dev: { astark: "pw-dev" },
        demo: { demo: "pw-demo" },
      }),
    );

    expect(readDemoAccounts(env)).toEqual([
      { username: "demo", password: "pw-demo", role: "Read-Only Guest" },
    ]);
  });

  it("lists nothing on a plain live build, where every credential belongs to the server", () => {
    const env = createWebBootEnv(
      createSeededEnv({ serverUrl: WS_URL, dev: { astark: "pw-dev" } }),
    );

    expect(readDemoAccounts(env)).toEqual([]);
  });
});

const WS_URL = "ws://localhost:4000";

interface EnvSeed {
  readonly serverUrl?: string;
  readonly dev?: Record<string, string>;
  readonly demo?: Record<string, string>;
}

function createSeededEnv(seed: EnvSeed): Partial<WebBootEnv> {
  return {
    serverUrl: seed.serverUrl ?? "",
    devAuth: JSON.stringify(seed.dev ?? {}),
    demoAuth: JSON.stringify(seed.demo ?? {}),
  };
}
