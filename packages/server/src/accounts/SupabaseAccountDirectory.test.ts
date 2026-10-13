import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createSupabaseAccountDirectory } from "#/accounts/SupabaseAccountDirectory";
import { collapseToNetworkKey } from "#/http/clientIp";

describe("SupabaseAccountDirectory — transport", () => {
  it("sends the secret key, the caller's IP and never a key in the URL", async () => {
    const fake = createFakeFetch([createReply(200, {})]);
    const directory = createDirectory(fake);

    await directory.requestReset("ann@desk.io", IP);

    const request = fake.requests[0];

    expect(request?.url).toBe("https://proj.supabase.co/auth/v1/recover");
    expect(request?.method).toBe("POST");
    expect(request?.headers.apikey).toBe("sb_secret_test");
    expect(request?.headers.Authorization).toBe("Bearer sb_secret_test");
    expect(request?.headers["Sb-Forwarded-For"]).toBe(IP);
    expect(request?.body).toBe(JSON.stringify({ email: "ann@desk.io" }));
  });

  it("a thrown fetch (timeout, reset) is unavailable (Review Focus 5)", async () => {
    const directory = createDirectory(createFailingFetch());

    expect(await directory.checkPassword("ann@desk.io", "x", IP)).toEqual({
      outcome: "unavailable",
    });
    expect(await directory.findAccount(ACCOUNT_ID)).toEqual({
      outcome: "unavailable",
    });
    expect(await directory.ping()).toBe(false);
  });

  it("a paused project (540) is unavailable, not a wrong password", async () => {
    const directory = createDirectory(createFakeFetch([createReply(540, {})]));

    expect(await directory.checkPassword("ann@desk.io", "x", IP)).toEqual({
      outcome: "unavailable",
    });
  });
});

describe("SupabaseAccountDirectory — signUp", () => {
  it("posts the display name as sign-up metadata", async () => {
    const fake = createFakeFetch([createReply(200, { id: ACCOUNT_ID })]);

    expect(
      await createDirectory(fake).signUp(
        { email: "ann@desk.io", displayName: "Ann Lee" },
        IP,
      ),
    ).toBe("sent");
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/auth/v1/signup",
    );

    const body = readSignUpBody(fake.requests[0]);

    expect(body.email).toBe("ann@desk.io");
    expect(body.data).toEqual({ display_name: "Ann Lee" });
  });

  it("stores a fresh random password nobody knows, different every call", async () => {
    const fake = createFakeFetch([createReply(200, {}), createReply(200, {})]);
    const directory = createDirectory(fake);

    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);

    const first = readSignUpBody(fake.requests[0]).password;
    const second = readSignUpBody(fake.requests[1]).password;

    // "Aa1!" + 32 random bytes as base64url: 47 bytes, every character class.
    expect(first).toMatch(/^Aa1!.{43}$/);
    expect(second).toMatch(/^Aa1!.{43}$/);
    expect(first).not.toBe(second);
  });

  it.each([
    ["weak_password", 422, "unavailable"],
    ["email_address_invalid", 400, "rejected-email"],
    ["user_already_exists", 422, "sent"],
    ["email_exists", 422, "sent"],
    ["over_email_send_rate_limit", 429, "sent"],
    ["over_request_rate_limit", 429, "unavailable"],
    ["unexpected_failure", 400, "unavailable"],
  ])("maps %s to %s", async (errorCode, status, outcome) => {
    const fake = createFakeFetch([
      createReply(status, { error_code: errorCode }),
    ]);

    expect(
      await createDirectory(fake).signUp(
        { email: "ann@desk.io", displayName: "Ann" },
        IP,
      ),
    ).toBe(outcome);
  });
});

