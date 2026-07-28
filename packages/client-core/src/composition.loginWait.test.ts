// packages/client-core/src/composition.loginWait.test.ts
//
// The two login-wait inspection preferences are resolved in composition, not
// in AuthPresenter: the presenter asks one question ("which treatment for this
// attempt?") and composition decides whether the answer comes from the
// persisted cycle or from a user's pin. These tests pin that split, plus the
// delay decorator's effect on a real createApp wiring.

import { NEVER, type Observable } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AuthSimulator,
  type LoginWaitDelay,
  type LoginWaitStyle,
  type LoginWaitVariant,
  PreferencesSimulator,
} from "@rtc/domain";

import { InMemorySessionStore } from "#/adapters/InMemorySessionStore";
import type { AppPorts } from "#/adapters/portFactory";
import { createSimulatorPorts } from "#/adapters/portFactory";
import { type App, createApp } from "#/composition";

const PASSWORD = "pw";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("login-wait style pin", () => {
  it("uses the persisted cycle when the style is auto", () => {
    const app = appWith({
      loginWaitStyle: "auto",
      loginWaitVariant: "reactor",
    });
    app.presenters.auth.login("demo", PASSWORD);
    expect(waitVariantOf(app)).toBe("reactor");
  });

  it("advances the cycle on each attempt while the style is auto", () => {
    const prefs = new PreferencesSimulator({
      loginWaitStyle: "auto",
      loginWaitVariant: "handshake",
    });
    const app = appWithPrefs(prefs);

    app.presenters.auth.login("demo", PASSWORD);
    expect(waitVariantOf(app)).toBe("handshake");
    expect(storedVariant(prefs)).toBe("reactor");
  });

  it("renders the pinned treatment instead of the cycle's next entry", () => {
    const app = appWith({
      loginWaitStyle: "handshake",
      loginWaitVariant: "reactor",
    });
    app.presenters.auth.login("demo", PASSWORD);
    expect(waitVariantOf(app)).toBe("handshake");
  });

  it("never writes the cycle pointer while pinned", () => {
    // The pointer is what "auto" resumes from. If pinning advanced it, coming
    // back to auto would drop the user somewhere they never chose.
    //
    // Asserted as "setLoginWaitVariant is not CALLED", not as "the stored
    // value is unchanged". With only two variants the pinned successor equals
    // the seed in half of all seed/pin combinations, so a value assertion
    // passes against a broken `advance` for those seeds — verified: dropping
    // the pin guard left the value-based version of this test green.
    const prefs = new PreferencesSimulator({
      loginWaitStyle: "reactor",
      loginWaitVariant: "handshake",
    });
    const writes = recordVariantWrites(prefs);
    const app = appWithPrefs(prefs);

    app.presenters.auth.login("demo", PASSWORD);
    app.presenters.auth.login("demo", PASSWORD);

    expect(writes).toEqual([]);
    expect(storedVariant(prefs)).toBe("handshake");
  });

  it("still writes the cycle pointer on every auto attempt", () => {
    // The guard's other half — proving it suppresses writes only when pinned.
    const prefs = new PreferencesSimulator({
      loginWaitStyle: "auto",
      loginWaitVariant: "handshake",
    });
    const writes = recordVariantWrites(prefs);
    const app = appWithPrefs(prefs);

    app.presenters.auth.login("demo", PASSWORD);
    app.presenters.auth.login("demo", PASSWORD);

    expect(writes).toEqual(["reactor", "handshake"]);
  });

  it("resumes the cycle where it left off when the pin is released", () => {
    const prefs = new PreferencesSimulator({
      loginWaitStyle: "auto",
      loginWaitVariant: "handshake",
    });
    const app = appWithPrefs(prefs);

    // One auto attempt moves the pointer handshake → reactor.
    app.presenters.auth.login("demo", PASSWORD);
    expect(storedVariant(prefs)).toBe("reactor");

    // Pin to "reactor" specifically: its successor is "handshake", so a broken
    // `advance` would visibly rewind the pointer here rather than coincide
    // with it (see the seed/pin analysis on the test above).
    prefs.setLoginWaitStyle("reactor");
    app.presenters.auth.login("demo", PASSWORD);
    app.presenters.auth.login("demo", PASSWORD);
    expect(storedVariant(prefs)).toBe("reactor");

    prefs.setLoginWaitStyle("auto");
    app.presenters.auth.login("demo", PASSWORD);
    expect(waitVariantOf(app)).toBe("reactor");
  });
});

