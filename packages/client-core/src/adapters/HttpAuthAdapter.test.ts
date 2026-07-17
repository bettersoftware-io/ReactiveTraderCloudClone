import { firstValueFrom } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { LoginResponseDto } from "@rtc/shared";

import { HttpAuthAdapter, wsUrlToHttpBase } from "./HttpAuthAdapter";

const BASE_URL = "http://localhost:4000";

describe("HttpAuthAdapter", () => {
  it("resolves { ok:true, token, user } on a 200 response", async () => {
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
      },
      exp: 1_800_000_000,
    };
    const fetchImpl = vi.fn(async () => {
      return jsonResponse(dto, 200);
    });
    const adapter = new HttpAuthAdapter(BASE_URL, fetchImpl);

    const outcome = await firstValueFrom(adapter.login("ada", "hunter2"));

    expect(outcome).toEqual({ ok: true, token: dto.token, user: dto.user });
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

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
