import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createSupabaseAccountDirectory } from "#/accounts/SupabaseAccountDirectory";

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
        { email: "ann@desk.io", displayName: "Ann Lee", password: "pw" },
        IP,
      ),
    ).toBe("sent");
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/auth/v1/signup",
    );
    expect(fake.requests[0]?.body).toBe(
      JSON.stringify({
        email: "ann@desk.io",
        password: "pw",
        data: { display_name: "Ann Lee" },
      }),
    );
  });

  it.each([
    ["weak_password", 422, "rejected-password"],
    ["email_address_invalid", 400, "rejected-email"],
    ["user_already_exists", 422, "sent"],
    ["email_exists", 422, "sent"],
    ["over_email_send_rate_limit", 429, "unavailable"],
  ])("maps %s to %s", async (errorCode, status, outcome) => {
    const fake = createFakeFetch([
      createReply(status, { error_code: errorCode }),
    ]);

    expect(
      await createDirectory(fake).signUp(
        { email: "ann@desk.io", displayName: "Ann", password: "pw" },
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

  it("confirms with the email OTP type", async () => {
    const fake = createFakeFetch([createReply(200, { access_token: "t" })]);

    expect(
      await createDirectory(fake).confirmEmail("ann@desk.io", "123456", IP),
    ).toBe("confirmed");
    expect(fake.requests[0]?.body).toBe(
      JSON.stringify({ type: "email", email: "ann@desk.io", token: "123456" }),
    );
  });

  it("a refused code is invalid_code", async () => {
    const fake = createFakeFetch([
      createReply(403, { error_code: "otp_expired" }),
    ]);

    expect(
      await createDirectory(fake).confirmEmail("ann@desk.io", "123456", IP),
    ).toBe("invalid_code");
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
        "123456",
        "Fresh2026!pass",
        IP,
      ),
    ).toBe("changed");
    expect(fake.requests[0]?.body).toBe(
      JSON.stringify({
        type: "recovery",
        email: "ann@desk.io",
        token: "123456",
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
      createReply(422, { error_code: "same_password" }),
    ]);

    expect(
      await createDirectory(fake).resetPassword("ann@desk.io", "1", "pw", IP),
    ).toBe("rejected");
  });
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

interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
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
