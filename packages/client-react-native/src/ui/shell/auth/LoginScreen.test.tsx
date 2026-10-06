import { afterEach, expect, jest, test } from "@jest/globals";

import type { DemoAccount } from "@rtc/domain";

import { loginScreenPage } from "#tests/pages/LoginScreenPage";

afterEach(() => {
  return page.unmountAll();
});

test("typing credentials then pressing AUTHENTICATE calls login with them", async () => {
  const login = jest.fn();
  await page.mount("unauthenticated", login);

  await page.typeUsername("trader1");
  await page.typePassword("s3cret");
  await page.pressSubmit();

  expect(login).toHaveBeenCalledTimes(1);
  expect(login).toHaveBeenCalledWith("trader1", "s3cret");
});

// Against a real server every credential is the server's, so there is
// nothing the app may offer.
test("lists no demo accounts when the host verifies none", async () => {
  await page.mount("unauthenticated", jest.fn());

  expect(page.exists("login-demo-accounts")).toBe(false);
});

test("picking a demo account fills the form without signing in", async () => {
  const login = jest.fn();
  await page.mount("unauthenticated", login, {
    demoAccounts: createDemoAccounts(),
  });

  await page.pickDemoAccount("nromanoff");

  expect(login).not.toHaveBeenCalled();

  await page.pressSubmit();

  expect(login).toHaveBeenCalledWith("nromanoff", "widow-pass");
});

test("prints the password once when every demo account shares it", async () => {
  await page.mount("unauthenticated", jest.fn(), {
    demoAccounts: createDemoAccounts().map((account) => {
      return { ...account, password: "shared-pass" };
    }),
  });

  expect(page.demoPassword()).toBe("shared-pass");
});

test("prints no password when the demo accounts differ", async () => {
  await page.mount("unauthenticated", jest.fn(), {
    demoAccounts: createDemoAccounts(),
  });

  expect(page.demoPassword()).toBeNull();
});

test("a sign-in in flight recedes the demo accounts and disables their rows", async () => {
  await page.mount("authenticating", jest.fn(), {
    demoAccounts: createDemoAccounts(),
  });

  expect(page.opacityOf("login-demo-accounts")).toBe(0.35);
  expect(page.demoAccountDisabled("astark")).toBe(true);
});

// A development run has no stamp, and half a line would read as a fact.
test("prints no build line when the bundle carries no stamp", async () => {
  await page.mount("unauthenticated", () => {});

  expect(page.exists("login-build")).toBe(false);
});

// The answer to "which published build is this?", readable before signing in.
test("prints the commit and publish time of a published build", async () => {
  await page.mount("unauthenticated", () => {}, {
    buildStamp: { commit: "f0482c5", builtAt: "2026-10-04T15:20Z" },
  });

  expect(
    page.hasTextContent("login-build", "BUILD f0482c5 · 2026-10-04T15:20Z"),
  ).toBe(true);
});

test("renders the seeded error message", async () => {
  await page.mount("unauthenticated", () => {}, {
    error: "Invalid credentials",
  });

  expect(page.errorText()).toBe("Invalid credentials");
});

test("renders no error node when state.error is null", async () => {
  await page.mount("unauthenticated", () => {});

  expect(page.exists("login-error")).toBe(false);
});

test("submit is disabled while authenticating, and pressing it does not call login", async () => {
  const login = jest.fn();
  await page.mount("authenticating", login);

  await page.pressSubmit();
  expect(login).not.toHaveBeenCalled();
});

test("at rest the form is at full strength and no wait treatment shows", async () => {
  await page.mount("unauthenticated", () => {});

  expect(page.submitLabel()).toBe("AUTHENTICATE ▸");
  expect(page.opacityOf("login-username")).toBeUndefined();
  expect(page.opacityOf("login-password")).toBeUndefined();
  expect(page.exists("auth-wait-handshake")).toBe(false);
  expect(page.exists("auth-wait-reactor")).toBe(false);
  expect(page.exists("auth-wait-rings")).toBe(false);
});

test("a handshake wait recedes the form and shows the console, not the reactor", async () => {
  await page.mount("authenticating", () => {}, { waitVariant: "handshake" });

  expect(page.submitLabel()).toBe("AUTHENTICATING");
  expect(page.opacityOf("login-username")).toBe(0.35);
  expect(page.opacityOf("login-password")).toBe(0.35);
  expect(page.exists("auth-wait-handshake")).toBe(true);
  expect(page.exists("auth-wait-reactor")).toBe(false);
  expect(page.exists("auth-wait-rings")).toBe(false);
});

test("a reactor wait rings the emblem and shows the bar, not the console", async () => {
  await page.mount("authenticating", () => {}, { waitVariant: "reactor" });

  expect(page.exists("auth-wait-rings")).toBe(true);
  expect(page.exists("lock-emblem")).toBe(true);
  expect(page.exists("auth-wait-reactor")).toBe(true);
  expect(page.exists("auth-wait-handshake")).toBe(false);
});

test("toggling the sim switch calls onToggleSimulator with the new value", async () => {
  const onToggleSimulator = jest.fn();
  await page.mount("unauthenticated", () => {}, { onToggleSimulator });

  await page.toggleSimulator(true);

  expect(onToggleSimulator).toHaveBeenCalledTimes(1);
  expect(onToggleSimulator).toHaveBeenCalledWith(true);
});

const page = loginScreenPage();

function createDemoAccounts(): DemoAccount[] {
  return [
    { username: "astark", password: "stark-pass", role: "Senior FX Trader" },
    { username: "nromanoff", password: "widow-pass", role: "Credit Trader" },
  ];
}