describe("SupabaseAccountDirectory — codes and passwords", () => {
  it("resend and request-reset answer `sent` even when refused", async () => {
    const refused = createReply(429, {
      error_code: "over_email_send_rate_limit",
    });
    const directory = createDirectory(createFakeFetch([refused, refused]));

    expect(await directory.resendCode("ann@desk.io", IP)).toBe("sent");
    expect(await directory.requestReset("ann@desk.io", IP)).toBe("sent");
  });

  it("confirms with the signup OTP type (never a recovery code), then sets the password with the returned token", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "confirm-token" }),
      createReply(200, {}),
    ]);

    expect(
      await createDirectory(fake).confirmEmail(
        "ann@desk.io",
        "12345678",
        "Owner2026!pass",
        IP,
      ),
    ).toBe("confirmed");
    expect(fake.requests[0]?.body).toBe(
      JSON.stringify({
        type: "signup",
        email: "ann@desk.io",
        token: "12345678",
      }),
    );

    const update = fake.requests[1];

    expect(update?.url).toBe("https://proj.supabase.co/auth/v1/user");
    expect(update?.method).toBe("PUT");
    expect(update?.headers.Authorization).toBe("Bearer confirm-token");
    expect(update?.headers.apikey).toBe("sb_secret_test");
    expect(update?.headers["Sb-Forwarded-For"]).toBe(IP);
    expect(update?.body).toBe(JSON.stringify({ password: "Owner2026!pass" }));
  });

  it("a refused code is invalid_code and never reaches the update", async () => {
    const fake = createFakeFetch([
      createReply(403, { error_code: "otp_expired" }),
    ]);

    expect(
      await createDirectory(fake).confirmEmail(
        "ann@desk.io",
        "12345678",
        "pw",
        IP,
      ),
    ).toBe("invalid_code");
    expect(fake.requests).toHaveLength(1);
  });

  it("a password update refused as the same password still confirms", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "confirm-token" }),
      createReply(422, { error_code: "same_password" }),
    ]);

    expect(
      await createDirectory(fake).confirmEmail("ann@desk.io", "1", "pw", IP),
    ).toBe("confirmed");
  });

  it.each([
    ["any other refusal", [createReply(422, { error_code: "weak_password" })]],
    ["a 5xx", [createReply(503, {})]],
    ["a thrown fetch", []],
  ])(
    "a verified code whose password update meets %s is confirmed_unset",
    async (_name: string, updateReplies: readonly Response[]) => {
      const fake = createFakeFetch([
        createReply(200, { access_token: "confirm-token" }),
        ...updateReplies,
      ]);

      expect(
        await createDirectory(fake).confirmEmail("ann@desk.io", "1", "pw", IP),
      ).toBe("confirmed_unset");
      expect(fake.requests[1]?.url).toBe(
        "https://proj.supabase.co/auth/v1/user",
      );
    },
  );

  it("a verified code with no access token is confirmed_unset, and no update is sent", async () => {
    const fake = createFakeFetch([createReply(200, {})]);

    expect(
      await createDirectory(fake).confirmEmail("ann@desk.io", "1", "pw", IP),
    ).toBe("confirmed_unset");
    expect(fake.requests).toHaveLength(1);
  });

  it("checkPassword returns the account id on a match", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "t", user: { id: ACCOUNT_ID } }),
    ]);

    expect(
      await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP),
    ).toEqual({ outcome: "match", accountId: ACCOUNT_ID });
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/auth/v1/token?grant_type=password",
    );
  });

  it.each([
    [{ error_code: "email_not_confirmed" }, 400, "unconfirmed"],
    [{ error_code: "invalid_credentials" }, 400, "invalid"],
    [
      { error: "invalid_grant", error_description: "Email not confirmed" },
      400,
      "unconfirmed",
    ],
    [{ error_code: "over_request_rate_limit" }, 429, "unavailable"],
  ])("maps a refused sign-in %o", async (body, status, outcome) => {
    const fake = createFakeFetch([createReply(status, body)]);

    expect(
      await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP),
    ).toEqual({ outcome });
  });

  it("a match with no user id is unavailable, never a session", async () => {
    const fake = createFakeFetch([createReply(200, { access_token: "t" })]);

    expect(
      await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP),
    ).toEqual({ outcome: "unavailable" });
  });

  it("a reset verifies the code, then updates with the returned token", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "recovery-token" }),
      createReply(200, {}),
    ]);

    expect(
      await createDirectory(fake).resetPassword(
        "ann@desk.io",
        "12345678",
        "Fresh2026!pass",
        IP,
      ),
    ).toBe("changed");
    expect(fake.requests[0]?.body).toBe(
      JSON.stringify({
        type: "recovery",
        email: "ann@desk.io",
        token: "12345678",
      }),
    );
    expect(fake.requests[1]?.url).toBe("https://proj.supabase.co/auth/v1/user");
    expect(fake.requests[1]?.method).toBe("PUT");
    expect(fake.requests[1]?.headers.Authorization).toBe(
      "Bearer recovery-token",
    );
    expect(fake.requests[1]?.body).toBe(
      JSON.stringify({ password: "Fresh2026!pass" }),
    );
  });

  it("a refused reset code never reaches the update", async () => {
    const fake = createFakeFetch([
      createReply(403, { error_code: "otp_expired" }),
    ]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("invalid_code");
    expect(fake.requests).toHaveLength(1);
  });

  it("a refused new password is rejected", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "recovery-token" }),
      createReply(422, { error_code: "weak_password" }),
    ]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("rejected");
  });

  it("a reset refused as the same password is changed: the password already is what was asked", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "recovery-token" }),
      createReply(422, { error_code: "same_password" }),
    ]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("changed");
  });
});

