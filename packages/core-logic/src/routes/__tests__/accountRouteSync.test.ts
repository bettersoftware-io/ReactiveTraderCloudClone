import { describe, expect, it } from "vitest";

import type { AccountAccessState, AccountNavigation } from "@rtc/core-api";

import {
  ACCOUNT_ACCESS_IDLE,
  NOTHING_HELD,
  stepAccountAccess,
} from "#/presenters/accountAccessFold";
import {
  createFakeRouteHistory,
  type FakeRouteHistory,
} from "#/routes/__tests__/createFakeRouteHistory";
import {
  type AccountRouteSync,
  accountRouteOf,
  accountRouteShows,
  createAccountRouteSync,
} from "#/routes/accountRouteSync";
import { accountRoute, workspaceRoute } from "#/routes/appRoutes";

const REGISTER_BUSY: AccountAccessState = {
  phase: "register",
  busy: true,
  error: null,
};

const SIGNUP_CODE: AccountAccessState = {
  phase: "code",
  flow: "signup",
  email: "a@b.co",
  passwordHeld: true,
  resent: false,
  busy: false,
  error: null,
};

const RESET_CODE: AccountAccessState = { ...SIGNUP_CODE, flow: "reset" };

describe("accountRouteOf", () => {
  it.each<[string, AccountAccessState, string]>([
    ["signIn", ACCOUNT_ACCESS_IDLE, "signIn"],
    ["register", REGISTER_BUSY, "register"],
    [
      "requestReset",
      { phase: "requestReset", busy: false, error: null },
      "requestReset",
    ],
    ["code signup", SIGNUP_CODE, "enterCode"],
    ["code reset", RESET_CODE, "requestReset"],
    [
      "pendingApproval",
      { phase: "pendingApproval", email: "a@b.co" },
      "signIn",
    ],
    ["passwordUnset", { phase: "passwordUnset", email: "a@b.co" }, "signIn"],
    [
      "passwordChanged",
      { phase: "passwordChanged", email: "a@b.co" },
      "signIn",
    ],
  ])("%s", (_name, state, mode) => {
    expect(accountRouteOf(state)).toEqual({ area: "account", mode });
  });
});

describe("accountRouteShows", () => {
  it("shows sign-in on its own route and on every workspace route", () => {
    expect(accountRouteShows(ACCOUNT_ACCESS_IDLE, accountRoute("signIn"))).toBe(
      true,
    );

    for (const tab of ["fx", "credit", "equities", "ops"] as const) {
      expect(accountRouteShows(ACCOUNT_ACCESS_IDLE, workspaceRoute(tab))).toBe(
        true,
      );
    }
  });

  it("does not show register on a workspace route", () => {
    expect(accountRouteShows(REGISTER_BUSY, workspaceRoute("fx"))).toBe(false);
  });

  it("shows nothing for no route", () => {
    expect(accountRouteShows(ACCOUNT_ACCESS_IDLE, null)).toBe(false);
  });
});

