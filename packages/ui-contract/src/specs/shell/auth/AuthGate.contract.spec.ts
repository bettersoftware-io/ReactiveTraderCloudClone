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
    // Regression: modelling the unlock wait as status "authenticating" would
    // make AuthGate swap the whole app for LoginScreen mid-unlock.
    const page = mount(AuthGate, {
      auth: { status: "authenticated", locked: true, unlocking: true },
    });
    expect(page.showsChildren()).toBe(true);
    expect(page.showsLogin()).toBe(false);
  });
});
