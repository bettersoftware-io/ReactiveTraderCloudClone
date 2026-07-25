import { AuthGate } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("AuthGate", () => {
  it("shows the login screen and hides the app while unauthenticated", () => {
    const page = mount(AuthGate, { auth: { status: "unauthenticated" } });
    expect(page.showsLogin()).toBe(true);
    expect(page.showsChildren()).toBe(false);
  });

  it("shows the app and hides the login screen once authenticated", () => {
    const page = mount(AuthGate, { auth: { status: "authenticated" } });
    expect(page.showsChildren()).toBe(true);
    expect(page.showsLogin()).toBe(false);
  });

  it("keeps showing the login screen (not the app) while authenticating", () => {
    const page = mount(AuthGate, { auth: { status: "authenticating" } });
    expect(page.showsLogin()).toBe(true);
    expect(page.showsChildren()).toBe(false);
  });

  it("keeps the app mounted while an unlock is in flight", () => {
    // AuthGate only ever reads `status`, so this seeds `unlocking` for
    // documentation, not because AuthGate branches on it — this case would
    // pass even if `unlocking` did not exist. What it DOES guard is the
    // trap of modelling the unlock wait as its own status (e.g.
    // "authenticating"), which would make AuthGate swap the whole app for
    // LoginScreen mid-unlock. The actual invariant that `status` never
    // leaves "authenticated" during a real unlock is pinned at the
    // presenter level by AuthPresenter.test.ts's "unlock sets unlocking
    // while in flight and leaves status authenticated".
    const page = mount(AuthGate, {
      auth: { status: "authenticated", locked: true, unlocking: true },
    });
    expect(page.showsChildren()).toBe(true);
    expect(page.showsLogin()).toBe(false);
  });
});