describe("createAccountRouteSync", () => {
  it("mounts on the root path by replacing it with sign-in", () => {
    const h = createHarness("/", true);
    h.mount();

    expect(h.history.writes).toEqual(["replace /sign-in"]);
    expect(h.called).toEqual(["returnToSignIn"]);
  });

  it("mounts on create-account with registration by opening it", () => {
    const h = createHarness("/create-account", true);
    h.mount();

    expect(h.called).toEqual(["startRegistration"]);
    expect(h.history.writes).toEqual([]);
    expect(h.phase()).toBe("register");
  });

  it("mounts on create-account without registration by rewriting to sign-in", () => {
    const h = createHarness("/create-account", false);
    h.mount();

    expect(h.history.writes).toEqual(["replace /sign-in"]);
    expect(h.phase()).toBe("signIn");
  });

  it("keeps a workspace URL while signed out", () => {
    const h = createHarness("/credit", true);
    h.mount();

    expect(h.history.writes).toEqual([]);
    expect(h.phase()).toBe("signIn");
  });

  it("observing the state last observed does nothing", () => {
    const h = createHarness("/create-account", true, { reenter: false });
    h.mount();
    h.mount();

    expect(h.called).toEqual(["startRegistration"]);
    expect(h.history.writes).toEqual([]);
  });

  it("a link pushes its route, then runs the intent; the new state writes nothing", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.sync.navigate("startRegistration");

    expect(h.history.writes).toEqual(["push /create-account"]);
    expect(h.called).toEqual(["returnToSignIn", "startRegistration"]);
  });

  it("a link to the route already shown writes nothing but still runs the intent", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.called.length = 0;
    h.sync.navigate("returnToSignIn");

    expect(h.history.writes).toEqual([]);
    expect(h.called).toEqual(["returnToSignIn"]);
  });

  it("a signup result moves the URL to enter-code by replace", () => {
    const h = createHarness("/create-account", true);
    h.mount();
    h.enterState(SIGNUP_CODE);

    expect(h.history.writes).toEqual(["replace /enter-code"]);
  });

  it("the reset code step writes nothing: forgot-password is already shown", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.sync.navigate("startReset");
    h.enterState(RESET_CODE);

    expect(h.history.writes).toEqual(["push /forgot-password"]);
  });

  it("a notice after enter-code replaces with sign-in", () => {
    const h = createHarness("/enter-code", true);
    h.mount();
    h.enterState({ phase: "pendingApproval", email: "a@b.co" });

    expect(h.history.writes).toEqual(["replace /sign-in"]);
  });

  it("traversal opens the mode its URL names, even over a busy form", () => {
    const h = createHarness("/create-account", true);
    h.mount();
    h.enterState(REGISTER_BUSY);
    h.called.length = 0;

    h.history.traverse("/sign-in");
    expect(h.called).toEqual(["returnToSignIn"]);

    h.history.traverse("/create-account");
    expect(h.called).toEqual(["returnToSignIn", "startRegistration"]);

    h.called.length = 0;
    h.history.traverse("/credit");
    expect(h.called).toEqual(["returnToSignIn"]);
    expect(h.history.writes).toEqual([]);
  });

  it("traversal to enter-code without registration rewrites to sign-in", () => {
    const h = createHarness("/sign-in", false);
    h.mount();
    h.called.length = 0;
    h.history.traverse("/enter-code");

    expect(h.history.writes).toEqual(["replace /sign-in"]);
    expect(h.called).toEqual(["returnToSignIn"]);
  });

  it("traversal to forgot-password opens the reset request, writing nothing", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.called.length = 0;
    h.history.traverse("/forgot-password");

    expect(h.called).toEqual(["startReset"]);
    expect(h.history.writes).toEqual([]);
  });

  it("traversal to enter-code opens code entry, writing nothing", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.called.length = 0;
    h.history.traverse("/enter-code");

    expect(h.called).toEqual(["startCodeEntry"]);
    expect(h.history.writes).toEqual([]);
  });

  it("the already-have-a-code link pushes enter-code, then runs its intent", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.called.length = 0;
    h.sync.navigate("startCodeEntry");

    expect(h.history.writes).toEqual(["push /enter-code"]);
    expect(h.called).toEqual(["startCodeEntry"]);
  });

  it("dispose stops listening", () => {
    const h = createHarness("/sign-in", true);
    h.mount();
    h.called.length = 0;
    h.sync.dispose();
    h.history.traverse("/create-account");

    expect(h.called).toEqual([]);
  });
});

interface AccountHarness {
  readonly history: FakeRouteHistory;
  readonly sync: AccountRouteSync;
  readonly called: AccountNavigation[];
  phase(): string;
  mount(): void;
  /** Sets the machine's state, as a result from the server would, and
   * lets the controller observe it. */
  enterState(next: AccountAccessState): void;
}

interface AccountHarnessOptions {
  /** Makes each intent behave like the real machine: the state steps and
   * the controller observes it synchronously. Off, an intent is only
   * recorded. */
  readonly reenter?: boolean;
}

function createHarness(
  path: string,
  registrationAvailable: boolean,
  { reenter = true }: AccountHarnessOptions = {},
): AccountHarness {
  const history = createFakeRouteHistory(path);
  const called: AccountNavigation[] = [];
  let state: AccountAccessState = ACCOUNT_ACCESS_IDLE;

  function run(navigation: AccountNavigation): void {
    called.push(navigation);

    if (reenter) {
      enterState(
        stepAccountAccess(state, NOTHING_HELD, { kind: navigation }).state,
      );
    }
  }

  function enterState(next: AccountAccessState): void {
    state = next;
    sync.observe(state);
  }

  const sync = createAccountRouteSync({
    routes: history,
    registrationAvailable,
    intents: {
      returnToSignIn: () => {
        return run("returnToSignIn");
      },
      startRegistration: () => {
        return run("startRegistration");
      },
      startReset: () => {
        return run("startReset");
      },
      startCodeEntry: () => {
        return run("startCodeEntry");
      },
    },
  });

  return {
    history,
    sync,
    called,
    phase: (): string => {
      return state.phase;
    },
    mount: (): void => {
      sync.observe(state);
    },
    enterState,
  };
}
