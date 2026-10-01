import { lastValueFrom, type Observable, of, toArray } from "rxjs";
import { describe, expect, it, type Mock, vi } from "vitest";

import type { AuthOutcome, AuthPort, SessionUser } from "@rtc/domain";

import { InMemoryDataSourceStore } from "./InMemoryDataSourceStore";
import { InMemorySessionStore } from "./InMemorySessionStore";
import {
  createRoutingAuthPort,
  type RoutingAuthPortDeps,
} from "./RoutingAuthPort";

describe("createRoutingAuthPort", () => {
  it("a demo match on a sim page emits the outcome, records sim, and never calls the server", async () => {
    const harness = createHarness({
      composed: "sim",
      demo: createOkOutcome("demo"),
    });

    const outcomes = await collect(harness.port.login("demo", "mcdc2026"));

    expect(outcomes).toEqual([createOkOutcome("demo")]);
    expect(harness.live.login).not.toHaveBeenCalled();
    expect(harness.dataSourceStore.read()).toBe("sim");
    expect(harness.relaunch).not.toHaveBeenCalled();
  });

  it("a live match on a sim page writes the session and the choice, relaunches, and emits nothing", async () => {
    const harness = createHarness({
      composed: "sim",
      demo: createInvalidOutcome(),
      live: createOkOutcome("ada"),
    });

    const outcomes = await collect(harness.port.login("ada", "hunter2"));

    expect(outcomes).toEqual([]);
    expect(harness.dataSourceStore.read()).toBe("live");
    expect(harness.sessionStore.read()).toEqual({
      token: "tok-ada",
      user: createUser("ada"),
      username: "ada",
      exp: 1_800_000_000,
    });
    expect(harness.relaunch).toHaveBeenCalledTimes(1);
  });

  it("writes the session BEFORE relaunching", async () => {
    const sessionStore = new InMemorySessionStore();
    const seenAtRelaunch: string[] = [];
    const harness = createHarness({
      composed: "sim",
      demo: createInvalidOutcome(),
      live: createOkOutcome("ada"),
      sessionStore,
      relaunch: (): void => {
        seenAtRelaunch.push(sessionStore.read()?.username ?? "<none>");
      },
    });

    await collect(harness.port.login("ada", "hunter2"));

    // A relaunch that ran first would reload into a page with no session to resume.
    expect(seenAtRelaunch).toEqual(["ada"]);
  });

  it("a live match on a live page emits the outcome and does not relaunch", async () => {
    const harness = createHarness({
      composed: "live",
      demo: createInvalidOutcome(),
      live: createOkOutcome("ada"),
    });

    const outcomes = await collect(harness.port.login("ada", "hunter2"));

    expect(outcomes).toEqual([createOkOutcome("ada")]);
    expect(harness.dataSourceStore.read()).toBe("live");
    expect(harness.relaunch).not.toHaveBeenCalled();
  });

  it("a demo match on a live page relaunches into sim (the post-logout path)", async () => {
    const harness = createHarness({
      composed: "live",
      demo: createOkOutcome("demo"),
    });

    const outcomes = await collect(harness.port.login("demo", "mcdc2026"));

    expect(outcomes).toEqual([]);
    expect(harness.dataSourceStore.read()).toBe("sim");
    expect(harness.sessionStore.read()?.username).toBe("demo");
    expect(harness.relaunch).toHaveBeenCalledTimes(1);
  });

  it("when both fail, the live failure is what the user sees", async () => {
    const unavailable = createHarness({
      composed: "sim",
      demo: createInvalidOutcome(),
      live: createFailure("unavailable"),
    });

    const wrongPassword = createHarness({
      composed: "sim",
      demo: createInvalidOutcome(),
      live: createFailure("invalid"),
    });

    expect(await collect(unavailable.port.login("ada", "x"))).toEqual([
      { ok: false, reason: "unavailable" },
    ]);
    expect(await collect(wrongPassword.port.login("ada", "x"))).toEqual([
      { ok: false, reason: "invalid" },
    ]);
    expect(unavailable.dataSourceStore.read()).toBeNull();
    expect(unavailable.relaunch).not.toHaveBeenCalled();
  });

  it("forwards the typed username and password to both ports unchanged", async () => {
    const harness = createHarness({
      composed: "sim",
      demo: createInvalidOutcome(),
      live: createOkOutcome("ada"),
    });

    await collect(harness.port.login("Ada ", "p@ss word"));

    expect(harness.demo.login).toHaveBeenCalledWith("Ada ", "p@ss word");
    expect(harness.live.login).toHaveBeenCalledWith("Ada ", "p@ss word");
  });
});

type LoginMock = Mock<AuthPort["login"]>;

interface MockAuthPort extends AuthPort {
  readonly login: LoginMock;
}

interface HarnessOverrides {
  readonly composed: RoutingAuthPortDeps["composed"];
  readonly demo?: AuthOutcome;
  readonly live?: AuthOutcome;
  readonly sessionStore?: InMemorySessionStore;
  readonly relaunch?: () => void;
}

interface Harness {
  readonly port: AuthPort;
  readonly demo: MockAuthPort;
  readonly live: MockAuthPort;
  readonly sessionStore: InMemorySessionStore;
  readonly dataSourceStore: InMemoryDataSourceStore;
  readonly relaunch: Mock<() => void>;
}

function noop(): void {
  // The default relaunch: nothing to do in a unit test.
}

function collect(source: Observable<AuthOutcome>): Promise<AuthOutcome[]> {
  return lastValueFrom(source.pipe(toArray()));
}

function createPort(outcome: AuthOutcome): MockAuthPort {
  return {
    login: vi.fn((): Observable<AuthOutcome> => {
      return of(outcome);
    }),
  };
}

function createHarness(overrides: HarnessOverrides): Harness {
  const demo = createPort(overrides.demo ?? createInvalidOutcome());
  const live = createPort(overrides.live ?? createInvalidOutcome());
  const sessionStore = overrides.sessionStore ?? new InMemorySessionStore();
  const dataSourceStore = new InMemoryDataSourceStore();
  const relaunch = vi.fn(overrides.relaunch ?? noop);
  const port = createRoutingAuthPort({
    demo,
    live,
    composed: overrides.composed,
    sessionStore,
    dataSourceStore,
    relaunch,
  });
  return { port, demo, live, sessionStore, dataSourceStore, relaunch };
}

function createUser(username: string): SessionUser {
  return {
    name: username,
    initials: username.slice(0, 2).toUpperCase(),
    role: "trader",
    id: `id-${username}`,
    email: `${username}@example.com`,
    desk: "FX",
    clearance: "standard",
  };
}

function createOkOutcome(username: string): AuthOutcome {
  return {
    ok: true,
    token: `tok-${username}`,
    user: createUser(username),
    exp: 1_800_000_000,
  };
}

function createInvalidOutcome(): AuthOutcome {
  return { ok: false, reason: "invalid" };
}

function createFailure(reason: "invalid" | "unavailable"): AuthOutcome {
  return { ok: false, reason };
}
