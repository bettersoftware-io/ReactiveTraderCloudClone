import { LoginScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { DemoAccount } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("LoginScreen", () => {
  it("renders the sign-in title, username/password fields, and submit control", () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });
    expect(page.hasRoot()).toBe(true);
    expect(page.title()).toMatch(/REACTIVE TRADER OS · SIGN IN/i);
  });

  it("calls login with exactly the typed username and password on submit", async () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });
    await page.typeUsername("demo");
    await page.typePassword("s3cret");
    await page.submit();
    const args = page.loginArgs();
    expect(args[args.length - 1]).toEqual(["demo", "s3cret"]);
  });

  it("renders a seeded error in the error line", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated", error: "Invalid credentials" },
    });
    expect(page.error()).toBe("Invalid credentials");
  });

  it("disables the submit control while authenticating", () => {
    const page = mount(LoginScreen, { auth: { status: "authenticating" } });
    expect(page.isSubmitDisabled()).toBe(true);
  });

  it("shows no wait treatment when idle", () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });
    expect(page.hasWait()).toBe(false);
  });

  it("shows the handshake treatment while authenticating on that variant", () => {
    const page = mount(LoginScreen, {
      auth: { status: "authenticating", waitVariant: "handshake" },
    });
    expect(page.waitVariant()).toBe("handshake");
  });

  it("shows the reactor treatment while authenticating on that variant", () => {
    const page = mount(LoginScreen, {
      auth: { status: "authenticating", waitVariant: "reactor" },
    });
    expect(page.waitVariant()).toBe("reactor");
  });

  it("renders no demo-accounts hint when the host lists none", () => {
    const page = mount(LoginScreen, { auth: { status: "unauthenticated" } });

    expect(page.hasDemoAccounts()).toBe(false);
    expect(page.demoAccounts()).toEqual([]);
  });

  it("lists each demo account with its role, in the host's order", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });

    expect(page.demoAccounts()).toEqual([
      "astark — Senior FX Trader",
      "demo — Read-Only Guest",
    ]);
  });

  it("names each demo-account row for assistive tech, so the cells do not run together", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });

    expect(page.demoAccountLabels()).toEqual([
      "Fill the sign-in form as astark, Senior FX Trader",
      "Fill the sign-in form as demo, Read-Only Guest",
    ]);
  });

  it("prints the password once when every demo account shares it", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });

    expect(page.demoPassword()).toBe("shared-pw");
  });

  it("prints no password when the demo accounts' passwords differ", () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts({ demoPassword: "other-pw" }),
    });

    expect(page.hasDemoAccounts()).toBe(true);
    expect(page.demoPassword()).toBe("");
  });

  it("fills both fields from the picked demo account without signing in", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts({ demoPassword: "other-pw" }),
    });

    await page.pickDemoAccount("demo");

    expect(page.usernameValue()).toBe("demo");
    expect(page.passwordValue()).toBe("other-pw");
    expect(page.loginArgs()).toEqual([]);
  });

  it("hands keyboard focus to AUTHENTICATE after a pick, so the next Enter signs in", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });

    await page.pickDemoAccount("demo");

    expect(page.focusedControl()).toBe("login-submit");
  });

  it("replaces what was typed when a demo account is picked", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });
    await page.typeUsername("someone");
    await page.typePassword("typed");

    await page.pickDemoAccount("astark");

    expect(page.usernameValue()).toBe("astark");
    expect(page.passwordValue()).toBe("shared-pw");
  });

  it("signs in with the picked demo account's credentials on submit", async () => {
    const page = mount(LoginScreen, {
      auth: { status: "unauthenticated" },
      demoAccounts: createDemoAccounts(),
    });

    await page.pickDemoAccount("astark");
    await page.submit();

    expect(page.loginArgs()).toEqual([["astark", "shared-pw"]]);
  });

  it("disables the demo accounts while authenticating", () => {
    const page = mount(LoginScreen, {
      auth: { status: "authenticating" },
      demoAccounts: createDemoAccounts(),
    });

    expect(page.isDemoAccountDisabled("astark")).toBe(true);
    expect(page.isDemoAccountDisabled("demo")).toBe(true);
  });
});

interface DemoAccountsSeed {
  /** The `demo` row's password; defaults to the one `astark` uses, so the two
   * rows share a password unless a case asks otherwise. */
  readonly demoPassword?: string;
}

function createDemoAccounts(seed: DemoAccountsSeed = {}): DemoAccount[] {
  return [
    { username: "astark", password: "shared-pw", role: "Senior FX Trader" },
    {
      username: "demo",
      password: seed.demoPassword ?? "shared-pw",
      role: "Read-Only Guest",
    },
  ];
}
