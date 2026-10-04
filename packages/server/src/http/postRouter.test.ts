import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { type BanList, createBanList } from "#/auth/banList";
import { resolveClientIp } from "#/http/clientIp";
import { jsonResult } from "#/http/jsonResult";
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
      headers: { "Fly-Client-IP": "7.7.7.7", "X-Forwarded-For": "6.6.6.6" },
    });

    expect(await response.json()).toEqual({ ip: "7.7.7.7" });
  });

  it.each(["/echo", "/other"])(
    "answers the preflight for %s exactly as /login always has",
    async (path) => {
      const base = await startRouter({
        "/echo": createEchoRoute(),
        "/other": createEchoRoute(),
      });

      const response = await fetch(`${base}${path}`, { method: "OPTIONS" });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toBe(
        "POST, OPTIONS",
      );
      expect(response.headers.get("access-control-allow-headers")).toBe(
        "Content-Type",
      );
    },
  );

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
      (await fetch(`${base}/small`, { method: "POST", body })).status,
    ).toBe(413);
    expect(
      (await fetch(`${base}/large`, { method: "POST", body })).status,
    ).toBe(200);
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

    const response = await fetch(`${base}/echo`, { method: "POST", body: "x" });

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

    const response = await fetch(`${base}/echo`, { method: "POST", body: "x" });

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
      body: JSON.stringify({ email: "body@example.com", code: "123456" }),
      headers: { "X-Secret-Header": "header-value" },
    });

    expect(response.status).toBe(500);
    expect(lines).toEqual([
      "[http] 500 route=/register ip=9.9.9.9 err=TypeError",
    ]);
    expect(lines.join("\n")).not.toMatch(
      /secret@example\.com|hunter2|body@example\.com|123456|header-value/,
    );
  });

  it("does not log a 413 or a refused ban — those are the caller's fault", async () => {
    const lines: string[] = [];
    const base = await startRouter(
      { "/echo": { ...createEchoRoute(), maxBodyBytes: 8 } },
      {
        log: (line: string): void => {
          lines.push(line);
        },
      },
    );

    await fetch(`${base}/echo`, { method: "POST", body: "x".repeat(64) });

    expect(lines).toEqual([]);
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

    const response = await fetch(`${base}/echo`, { method: "POST", body: "x" });

    expect(response.status).toBe(500);
  });
});

interface RouterOverrides {
  readonly banList?: BanList;
  readonly clientIp?: (req: IncomingMessage) => string;
  readonly log?: (line: string) => void;
}

function createEchoRoute(): PostRoute {
  return {
    maxBodyBytes: 1_024,
    handle: (bodyText: string) => {
      return Promise.resolve(jsonResult(200, { bodyText }));
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
