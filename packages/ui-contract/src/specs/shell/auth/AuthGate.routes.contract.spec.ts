/**
 * The route hooks across sign-in and sign-out (spec §5, §6): the real
 * `App` under the real `AuthGate` (`AuthGatedAppShell`), over one World and
 * one fake page history. Signing in unmounts the login screen's route hook
 * and mounts the workspace's; signing out the reverse. An unmounted hook
 * must leave the history alone — a leaked one would open login forms on a
 * disposed machine, or switch tabs on a disposed core, at the next Back.
 */

import { AuthGatedAppShell } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import type { AuthGatedAppPage } from "@ui-contract/pages/shell/auth/AuthGatedAppPage";
import { afterEach, describe, expect, it } from "vitest";

import { parseAppRoute } from "@rtc/core-logic";

afterEach(() => {
  cleanupMounted();
});

describe("AuthGate routes — signing in hands the URL to the workspace", () => {
  it("lands on the tab a signed-out visitor's URL names, writing nothing", () => {
    const page = mountSignedOut("#/credit");

    expect(page.showsLogin()).toBe(true);

    page.signIn();

    expect(page.showsLogin()).toBe(false);
    expect(page.header.isActive("credit")).toBe(true);
    expect(page.routeWrites()).toEqual([]);
    expect(page.routeHash()).toBe("#/credit");
  });

  it("replaces the sign-in route with the tab on screen", () => {
    const page = mountSignedOut("");

    page.signIn();

    expect(page.header.isActive("fx")).toBe(true);
    expect(page.routeWrites()).toEqual(["replace #/sign-in", "replace #/fx"]);
    expect(page.routeHash()).toBe("#/fx");
  });
});

describe("AuthGate routes — an unmounted hook leaves the history alone", () => {
  it("opens no login form when Back lands on a login route after sign-in", async () => {
    const page = mountSignedOut("#/sign-in");

    page.signIn();
    const navigations = [...page.login.navigations()];
    const writesBefore = page.routeWrites().length;

    await page.traverse("#/create-account");

    expect(page.showsLogin()).toBe(false);
    // The discriminator: a leaked login hook would open the form here.
    expect(page.login.navigations()).toEqual(navigations);
    expect(
      page
        .routeWrites()
        .slice(writesBefore)
        .filter((write) => {
          return (
            parseAppRoute(write.slice(write.indexOf("#")))?.area === "account"
          );
        }),
    ).toEqual([]);
  });

  it("rewrites no login route to a tab after sign-out", async () => {
    const page = mountSignedOut("#/credit");

    page.signIn();
    page.signOut();
    await page.traverse("#/forgot-password");

    expect(page.login.phase()).toBe("requestReset");
    expect(page.routeWrites()).toEqual([]);
    expect(page.routeHash()).toBe("#/forgot-password");
  });
});

/** Mounts the gated app signed out, with registration, on a page whose
 * history holds `hash`. */
function mountSignedOut(hash: string): AuthGatedAppPage {
  return mount(AuthGatedAppShell, {
    auth: { status: "unauthenticated" },
    registrationAvailable: true,
    routeHash: hash,
  });
}
