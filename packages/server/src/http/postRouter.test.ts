import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { type BanList, createBanList } from "#/auth/banList";
import { resolveClientIp } from "#/http/clientIp";
import { type HttpResult, jsonResult } from "#/http/jsonResult";
import { type OriginPolicy, resolveOriginPolicy } from "#/http/originPolicy";
import { createPostRouter, type PostRoute } from "#/http/postRouter";

afterEach(async () => {
  await new Promise<void>((resolve) => {
    if (server === undefined) {
      resolve();

      return;
    }

    // fetch keeps its connection alive; without this `close` waits for it.
    server.closeAllConnections();
    server.close(() => {
      resolve();
    });
  });
  server = undefined;
});

describe("createPostRouter", () => {
  it("hands the body and the caller's IP to the route and writes its result", async () => {
    const base = await startRouter({
      "/echo": {
        maxBodyBytes: 1_024,
        handle: (bodyText: string, ip: string) => {
          return Promise.resolve(jsonResult(202, { bodyText, ip }));
        },
      },
    });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "hello",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ bodyText: "hello", ip: "9.9.9.9" });
  });

  it("keys the caller on the trusted header it is given, never X-Forwarded-For", async () => {
    const base = await startRouter(
      {
        "/echo": {
          maxBodyBytes: 1_024,
          handle: (_bodyText: string, ip: string) => {
            return Promise.resolve(jsonResult(200, { ip }));
          },
        },
      },
      { clientIp: readFlyClientIp },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: {
        "Content-Type": "application/json",
        "Fly-Client-IP": "7.7.7.7",
        "X-Forwarded-For": "6.6.6.6",
      },
    });

    expect(await response.json()).toEqual({ ip: "7.7.7.7" });
  });

  it("leaves an unknown path and a GET to the caller (404 here)", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    expect((await fetch(`${base}/nope`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/echo`)).status).toBe(404);
  });

  it("answers 413 past the route's body cap, by bytes received, without running the route", async () => {
    let ran = false;
    const base = await startRouter({
      "/echo": {
        maxBodyBytes: 8,
        handle: () => {
          ran = true;

          return Promise.resolve(jsonResult(200, {}));
        },
      },
    });

    // Multi-byte characters: 9 bytes, 3 characters. A cap on characters
    // would let this through.
    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "€€€",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("connection")).toBe("close");
    expect(await response.json()).toEqual({ error: "body_too_large" });
    expect(ran).toBe(false);
  });

  it("caps each route by its own limit", async () => {
    const base = await startRouter({
      "/small": { ...createEchoRoute(), maxBodyBytes: 8 },
      "/large": { ...createEchoRoute(), maxBodyBytes: 1_024 },
    });

    const body = "x".repeat(64);

    expect(
      (
        await fetch(`${base}/small`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        })
      ).status,
    ).toBe(413);
    expect(
      (
        await fetch(`${base}/large`, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
        })
      ).status,
    ).toBe(202);
  });

  it("answers a banned caller 429 without running the route", async () => {
    let ran = false;
    const banList = createBannedList();
    const base = await startRouter(
      {
        "/echo": {
          maxBodyBytes: 1_024,
          handle: () => {
            ran = true;

            return Promise.resolve(jsonResult(200, {}));
          },
        },
      },
      { banList },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({ error: "banned" });
    expect(ran).toBe(false);
  });

  it("refuses a banned caller before the body is read — an oversized body still gets 429, not 413", async () => {
    const base = await startRouter(
      { "/echo": { ...createEchoRoute(), maxBodyBytes: 8 } },
      { banList: createBannedList() },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x".repeat(64),
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(429);
  });

  it("answers 500 when a route throws, never a hung request", async () => {
    const base = await startRouter({
      "/echo": {
        maxBodyBytes: 1_024,
        handle: () => {
          return Promise.reject(new Error("boom"));
        },
      },
    });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "internal_error" });
  });

  it("logs a handler fault as one fixed line — the route, the IP and the error's name only", async () => {
    const lines: string[] = [];
    const base = await startRouter(
      {
        "/register": {
          maxBodyBytes: 1_024,
          handle: () => {
            return Promise.reject(new TypeError("secret@example.com hunter2"));
          },
        },
      },
      {
        log: (line: string): void => {
          lines.push(line);
        },
      },
    );

    const response = await fetch(`${base}/register`, {
      method: "POST",
      body: JSON.stringify({ email: "body@example.com", code: "12345678" }),
      headers: {
        "Content-Type": "application/json",
        "X-Secret-Header": "header-value",
      },
    });

    expect(response.status).toBe(500);
    expect(lines).toEqual([
      "[http] 500 route=/register ip=9.9.9.9 err=TypeError",
    ]);
    expect(lines.join("\n")).not.toMatch(
      /secret@example\.com|hunter2|body@example\.com|123456|header-value/,
    );
  });

  it("does not log a 413 — that is the caller's fault", async () => {
    const lines: string[] = [];
    const base = await startRouter(
      { "/echo": { ...createEchoRoute(), maxBodyBytes: 8 } },
      {
        log: (line: string): void => {
          lines.push(line);
        },
      },
    );

    await fetch(`${base}/echo`, {
      method: "POST",
      body: "x".repeat(64),
      headers: { "Content-Type": "application/json" },
    });

    expect(lines).toEqual([]);
  });

  it("does not log a refused ban either", async () => {
    const lines: string[] = [];
    const base = await startRouter(
      { "/echo": createEchoRoute() },
      {
        banList: createBannedList(),
        log: (line: string): void => {
          lines.push(line);
        },
      },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(429);
    expect(lines).toEqual([]);
  });

  it("a fault after the head was written logs once and drops the connection, never writing a second head", async () => {
    const lines: string[] = [];
    const base = await startRouter(
      {
        "/echo": {
          maxBodyBytes: 1_024,
          // A body `res.end` refuses: it throws after `writeHead` ran.
          handle: (): Promise<HttpResult> => {
            return Promise.resolve({
              status: 200,
              headers: {},
              body: 42 as unknown as string,
            });
          },
        },
      },
      {
        log: (line: string): void => {
          lines.push(line);
        },
      },
    );

    const outcome = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: { "Content-Type": "application/json" },
    })
      .then((response) => {
        return response.text();
      })
      .then(
        (): string => {
          return "completed";
        },
        (): string => {
          return "dropped";
        },
      );

    expect(outcome).toBe("dropped");
    expect(lines).toEqual(["[http] 500 route=/echo ip=9.9.9.9 err=TypeError"]);
  });

  it("answers 500 when a route throws synchronously", async () => {
    const base = await startRouter({
      "/echo": {
        maxBodyBytes: 1_024,
        handle: (): Promise<never> => {
          throw new Error("boom");
        },
      },
    });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x",
      headers: { "Content-Type": "application/json" },
    });

    expect(response.status).toBe(500);
  });
});

describe("createPostRouter — origins and content type", () => {
  const FOREIGN = "https://evil.example";
  it("answers the preflight of an allowed origin with that origin and no wildcard", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, {
      method: "OPTIONS",
      headers: { Origin: ALLOWED, "Access-Control-Request-Method": "POST" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(response.headers.get("vary")).toBe("Origin");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it.each([FOREIGN, "null"])(
    "refuses the preflight of %s with 403 and no CORS header",
    async (origin) => {
      const base = await startRouter({ "/echo": createEchoRoute() });

      const response = await fetch(`${base}/echo`, {
        method: "OPTIONS",
        headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
      });

      expect(response.status).toBe(403);
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    },
  );

  it.each([FOREIGN, "null"])(
    "refuses a POST from %s before the body is read, without a strike",
    async (origin) => {
      const handled: string[] = [];
      const banList = createBanList({
        strikesToBan: 1,
        strikeWindowMs: 60_000,
        banMs: 60_000,
        maxEntries: 10,
      });

      const base = await startRouter(
        { "/echo": createEchoRoute(handled) },
        { banList },
      );

      const response = await fetch(`${base}/echo`, {
        method: "POST",
        headers: { Origin: origin, ...JSON_HEADERS },
        body: "{}",
      });

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: "origin_not_allowed" });
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(handled).toEqual([]);
      expect(banList.bannedUntil("9.9.9.9", 1_000)).toBeNull();
    },
  );

  it("echoes an allowed origin on the handler's answer, the 413 and the banned 429", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 60_000,
      maxEntries: 10,
    });

    const base = await startRouter(
      { "/echo": { ...createEchoRoute(), maxBodyBytes: 4 } },
      { banList },
    );
    const headers = { Origin: ALLOWED, ...JSON_HEADERS };

    const ok = await fetch(`${base}/echo`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(ok.status).toBe(202);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(ok.headers.get("vary")).toBe("Origin");

    const big = await fetch(`${base}/echo`, {
      method: "POST",
      headers,
      body: '{"a":1}',
    });
    expect(big.status).toBe(413);
    expect(big.headers.get("access-control-allow-origin")).toBe(ALLOWED);

    banList.strike("9.9.9.9", "login-failed", 1_000);
    const banned = await fetch(`${base}/echo`, {
      method: "POST",
      headers,
      body: "{}",
    });
    expect(banned.status).toBe(429);
    expect(banned.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("echoes an allowed origin on a 500 too", async () => {
    const base = await startRouter({
      "/echo": {
        maxBodyBytes: 1_024,
        handle: (): Promise<HttpResult> => {
          return Promise.reject(new Error("boom"));
        },
      },
    });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { Origin: ALLOWED, ...JSON_HEADERS },
      body: "{}",
    });

    expect(response.status).toBe(500);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("sends no CORS header at all on a request with no Origin (the mobile client, curl)", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: JSON_HEADERS,
      body: "{}",
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });

  it.each([
    ["text/plain", "text/plain"],
    [undefined, "no header"],
  ])(
    "refuses a POST whose Content-Type is %s (%s) with 415 before the body is read",
    async (contentType, _label) => {
      const handled: string[] = [];
      const base = await startRouter({ "/echo": createEchoRoute(handled) });

      const response = await fetch(`${base}/echo`, {
        method: "POST",
        headers:
          contentType === undefined ? {} : { "Content-Type": contentType },
        body: "{}",
      });

      expect(response.status).toBe(415);
      expect(await response.json()).toEqual({
        error: "unsupported_media_type",
      });
      expect(handled).toEqual([]);
    },
  );

  it("accepts application/json with a charset parameter", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { "Content-Type": "Application/JSON; charset=utf-8" },
      body: "{}",
    });

    expect(response.status).toBe(202);
  });

  it("uses the policy it is given", async () => {
    const base = await startRouter(
      { "/echo": createEchoRoute() },
      { origins: resolveOriginPolicy({ RTC_ALLOWED_ORIGINS: FOREIGN }) },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { Origin: FOREIGN, ...JSON_HEADERS },
      body: "{}",
    });

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBe(FOREIGN);
  });

  const ALLOWED = "http://localhost:5173";

  const JSON_HEADERS = { "Content-Type": "application/json" };
});

interface RouterOverrides {
  readonly banList?: BanList;
  readonly clientIp?: (req: IncomingMessage) => string;
  readonly log?: (line: string) => void;
  readonly origins?: OriginPolicy;
}

/** A route that records each body it was handed and answers 202. */
function createEchoRoute(handled: string[] = []): PostRoute {
  return {
    maxBodyBytes: 1_024,
    handle: (bodyText: string): Promise<HttpResult> => {
      handled.push(bodyText);

      return Promise.resolve(jsonResult(202, { ok: true }));
    },
  };
}

/** A ban list in which the caller `9.9.9.9` is banned until 31 000 (the
 * router's clock reads 1 000, so `Retry-After` is 30). */
function createBannedList(): BanList {
  const banList = createBanList({
    strikesToBan: 1,
    strikeWindowMs: 60_000,
    banMs: 30_000,
    maxEntries: 10,
  });
  banList.strike("9.9.9.9", "login-failed", 1_000);

  return banList;
}

function readFlyClientIp(req: IncomingMessage): string {
  return resolveClientIp(req, "fly-client-ip");
}

/** A real node:http server on an ephemeral port, with the router in front
 * of a 404 — the same position it has in `index.ts`. */
async function startRouter(
  routes: Record<string, PostRoute>,
  overrides: RouterOverrides = {},
): Promise<string> {
  const route = createPostRouter({
    routes: new Map<string, PostRoute>(Object.entries(routes)),
    banList:
      overrides.banList ??
      createBanList({
        strikesToBan: 100,
        strikeWindowMs: 60_000,
        banMs: 60_000,
        maxEntries: 10,
      }),
    clientIp:
      overrides.clientIp ??
      ((): string => {
        return "9.9.9.9";
      }),
    now: (): number => {
      return 1_000;
    },
    log: overrides.log ?? createLineSink(),
    origins: overrides.origins ?? resolveOriginPolicy({}),
  });

  const started = createServer((req, res) => {
    if (!route(req, res)) {
      res.writeHead(404);
      res.end();
    }
  });
  server = started;

  await new Promise<void>((resolve) => {
    started.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });

  return `http://127.0.0.1:${(started.address() as AddressInfo).port}`;
}

let server: Server | undefined;

/** A log that keeps its lines to itself, for cases that do not read them. */
function createLineSink(): (line: string) => void {
  const lines: string[] = [];

  return (line: string): void => {
    lines.push(line);
  };
}
