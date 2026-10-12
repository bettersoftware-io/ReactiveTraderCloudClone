import { describe, expect, it } from "vitest";

import {
  createAccountDirectory,
  isRegistrationOpen,
  resolveAccountsMode,
} from "#/accounts/resolveAccountsMode";

describe("resolveAccountsMode", () => {
  it("is disabled when nothing is configured — never the dev directory (Review Focus 1)", () => {
    expect(resolveAccountsMode({})).toEqual({ kind: "disabled" });
    expect(resolveAccountsMode({ AUTH_SECRET: createSecret() })).toEqual({
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
        AUTH_SECRET: createSecret(),
      }),
    ).toEqual({
      kind: "supabase",
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_x",
    });
  });

  it.each([
    [
      { SUPABASE_URL: "https://proj.supabase.co", AUTH_SECRET: createSecret() },
      "SUPABASE_SECRET_KEY must be set when SUPABASE_URL is configured",
    ],
    [
      { SUPABASE_SECRET_KEY: "sb_secret_x", AUTH_SECRET: createSecret() },
      "SUPABASE_URL must be set when SUPABASE_SECRET_KEY is configured",
    ],
    [
      {
        SUPABASE_URL: "http://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: createSecret(),
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
        AUTH_SECRET: createSecret(),
        RTC_DEV_ACCOUNTS: "1",
      },
      "RTC_DEV_ACCOUNTS and SUPABASE_URL cannot both be set",
    ],
    [
      {
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: createSecret(),
        RTC_DEV_ACCOUNTS: "1",
      },
      "SUPABASE_URL must be set when SUPABASE_SECRET_KEY is configured",
    ],
  ])("refuses %o", (env, message) => {
    expect(() => {
      return resolveAccountsMode(env);
    }).toThrow(message);
  });

  it.each([
    ["a 31-character secret", "x".repeat(31)],
    ["a whitespace-only secret", " ".repeat(40)],
    ["a secret padded to 32 with whitespace", ` ${"x".repeat(30)} `],
  ])("refuses %s in either account mode (Review Focus 2)", (_label, secret) => {
    const message =
      "AUTH_SECRET must be at least 32 characters when accounts are enabled";

    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: secret,
      });
    }).toThrow(message);
    expect(() => {
      return resolveAccountsMode({
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: secret,
      });
    }).toThrow(message);
  });

  it("never echoes a weak secret in its refusal", () => {
    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: "weak-secret-value",
      });
    }).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("weak-secret-value"),
      }),
    );
  });

  it("accepts a 32-character secret", () => {
    expect(
      resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: "x".repeat(32),
      }),
    ).toEqual({ kind: "in-memory" });
  });

  it("keeps the disabled mode's behaviour for a short secret", () => {
    expect(resolveAccountsMode({ AUTH_SECRET: "s" })).toEqual({
      kind: "disabled",
    });
  });

  it("is in-memory only when asked for by name", () => {
    expect(
      resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: createSecret(),
      }),
    ).toEqual({ kind: "in-memory" });
    expect(
      resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "true",
        AUTH_SECRET: createSecret(),
      }),
    ).toEqual({ kind: "disabled" });
  });

  it("refuses the dev directory on a deployed machine (Review Focus 1)", () => {
    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: createSecret(),
        FLY_APP_NAME: "rtc-clone-server",
      });
    }).toThrow("RTC_DEV_ACCOUNTS is refused on a deployed machine");
  });

  it("refuses the dev directory in the container image, whatever the host (RTC_DEPLOYED)", () => {
    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: createSecret(),
        RTC_DEPLOYED: "1",
      });
    }).toThrow("RTC_DEV_ACCOUNTS is refused on a deployed machine");
  });

  it("reads an empty deployment marker as unset", () => {
    expect(
      resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: createSecret(),
        RTC_DEPLOYED: "",
        FLY_APP_NAME: "",
      }),
    ).toEqual({ kind: "in-memory" });
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
  it.each([
    [undefined, true],
    ["true", true],
    ["false", false],
    [" false\n", false],
    [" true ", true],
  ])("reads REGISTRATION_OPEN=%j as open=%s", (value, open) => {
    expect(isRegistrationOpen({ REGISTRATION_OPEN: value })).toBe(open);
  });

  it.each(["0", "FALSE", "no", "", "off"])(
    "refuses REGISTRATION_OPEN=%j at startup — a typo must not leave sign-up open",
    (value) => {
      expect(() => {
        return isRegistrationOpen({ REGISTRATION_OPEN: value });
      }).toThrow('REGISTRATION_OPEN must be "true" or "false"');
    },
  );

  it("never echoes the value it refuses", () => {
    expect(() => {
      return isRegistrationOpen({ REGISTRATION_OPEN: "nope-value" });
    }).toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining("nope-value"),
      }),
    );
  });
});

/** Long enough for the account modes (32+); public, like every dev secret. */
function createSecret(): string {
  return "test-secret-that-is-32-chars-long!";
}
