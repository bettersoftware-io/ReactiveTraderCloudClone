import { LockScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("LockScreen", () => {
  it("renders nothing while the session is unlocked", () => {
    const page = mount(LockScreen, { session: { locked: false } });
    expect(page.hasRoot()).toBe(false);
  });

  it("renders the locked user identity and the AUTHENTICATE control", () => {
    const page = mount(LockScreen, { session: { locked: true } });
    expect(page.hasRoot()).toBe(true);
    expect(page.title()).toMatch(/SESSION LOCKED/i);
    expect(page.userName()).toBe("Anthony Stark");
    expect(page.hasAuthenticate()).toBe(true);
  });

  it("re-authenticates (unlock) when AUTHENTICATE is pressed", async () => {
    const page = mount(LockScreen, { session: { locked: true } });
    await page.authenticate();
    expect(page.unlockCount()).toBe(1);
  });

  it("hides the overlay once the session unlocks through the seam", async () => {
    const page = mount(LockScreen, { session: { locked: true } });
    expect(page.hasRoot()).toBe(true);
    await page.authenticate();
    expect(page.hasRoot()).toBe(false);
  });
});
