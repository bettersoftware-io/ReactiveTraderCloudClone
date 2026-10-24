import { firstValueFrom, type Observable } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { AccountFlowOutcome } from "@rtc/domain";
import type { LoginResponseDto } from "@rtc/shared";

import { HttpAuthAdapter, wsUrlToHttpBase } from "./HttpAuthAdapter";

describe("HttpAuthAdapter", () => {
  it("resolves { ok:true, token, user, exp } on a 200 response", async () => {
    const dto: LoginResponseDto = {
      token: "tok.abc",
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        role: "trader",
        id: "u1",
        email: "ada@example.com",
        desk: "FX",
        clearance: "standard",
        access: "user",
      },
      exp: 1_800_000_000,
    };

    const fetchImpl = vi.fn(async () => {
      return jsonResponse(dto, 200);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(outcome).toEqual({
      ok: true,
      token: dto.token,
      user: dto.user,
      exp: dto.exp,
    });
  });

  it("POSTs to the base URL's /login path with a JSON body and Content-Type header", async () => {
    const dto: LoginResponseDto = {
      token: "tok.abc",
      user: {
        name: "Ada Lovelace",
        initials: "AL",
        role: "trader",
        id: "u1",
        email: "ada@example.com",
        desk: "FX",
        clearance: "standard",
        access: "user",
      },
      exp: 1_800_000_000,
    };

    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse(dto, 200);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/login`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init?.body as string)).toEqual({
      username: "ada",
      password: "hunter2",
    });
  });

  it("resolves { ok:false, reason:'invalid' } on a 401 response", async () => {
    const fetchImpl = vi.fn(async () => {
      return jsonResponse({ error: "invalid credentials" }, 401);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "wrong"));

    expect(outcome).toEqual({ ok: false, reason: "invalid" });
  });

  it("resolves { ok:false, reason:'unavailable' } on a 429 response", async () => {
    const fetchImpl = vi.fn(async () => {
      return jsonResponse({ error: "rate limited" }, 429);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("resolves { ok:false, reason:'unavailable' } on a 500 response", async () => {
    const fetchImpl = vi.fn(async () => {
      return jsonResponse({ error: "boom" }, 500);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("resolves { ok:false, reason:'unavailable' } when fetch throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("is cold: does not call fetch until subscribed", async () => {
    const fetchImpl = vi.fn(async () => {
      return jsonResponse({ error: "invalid credentials" }, 401);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const login$ = adapter.login("ada", "hunter2");
    expect(fetchImpl).not.toHaveBeenCalled();

    await firstValueFrom(login$);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("wsUrlToHttpBase", () => {
  it("maps wss:// to https://", () => {
    expect(wsUrlToHttpBase("wss://x/y")).toBe("https://x/y");
  });

  it("maps ws:// to http://", () => {
    expect(wsUrlToHttpBase("ws://localhost:4000")).toBe(
      "http://localhost:4000",
    );
  });
});

describe("HttpAuthAdapter /login refusals", () => {
  it.each([
    ["unconfirmed", "unconfirmed"],
    ["pending_approval", "pending"],
    ["blocked", "blocked"],
  ])("a 403 %s reads as %s", async (error, reason) => {
    const adapter = new HttpAuthAdapter(BASE_URL, async () => {
      return jsonResponse({ error }, 403);
    });

    const outcome = await firstValueFrom(adapter.login("ada@x.test", "pw"));

    expect(outcome).toEqual({ ok: false, reason });
  });

  it.each([
    [403, { error: "origin_not_allowed" }],
    [415, { error: "unsupported_media_type" }],
  ])("a %s refusal reads as unavailable", async (status, body) => {
    const adapter = new HttpAuthAdapter(BASE_URL, async () => {
      return jsonResponse(body, status);
    });

    const outcome = await firstValueFrom(adapter.login("ada", "pw"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a 403 with a non-JSON body reads as unavailable", async () => {
    const adapter = new HttpAuthAdapter(BASE_URL, async () => {
      return new Response("<html>", { status: 403 });
    });

    const outcome = await firstValueFrom(adapter.login("ada", "pw"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });
});

describe("HttpAuthAdapter account flows", () => {
  it.each(createFlowCalls())(
    "%s POSTs its JSON body to %s",
    async (_name, path, call, body) => {
      const fetchImpl = vi.fn<typeof fetch>(async () => {
        return jsonResponse({ status: "code_sent" }, 202);
      });
      const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

      await firstValueFrom(call(adapter));

      expect(fetchImpl).toHaveBeenCalledTimes(1);
      const [url, init] = fetchImpl.mock.calls[0] ?? [];
      expect(url).toBe(`${BASE_URL}${path}`);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "Content-Type": "application/json" });
      expect(init?.body).toBe(JSON.stringify(body));
    },
  );

  it.each(createFlowResponses())(
    "%s",
    async (_title, status, body, expected) => {
      const adapter = new HttpAuthAdapter(BASE_URL, async () => {
        return jsonResponse(body, status);
      });

      const outcome = await firstValueFrom(adapter.register("a@x.test", "Ada"));

      expect(outcome).toEqual(expected);
    },
  );

  it("a 202 with a non-JSON body reads as unavailable", async () => {
    const adapter = new HttpAuthAdapter(BASE_URL, async () => {
      return new Response("accepted", { status: 202 });
    });

    const outcome = await firstValueFrom(adapter.resendCode("a@x.test"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a rejecting fetch reads as unavailable", async () => {
    const adapter = new HttpAuthAdapter(BASE_URL, async () => {
      throw new Error("network down");
    });

    const outcome = await firstValueFrom(adapter.resetPassword("a", "1", "p"));

    expect(outcome).toEqual({ ok: false, reason: "unavailable" });
  });

  it("is cold: no request until subscribed", () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return jsonResponse({ status: "code_sent" }, 202);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    adapter.requestPasswordReset("a@x.test");

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

type FlowCall = (adapter: HttpAuthAdapter) => Observable<AccountFlowOutcome>;

function createFlowCalls(): [
  string,
  string,
  FlowCall,
  Record<string, string>,
][] {
  return [
    [
      "register",
      "/register",
      (adapter: HttpAuthAdapter) => {
        return adapter.register("a@x.test", "Ada");
      },
      { email: "a@x.test", displayName: "Ada" },
    ],
    [
      "resendCode",
      "/resend-code",
      (adapter: HttpAuthAdapter) => {
        return adapter.resendCode("a@x.test");
      },
      { email: "a@x.test" },
    ],
    [
      "confirmEmail",
      "/confirm-email",
      (adapter: HttpAuthAdapter) => {
        return adapter.confirmEmail("a@x.test", "12345678", "pw");
      },
      { email: "a@x.test", code: "12345678", password: "pw" },
    ],
    [
      "requestPasswordReset",
      "/request-reset",
      (adapter: HttpAuthAdapter) => {
        return adapter.requestPasswordReset("a@x.test");
      },
      { email: "a@x.test" },
    ],
    [
      "resetPassword",
      "/reset-password",
      (adapter: HttpAuthAdapter) => {
        return adapter.resetPassword("a@x.test", "12345678", "pw");
      },
      { email: "a@x.test", code: "12345678", password: "pw" },
    ],
  ];
}

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

function createFlowResponses(): [
  string,
  number,
  unknown,
  AccountFlowOutcome,
][] {
  return [
    [
      "202 code_sent is ok",
      202,
      { status: "code_sent" },
      { ok: true, status: "code_sent" },
    ],
    [
      "200 password_changed is ok",
      200,
      { status: "password_changed" },
      { ok: true, status: "password_changed" },
    ],
    [
      "a 200 with an unknown status is unavailable",
      200,
      { status: "nonsense" },
      UNAVAILABLE,
    ],
    [
      "400 invalid_request carries a known rule",
      400,
      { error: "invalid_request", rule: "min-length" },
      { ok: false, reason: "invalid_input", rule: "min-length" },
    ],
    [
      "400 invalid_request drops an unknown rule",
      400,
      { error: "invalid_request", rule: "bogus" },
      { ok: false, reason: "invalid_input" },
    ],
    [
      "400 invalid_code",
      400,
      { error: "invalid_code" },
      { ok: false, reason: "invalid_code" },
    ],
    [
      "400 malformed_json is unavailable",
      400,
      { error: "malformed_json" },
      UNAVAILABLE,
    ],
    [
      "403 registration_closed",
      403,
      { error: "registration_closed" },
      { ok: false, reason: "registration_closed" },
    ],
    [
      "403 origin_not_allowed is unavailable",
      403,
      { error: "origin_not_allowed" },
      UNAVAILABLE,
    ],
    ["413 is unavailable", 413, { error: "too_large" }, UNAVAILABLE],
    [
      "415 is unavailable",
      415,
      { error: "unsupported_media_type" },
      UNAVAILABLE,
    ],
    [
      "429 rate_limited",
      429,
      { error: "rate_limited" },
      { ok: false, reason: "rate_limited" },
    ],
    [
      "429 banned",
      429,
      { error: "banned" },
      { ok: false, reason: "rate_limited" },
    ],
    ["503 is unavailable", 503, { error: "down" }, UNAVAILABLE],
  ];
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const BASE_URL = "http://localhost:4000";
