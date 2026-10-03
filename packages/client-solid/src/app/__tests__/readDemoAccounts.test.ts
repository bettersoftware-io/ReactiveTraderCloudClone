import { afterEach, describe, expect, it, vi } from "vitest";

import { readDemoAccounts } from "#/app/buildBrowserPorts";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Which sign-ins the login screen may hint at (hardening spec §7 D9): exactly
// the ones this page verifies in the browser, so the hint can never advertise
// a login the server would have to accept.
describe("readDemoAccounts", () => {
  it("lists the simulator's dev roster when there is no server", () => {
    seedEnv({ dev: { astark: "pw-dev" } });

    expect(readDemoAccounts()).toEqual([
      { username: "astark", password: "pw-dev", role: "Senior FX Trader" },
    ]);
  });

  it("lists the demo roster too on a simulator-only production build", () => {
    seedEnv({ demo: { demo: "pw-demo" } });

    expect(readDemoAccounts()).toEqual([
      { username: "demo", password: "pw-demo", role: "Read-Only Guest" },
    ]);
  });

  it("lists only the demo roster on a hybrid build — the dev roster is not verified there", () => {
    seedEnv({
      serverUrl: WS_URL,
      dev: { astark: "pw-dev" },
      demo: { demo: "pw-demo" },
    });

    expect(readDemoAccounts()).toEqual([
      { username: "demo", password: "pw-demo", role: "Read-Only Guest" },
    ]);
  });

  it("lists nothing on a plain live build, where every credential belongs to the server", () => {
    seedEnv({ serverUrl: WS_URL, dev: { astark: "pw-dev" } });

    expect(readDemoAccounts()).toEqual([]);
  });
});

const WS_URL = "ws://localhost:4000";

interface EnvSeed {
  readonly serverUrl?: string;
  readonly dev?: Record<string, string>;
  readonly demo?: Record<string, string>;
}

function seedEnv(seed: EnvSeed): void {
  vi.stubEnv("VITE_SERVER_URL", seed.serverUrl ?? "");
  vi.stubEnv("VITE_DEV_AUTH", JSON.stringify(seed.dev ?? {}));
  vi.stubEnv("VITE_DEMO_AUTH", JSON.stringify(seed.demo ?? {}));
}