describe("SupabaseAccountDirectory — Supabase throttling", () => {
  it.each([
    [
      "confirmEmail",
      (d: AccountDirectory): Promise<unknown> => {
        return d.confirmEmail("ann@desk.io", "12345678", "pw", IP);
      },
    ],
    [
      "resetPassword",
      (d: AccountDirectory): Promise<unknown> => {
        return d.resetPassword("ann@desk.io", "12345678", "pw", IP);
      },
    ],
  ])(
    "%s: a 429 on the verify is unavailable, never a wrong code",
    async (_name: string, run: Run) => {
      const fake = createFakeFetch([
        createReply(429, { error_code: "over_request_rate_limit" }),
      ]);

      expect(await run(createDirectory(fake))).toBe("unavailable");
      expect(fake.requests).toHaveLength(1);
    },
  );

  it("a reset whose password update is throttled is unavailable, not rejected", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "recovery-token" }),
      createReply(429, { error_code: "over_request_rate_limit" }),
    ]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("unavailable");
  });

  it("a confirmation whose password update is throttled is confirmed_unset", async () => {
    const fake = createFakeFetch([
      createReply(200, { access_token: "confirm-token" }),
      createReply(429, { error_code: "over_request_rate_limit" }),
    ]);

    expect(
      await createDirectory(fake).confirmEmail("ann@desk.io", "1", "pw", IP),
    ).toBe("confirmed_unset");
  });
});

describe("SupabaseAccountDirectory — sessions are closed", () => {
  it("a successful password check logs its session out (scope=local)", async () => {
    const fake = createFakeFetch([
      createReply(200, {
        access_token: "grant-token",
        user: { id: ACCOUNT_ID },
      }),
      new Response(null, { status: 204 }),
    ]);

    await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP);

    expectLogout(fake.requests[1], "grant-token");
  });

  it.each([
    [
      "a confirmation",
      "confirm-token",
      (d: AccountDirectory): Promise<unknown> => {
        return d.confirmEmail("ann@desk.io", "1", "pw", IP);
      },
    ],
    [
      "a reset",
      "recovery-token",
      (d: AccountDirectory): Promise<unknown> => {
        return d.resetPassword("ann@desk.io", "1", "pw", IP);
      },
    ],
  ])(
    "%s logs out the session its verified code returned",
    async (_name: string, token: string, run: Run) => {
      const fake = createFakeFetch([
        createReply(200, { access_token: token }),
        createReply(200, {}),
        new Response(null, { status: 204 }),
      ]);

      await run(createDirectory(fake));

      expect(fake.requests).toHaveLength(3);
      expectLogout(fake.requests[2], token);
    },
  );

  it("a refused password check opens no session, so nothing is logged out", async () => {
    const fake = createFakeFetch([
      createReply(400, { error_code: "invalid_credentials" }),
    ]);

    await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP);

    expect(fake.requests).toHaveLength(1);
  });

  it.each([
    ["a 500", [createReply(500, {})]],
    ["a thrown fetch", []],
  ])(
    "a logout that meets %s leaves every outcome unchanged",
    async (_name: string, logoutReplies: readonly Response[]) => {
      const grant = createFakeFetch([
        createReply(200, { access_token: "t", user: { id: ACCOUNT_ID } }),
        ...logoutReplies,
      ]);

      const confirm = createFakeFetch([
        createReply(200, { access_token: "t" }),
        createReply(200, {}),
        ...logoutReplies,
      ]);

      const reset = createFakeFetch([
        createReply(200, { access_token: "t" }),
        createReply(200, {}),
        ...logoutReplies,
      ]);

      expect(
        await createDirectory(grant).checkPassword("ann@desk.io", "pw", IP),
      ).toEqual({ outcome: "match", accountId: ACCOUNT_ID });
      expect(
        await createDirectory(confirm).confirmEmail(
          "ann@desk.io",
          "1",
          "pw",
          IP,
        ),
      ).toBe("confirmed");
      expect(
        await createDirectory(reset).resetPassword(
          "ann@desk.io",
          "1",
          "pw",
          IP,
        ),
      ).toBe("changed");
    },
  );
});