describe("login-wait delay", () => {
  it("authenticates synchronously when the delay is off", () => {
    const app = appWith({ loginWaitDelay: "off" });
    app.presenters.auth.login("demo", PASSWORD);
    expect(statusOf(app)).toBe("authenticated");
  });

  it("holds the app in authenticating for the chosen duration", () => {
    const app = appWith({ loginWaitDelay: "3s" });
    app.presenters.auth.login("demo", PASSWORD);

    expect(statusOf(app)).toBe("authenticating");
    vi.advanceTimersByTime(2_999);
    expect(statusOf(app)).toBe("authenticating");

    vi.advanceTimersByTime(1);
    expect(statusOf(app)).toBe("authenticated");
  });

  it("keeps the wait treatment mounted for the whole delay", () => {
    // The reason the setting exists: the treatment is chosen when the attempt
    // starts and must still be the reported state while the delay runs.
    const app = appWith({
      loginWaitDelay: "6s",
      loginWaitStyle: "reactor",
    });
    app.presenters.auth.login("demo", PASSWORD);

    vi.advanceTimersByTime(5_000);
    expect(statusOf(app)).toBe("authenticating");
    expect(waitVariantOf(app)).toBe("reactor");
  });

  it("delays a rejected sign-in too", () => {
    const app = appWith({ loginWaitDelay: "1s" });
    app.presenters.auth.login("demo", "wrong");

    expect(statusOf(app)).toBe("authenticating");
    vi.advanceTimersByTime(1_000);
    expect(statusOf(app)).toBe("unauthenticated");
  });

  it("picks up a delay change without recomposing the app", () => {
    const prefs = new PreferencesSimulator({ loginWaitDelay: "off" });
    const app = appWithPrefs(prefs);

    app.presenters.auth.login("demo", PASSWORD);
    expect(statusOf(app)).toBe("authenticated");

    app.presenters.auth.logout();
    prefs.setLoginWaitDelay("3s");
    app.presenters.auth.login("demo", PASSWORD);
    expect(statusOf(app)).toBe("authenticating");

    vi.advanceTimersByTime(3_000);
    expect(statusOf(app)).toBe("authenticated");
  });
});

describe("loginWaitPreferences presenter", () => {
  it("writes both preferences through the port", () => {
    const prefs = new PreferencesSimulator({});
    const app = appWithPrefs(prefs);

    app.presenters.loginWaitPreferences.setStyle("reactor");
    app.presenters.loginWaitPreferences.setDelay("6s");

    expect(readOnce(prefs.loginWaitStyle$())).toBe("reactor");
    expect(readOnce(prefs.loginWaitDelay$())).toBe("6s");
  });

  it("replays the current values to a late subscriber", () => {
    const app = appWith({ loginWaitStyle: "handshake", loginWaitDelay: "1s" });
    expect(readOnce(app.presenters.loginWaitPreferences.style$)).toBe(
      "handshake",
    );
    expect(readOnce(app.presenters.loginWaitPreferences.delay$)).toBe("1s");
  });
});

interface WaitSeed {
  loginWaitStyle?: LoginWaitStyle;
  loginWaitVariant?: LoginWaitVariant;
  loginWaitDelay?: LoginWaitDelay;
}

function appWith(seed: WaitSeed): App {
  return appWithPrefs(new PreferencesSimulator(seed));
}

function appWithPrefs(preferences: PreferencesSimulator): App {
  return createApp(portsWith(preferences));
}

function portsWith(preferences: PreferencesSimulator): AppPorts {
  return {
    ...createSimulatorPorts({
      preferences,
      auth: new AuthSimulator({ demo: PASSWORD }),
      sessionStore: new InMemorySessionStore(),
    }),
    connectionEvents: {
      events: () => {
        return NEVER;
      },
    },
  };
}

function readOnce<T>(source$: Observable<T>): T {
  let value: T | undefined;
  source$.subscribe((v) => {
    value = v;
  });

  if (value === undefined) {
    throw new Error("stream did not emit synchronously");
  }

  return value;
}

function waitVariantOf(app: App): LoginWaitVariant {
  return readOnce(app.presenters.auth.state$).waitVariant;
}

function statusOf(app: App): string {
  return readOnce(app.presenters.auth.state$).status;
}

function storedVariant(prefs: PreferencesSimulator): LoginWaitVariant {
  return readOnce(prefs.loginWaitVariant$());
}

/** Records every setLoginWaitVariant call without breaking the subject chain
 * (same spy shape as composition.boot.test.ts's setBootVariant recorder). */
function recordVariantWrites(prefs: PreferencesSimulator): LoginWaitVariant[] {
  const writes: LoginWaitVariant[] = [];
  const original = prefs.setLoginWaitVariant.bind(prefs);

  prefs.setLoginWaitVariant = (variant: LoginWaitVariant): void => {
    writes.push(variant);
    original(variant);
  };

  return writes;
}
