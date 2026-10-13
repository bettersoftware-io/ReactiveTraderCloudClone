import type { IncomingMessage, ServerResponse } from "node:http";

import type { BanList } from "../auth/banList.js";
import { CORS_MAX_AGE_SECONDS } from "../config/limits.js";
import type { HttpResult } from "./jsonResult.js";
import { isJsonContentType, type OriginPolicy } from "./originPolicy.js";
import { BodyTooLargeError, readBodyWithLimit } from "./readBody.js";

export interface PostRoute {
  /** Body cap, by bytes RECEIVED (S2). */
  readonly maxBodyBytes: number;
  readonly handle: (bodyText: string, ip: string) => Promise<HttpResult>;
}

interface PostRouterDeps {
  readonly routes: ReadonlyMap<string, PostRoute>;
  readonly banList: Pick<BanList, "bannedUntil">;
  /** The S3 trusted-header resolver — the one source of the caller's IP. */
  readonly clientIp: (req: IncomingMessage) => string;
  readonly now: () => number;
  /** Where a handler fault's one fixed line goes. */
  readonly log: (line: string) => void;
  /** Which browser pages may use these routes (spec §3.1). */
  readonly origins: OriginPolicy;
}

/**
 * Every JSON POST route goes through the same five steps, written once:
 * the origin and content-type rules and the CORS preflight, the §9.2 ban
 * check before the body is even read, the S2 body cap by bytes received, and
 * one error mapping (413 for an oversized body, 500 for anything a handler
 * throws). The router, not `jsonResult`, writes every CORS header: an
 * allowed origin is echoed (never `*`); a request with no `Origin` is not a
 * browser and gets none. Returns `false` for a
 * path or method it does not own, so the caller's routing continues. A
 * handler fault is logged as one fixed line — the route, the IP and the
 * error's NAME — never its message, the body or a header: a body carries
 * passwords, codes and email addresses, and an error message can echo them.
 */
export function createPostRouter(
  deps: PostRouterDeps,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const path = req.url;
    const route = path === undefined ? undefined : deps.routes.get(path);

    if (route === undefined) {
      return false;
    }

    // The Origin header is a browser's statement of the page that sent the
    // request; a page cannot change it. No header: not a browser (the
    // mobile client, curl, the probe) and not this policy's business. The
    // literal `null` is a browser's and is never allowed.
    const origin = readHeader(req.headers.origin);
    const allowedOrigin =
      origin !== null && deps.origins.allows(origin) ? origin : null;

    const cors: Record<string, string> =
      allowedOrigin === null
        ? {}
        : { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" };

    if (req.method === "OPTIONS") {
      if (allowedOrigin === null) {
        res.writeHead(403);
        res.end();

        return true;
      }

      res.writeHead(204, {
        ...cors,
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": String(CORS_MAX_AGE_SECONDS),
      });
      res.end();

      return true;
    }

    if (req.method !== "POST") {
      return false;
    }

    // A foreign page's request is refused before anything is read or
    // charged: the sender is a visitor's browser, not the attacker, so it
    // is no strike. The body is unread, so the connection is closed.
    if (origin !== null && allowedOrigin === null) {
      refuseUnread(res, 403, "origin_not_allowed", cors);

      return true;
    }

    // A "simple" cross-site form post carries text/plain or form encoding
    // and needs no preflight; requiring JSON is what makes the allowlist
    // above hold for every browser request.
    if (
      !isJsonContentType(readHeader(req.headers["content-type"]) ?? undefined)
    ) {
      refuseUnread(res, 415, "unsupported_media_type", cors);

      return true;
    }

    const ip = deps.clientIp(req);
    const now = deps.now();
    const bannedUntil = deps.banList.bannedUntil(ip, now);

    // A banned caller is answered before its body is read (the handler
    // checks again; this saves the read). Same shape as the handler's
    // answer: 429, `{ error: "banned" }`, Retry-After in whole seconds.
    if (bannedUntil !== null) {
      res.writeHead(429, {
        ...cors,
        "Content-Type": "application/json",
        Connection: "close",
        "Retry-After": String(Math.ceil((bannedUntil - now) / 1_000)),
      });
      res.end(JSON.stringify({ error: "banned" }));

      return true;
    }

    readBodyWithLimit(req, route.maxBodyBytes)
      .then((bodyText) => {
        return route.handle(bodyText, ip);
      })
      .then((result) => {
        res.writeHead(result.status, { ...result.headers, ...cors });
        res.end(result.body);
      })
      .catch((err: unknown) => {
        // 413 for an oversized body; anything else is a server fault (a
        // handler answers 4xx itself), never a bad request. The body may be
        // unread (413): close the connection after the status so the rest
        // of it is never consumed.
        const tooLarge = err instanceof BodyTooLargeError;

        if (!tooLarge) {
          deps.log(
            `[http] 500 route=${path} ip=${ip} err=${err instanceof Error ? err.name : "unknown"}`,
          );
        }

        // The fault came after the head was written (writing the body
        // failed): a second head would throw out of this catch. Drop the
        // connection, so the caller is not left waiting on a half response.
        if (res.headersSent) {
          res.destroy();

          return;
        }

        res.writeHead(tooLarge ? 413 : 500, {
          ...cors,
          "Content-Type": "application/json",
          Connection: "close",
        });
        res.end(
          JSON.stringify({
            error: tooLarge ? "body_too_large" : "internal_error",
          }),
        );
      });

    return true;
  };
}

function readHeader(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;

  return first === undefined ? null : first;
}

/** A refusal written before the body was read: close the connection so the
 * rest of the body is never consumed (as the 413 does). */
function refuseUnread(
  res: ServerResponse,
  status: number,
  error: string,
  cors: Record<string, string>,
): void {
  res.writeHead(status, {
    ...cors,
    "Content-Type": "application/json",
    Connection: "close",
  });
  res.end(JSON.stringify({ error }));
}
