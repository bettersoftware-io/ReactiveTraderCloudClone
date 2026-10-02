import { firstValueFrom, type Observable } from "rxjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DATA_SOURCE_STORAGE_KEY,
  type StoredSession,
  WsAdapter,
} from "@rtc/client-core";
import type { AuthOutcome, SessionUser } from "@rtc/domain";

import { SESSION_STORAGE_KEY } from "#/app/adapters/LocalStorageSessionStore";
import { buildBrowserPorts } from "#/app/buildBrowserPorts";

// The Solid mirror of client-react's buildBrowserPorts.hybrid.test.ts — the
// two composition roots are functionally identical, so the hybrid contract
// (hardening spec §8.4) they must satisfy is identical too. The siblings
// cover the simulator branch (buildBrowserPorts.test.ts) and the ws-real
// branch (buildBrowserPorts.wsBranch.test.ts); this file is the THIRD shape,
// a server URL AND a demo roster, where the stored choice picks the branch
// and a login can change it.

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
    const login = observe(ports.auth.login("ada", "hunter2"));
    // The HTTP leg is async; the relaunch call is the witness that it landed.
    await vi.waitFor(() => {
      expect(relaunch).toHaveBeenCalledTimes(1);
    });
    login.stop();

    // Spec §8.3 step 3: the cross-mode login NEVER emits and never completes —
    // the login screen stays authenticating until the page unloads.
    expect(login.emissions).toEqual([]);
    expect(login.completed).toBe(false);
    expect(localStorage.getItem(DATA_SOURCE_STORAGE_KEY)).toBe("live");
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "null"),
    ).toMatchObject({
      username: "ada",
      token: "tok-ada",
    });
    expect(relaunch).toHaveBeenCalledTimes(1);
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

interface ObservedLogin {
  readonly emissions: AuthOutcome[];
  readonly completed: boolean;
  /** Ends the subscription once the test has its witness. */
  readonly stop: () => void;
}

/** Subscribes and records what the login stream does, without awaiting a
 * value or a completion — the cross-mode path delivers neither. */
function observe(source: Observable<AuthOutcome>): ObservedLogin {
  const emissions: AuthOutcome[] = [];
  const observed = {
    emissions,
    completed: false,
    stop: (): void => {
      subscription.unsubscribe();
    },
  };

  const subscription = source.subscribe({
    next: (outcome: AuthOutcome) => {
      emissions.push(outcome);
    },
    complete: () => {
      observed.completed = true;
    },
  });
  return observed;
}

function seedSession(token: string): void {
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify(createStoredSession(token)),
  );
}

/** The shape `LocalStorageSessionStore` accepts — a pre-hybrid live session. */
function createStoredSession(token: string): StoredSession {
  return {
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
}

function createLoginResponse(): Response {
  return new Response(JSON.stringify(createLoginPayload()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** What the server's `/login` answers for a registered (non-demo) account. */
function createLoginPayload(): LoginPayload {
  return {
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
}

interface LoginPayload {
  readonly token: string;
  readonly user: SessionUser;
  readonly exp: number;
}

const WS_URL = "wss://server.example";

const DEMO_ROSTER = JSON.stringify({ demo: "mcdc2026" });
