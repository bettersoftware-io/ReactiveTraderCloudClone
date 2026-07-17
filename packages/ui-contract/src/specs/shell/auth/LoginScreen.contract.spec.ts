import { LoginScreen } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

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
});