describe("SupabaseAccountDirectory — profiles", () => {
  it("reads one profile into an account record", async () => {
    const fake = createFakeFetch([createReply(200, [createProfileRow()])]);

    expect(await createDirectory(fake).findAccount(ACCOUNT_ID)).toEqual({
      outcome: "found",
      account: {
        id: ACCOUNT_ID,
        email: "ann@desk.io",
        displayName: "Ann Lee",
        access: "user",
        status: "pending",
      },
    });
    expect(fake.requests[0]?.url).toBe(
      `https://proj.supabase.co/rest/v1/profiles?id=eq.${ACCOUNT_ID}&select=id,email,display_name,role,approved,blocked,email_confirmed_at`,
    );
    expect(fake.requests[0]?.headers["Sb-Forwarded-For"]).toBeUndefined();
  });

  it("no row is missing", async () => {
    const fake = createFakeFetch([createReply(200, [])]);

    expect(await createDirectory(fake).findAccount(ACCOUNT_ID)).toEqual({
      outcome: "missing",
    });
  });

  it("a row it cannot read is unavailable — fail closed", async () => {
    const fake = createFakeFetch([
      createReply(200, [{ ...createProfileRow(), role: "root" }]),
    ]);

    expect(await createDirectory(fake).findAccount(ACCOUNT_ID)).toEqual({
      outcome: "unavailable",
    });
  });

  it("refuses a non-UUID id without a network call (Review Focus 4)", async () => {
    const fake = createFakeFetch([]);

    expect(
      await createDirectory(fake).findAccount("x&select=*&role=eq.admin"),
    ).toEqual({ outcome: "missing" });
    expect(fake.requests).toHaveLength(0);
  });

  it("counts registrations from the Content-Range total", async () => {
    const fake = createFakeFetch([
      createReply(206, [], { "content-range": "0-0/12" }),
    ]);

    expect(
      await createDirectory(fake).countRegistrationsSince(1_700_000_000_000),
    ).toEqual({ outcome: "counted", count: 12 });
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/rest/v1/profiles?select=id&created_at=gte.2023-11-14T22%3A13%3A20.000Z",
    );
    expect(fake.requests[0]?.headers.Prefer).toBe("count=exact");
  });

  it("an empty table counts as zero", async () => {
    const fake = createFakeFetch([
      createReply(200, [], { "content-range": "*/0" }),
    ]);

    expect(await createDirectory(fake).countRegistrationsSince(0)).toEqual({
      outcome: "counted",
      count: 0,
    });
  });

  it("a count it cannot read is unavailable", async () => {
    const fake = createFakeFetch([createReply(200, [])]);

    expect(await createDirectory(fake).countRegistrationsSince(0)).toEqual({
      outcome: "unavailable",
    });
  });
});

