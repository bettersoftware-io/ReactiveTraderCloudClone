/**
 * LoginScreen hash routes (spec §6): the URL follows the login screen's
 * mode, the four links push, a result replaces, and Back/Forward reopens
 * the mode the URL names. Every mount but the last is seeded with a fake
 * page history (`routeHash`); the world's fake `accountAccess` moves to the
 * phase each navigation intent opens, so the hook sees the same states a
 * real machine would emit.
 */

import { LoginScreen } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import type { LoginScreenPage } from "@ui-contract/pages/shell/auth/LoginScreenPage";
import { afterEach, describe, expect, it } from "vitest";

import type { AccountAccessState } from "@rtc/core-api";

afterEach(() => {
  cleanupMounted();
});

describe("LoginScreen routes — mount", () => {
  it("replaces an empty hash with the sign-in route", () => {
    const page = mountRouted("");

    expect(page.phase()).toBe("signIn");
    expect(page.routeWrites()).toEqual(["replace #/sign-in"]);
  });

  it("opens the create-account form the URL names, writing nothing", () => {
    const page = mountRouted("#/create-account");

    expect(page.phase()).toBe("register");
    expect(page.routeWrites()).toEqual([]);
  });

  it("opens the reset request the URL names", () => {
    const page = mountRouted("#/forgot-password");

    expect(page.phase()).toBe("requestReset");
    expect(page.routeWrites()).toEqual([]);
  });

  it("rewrites an account route to sign-in on a page without registration", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: false,
      routeHash: "#/create-account",
    });

    expect(page.phase()).toBe("signIn");
    expect(page.routeWrites()).toEqual(["replace #/sign-in"]);
  });

  it("keeps a workspace route, showing the sign-in form", () => {
    const page = mountRouted("#/credit");

    expect(page.phase()).toBe("signIn");
    expect(page.routeWrites()).toEqual([]);
    expect(page.routeHash()).toBe("#/credit");
  });
});

describe("LoginScreen routes — the links push", () => {
  it("pushes the create-account route from Create account", async () => {
    const page = mountRouted("#/sign-in");

    await page.openCreateAccount();

    expect(page.phase()).toBe("register");
    expect(page.routeWrites()).toEqual(["push #/create-account"]);
    expect(page.navigations()).toEqual(["returnToSignIn", "startRegistration"]);
  });

  it("pushes the reset route from Forgot password?", async () => {
    const page = mountRouted("#/sign-in");

    await page.openForgotPassword();

    expect(page.phase()).toBe("requestReset");
    expect(page.routeWrites()).toEqual(["push #/forgot-password"]);
    expect(page.navigations()).toEqual(["returnToSignIn", "startReset"]);
  });

  it("pushes the code route from the sign-in form's code offer", async () => {
    const page = mount(LoginScreen, {
      auth: {
        status: "unauthenticated",
        error: "Email not confirmed",
        failure: "unconfirmed",
      },
      registrationAvailable: true,
      routeHash: "#/sign-in",
    });

    await page.openCodeEntry();

    expect(page.phase()).toBe("code");
    expect(page.routeWrites()).toEqual(["push #/enter-code"]);
    expect(page.navigations()).toEqual(["returnToSignIn", "startCodeEntry"]);
  });

  it("pushes the code route from I already have a code", async () => {
    const page = mountRouted("#/create-account");

    await page.openCodeEntry();

    expect(page.phase()).toBe("code");
    expect(page.routeWrites()).toEqual(["push #/enter-code"]);
    expect(page.navigations()).toEqual(["startRegistration", "startCodeEntry"]);
  });

  it.each([
    {
      from: "#/create-account",
      phase: "register",
      opened: "startRegistration",
    },
    { from: "#/enter-code", phase: "code", opened: "startCodeEntry" },
    { from: "#/forgot-password", phase: "requestReset", opened: "startReset" },
  ])(
    "pushes the sign-in route from Back to sign in on $from",
    async ({ from, phase, opened }) => {
      const page = mountRouted(from);

      expect(page.phase()).toBe(phase);

      await page.goBack();

      expect(page.phase()).toBe("signIn");
      expect(page.routeWrites()).toEqual(["push #/sign-in"]);
      expect(page.navigations()).toEqual([opened, "returnToSignIn"]);
    },
  );
});

describe("LoginScreen routes — Back and Forward", () => {
  it("returns to sign-in when the history lands on #/sign-in, writing nothing", async () => {
    const page = mountRouted("#/sign-in");

    await page.openCreateAccount();
    await page.traverse("#/sign-in");

    expect(page.phase()).toBe("signIn");
    expect(page.navigations()).toEqual([
      "returnToSignIn",
      "startRegistration",
      "returnToSignIn",
    ]);
    expect(page.routeWrites()).toEqual(["push #/create-account"]);
  });

  it("opens the reset request when the history lands on #/forgot-password", async () => {
    const page = mountRouted("#/sign-in");

    await page.traverse("#/forgot-password");

    expect(page.phase()).toBe("requestReset");
    expect(page.navigations()).toEqual(["returnToSignIn", "startReset"]);
    expect(page.routeWrites()).toEqual([]);
  });
});

describe("LoginScreen routes — results replace", () => {
  it("replaces the create-account route once the sign-up code step arrives, so Back skips the spent form", async () => {
    const world = createWorld({
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
      routeHash: "#/sign-in",
    });
    const page = mountWith(world, LoginScreen);

    await page.openCreateAccount();
    await page.flushAsync(() => {
      world.accountAccess.next(createSignUpCodeState());

      return Promise.resolve();
    });

    expect(page.phase()).toBe("code");
    expect(page.routeWrites()).toEqual([
      "push #/create-account",
      "replace #/enter-code",
    ]);

    await page.traverse("#/sign-in");

    expect(page.phase()).toBe("signIn");
    expect(page.routeWrites()).toHaveLength(2);
  });
});

describe("LoginScreen routes — a page with no route history", () => {
  it("still navigates through every link", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      registrationAvailable: true,
    });

    await page.openCreateAccount();
    await page.openCodeEntry();
    await page.goBack();
    await page.openForgotPassword();

    expect(page.phase()).toBe("requestReset");
    expect(page.navigations()).toEqual([
      "startRegistration",
      "startCodeEntry",
      "returnToSignIn",
      "startReset",
    ]);
  });

  it("refuses to read a history it was never given, naming the mount option", () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });

    expect(() => {
      return page.routeWrites();
    }).toThrow(
      "this mount has no route history: pass `routeHash` to mount(...)",
    );
  });
});

/** Mounts LoginScreen signed out, with registration, on a page whose
 * history holds `hash`. */
function mountRouted(hash: string): LoginScreenPage {
  return mount(LoginScreen, {
    auth: { status: "unauthenticated" },
    registrationAvailable: true,
    routeHash: hash,
  });
}

/** The code step a finished sign-up request leaves: address and password
 * held. */
function createSignUpCodeState(): AccountAccessState {
  return {
    phase: "code",
    flow: "signup",
    email: "ann@desk.io",
    passwordHeld: true,
    resent: false,
    busy: false,
    error: null,
  };
}
