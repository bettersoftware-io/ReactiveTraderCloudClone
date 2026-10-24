import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AuthViewState,
  BootSequenceState,
  WorkspaceNavState,
} from "@rtc/core-api";
import {
  BOOT_DURATION_MS,
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  type BootVariant,
  DEFAULT_LOGIN_WAIT_VARIANT,
} from "@rtc/domain";

import { storeToStateStream } from "#/bridge/out";
import { createStore } from "#/kernel/store";
import { createBootMachine } from "#/machines/boot";
import { createWorkspaceNavMachine } from "#/machines/workspaceNav";

describe("createWorkspaceNavMachine (async)", () => {
  it("shows admin in the first emission of a resumed administrator, and loses it with the access", () => {
    const auth = createStore<AuthViewState>(createAuthView("admin"));
    const nav = createWorkspaceNavMachine(
      storeToStateStream(auth),
      new AbortController().signal,
    );
    const seen: WorkspaceNavState[] = [];
    const sub = nav.state$.subscribe((s) => {
      seen.push(s);
    });
    nav.intents.switchTab("admin");
    auth.set(createAuthView("user"));

    expect(seen[0]?.visibleTabs).toEqual([...USER_TABS, "admin"]);
    expect(seen.at(-2)?.activeTab).toBe("admin");
    expect(seen.at(-1)).toEqual({ activeTab: "fx", visibleTabs: USER_TABS });
    sub.unsubscribe();
  });

  it("refuses a switch to a hidden tab without emitting", () => {
    const nav = createWorkspaceNavMachine(
      storeToStateStream(createStore<AuthViewState>(createAuthView("user"))),
      new AbortController().signal,
    );
    const seen: WorkspaceNavState[] = [];
    const sub = nav.state$.subscribe((s) => {
      seen.push(s);
    });
    nav.intents.switchTab("admin");

    expect(seen).toHaveLength(1);
    sub.unsubscribe();
  });

  it("drops a switch to the tab already active and moves on a new one", () => {
    const nav = createWorkspaceNavMachine(
      storeToStateStream(createStore<AuthViewState>(createAuthView(null))),
      new AbortController().signal,
    );
    const seen: WorkspaceNavState[] = [];
    const sub = nav.state$.subscribe((s) => {
      seen.push(s);
    });
    nav.intents.switchTab("fx");
    nav.intents.switchTab("credit");

    expect(seen).toEqual([
      { activeTab: "fx", visibleTabs: USER_TABS },
      { activeTab: "credit", visibleTabs: USER_TABS },
    ]);
    sub.unsubscribe();
  });

  // Read from a FRESH subscriber's seed after the abort: a subscriber made
  // before it stays attached to the shared source and would not tell.
  it("after the lifetime aborts, switchTab changes nothing", () => {
    const lifetime = new AbortController();
    const nav = createWorkspaceNavMachine(
      storeToStateStream(createStore<AuthViewState>(createAuthView(null))),
      lifetime.signal,
    );
    lifetime.abort();
    nav.intents.switchTab("credit");
    const fresh: WorkspaceNavState[] = [];
    nav.state$
      .subscribe((s) => {
        fresh.push(s);
      })
      .unsubscribe();

    expect(fresh).toEqual([{ activeTab: "fx", visibleTabs: USER_TABS }]);
  });
});

describe("createBootMachine (async)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the persisted variant at creation and finishes after the ramp, calling onDone once", async () => {
    const advanced: string[] = [];
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: (next: BootVariant) => {
        advanced.push(next);
      },
      onDone: () => {
        done += 1;
      },
    });

    expect(advanced).toEqual([BOOT_VARIANTS[1]]);
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS + BOOT_TICK_MS);
    expect(m.state$.getValue()).toMatchObject({ progress: 100, done: true });
    m.intents.skip();
    expect(done).toBe(1);
    m.dispose();
  });

  it("dispose stops the ramp itself — no later state for an attached subscriber — and onDone never runs", async () => {
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: () => {},
      onDone: () => {
        done += 1;
      },
    });
    const seen: BootSequenceState[] = [];
    const sub = m.state$.subscribe((s) => {
      seen.push(s);
    });
    await vi.advanceTimersByTimeAsync(BOOT_TICK_MS * 3);
    m.dispose();
    const count = seen.length;
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS * 2);
    m.intents.skip();

    expect(seen.length).toBe(count);
    expect(done).toBe(0);
    sub.unsubscribe();
  });
});

function createAuthView(access: "admin" | "user" | null): AuthViewState {
  return {
    status: access === null ? "unauthenticated" : "authenticated",
    user:
      access === null
        ? null
        : {
            id: "u1",
            name: "U One",
            initials: "UO",
            role: "Trader",
            email: "u1@example.com",
            desk: "FX",
            clearance: "L1",
            access,
          },
    locked: false,
    unlocking: false,
    error: null,
    failure: null,
    waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
  };
}

const USER_TABS = ["fx", "credit", "equities", "ops"];