describe("SupabaseAccountDirectory — the timeout", () => {
  it.each(createOperations())(
    "%s carries an abort signal",
    async (_name, run, _unavailable) => {
      const fake = createFakeFetch([createReply(200, {})]);

      await run(createDirectory(fake));

      expect(fake.requests[0]?.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it("a hanging Supabase is unavailable once the timeout fires", async () => {
    const directory = createSupabaseAccountDirectory({
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_test",
      timeoutMs: 5,
      fetchImpl: createHangingFetch(),
    });

    expect(await directory.checkPassword("ann@desk.io", "pw", IP)).toEqual({
      outcome: "unavailable",
    });
    expect(await directory.findAccount(ACCOUNT_ID)).toEqual({
      outcome: "unavailable",
    });
  });
});

describe("SupabaseAccountDirectory — a rejected key is not a verdict", () => {
  it.each(createOperations())(
    "%s: a 401 is unavailable, never a verdict about the user",
    async (_name, run, unavailable) => {
      const fake = createFakeFetch([
        createReply(401, { message: "Invalid API key" }),
      ]);

      expect(await run(createDirectory(fake))).toEqual(unavailable);
    },
  );

  it("a 403 with no error_code is the gateway, so unavailable", async () => {
    const fake = createFakeFetch([createReply(403, { message: "forbidden" })]);

    expect(
      await createDirectory(fake).confirmEmail(
        "ann@desk.io",
        "12345678",
        "pw",
        IP,
      ),
    ).toBe("unavailable");
  });

  it("a 403 with an error_code is still a refusal (otp_expired)", async () => {
    const fake = createFakeFetch([
      createReply(403, { error_code: "otp_expired" }),
    ]);

    expect(
      await createDirectory(fake).confirmEmail(
        "ann@desk.io",
        "12345678",
        "pw",
        IP,
      ),
    ).toBe("invalid_code");
  });
});

describe("SupabaseAccountDirectory — hardening", () => {
  it("a non-finite since-time is unavailable, not a throw", async () => {
    const fake = createFakeFetch([]);

    expect(
      await createDirectory(fake).countRegistrationsSince(Number.NaN),
    ).toEqual({ outcome: "unavailable" });
    expect(fake.requests).toHaveLength(0);
  });

  it("forwards only a real IP address", async () => {
    const fake = createFakeFetch([createReply(200, {}), createReply(200, {})]);
    const directory = createDirectory(fake);

    await directory.requestReset("ann@desk.io", "not-an-ip");
    await directory.requestReset("ann@desk.io", IP);

    expect(fake.requests[0]?.headers["Sb-Forwarded-For"]).toBeUndefined();
    expect(fake.requests[1]?.headers["Sb-Forwarded-For"]).toBe(IP);
  });

  it("forwards an IPv6 caller's /64 key as given (it is a valid address)", async () => {
    const fake = createFakeFetch([createReply(200, {})]);
    const key = collapseToNetworkKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd");

    await createDirectory(fake).requestReset("ann@desk.io", key);

    expect(fake.requests[0]?.headers["Sb-Forwarded-For"]).toBe(
      "2001:db8:1:2::",
    );
  });

  it("a 200 whose body is not JSON never yields a session", async () => {
    const fake = createFakeFetch([new Response("<html>", { status: 200 })]);

    expect(
      await createDirectory(fake).checkPassword("ann@desk.io", "pw", IP),
    ).toEqual({ outcome: "unavailable" });
  });

  it("a verified reset code with no access token never sends the update", async () => {
    const fake = createFakeFetch([createReply(200, {})]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("unavailable");
    expect(fake.requests).toHaveLength(1);
  });

  it("a profile lookup refused with a 4xx is unavailable", async () => {
    const fake = createFakeFetch([createReply(400, { code: "PGRST100" })]);

    expect(await createDirectory(fake).findAccount(ACCOUNT_ID)).toEqual({
      outcome: "unavailable",
    });
  });

  it("confirm and reset are unavailable on a 5xx", async () => {
    const fake = createFakeFetch([createReply(503, {}), createReply(503, {})]);
    const directory = createDirectory(fake);

    expect(await directory.confirmEmail("ann@desk.io", "1", "pw", IP)).toBe(
      "unavailable",
    );
    expect(await directory.resetPassword("ann@desk.io", "1", "pw", IP)).toBe(
      "unavailable",
    );
  });

  it("confirm and reset are unavailable on a thrown fetch", async () => {
    const directory = createDirectory(createFailingFetch());

    expect(await directory.confirmEmail("ann@desk.io", "1", "pw", IP)).toBe(
      "unavailable",
    );
    expect(await directory.resetPassword("ann@desk.io", "1", "pw", IP)).toBe(
      "unavailable",
    );
  });
});

describe("SupabaseAccountDirectory — findByEmail and purge", () => {
  it("findByEmail reads profiles by the quoted address and maps the row", async () => {
    const fake = createFakeFetch([createReply(200, [createProfileRow()])]);

    const found = await createDirectory(fake).findByEmail("ann+desk@desk.io");

    expect(fake.requests[0]?.method).toBe("GET");
    expect(fake.requests[0]?.url).toBe(
      `https://proj.supabase.co/rest/v1/profiles?email=eq.${encodeURIComponent('"ann+desk@desk.io"')}&select=id,email,display_name,role,approved,blocked,email_confirmed_at`,
    );
    expect(found.outcome).toBe("found");
  });

  it("findByEmail is missing for no row and unavailable for a 5xx or a non-array body", async () => {
    expect(
      await createDirectory(
        createFakeFetch([createReply(200, [])]),
      ).findByEmail("x@desk.io"),
    ).toEqual({ outcome: "missing" });
    expect(
      await createDirectory(
        createFakeFetch([createReply(503, {})]),
      ).findByEmail("x@desk.io"),
    ).toEqual({ outcome: "unavailable" });
    expect(
      await createDirectory(
        createFakeFetch([createReply(200, { not: "rows" })]),
      ).findByEmail("x@desk.io"),
    ).toEqual({ outcome: "unavailable" });
  });

  it("purgeUnconfirmedBefore lists unconfirmed profiles before the cutoff, oldest first, then deletes each user", async () => {
    const fake = createFakeFetch([
      createReply(200, [{ id: ACCOUNT_ID }, { id: OTHER_ID }]),
      createReply(200, {}),
      createReply(404, { error_code: "user_not_found" }),
    ]);

    const result = await createDirectory(fake).purgeUnconfirmedBefore(
      Date.UTC(2026, 9, 11),
      50,
    );

    expect(result).toEqual({ outcome: "purged", count: 2 });
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/rest/v1/profiles?select=id&email_confirmed_at=is.null&created_at=lt.2026-10-11T00%3A00%3A00.000Z&order=created_at.asc&limit=50",
    );
    expect(fake.requests[1]?.method).toBe("DELETE");
    expect(fake.requests[1]?.url).toBe(
      `https://proj.supabase.co/auth/v1/admin/users/${ACCOUNT_ID}`,
    );
    expect(fake.requests[2]?.url).toBe(
      `https://proj.supabase.co/auth/v1/admin/users/${OTHER_ID}`,
    );
  });

  it("purgeUnconfirmedBefore is unavailable when the list fails, and stops with the partial count when a delete fails", async () => {
    expect(
      await createDirectory(
        createFakeFetch([createReply(500, {})]),
      ).purgeUnconfirmedBefore(0, 10),
    ).toEqual({ outcome: "unavailable" });

    const fake = createFakeFetch([
      createReply(200, [{ id: ACCOUNT_ID }, { id: OTHER_ID }]),
      createReply(200, {}),
      createReply(500, {}),
    ]);

    expect(await createDirectory(fake).purgeUnconfirmedBefore(0, 10)).toEqual({
      outcome: "purged",
      count: 1,
    });
    expect(fake.requests).toHaveLength(3);
  });

  it("purgeUnconfirmedBefore stops at a refusal that is not a 404", async () => {
    const fake = createFakeFetch([
      createReply(200, [{ id: ACCOUNT_ID }, { id: OTHER_ID }]),
      createReply(422, { error_code: "validation_failed" }),
    ]);

    expect(await createDirectory(fake).purgeUnconfirmedBefore(0, 10)).toEqual({
      outcome: "purged",
      count: 0,
    });
    expect(fake.requests).toHaveLength(2);
  });

  it("purgeUnconfirmedBefore refuses a non-finite cutoff or a non-positive limit without a request", async () => {
    const fake = createFakeFetch([]);

    expect(
      await createDirectory(fake).purgeUnconfirmedBefore(Number.NaN, 10),
    ).toEqual({
      outcome: "unavailable",
    });
    expect(await createDirectory(fake).purgeUnconfirmedBefore(0, 0)).toEqual({
      outcome: "unavailable",
    });
    expect(fake.requests).toHaveLength(0);
  });
});

function expectLogout(
  request: RecordedRequest | undefined,
  token: string,
): void {
  expect(request?.url).toBe(
    "https://proj.supabase.co/auth/v1/logout?scope=local",
  );
  expect(request?.method).toBe("POST");
  expect(request?.headers.Authorization).toBe(`Bearer ${token}`);
  expect(request?.headers.apikey).toBe("sb_secret_test");
  expect(request?.signal).toBeInstanceOf(AbortSignal);
}

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
  readonly signal: AbortSignal | undefined;
}

interface FakeFetch {
  readonly fetchImpl: typeof fetch;
  readonly requests: RecordedRequest[];
}

/** Answers each call with the next reply in order, recording the request. */
function createFakeFetch(replies: readonly Response[]): FakeFetch {
  const requests: RecordedRequest[] = [];
  let next = 0;

  const fetchImpl = ((url: string, init: RequestInit): Promise<Response> => {
    requests.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: typeof init.body === "string" ? init.body : undefined,
      signal: init.signal ?? undefined,
    });

    const reply = replies[next];
    next += 1;

    if (reply === undefined) {
      return Promise.reject(new Error("no reply scripted"));
    }

    return Promise.resolve(reply);
  }) as typeof fetch;

  return { fetchImpl, requests };
}

