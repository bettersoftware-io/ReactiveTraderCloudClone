import { firstValueFrom, type Observable } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DATA_SOURCE_STORAGE_KEY, WsAdapter } from "@rtc/client-adapters";
import type { AuthOutcome } from "@rtc/domain";

import { SESSION_STORAGE_KEY } from "#/app/adapters/LocalStorageSessionStore";
import { buildBrowserPorts, readDemoAccounts } from "#/app/buildBrowserPorts";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("buildBrowserPorts (hybrid: server URL + demo roster)", () => {
  it("composes the simulator branch when nothing is stored", () => {
    seedHybridEnv();

    const ports = buildBrowserPorts();

    expect(ports.transport).toBeUndefined();
  });

  it("composes the ws-real branch when the stored choice is live", () => {
    seedHybridEnv();
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "live");

    expect(buildBrowserPorts().transport).toBeInstanceOf(WsAdapter);
  });

  it("composes the ws-real branch for a stored session with no choice (pre-hybrid live session)", () => {
    seedHybridEnv();
    seedSession("tok-old");

    expect(buildBrowserPorts().transport).toBeInstanceOf(WsAdapter);
  });

  it("a demo login on the sim page resolves in the browser: no fetch, choice recorded, no relaunch", async () => {
    seedHybridEnv();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(outcome.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("sim");
    expect(relaunch).not.toHaveBeenCalled();
  });

  it("a server login on the sim page stores the session + live choice and relaunches without emitting", async () => {
    seedHybridEnv();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createLoginResponse());
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const probe = observe(ports.auth.login("ada", "hunter2"));
    // The HTTP leg is async; the relaunch is the witness that it settled.
    await vi.waitFor(() => {
      expect(relaunch).toHaveBeenCalledTimes(1);
    });

    // Never emits AND never completes: the async/Effect cores await the first
    // value and would rethrow a completion-without-value out of band.
    expect(probe.emissions).toEqual([]);
    expect(probe.completed).toBe(false);
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("live");
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null"),
    ).toMatchObject({
      username: "ada",
      token: "tok-ada",
    });
    probe.dispose();
  });

  it("a server login on the live page emits normally and does not relaunch", async () => {
    seedHybridEnv();
    localStorage.setItem(DATA_SOURCE_STORAGE_KEY, "live");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createLoginResponse());
    const relaunch = vi.fn();

    const ports = buildBrowserPorts({ relaunch });
    const outcome = await firstValueFrom(ports.auth.login("ada", "hunter2"));

    expect(outcome.ok).toBe(true);
    expect(relaunch).not.toHaveBeenCalled();
  });

  // The login hint (hardening spec §7 D9) must never advertise an account
  // this page would post to the server. `readDemoAccounts()` derives its list
  // from the env on its own, so this pins it against the auth port composed
  // from the same env: listed ⇒ signs in with no fetch; not listed ⇒ server.
  it("the login hint lists exactly the accounts this page signs in without the server", async () => {
    seedHybridEnv();
    vi.stubEnv("VITE_DEV_AUTH", JSON.stringify({ astark: "dev-pw" }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));
    const ports = buildBrowserPorts({ relaunch: vi.fn() });

    const hinted = readDemoAccounts();
    expect(hinted).toEqual([
      { username: "demo", password: "mcdc2026", role: "Read-Only Guest" },
    ]);
    const listed = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));
    expect(listed.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();

    const unlisted = await firstValueFrom(ports.auth.login("astark", "dev-pw"));
    expect(unlisted.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a malformed demo roster means no roster: today's ws-real mode, plain HTTP auth", async () => {
    vi.stubEnv("VITE_SERVER_URL", WS_URL);
    vi.stubEnv("VITE_DEMO_AUTH", "{not json");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 401 }));

    const ports = buildBrowserPorts();
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(ports.transport).toBeInstanceOf(WsAdapter);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, reason: "invalid" });
  });

  it("a demo roster without a server URL is a simulator build whose roster signs in", async () => {
    vi.stubEnv("VITE_DEMO_AUTH", DEMO_ROSTER);

    const ports = buildBrowserPorts();
    const outcome = await firstValueFrom(ports.auth.login("demo", "mcdc2026"));

    expect(ports.transport).toBeUndefined();
    expect(outcome.ok).toBe(true);
  });
});

function seedHybridEnv(): void {
  vi.stubEnv("VITE_SERVER_URL", WS_URL);
  vi.stubEnv("VITE_DEMO_AUTH", DEMO_ROSTER);
}

interface LoginProbe {
  readonly emissions: readonly AuthOutcome[];
  readonly completed: boolean;
  dispose(): void;
}

/** Subscribes and records what a login observable does. The subscription
 * stays open until `dispose()` — the HTTP leg is async, and tearing it down
 * at once would cancel the chain before the routing port could settle. */
function observe(source: Observable<AuthOutcome>): LoginProbe {
  const emissions: AuthOutcome[] = [];
  let completed = false;
  const subscription = source.subscribe({
    next: (outcome: AuthOutcome) => {
      emissions.push(outcome);
    },
    complete: () => {
      completed = true;
    },
  });

  return {
    emissions,
    get completed(): boolean {
      return completed;
    },
    dispose: () => {
      subscription.unsubscribe();
    },
  };
}

/** Writes a stored session whose token is `token` — a pre-hybrid live
 * login, which `resolveDataSource` reads as "live" when no choice is stored. */
function seedSession(token: string): void {
  const session = {
    token,
    username: "demo",
    exp: Date.now() + 60_000,
    user: {
      name: "Demo Operator",
      initials: "DO",
      role: "Read-Only Guest",
      id: "TRD-0000",
      email: "demo@reactivetrader.io",
      desk: "Demo · Cloud",
      clearance: "LEVEL 1 · VIEW",
    },
  };
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

/** The server's 200 `/login` body for a non-demo user. */
function createLoginResponse(): Response {
  const body = {
    token: "tok-ada",
    user: {
      name: "Ada Lovelace",
      initials: "AL",
      role: "trader",
      id: "u1",
      email: "ada@example.com",
      desk: "FX",
      clearance: "standard",
    },
    exp: Date.now() + 60_000,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const WS_URL = "wss://server.example";

const DEMO_ROSTER = JSON.stringify({ demo: "mcdc2026" });
