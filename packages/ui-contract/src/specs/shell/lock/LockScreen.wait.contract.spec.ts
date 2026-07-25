import { LockScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("LockScreen — login-wait treatment", () => {
  it("shows no wait treatment when idle", () => {
    const page = mount(LockScreen, {
      auth: { status: "authenticated", locked: true, unlocking: false },
    });
    expect(page.hasWait()).toBe(false);
  });

  it("shows the handshake treatment while unlocking on that variant", () => {
    const page = mount(LockScreen, {
      auth: {
        status: "authenticated",
        locked: true,
        unlocking: true,
        waitVariant: "handshake",
      },
    });
    expect(page.waitVariant()).toBe("handshake");
  });

  it("shows the reactor treatment while unlocking on that variant", () => {
    const page = mount(LockScreen, {
      auth: {
        status: "authenticated",
        locked: true,
        unlocking: true,
        waitVariant: "reactor",
      },
    });
    expect(page.waitVariant()).toBe("reactor");
  });
});