/** Never answers; rejects only when the signal it was handed aborts. */
function createHangingFetch(): typeof fetch {
  return ((_url: string, init: RequestInit): Promise<Response> => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => {
        reject(init.signal?.reason);
      });
    });
  }) as typeof fetch;
}

type Run = (directory: AccountDirectory) => Promise<unknown>;

type Operation = readonly [name: string, run: Run, unavailable: unknown];

/** All eleven port methods with the value each answers when the store is down. */
function createOperations(): Operation[] {
  const down = { outcome: "unavailable" };

  function signUp(d: AccountDirectory): Promise<unknown> {
    return d.signUp({ email: "a@b.io", displayName: "A" }, IP);
  }

  function resendCode(d: AccountDirectory): Promise<unknown> {
    return d.resendCode("a@b.io", IP);
  }

  function confirmEmail(d: AccountDirectory): Promise<unknown> {
    return d.confirmEmail("a@b.io", "1", "p", IP);
  }

  function checkPassword(d: AccountDirectory): Promise<unknown> {
    return d.checkPassword("a@b.io", "p", IP);
  }

  function requestReset(d: AccountDirectory): Promise<unknown> {
    return d.requestReset("a@b.io", IP);
  }

  function resetPassword(d: AccountDirectory): Promise<unknown> {
    return d.resetPassword("a@b.io", "1", "p", IP);
  }

  function findAccount(d: AccountDirectory): Promise<unknown> {
    return d.findAccount(ACCOUNT_ID);
  }

  function countRegistrationsSince(d: AccountDirectory): Promise<unknown> {
    return d.countRegistrationsSince(0);
  }

  function findByEmail(d: AccountDirectory): Promise<unknown> {
    return d.findByEmail("a@b.io");
  }

  function purgeUnconfirmedBefore(d: AccountDirectory): Promise<unknown> {
    return d.purgeUnconfirmedBefore(0, 10);
  }

  function ping(d: AccountDirectory): Promise<unknown> {
    return d.ping();
  }

  return [
    ["signUp", signUp, "unavailable"],
    ["resendCode", resendCode, "unavailable"],
    ["confirmEmail", confirmEmail, "unavailable"],
    ["checkPassword", checkPassword, down],
    ["requestReset", requestReset, "unavailable"],
    ["resetPassword", resetPassword, "unavailable"],
    ["findAccount", findAccount, down],
    ["countRegistrationsSince", countRegistrationsSince, down],
    ["findByEmail", findByEmail, down],
    ["purgeUnconfirmedBefore", purgeUnconfirmedBefore, down],
    ["ping", ping, false],
  ];
}

