import { describe, expect, it } from "vitest";

import {
  createAccountDirectory,
  isRegistrationOpen,
  resolveAccountsMode,
} from "#/accounts/resolveAccountsMode";

describe("resolveAccountsMode", () => {
  it("is disabled when nothing is configured — never the dev directory (Review Focus 1)", () => {
    expect(resolveAccountsMode({})).toEqual({ kind: "disabled" });
    expect(resolveAccountsMode({ AUTH_SECRET: "s" })).toEqual({
      kind: "disabled",
    });
  });

  it("keeps the disabled mode working without AUTH_SECRET, as before accounts", () => {
    expect(resolveAccountsMode({ AUTH_SECRET: "" })).toEqual({
      kind: "disabled",
    });
  });

  it("is supabase when the URL, the key and the secret are all set", () => {
    expect(
      resolveAccountsMode({
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_x",
        AUTH_SECRET: "s",
      }),
    ).toEqual({
      kind: "supabase",
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_x",
    });
  });

  it.each([
    [
      { SUPABASE_URL: "https://proj.supabase.co", AUTH_SECRET: "s" },
      "SUPABASE_SECRET_KEY must be set when SUPABASE_URL is configured",
    ],
    [
      { SUPABASE_SECRET_KEY: "sb_secret_x", AUTH_SECRET: "s" },
      "SUPABASE_URL must be set when SUPABASE_SECRET_KEY is configured",
    ],
    [
      {
        SUPABASE_URL: "http://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: "s",
      },
      "SUPABASE_URL must be an https URL",
    ],
    [
      { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: "k" },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      {
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: "",
      },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      { RTC_DEV_ACCOUNTS: "1" },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      { RTC_DEV_ACCOUNTS: "1", AUTH_SECRET: "" },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      {
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: "s",
        RTC_DEV_ACCOUNTS: "1",
      },
      "RTC_DEV_ACCOUNTS and SUPABASE_URL cannot both be set",
    ],
    [
      { SUPABASE_SECRET_KEY: "k", AUTH_SECRET: "s", RTC_DEV_ACCOUNTS: "1" },
      "SUPABASE_URL must be set when SUPABASE_SECRET_KEY is configured",
    ],
  ])("refuses %o", (env, message) => {
    expect(() => {
      return resolveAccountsMode(env);
    }).toThrow(message);
  });

  it("is in-memory only when asked for by name", () => {
    expect(
      resolveAccountsMode({ RTC_DEV_ACCOUNTS: "1", AUTH_SECRET: "s" }),
    ).toEqual({ kind: "in-memory" });
    expect(
      resolveAccountsMode({ RTC_DEV_ACCOUNTS: "true", AUTH_SECRET: "s" }),
    ).toEqual({ kind: "disabled" });
  });

  it("refuses the dev directory on a deployed machine (Review Focus 1)", () => {
    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: "s",
        FLY_APP_NAME: "rtc-clone-server",
      });
    }).toThrow("RTC_DEV_ACCOUNTS is refused on a deployed machine");
  });
});

describe("createAccountDirectory", () => {
  it("builds the directory its mode names", () => {
    const deps = {
      now: (): number => {
        return 0;
      },
      timeoutMs: 5_000,
    };

    expect(createAccountDirectory({ kind: "disabled" }, deps).kind).toBe(
      "disabled",
    );
    expect(createAccountDirectory({ kind: "in-memory" }, deps).kind).toBe(
      "in-memory",
    );
    expect(
      createAccountDirectory(
        { kind: "supabase", url: "https://p.supabase.co", secretKey: "k" },
        deps,
      ).kind,
    ).toBe("supabase");
  });
});

describe("isRegistrationOpen", () => {
  it("is open unless REGISTRATION_OPEN is exactly `false`", () => {
    expect(isRegistrationOpen({})).toBe(true);
    expect(isRegistrationOpen({ REGISTRATION_OPEN: "true" })).toBe(true);
    expect(isRegistrationOpen({ REGISTRATION_OPEN: "false" })).toBe(false);
  });
});
