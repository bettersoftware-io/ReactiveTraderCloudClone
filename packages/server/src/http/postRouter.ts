import type { IncomingMessage, ServerResponse } from "node:http";

import type { BanList } from "../auth/banList.js";
import type { HttpResult } from "./jsonResult.js";
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
}

/**
 * Every JSON POST route goes through the same four steps, written once:
 * the CORS preflight, the §9.2 ban check before the body is even read, the
 * S2 body cap by bytes received, and one error mapping (413 for an
 * oversized body, 500 for anything a handler throws). Returns `false` for a
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

    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      });
      res.end();

      return true;
    }

    if (req.method !== "POST") {
      return false;
    }

    const ip = deps.clientIp(req);
    const now = deps.now();
    const bannedUntil = deps.banList.bannedUntil(ip, now);

    // A banned caller is answered before its body is read (the handler
    // checks again; this saves the read). Same shape as the handler's
    // answer: 429, `{ error: "banned" }`, Retry-After in whole seconds.
    if (bannedUntil !== null) {
      res.writeHead(429, {
        "Access-Control-Allow-Origin": "*",
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
        res.writeHead(result.status, result.headers);
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
          "Access-Control-Allow-Origin": "*",
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