interface SignUpBody {
  readonly email: string;
  readonly password: string;
  readonly data: unknown;
}

function readSignUpBody(request: RecordedRequest | undefined): SignUpBody {
  return JSON.parse(request?.body ?? "null") as SignUpBody;
}

function createFailingFetch(): FakeFetch {
  const fetchImpl = ((): Promise<Response> => {
    return Promise.reject(new DOMException("timed out", "TimeoutError"));
  }) as typeof fetch;

  return { fetchImpl, requests: [] };
}

function createReply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function createDirectory(fake: FakeFetch): AccountDirectory {
  return createSupabaseAccountDirectory({
    url: "https://proj.supabase.co/",
    secretKey: "sb_secret_test",
    timeoutMs: 5_000,
    fetchImpl: fake.fetchImpl,
  });
}

interface ProfileRow {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly role: string;
  readonly approved: boolean;
  readonly blocked: boolean;
  readonly email_confirmed_at: string | null;
}

function createProfileRow(): ProfileRow {
  return {
    id: ACCOUNT_ID,
    email: "ann@desk.io",
    display_name: "Ann Lee",
    role: "user",
    approved: false,
    blocked: false,
    email_confirmed_at: "2026-10-04T10:00:00Z",
  };
}

const IP = "203.0.113.9";

const ACCOUNT_ID = "1f3a9c2e-0000-4000-8000-000000000000";
const OTHER_ID = "2b4c8d1f-0000-4000-8000-000000000000";
