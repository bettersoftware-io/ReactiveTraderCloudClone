# B2a Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven items `docs/STATUS.md` lists as blocking before registration opens: browsers reach the POST routes only from allowed origins with JSON bodies; sends cannot be timed and are attempted only when they land; never-confirmed accounts are purged; the sign-up levers are settings; a /48 is bounded; the probe and the docs record it.

**Architecture:** Everything lands in `@rtc/server` (plus two error words in `@rtc/shared`). The POST router gains an origin policy and a content-type rule and owns every CORS header. The account store's port gains one read (`findByEmail`) and one write (`purgeUnconfirmedBefore`), implemented by all three directories. The account service answers the three send paths before their Supabase call runs, gated by the lookup and by three per-path fuses. A scheduler runs the purge hourly. The login handler holds a failed account login to a floor. Two settings and one new one are read where `REGISTRATION_OPEN` is.

**Tech Stack:** Node 26 `node:http`, TypeScript 7 (`tsc`), Vitest 5 with fake timers, PostgREST and Supabase Auth over `fetch`, the repo's `mutation-check`.

**Spec:** `docs/superpowers/specs/2026-10-13-b2a-hardening-design.md` — the plan argues from it; read §3 before any task.

## Global Constraints

- Work in the worktree `.claude/worktrees/b2a-hardening` (branch `worktree-b2a-hardening`), with an absolute `cd` in every command and absolute paths everywhere.
- Logs never contain a password, a code, a token, a request body or an email address (spec §3.2, parent §5.7). A detached-send log line carries the route and the outcome word only.
- Test files import their own package through the `#/` alias (`#/accounts/AccountService`), never `./x.js`.
- Before every commit: `pnpm exec biome ci --error-on-warnings <files>` AND `pnpm exec eslint <files>`; both must be clean. Commit attribution comes from the implementer's own harness reminder.
- After editing anything under `packages/shared/src`, rebuild `@rtc/domain` then `@rtc/shared`, sequentially, before running server tests: `pnpm --filter @rtc/domain build && pnpm --filter @rtc/shared build`. Never two builds at once.
- A test waiting for a timer runs on fake timers (`vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync`), never a real sleep.
- The three fuses sum to 55 an hour (25 + 15 + 15), under the project's email limit of 60 (spec §3.2). Do not change the constants.
- No wire type changes beyond the two new `AccountErrorCode` words `origin_not_allowed` and `unsupported_media_type`.
- Function names state their effect (`docs/handler-naming.md`); fixture factories are `create*`; one import statement per module.

## Review Focus

1. **A request with an `Origin` header whose value is the literal string `null`** (a sandboxed iframe, some redirects): must be refused like a foreign origin, never treated as "no browser". Pinned in Task 2 and Task 3.
2. **A `Content-Type` with parameters or odd casing** (`Application/JSON; charset=utf-8`): must pass; `text/plain` and a missing header must be refused. Pinned in Task 2 and Task 3.
3. **A directory whose send never settles**: the three send paths must still answer, and the daily-cap counters must not leak an in-flight count forever when the detached call eventually settles. Pinned in Task 5 with a deferred fake.
4. **A spent fuse must refuse a request for a *missing* address too**, or the refusal reveals which addresses have accounts. Pinned in Task 5.
5. **The purge must never remove a seed or a confirmed account**, and a 404 on a delete is "already gone", not a failure. Pinned in Task 4.

---

### Task 1: Limiter primitives — `peek`, the /48 key, the tiered limiter, the new constants

**Files:**
- Modify: `packages/server/src/auth/rateLimit.ts`
- Modify: `packages/server/src/auth/rateLimit.test.ts`
- Modify: `packages/server/src/http/clientIp.ts`
- Modify: `packages/server/src/http/clientIp.test.ts`
- Create: `packages/server/src/http/tieredLimiter.ts`
- Create: `packages/server/src/http/tieredLimiter.test.ts`
- Modify: `packages/server/src/config/limits.ts`

**Interfaces:**
- Produces: `RateLimiter.peek(key: string, now: number): boolean` — true when a `hit` now would be allowed; charges nothing. `widerNetworkKeyOf(key: string): string | null` — the /48 (`a:b:c::`) of an IPv6 key, `null` for IPv4 or anything unparsable. `createTieredLimiter(own: RateLimiter, wider: RateLimiter): RateLimiter` — a `RateLimiter` whose `hit`/`peek` consult both. Constants: `RESENDS_PER_HOUR_MAX = 15`, `RESETS_PER_HOUR_MAX = 15`, `SEND_FUSE_WINDOW_MS = 60 * 60 * 1000`, `LOGIN_FAILURE_FLOOR_MS = 300`, `PURGE_UNCONFIRMED_AFTER_MS = 48 * 60 * 60 * 1000`, `PURGE_INTERVAL_MS = 60 * 60 * 1000`, `PURGE_FIRST_RUN_DELAY_MS = 60 * 1000`, `PURGE_BATCH = 100`, `WIDER_NETWORK_BUDGET_MULTIPLIER = 4`, `CORS_MAX_AGE_SECONDS = 600`.

- [ ] **Step 1: Write the failing tests**

Append to `rateLimit.test.ts`:

```ts
  it("peek reports whether a hit would be allowed, and charges nothing", () => {
    const rl = createRateLimiter(2, 1_000);

    expect(rl.peek("ip", 0)).toBe(true);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 10)).toBe(true);
    expect(rl.peek("ip", 20)).toBe(false);
    // A refused peek did not open a window; a new window after it passes.
    expect(rl.peek("ip", 1_500)).toBe(true);
    expect(rl.hit("ip", 1_500)).toBe(true);
  });

  it("peek on a key never seen does not add it to the table", () => {
    const rl = createRateLimiter(1, 1_000);

    expect(rl.peek("fresh", 0)).toBe(true);
    expect(rl.size()).toBe(0);
  });
```

Append to `clientIp.test.ts` (inside a new `describe("widerNetworkKeyOf", …)`, importing it from `#/http/clientIp`):

```ts
describe("widerNetworkKeyOf", () => {
  it("gives the /48 of an IPv6 /64 key", () => {
    expect(widerNetworkKeyOf("2001:db8:1:2::")).toBe("2001:db8:1::");
    expect(widerNetworkKeyOf("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1::");
  });

  it("is null for IPv4, an IPv4-mapped address and anything unparsable", () => {
    expect(widerNetworkKeyOf("203.0.113.9")).toBeNull();
    expect(widerNetworkKeyOf("::ffff:203.0.113.9")).toBeNull();
    expect(widerNetworkKeyOf("unknown")).toBeNull();
  });
});
```

Create `tieredLimiter.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { createRateLimiter } from "#/auth/rateLimit";
import { createTieredLimiter } from "#/http/tieredLimiter";

describe("createTieredLimiter", () => {
  it("lets five /64s of one /48 spend the own budget each, then the /48 refuses the fifth", () => {
    const limiter = createTieredLimiter(
      createRateLimiter(1, 60_000),
      createRateLimiter(4, 60_000),
    );

    expect(limiter.hit("2001:db8:1:1::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:2::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:3::", 0)).toBe(true);
    expect(limiter.hit("2001:db8:1:4::", 0)).toBe(true);
    // A fifth /64 of the same /48: its own window is fresh, the /48's is spent.
    expect(limiter.hit("2001:db8:1:5::", 0)).toBe(false);
    // Another /48 is untouched.
    expect(limiter.hit("2001:db8:2:1::", 0)).toBe(true);
  });

  it("charges only the own window for an IPv4 caller", () => {
    const wider = createRateLimiter(1, 60_000);
    const limiter = createTieredLimiter(createRateLimiter(2, 60_000), wider);

    expect(limiter.hit("203.0.113.9", 0)).toBe(true);
    expect(limiter.hit("203.0.113.9", 0)).toBe(true);
    expect(limiter.hit("203.0.113.9", 0)).toBe(false);
    expect(wider.size()).toBe(0);
  });

  it("peek consults both windows and charges neither", () => {
    const limiter = createTieredLimiter(
      createRateLimiter(1, 60_000),
      createRateLimiter(1, 60_000),
    );

    expect(limiter.hit("2001:db8:1:1::", 0)).toBe(true);
    expect(limiter.peek("2001:db8:1:2::", 0)).toBe(false);
    expect(limiter.peek("2001:db8:2:1::", 0)).toBe(true);
    expect(limiter.size()).toBe(1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/b2a-hardening/packages/server && pnpm exec vitest run src/auth/rateLimit.test.ts src/http/clientIp.test.ts src/http/tieredLimiter.test.ts`
Expected: FAIL — `peek` is not a function; `widerNetworkKeyOf` not exported; module `#/http/tieredLimiter` not found.

- [ ] **Step 3: Implement**

In `rateLimit.ts`, add to the interface and the object:

```ts
export interface RateLimiter {
  hit(key: string, now: number): boolean;
  /** Whether `hit` would be allowed now. Reads only: no window is opened or
   * charged, so a refusal that depends on it is the same for every key. */
  peek(key: string, now: number): boolean;
  size(): number;
}
```

```ts
    peek(key: string, now: number): boolean {
      const state = windows.get(key);

      if (state === undefined || now >= state.windowStart + windowMs) {
        return true;
      }

      return state.count < maxPerWindow;
    },
```

In `clientIp.ts`, after `collapseToNetworkKey`:

```ts
/**
 * The /48 that holds an IPv6 key — the first three hextets, then `::` — so a
 * caller routed a whole /48 (a free tunnel broker hands out 65,536 /64s) can
 * be bounded as a group. `null` for an IPv4 caller, an IPv4-mapped address
 * and anything that does not parse: those have no wider bucket.
 */
export function widerNetworkKeyOf(key: string): string | null {
  if (isIP(key) !== 6) {
    return null;
  }

  const hextets = parseIpv6Hextets(key.replace(/%.*$/, ""));

  if (hextets === null || isIpv4Mapped(hextets)) {
    return null;
  }

  return `${hextets
    .slice(0, 3)
    .map((hextet) => {
      return hextet.toString(16);
    })
    .join(":")}::`;
}
```

Create `tieredLimiter.ts`:

```ts
import type { RateLimiter } from "../auth/rateLimit.js";
import { widerNetworkKeyOf } from "./clientIp.js";

/**
 * One per-IP budget in two tiers: the caller's own key (an IPv4 address or
 * an IPv6 /64) and, for IPv6, the /48 that holds it, against a limiter with a
 * larger budget. Both are always charged, so a /64 refused on its own window
 * still counts towards its /48; a refusal from either is a refusal. Satisfies
 * `RateLimiter`, so no handler knows it is there.
 */
export function createTieredLimiter(
  own: RateLimiter,
  wider: RateLimiter,
): RateLimiter {
  return {
    hit(key: string, now: number): boolean {
      const ownAllowed = own.hit(key, now);
      const widerKey = widerNetworkKeyOf(key);
      const widerAllowed = widerKey === null ? true : wider.hit(widerKey, now);

      return ownAllowed && widerAllowed;
    },
    peek(key: string, now: number): boolean {
      const widerKey = widerNetworkKeyOf(key);

      return (
        own.peek(key, now) && (widerKey === null || wider.peek(widerKey, now))
      );
    },
    size(): number {
      return own.size();
    },
  };
}
```

In `config/limits.ts`, after `EMAIL_SENDS_WINDOW_MS`:

```ts
/** B2a hardening — resends and reset requests per hour, whole server, one
 * fuse each, charged only for a send that will really happen (the address
 * was looked up first). With `EMAIL_SENDS_PER_HOUR_MAX` (25) the three fuses
 * sum to 55, under the Supabase project's email limit of 60 an hour, so the
 * project never throttles a mail the server let through. */
export const RESENDS_PER_HOUR_MAX = 15;
export const RESETS_PER_HOUR_MAX = 15;
export const SEND_FUSE_WINDOW_MS = 60 * 60 * 1000;

/** B2a hardening — a failed account login is not answered before this, so
 * Supabase's "unknown address at once, wrong password after its hash" is
 * not visible from outside. */
export const LOGIN_FAILURE_FLOOR_MS = 300;

/** B2a hardening — an account not confirmed within this is deleted; the
 * check runs hourly, a minute after start first, at most PURGE_BATCH at a
 * time. 48 hours and not 24: the daily cap counts the last 24 hours of
 * profiles and must not be undercut by its own cleanup. */
export const PURGE_UNCONFIRMED_AFTER_MS = 48 * 60 * 60 * 1000;
export const PURGE_INTERVAL_MS = 60 * 60 * 1000;
export const PURGE_FIRST_RUN_DELAY_MS = 60 * 1000;
export const PURGE_BATCH = 100;

/** B2a hardening — an IPv6 /48 may spend this many times one /64's budget. */
export const WIDER_NETWORK_BUDGET_MULTIPLIER = 4;

/** B2a hardening — how long a browser may cache a POST route's preflight. */
export const CORS_MAX_AGE_SECONDS = 600;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: the same vitest command. Expected: PASS. Then `pnpm exec biome ci --error-on-warnings` and `pnpm exec eslint` on the six files.

- [ ] **Step 5: Commit**

```bash
cd /Users/csx/workarea/dev/github.com/bettersoftware-io/ReactiveTraderCloudClone/.claude/worktrees/b2a-hardening && git add packages/server/src/auth/rateLimit.ts packages/server/src/auth/rateLimit.test.ts packages/server/src/http/clientIp.ts packages/server/src/http/clientIp.test.ts packages/server/src/http/tieredLimiter.ts packages/server/src/http/tieredLimiter.test.ts packages/server/src/config/limits.ts && git commit -m "feat(server): peek on the rate limiter, the /48 key and a two-tier limiter; the hardening constants"
```

---

### Task 2: The origin policy and the content-type rule; two error words

**Files:**
- Create: `packages/server/src/http/originPolicy.ts`
- Create: `packages/server/src/http/originPolicy.test.ts`
- Modify: `packages/shared/src/protocol/auth.ts` (`AccountErrorCode`)

**Interfaces:**
- Produces: `interface OriginPolicy { readonly kind: "list" | "localhost"; allows(origin: string): boolean }`; `resolveOriginPolicy(env: NodeJS.ProcessEnv): OriginPolicy` (throws at startup per spec §3.1); `parseAllowedOrigins(raw: string): string[]` (throws naming the entry's position); `isJsonContentType(value: string | undefined): boolean`.
- Consumed by: Task 3 (router, `index.ts`).

- [ ] **Step 1: Write the failing tests** (`originPolicy.test.ts`)

```ts
import { describe, expect, it } from "vitest";

import {
  isJsonContentType,
  parseAllowedOrigins,
  resolveOriginPolicy,
} from "#/http/originPolicy";

describe("parseAllowedOrigins", () => {
  it("splits on commas, trims, lowercases and keeps scheme://host[:port]", () => {
    expect(
      parseAllowedOrigins(
        " https://RTC-clone-react.vercel.app , https://rtc-clone-solid.vercel.app:443/ ",
      ),
    ).toEqual([
      "https://rtc-clone-react.vercel.app",
      "https://rtc-clone-solid.vercel.app",
    ]);
  });

  it.each([
    ["https://a.example/path", "a path"],
    ["https://a.example?x=1", "a query"],
    ["ftp://a.example", "a scheme that is not http(s)"],
    ["a.example", "no scheme"],
    ["https://", "no host"],
    ["", "an empty entry"],
  ])("refuses %s (%s), naming the entry's position and not its text", (entry) => {
    expect(() => {
      return parseAllowedOrigins(`https://ok.example,${entry}`);
    }).toThrow(/RTC_ALLOWED_ORIGINS entry 2/);
    expect(() => {
      return parseAllowedOrigins(`https://ok.example,${entry}`);
    }).not.toThrow(new RegExp(entry.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

describe("resolveOriginPolicy", () => {
  it("is the list when the setting is given, compared lowercase", () => {
    const policy = resolveOriginPolicy({
      RTC_ALLOWED_ORIGINS: "https://rtc-clone-react.vercel.app",
    });

    expect(policy.kind).toBe("list");
    expect(policy.allows("https://RTC-Clone-React.vercel.app")).toBe(true);
    expect(policy.allows("https://rtc-clone-react.vercel.app.evil.example")).toBe(false);
    expect(policy.allows("http://rtc-clone-react.vercel.app")).toBe(false);
    expect(policy.allows("null")).toBe(false);
  });

  it("is the localhost policy on a machine that is not deployed and has no setting", () => {
    const policy = resolveOriginPolicy({});

    expect(policy.kind).toBe("localhost");
    expect(policy.allows("http://localhost:5173")).toBe(true);
    expect(policy.allows("http://127.0.0.1:5473")).toBe(true);
    expect(policy.allows("http://localhost")).toBe(true);
    expect(policy.allows("https://localhost:5173")).toBe(false);
    expect(policy.allows("http://localhost.evil.example:5173")).toBe(false);
    expect(policy.allows("null")).toBe(false);
  });

  it.each([{ FLY_APP_NAME: "rtc-clone-server" }, { RTC_DEPLOYED: "1" }])(
    "refuses to start on a deployed machine without the setting (%o)",
    (env) => {
      expect(() => {
        return resolveOriginPolicy(env);
      }).toThrow("RTC_ALLOWED_ORIGINS must be set on a deployed server");
    },
  );

  it("treats a blank setting as unset", () => {
    expect(resolveOriginPolicy({ RTC_ALLOWED_ORIGINS: "  " }).kind).toBe("localhost");
  });
});

describe("isJsonContentType", () => {
  it.each([
    "application/json",
    "Application/JSON",
    "application/json; charset=utf-8",
    " application/json ;charset=UTF-8",
  ])("accepts %s", (value) => {
    expect(isJsonContentType(value)).toBe(true);
  });

  it.each([undefined, "", "text/plain", "application/x-www-form-urlencoded", "application/jsonx", "multipart/form-data; boundary=x"])(
    "refuses %s",
    (value) => {
      expect(isJsonContentType(value)).toBe(false);
    },
  );
});
```

- [ ] **Step 2: Run to verify failure** — module not found.

- [ ] **Step 3: Implement** (`originPolicy.ts`)

```ts
/** The setting the policy reads; named in every refusal, never its value. */
const SETTING = "RTC_ALLOWED_ORIGINS";
const LOCALHOST_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1"]);

export interface OriginPolicy {
  /** `list`: `RTC_ALLOWED_ORIGINS`. `localhost`: a dev machine with no setting. */
  readonly kind: "list" | "localhost";
  /** Whether a browser on `origin` (the `Origin` header's value) may use the POST routes. */
  allows(origin: string): boolean;
}

/**
 * Which pages may make a browser post to the server (spec §3.1). A request
 * with no `Origin` header is not a browser's and is not this policy's
 * business; the literal `null` origin is a browser's and is never allowed.
 * On a deployed machine the setting is required: a server that would accept
 * every page is not a configuration anyone meant.
 */
export function resolveOriginPolicy(env: NodeJS.ProcessEnv): OriginPolicy {
  const raw = env[SETTING]?.trim() ?? "";

  if (raw !== "") {
    const allowed = new Set(parseAllowedOrigins(raw));

    return {
      kind: "list",
      allows(origin: string): boolean {
        return allowed.has(origin.trim().toLowerCase());
      },
    };
  }

  if (env.FLY_APP_NAME || env.RTC_DEPLOYED) {
    throw new Error(`${SETTING} must be set on a deployed server`);
  }

  return {
    kind: "localhost",
    allows(origin: string): boolean {
      const parsed = parseOrigin(origin);

      return (
        parsed !== null &&
        parsed.protocol === "http:" &&
        LOCALHOST_HOSTS.has(parsed.hostname)
      );
    },
  };
}

/** The entries of the setting as normalized origins; throws on one that is
 * not an http(s) origin, naming its position (1-based) and not its text. */
export function parseAllowedOrigins(raw: string): string[] {
  return raw.split(",").map((entry, index) => {
    const parsed = parseOrigin(entry.trim());

    if (
      parsed === null ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      entry.trim().replace(/\/$/, "").toLowerCase() !== parsed.origin
    ) {
      throw new Error(
        `${SETTING} entry ${index + 1} is not an origin of the form scheme://host[:port]`,
      );
    }

    return parsed.origin;
  });
}

/** `application/json`, any case, with or without parameters. */
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const mediaType = value.split(";")[0]?.trim().toLowerCase();

  return mediaType === "application/json";
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
```

Note on the last condition in `parseAllowedOrigins`: `new URL("https://a.example:443/")` has `origin` `https://a.example` and `pathname` `/`, so the trailing slash and a default port are accepted; `https://a.example/path` fails on `pathname`.

In `packages/shared/src/protocol/auth.ts`, add to `AccountErrorCode` (alphabetical order, with a comment):

```ts
  | "malformed_json"
  /** A browser page whose origin is not on the server's allowlist. */
  | "origin_not_allowed"
  | "pending_approval"
  | "rate_limited"
  | "registration_closed"
  | "unavailable"
  | "unconfirmed"
  /** A POST whose `Content-Type` is not `application/json`. */
  | "unsupported_media_type";
```

Then rebuild: `pnpm --filter @rtc/domain build && pnpm --filter @rtc/shared build`.

- [ ] **Step 4: Run to verify they pass**; biome + eslint on the three files.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/originPolicy.ts packages/server/src/http/originPolicy.test.ts packages/shared/src/protocol/auth.ts && git commit -m "feat(server): the origin policy and the JSON content-type rule; two error words"
```

---

### Task 3: The POST router enforces origin and content type and owns CORS

**Files:**
- Modify: `packages/server/src/http/postRouter.ts`
- Modify: `packages/server/src/http/postRouter.test.ts`
- Modify: `packages/server/src/http/jsonResult.ts` (drop the CORS header)
- Modify: `packages/server/src/index.ts` (origin policy; `*` only on the GET branches and `/mcp`)
- Modify: `turbo.json` (`globalPassThroughEnv` gains `RTC_ALLOWED_ORIGINS`, `RTC_SIGNUPS_PER_HOUR`, `RTC_SIGNUPS_PER_DAY`)

**Interfaces:**
- Consumes: `OriginPolicy`, `isJsonContentType` (Task 2), `CORS_MAX_AGE_SECONDS` (Task 1).
- Produces: `PostRouterDeps.origins: OriginPolicy` (required).

- [ ] **Step 1: Write the failing tests** (add to `postRouter.test.ts`; `startRouter`'s `RouterOverrides` gains `origins?: OriginPolicy`, default `resolveOriginPolicy({})` — the localhost policy — so existing tests, which send no `Origin`, keep passing)

```ts
describe("createPostRouter — origins and content type", () => {
  const ALLOWED = "http://localhost:5173";
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
    expect(response.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(response.headers.get("access-control-max-age")).toBe("600");
  });

  it.each([FOREIGN, "null"])("refuses the preflight of %s with 403 and no CORS header", async (origin) => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST" },
    });

    expect(response.status).toBe(403);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it.each([FOREIGN, "null"])("refuses a POST from %s before the body is read, without a strike", async (origin) => {
    const handled: string[] = [];
    const banList = createBanList({ strikesToBan: 1, strikeWindowMs: 60_000, banMs: 60_000, maxEntries: 10 });
    const base = await startRouter(
      { "/echo": createEchoRoute(handled) },
      { banList },
    );

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "origin_not_allowed" });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(handled).toEqual([]);
    expect(banList.bannedUntil("9.9.9.9", 1_000)).toBeNull();
  });

  it("echoes an allowed origin on the handler's answer, the 413 and the banned 429", async () => {
    const banList = createBanList({ strikesToBan: 1, strikeWindowMs: 60_000, banMs: 60_000, maxEntries: 10 });
    const base = await startRouter({ "/echo": { ...createEchoRoute(), maxBodyBytes: 4 } }, { banList });

    const ok = await fetch(`${base}/echo`, { method: "POST", headers: { Origin: ALLOWED, "Content-Type": "application/json" }, body: "{}" });
    expect(ok.status).toBe(202);
    expect(ok.headers.get("access-control-allow-origin")).toBe(ALLOWED);
    expect(ok.headers.get("vary")).toBe("Origin");

    const big = await fetch(`${base}/echo`, { method: "POST", headers: { Origin: ALLOWED, "Content-Type": "application/json" }, body: "{\"a\":1}" });
    expect(big.status).toBe(413);
    expect(big.headers.get("access-control-allow-origin")).toBe(ALLOWED);

    banList.strike("9.9.9.9", "test", 1_000);
    const banned = await fetch(`${base}/echo`, { method: "POST", headers: { Origin: ALLOWED, "Content-Type": "application/json" }, body: "{}" });
    expect(banned.status).toBe(429);
    expect(banned.headers.get("access-control-allow-origin")).toBe(ALLOWED);
  });

  it("sends no CORS header at all on a request with no Origin (the mobile client, curl)", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("vary")).toBeNull();
  });

  it.each([
    ["text/plain", "text/plain"],
    [undefined, "no header"],
  ])("refuses a POST whose Content-Type is %s (%s) with 415 before the body is read", async (contentType) => {
    const handled: string[] = [];
    const base = await startRouter({ "/echo": createEchoRoute(handled) });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      headers: contentType === undefined ? {} : { "Content-Type": contentType },
      body: "{}",
    });

    expect(response.status).toBe(415);
    expect(await response.json()).toEqual({ error: "unsupported_media_type" });
    expect(handled).toEqual([]);
  });

  it("accepts application/json with a charset parameter", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, { method: "POST", headers: { "Content-Type": "Application/JSON; charset=utf-8" }, body: "{}" });

    expect(response.status).toBe(202);
  });

  it("uses the policy it is given", async () => {
    const base = await startRouter(
      { "/echo": createEchoRoute() },
      { origins: resolveOriginPolicy({ RTC_ALLOWED_ORIGINS: FOREIGN }) },
    );

    const response = await fetch(`${base}/echo`, { method: "POST", headers: { Origin: FOREIGN, "Content-Type": "application/json" }, body: "{}" });

    expect(response.status).toBe(202);
    expect(response.headers.get("access-control-allow-origin")).toBe(FOREIGN);
  });
});
```

With, below the cases:

```ts
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
```

**Existing tests in this file that send a body without a `Content-Type`** (e.g. `body: "hello"`) now get 415: add `headers: { "Content-Type": "application/json" }` to each such `fetch`. Node's `fetch` sets `text/plain;charset=UTF-8` for a string body when no header is given, which is exactly what the rule refuses.

- [ ] **Step 2: Run to verify failure** — the new cases fail; several old ones fail with 415 until their headers are added.

- [ ] **Step 3: Implement**

`jsonResult.ts`: remove `"Access-Control-Allow-Origin": "*"`; the constant becomes `JSON_HEADERS` with only `Content-Type`. Update its doc comment: the router adds the CORS headers.

`postRouter.ts`:

```ts
import { CORS_MAX_AGE_SECONDS } from "../config/limits.js";
import { isJsonContentType, type OriginPolicy } from "./originPolicy.js";
```

```ts
interface PostRouterDeps {
  readonly routes: ReadonlyMap<string, PostRoute>;
  readonly banList: Pick<BanList, "bannedUntil">;
  readonly clientIp: (req: IncomingMessage) => string;
  readonly now: () => number;
  readonly log: (line: string) => void;
  /** Which browser pages may use these routes (spec §3.1). */
  readonly origins: OriginPolicy;
}
```

The handler body, replacing the OPTIONS block and threading `cors` through every `writeHead`:

```ts
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
    if (!isJsonContentType(readHeader(req.headers["content-type"]) ?? undefined)) {
      refuseUnread(res, 415, "unsupported_media_type", cors);

      return true;
    }
```

Then the existing ban check, with `...cors` spread into its headers; the success path `res.writeHead(result.status, { ...result.headers, ...cors })`; the 413/500 path with `...cors`. Add the two helpers at the bottom:

```ts
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
```

Update the router's doc comment: "five steps" — the origin and content-type rules, the preflight, the ban check before the body, the body cap, one error mapping; and that the router, not `jsonResult`, writes every CORS header.

`index.ts`:
- `import { resolveOriginPolicy } from "./http/originPolicy.js";`
- Before the router: `const originPolicy = resolveOriginPolicy(process.env);` with a comment that it throws on a deployed machine without `RTC_ALLOWED_ORIGINS` (startup refusal, like the account modes).
- `createPostRouter({ …, origins: originPolicy })`.
- Remove `res.setHeader("Access-Control-Allow-Origin", "*");` at the top of the `createServer` callback; add `"Access-Control-Allow-Origin": "*"` to the `writeHead` of both `/health` responses and the `/health/accounts` responses (and the `/health` `Allow-Methods` setHeader stays); in the `/mcp` branch add `res.setHeader("Access-Control-Allow-Origin", "*");` before `serveMcp` so `/mcp` is unchanged. Update the "All are permissively CORS'd" comment: the GET routes and `/mcp` are; the POST routes answer only an allowed origin (`originPolicy`).

`turbo.json`: add `"RTC_ALLOWED_ORIGINS"`, `"RTC_SIGNUPS_PER_HOUR"`, `"RTC_SIGNUPS_PER_DAY"` after `"REGISTRATION_OPEN"`.

- [ ] **Step 4: Run** `pnpm exec vitest run src/http` in `packages/server` — PASS; then `pnpm --filter @rtc/server typecheck` (or `pnpm exec tsc --noEmit -p packages/server`) to catch any test fixture that builds `PostRouterDeps` without `origins`. Biome + eslint on the changed files.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/postRouter.ts packages/server/src/http/postRouter.test.ts packages/server/src/http/jsonResult.ts packages/server/src/index.ts turbo.json && git commit -m "feat(server): the POST routes answer only allowed origins with JSON bodies, and the router owns every CORS header"
```

---

### Task 4: The port's two new operations in all three directories, and the probe's wrapper

**Files:**
- Modify: `packages/server/src/accounts/AccountDirectory.ts`
- Modify: `packages/server/src/accounts/SupabaseAccountDirectory.ts` + `.test.ts`
- Modify: `packages/server/src/accounts/InMemoryAccountDirectory.ts` + `.test.ts`
- Modify: `packages/server/src/accounts/DisabledAccountDirectory.ts`
- Modify: `packages/server/scripts/probe-accounts.ts` (the `timeEveryCall` wrapper only — it must implement the full port to compile)

**Interfaces:**
- Produces, on `AccountDirectory`:
  - `findByEmail(email: string): Promise<AccountLookup>` — the normalized address; same shape as `findAccount`.
  - `purgeUnconfirmedBefore(cutoffMs: number, limit: number): Promise<PurgeOutcome>` with `export type PurgeOutcome = { readonly outcome: "purged"; readonly count: number } | { readonly outcome: "unavailable" }`.
- The Supabase adapter's `Call.method` gains `"DELETE"`.

- [ ] **Step 1: Write the failing tests**

`SupabaseAccountDirectory.test.ts` — a new `describe("SupabaseAccountDirectory — findByEmail and purge", …)`:

```ts
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
    expect(await createDirectory(createFakeFetch([createReply(200, [])])).findByEmail("x@desk.io")).toEqual({ outcome: "missing" });
    expect(await createDirectory(createFakeFetch([createReply(503, {})])).findByEmail("x@desk.io")).toEqual({ outcome: "unavailable" });
    expect(await createDirectory(createFakeFetch([createReply(200, { not: "rows" })])).findByEmail("x@desk.io")).toEqual({ outcome: "unavailable" });
  });

  it("purgeUnconfirmedBefore lists unconfirmed profiles before the cutoff, oldest first, then deletes each user", async () => {
    const fake = createFakeFetch([
      createReply(200, [{ id: ACCOUNT_ID }, { id: OTHER_ID }]),
      createReply(200, {}),
      createReply(404, { error_code: "user_not_found" }),
    ]);

    const result = await createDirectory(fake).purgeUnconfirmedBefore(Date.UTC(2026, 9, 11), 50);

    expect(result).toEqual({ outcome: "purged", count: 2 });
    expect(fake.requests[0]?.url).toBe(
      "https://proj.supabase.co/rest/v1/profiles?select=id&email_confirmed_at=is.null&created_at=lt.2026-10-11T00%3A00%3A00.000Z&order=created_at.asc&limit=50",
    );
    expect(fake.requests[1]?.method).toBe("DELETE");
    expect(fake.requests[1]?.url).toBe(`https://proj.supabase.co/auth/v1/admin/users/${ACCOUNT_ID}`);
    expect(fake.requests[2]?.url).toBe(`https://proj.supabase.co/auth/v1/admin/users/${OTHER_ID}`);
  });

  it("purgeUnconfirmedBefore is unavailable when the list fails, and stops with the partial count when a delete fails", async () => {
    expect(await createDirectory(createFakeFetch([createReply(500, {})])).purgeUnconfirmedBefore(0, 10)).toEqual({ outcome: "unavailable" });

    const fake = createFakeFetch([
      createReply(200, [{ id: ACCOUNT_ID }, { id: OTHER_ID }]),
      createReply(200, {}),
      createReply(500, {}),
    ]);

    expect(await createDirectory(fake).purgeUnconfirmedBefore(0, 10)).toEqual({ outcome: "purged", count: 1 });
    expect(fake.requests).toHaveLength(3);
  });

  it("purgeUnconfirmedBefore refuses a non-finite cutoff or a non-positive limit without a request", async () => {
    const fake = createFakeFetch([]);

    expect(await createDirectory(fake).purgeUnconfirmedBefore(Number.NaN, 10)).toEqual({ outcome: "unavailable" });
    expect(await createDirectory(fake).purgeUnconfirmedBefore(0, 0)).toEqual({ outcome: "unavailable" });
    expect(fake.requests).toHaveLength(0);
  });
```

Add `const OTHER_ID = "2b4c8d1f-0000-4000-8000-000000000000";` beside `ACCOUNT_ID`, and add both operations to `createOperations()` (the "every method is unavailable when the store is down" sweep) with `{ outcome: "unavailable" }`.

`InMemoryAccountDirectory.test.ts`:

```ts
  it("findByEmail finds a seed and a sign-up, and is missing otherwise", async () => {
    const directory = createDirectory();
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);

    expect(await directory.findByEmail("trader@rtc.test")).toMatchObject({ outcome: "found", account: { status: "active" } });
    expect(await directory.findByEmail("ann@desk.io")).toMatchObject({ outcome: "found", account: { status: "unconfirmed" } });
    expect(await directory.findByEmail("nobody@desk.io")).toEqual({ outcome: "missing" });
  });

  it("purgeUnconfirmedBefore removes only unconfirmed sign-ups older than the cutoff, never a seed or a confirmed account, at most limit", async () => {
    let now = 1_000;
    const directory = createInMemoryAccountDirectory({ now: () => now, seeds: DEV_ACCOUNT_SEEDS });
    await directory.signUp({ email: "old1@desk.io", displayName: "Old One" }, IP);
    await directory.signUp({ email: "old2@desk.io", displayName: "Old Two" }, IP);
    await directory.signUp({ email: "kept@desk.io", displayName: "Kept" }, IP);
    await directory.confirmEmail("kept@desk.io", DEV_CONFIRMATION_CODE, PASSWORD, IP);
    now = 5_000;
    await directory.signUp({ email: "young@desk.io", displayName: "Young" }, IP);

    expect(await directory.purgeUnconfirmedBefore(2_000, 1)).toEqual({ outcome: "purged", count: 1 });
    expect(await directory.purgeUnconfirmedBefore(2_000, 10)).toEqual({ outcome: "purged", count: 1 });
    expect(await directory.findByEmail("old1@desk.io")).toEqual({ outcome: "missing" });
    expect(await directory.findByEmail("old2@desk.io")).toEqual({ outcome: "missing" });
    expect((await directory.findByEmail("kept@desk.io")).outcome).toBe("found");
    expect((await directory.findByEmail("young@desk.io")).outcome).toBe("found");
    // Seeds are created at 0 and exempt, whatever the cutoff.
    expect(await directory.purgeUnconfirmedBefore(Number.MAX_SAFE_INTEGER, 10)).toEqual({ outcome: "purged", count: 1 });
    expect((await directory.findByEmail("trader@rtc.test")).outcome).toBe("found");
  });
```

(The last assertion: after the first two purges only `young@` is left unconfirmed, so a far cutoff purges exactly it, and the four seeds remain.)

- [ ] **Step 2: Run to verify failure** — not on the type / not a function.

- [ ] **Step 3: Implement**

`AccountDirectory.ts`: add the type and the two methods with doc comments:

```ts
export type PurgeOutcome =
  | { readonly outcome: "purged"; readonly count: number }
  | { readonly outcome: "unavailable" };
```

```ts
  /** The account for a normalized address; the same cost whether or not one
   * exists, so a caller's timing says nothing about the address. */
  findByEmail(email: string): Promise<AccountLookup>;
  /** Deletes up to `limit` accounts never confirmed and created before
   * `cutoffMs`, oldest first. `purged` with a partial count when a delete
   * fails mid-run: the next run continues. */
  purgeUnconfirmedBefore(cutoffMs: number, limit: number): Promise<PurgeOutcome>;
```

`SupabaseAccountDirectory.ts`: `Call.method: "GET" | "POST" | "PUT" | "DELETE"`; then:

```ts
    async findByEmail(email: string): Promise<AccountLookup> {
      // PostgREST reads a double-quoted filter value literally, so a local
      // part's `+`, `,` or `.` is not an operator; the validator refuses the
      // two characters a quoted value cannot carry (`"` and `\`).
      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?email=eq.${encodeURIComponent(`"${email}"`)}&select=${PROFILE_COLUMNS}`,
      });

      return lookupOf(reply);
    },

    async purgeUnconfirmedBefore(cutoffMs: number, limit: number): Promise<PurgeOutcome> {
      if (!Number.isFinite(cutoffMs) || !Number.isInteger(limit) || limit <= 0) {
        return { outcome: "unavailable" };
      }

      const cutoff = encodeURIComponent(new Date(cutoffMs).toISOString());
      const listed = await call({
        method: "GET",
        path: `/rest/v1/profiles?select=id&email_confirmed_at=is.null&created_at=lt.${cutoff}&order=created_at.asc&limit=${limit}`,
      });

      if (listed.kind !== "ok" || !Array.isArray(listed.body)) {
        return { outcome: "unavailable" };
      }

      let count = 0;

      for (const row of listed.body) {
        const id = readString(row, "id");

        if (id === null || !UUID_SHAPE.test(id)) {
          continue;
        }

        // The cascade removes the profile; a 404 is an account already gone.
        const deleted = await call({ method: "DELETE", path: `/auth/v1/admin/users/${id}` });

        if (deleted.kind === "ok" || (deleted.kind === "refused" && deleted.status === 404)) {
          count += 1;
        } else {
          break;
        }
      }

      return { outcome: "purged", count };
    },
```

Refactor `findAccount`'s tail into a shared `lookupOf(reply: Reply): AccountLookup` (unavailable for a non-ok or non-array reply, missing for an empty array, found via `toAccountRecord`, unavailable when the row does not map), and have `findAccount` use it.

`InMemoryAccountDirectory.ts`: `Entry` gains `readonly seed: boolean` (seeds `true`, sign-ups `false`); a private `toRecord(entry)` used by `findAccount` and the new:

```ts
    findByEmail(email: string): Promise<AccountLookup> {
      const entry = byEmail.get(email);

      return Promise.resolve(entry === undefined ? { outcome: "missing" } : { outcome: "found", account: toRecord(entry) });
    },

    purgeUnconfirmedBefore(cutoffMs: number, limit: number): Promise<PurgeOutcome> {
      let count = 0;

      for (const [email, entry] of byEmail) {
        if (count >= limit) {
          break;
        }

        if (!entry.seed && !entry.confirmed && entry.createdAt < cutoffMs) {
          byEmail.delete(email);
          count += 1;
        }
      }

      return Promise.resolve({ outcome: "purged", count });
    },
```

(Map iteration order is insertion order, oldest first; deleting the current entry during `for…of` over a Map is safe.)

`DisabledAccountDirectory.ts`: both answer `{ outcome: "unavailable" }`.

`probe-accounts.ts` `timeEveryCall`: add the two pass-through methods (`findByEmail`, `purgeUnconfirmedBefore`) wrapped in `recordDuration`, importing `PurgeOutcome`. Nothing else in the probe changes in this task.

- [ ] **Step 4: Run** `pnpm exec vitest run src/accounts` — PASS; `pnpm typecheck` from the worktree root (the probe is in the tooling-side typecheck of `packages/server/tsconfig.scripts.json` and in `tsconfig.eslint.json`). Biome + eslint on all changed files, the probe included.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/accounts/AccountDirectory.ts packages/server/src/accounts/SupabaseAccountDirectory.ts packages/server/src/accounts/SupabaseAccountDirectory.test.ts packages/server/src/accounts/InMemoryAccountDirectory.ts packages/server/src/accounts/InMemoryAccountDirectory.test.ts packages/server/src/accounts/DisabledAccountDirectory.ts packages/server/scripts/probe-accounts.ts && git commit -m "feat(server): the account store can look an address up and purge never-confirmed accounts"
```

---

### Task 5: Sends that are looked up first, fused per path and never awaited

**Files:**
- Modify: `packages/server/src/accounts/AccountService.ts`
- Modify: `packages/server/src/accounts/AccountService.test.ts`
- Modify: `packages/server/src/http/accountLimits.ts` (+ `.test.ts`)
- Modify every fixture that builds an `AccountServiceOptions`: `packages/server/src/http/accountHandlers.test.ts`, `packages/server/src/http/loginHandler.test.ts` (`createAccounts`), and any other found by `grep -rln "sendFuse:" packages/server/src`.
- Modify: `packages/server/src/index.ts` (the service's new options)

**Interfaces:**
- `AccountServiceOptions` **replaces** `sendFuse` with `sendFuses: SendFuses` where `export interface SendFuses { readonly signUp: Fuse; readonly resend: Fuse; readonly reset: Fuse }` and `type Fuse = Pick<RateLimiter, "hit" | "peek">`, and gains `log: (line: string) => void`.
- `createSendFuses(signupsPerHour: number): SendFuses` in `accountLimits.ts` replaces `createSendFuse()`.
- Outcomes are unchanged.

- [ ] **Step 1: Write the failing tests** (`AccountService.test.ts`; update `createService` to accept `sendFuses` and `log` overrides, defaulting `log` to a recording array)

```ts
describe("AccountService — sends are looked up first and never awaited", () => {
  it("register answers code_sent while the directory's sign-up is still pending, and settles the daily counters when it resolves (Review Focus 3)", async () => {
    const deferred = createDeferred<SignUpOutcome>();
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => Promise.resolve({ outcome: "counted", count: 0 }),
      signUp: () => deferred.promise,
    });
    const service = createDoubleService(directory, 1);

    const answer = await service.register(createRegistration(), IP);

    expect(answer).toEqual({ outcome: "code_sent" });
    // The in-flight sign-up counts against the cap until it settles.
    expect(await service.register({ ...createRegistration(), email: "bob@desk.io" }, IP)).toEqual({ outcome: "closed" });

    deferred.resolve("sent");
    await flushMicrotasks();
    // Settled: nothing in flight any more. The double's count is a constant 0
    // (a real store would now count the first sign-up), so the cap of 1 is
    // open again — which proves the in-flight count was released.
    expect(await service.register({ ...createRegistration(), email: "cy@desk.io" }, IP)).toEqual({ outcome: "code_sent" });
  });

  it("register logs a detached outcome that is not sent, without the address", async () => {
    const lines: string[] = [];
    const directory = createDoubleDirectory({
      countRegistrationsSince: () => Promise.resolve({ outcome: "counted", count: 0 }),
      signUp: () => Promise.resolve("rejected-email"),
    });
    const service = createAccountService({ ...createOptions(directory), log: (line) => lines.push(line) });

    expect(await service.register(createRegistration(), IP)).toEqual({ outcome: "code_sent" });
    await flushMicrotasks();

    expect(lines).toEqual(["[accounts] detached send route=/register outcome=rejected-email"]);
    expect(lines.join()).not.toContain("ann@desk.io");
  });

  it("register charges the sign-up fuse after the count, so a closed registration spends nothing", async () => {
    const fuse = createRateLimiter(1, 60_000);
    const { service } = createService({ maxRegistrationsPerDay: 0, sendFuses: createFuses({ signUp: fuse }) });

    expect(await service.register(createRegistration(), IP)).toEqual({ outcome: "closed" });
    expect(fuse.peek("all", 0)).toBe(true);
  });

  it.each([
    ["resendCode", "trader@rtc.test", "active"],
    ["resendCode", "nobody@desk.io", "missing"],
    ["requestReset", "blocked@rtc.test", "blocked"],
    ["requestReset", "nobody@desk.io", "missing"],
  ] as const)("%s for %s (%s) answers code_sent and sends nothing", async (path, email) => {
    const { service, directory } = createService();
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    expect(await service[path](email, IP)).toBe("code_sent");

    expect(resend).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("resendCode sends for an unconfirmed account and requestReset for a pending or active one, each charging only its own fuse", async () => {
    const fuses = createFuses({ resend: createRateLimiter(1, 60_000), reset: createRateLimiter(2, 60_000) });
    const { service, directory } = createService({ sendFuses: fuses });
    await directory.signUp({ email: "ann@desk.io", displayName: "Ann" }, IP);
    const resend = vi.spyOn(directory, "resendCode");
    const reset = vi.spyOn(directory, "requestReset");

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("pending@rtc.test", IP)).toBe("code_sent");
    expect(await service.requestReset("trader@rtc.test", IP)).toBe("code_sent");
    await flushMicrotasks();

    expect(resend).toHaveBeenCalledWith("ann@desk.io", IP);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(fuses.resend.peek("all", 0)).toBe(false);
    expect(fuses.reset.peek("all", 0)).toBe(false);
    expect(fuses.signUp.peek("all", 0)).toBe(true);
  });

  it("a spent fuse refuses a missing address too, so the refusal says nothing about the address (Review Focus 4)", async () => {
    const resend = createRateLimiter(1, 60_000);
    resend.hit("all", 0);
    const { service, directory } = createService({ sendFuses: createFuses({ resend }) });
    const lookup = vi.spyOn(directory, "findByEmail");

    expect(await service.resendCode("nobody@desk.io", IP)).toBe("unavailable");
    expect(await service.resendCode("trader@rtc.test", IP)).toBe("unavailable");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("resendCode and requestReset answer unavailable when the lookup cannot be read", async () => {
    const directory = createDoubleDirectory({ findByEmail: () => Promise.resolve({ outcome: "unavailable" }) });
    const service = createAccountService(createOptions(directory));

    expect(await service.resendCode("ann@desk.io", IP)).toBe("unavailable");
    expect(await service.requestReset("ann@desk.io", IP)).toBe("unavailable");
  });

  it("the send is not awaited: a resend answers while the directory's send is pending", async () => {
    const deferred = createDeferred<SendOutcome>();
    const directory = createDoubleDirectory({
      findByEmail: () => Promise.resolve({ outcome: "found", account: createUnconfirmedRecord() }),
      resendCode: () => deferred.promise,
    });
    const service = createAccountService(createOptions(directory));

    expect(await service.resendCode("ann@desk.io", IP)).toBe("code_sent");
    deferred.resolve("unavailable");
    await flushMicrotasks();
  });
});
```

With fixtures (below the cases): `createFuses(overrides: Partial<SendFuses> = {}): SendFuses` (each default `createRateLimiter(100, 60_000)`), `createOptions(directory: AccountDirectory): AccountServiceOptions` (the double service's options with `sendFuses: createFuses()` and `log: () => {}`), `createUnconfirmedRecord(): AccountRecord` (`{ id: "00000000-0000-4000-8000-0000000000aa", email: "ann@desk.io", displayName: "Ann", access: "user", status: "unconfirmed" }`). Replace every `sendFuse:` in this file and in the other fixtures with `sendFuses: createFuses()` (define the helper in each file, or inline `{ signUp: createRateLimiter(100, 60_000), resend: …, reset: … }`), and add `log: () => {}`.

**Existing tests to revisit** (they asserted awaited outcomes): "register answers unavailable when the directory's sign-up is unavailable" and the equivalent for `rejected-email`, resend and reset: with detached sends those answer `code_sent` and log instead — rewrite them to assert the log line (route and outcome word, no address). The old "sendFuse covers register only" tests become the per-path fuse tests above.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** (`AccountService.ts`)

Options:

```ts
type Fuse = Pick<RateLimiter, "hit" | "peek">;

export interface SendFuses {
  /** `/register`: every counted sign-up is a mail the project sends. */
  readonly signUp: Fuse;
  /** `/resend-code`, charged only for an unconfirmed account. */
  readonly resend: Fuse;
  /** `/request-reset`, charged only for a confirmed, unblocked account. */
  readonly reset: Fuse;
}
```

Replace `sendFuse` with `sendFuses: SendFuses` and add `readonly log: (line: string) => void;` — "one fixed line per detached send that did not answer `sent`: the route and the outcome word, never the address".

The detach helper and the three paths:

```ts
  /** Starts a send and lets the request answer without it. The caller has
   * already been told `code_sent`; an outcome other than `sent` is one log
   * line with the route and the word, never the address. */
  function detach(route: string, send: Promise<string>): void {
    send.then(
      (outcome) => {
        if (outcome !== "sent") {
          options.log(`[accounts] detached send route=${route} outcome=${outcome}`);
        }
      },
      () => {
        options.log(`[accounts] detached send route=${route} outcome=threw`);
      },
    );
  }
```

`register`: after the display-name check and `chargeSend`, read the count (as today, with `answeredBefore`/`uncounted`), then:

```ts
    if (!options.sendFuses.signUp.hit(SEND_FUSE_KEY, options.now())) {
      return { outcome: "unavailable" };
    }

    inFlight += 1;
    detach(
      "/register",
      directory.signUp({ email, displayName }, callerIp).finally(() => {
        inFlight -= 1;
        answered += 1;
      }),
    );

    return { outcome: "code_sent" };
```

`resendCode`:

```ts
    if (!options.sendFuses.resend.peek(SEND_FUSE_KEY, options.now())) {
      return "unavailable";
    }

    const found = await directory.findByEmail(email);

    if (found.outcome === "unavailable") {
      return "unavailable";
    }

    if (found.outcome === "found" && found.account.status === "unconfirmed") {
      if (!options.sendFuses.resend.hit(SEND_FUSE_KEY, options.now())) {
        return "unavailable";
      }

      detach("/resend-code", directory.resendCode(email, callerIp));
    }

    return "code_sent";
```

`requestReset`: the same with `sendFuses.reset`, the condition `found.account.status === "pending" || found.account.status === "active"`, route `/request-reset`. Update the class comment: the three rules plus "a send is attempted only where it lands, and never awaited".

`accountLimits.ts`: replace `createSendFuse` with

```ts
/** The three server-wide hourly fuses (spec §3.2), one key each. Sized with
 * `RESENDS_PER_HOUR_MAX` and `RESETS_PER_HOUR_MAX` so the three sum under
 * the project's email limit. */
export function createSendFuses(signupsPerHour: number): SendFuses {
  return {
    signUp: createRateLimiter(signupsPerHour, SEND_FUSE_WINDOW_MS),
    resend: createRateLimiter(RESENDS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS),
    reset: createRateLimiter(RESETS_PER_HOUR_MAX, SEND_FUSE_WINDOW_MS),
  };
}
```

(`EMAIL_SENDS_WINDOW_MS` and `EMAIL_SENDS_PER_HOUR_MAX` stay as the default the setting falls back to in Task 7; `index.ts` passes `EMAIL_SENDS_PER_HOUR_MAX` for now.) Add a test in `accountLimits.test.ts` that the three fuses are independent instances and sized 25/15/15 when given 25.

`index.ts`: `sendFuses: createSendFuses(EMAIL_SENDS_PER_HOUR_MAX)`, `log: (line) => { console.log(line); }`.

- [ ] **Step 4: Run** `pnpm exec vitest run` in `packages/server` (the whole package: every fixture changed) — PASS. Biome + eslint on all changed files.

- [ ] **Step 5: Commit**

```bash
git add -A packages/server/src/accounts/AccountService.ts packages/server/src/accounts/AccountService.test.ts packages/server/src/http/accountLimits.ts packages/server/src/http/accountLimits.test.ts packages/server/src/http/accountHandlers.test.ts packages/server/src/http/loginHandler.test.ts packages/server/src/index.ts && git commit -m "feat(server): sends are looked up first, fused per path and never awaited"
```

(List any further fixture file the grep found.)

---

### Task 6: A failed account login is held to a floor

**Files:**
- Modify: `packages/server/src/http/loginHandler.ts`
- Modify: `packages/server/src/http/loginHandler.test.ts`
- Modify: `packages/server/src/index.ts` (nothing new to pass; `wait` defaults)

**Interfaces:**
- `LoginHandlerDeps` gains `readonly wait?: (ms: number) => Promise<void>` (default: a `setTimeout` promise). The floor is `LOGIN_FAILURE_FLOOR_MS` from Task 1.

- [ ] **Step 1: Write the failing tests**

```ts
describe("authenticateLoginRequest — the floor on a failed account login", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not answer an unknown address or a wrong password before 300 ms, measured from the handler's start", async () => {
    vi.useFakeTimers();
    let clock = 1_000;
    const deps = createDeps(createAuth(() => clock), { now: () => clock });
    let settled = false;

    const pending = authenticateLoginRequest(createLoginBody("nobody@desk.io", "Wrong2026!desk"), "1.2.3.4", deps).then((result) => {
      settled = true;

      return result;
    });

    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const result = await pending;
    expect(settled).toBe(true);
    expect(result.status).toBe(401);
  });

  it("pads only the remainder: a decision that took 200 ms waits 100 ms more", async () => {
    vi.useFakeTimers();
    const accounts = createAccounts();
    const slowAccounts: AccountService = {
      ...accounts,
      login: async (...args) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 200));

        return accounts.login(...args);
      },
    };
    const waits: number[] = [];
    const deps = createDeps(createAuth(createClock(1_000)), {
      accounts: slowAccounts,
      wait: (ms) => {
        waits.push(ms);

        return Promise.resolve();
      },
    });

    const pending = authenticateLoginRequest(createLoginBody("nobody@desk.io", "Wrong2026!desk"), "1.2.3.4", deps);
    await vi.advanceTimersByTimeAsync(200);
    await pending;

    expect(waits).toEqual([100]);
  });

  it("does not hold a successful account login or a roster login", async () => {
    const waits: number[] = [];
    const deps = createDeps(createAuth(createClock(1_000)), { wait: (ms) => { waits.push(ms); return Promise.resolve(); } });

    await authenticateLoginRequest(createLoginBody("admin@rtc.test", DEV_ACCOUNT_PASSWORD), "1.2.3.4", deps);
    await authenticateLoginRequest(createLoginBody("astark", "mcdc2026"), "1.2.3.4", deps);

    expect(waits).toEqual([]);
  });
});
```

(`createDeps`'s `DepsOverrides` gains `wait`; `now` must be the same clock the floor measures with — the test uses a mutable `clock` so `performance`-style measurement is not needed: the handler measures with `deps.now()`.)

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

```ts
import { LOGIN_FAILURE_FLOOR_MS } from "../config/limits.js";
```

```ts
export interface LoginHandlerDeps {
  …
  /** How the floor waits; a test injects fake time. */
  readonly wait?: (ms: number) => Promise<void>;
}
```

In `answerAccountLogin`, record `const started = now;` is not enough (the account call takes real time while `now()` is a clock): measure with `deps.now()` taken before and after the decision:

```ts
  const decision = await deps.accounts.login(request.username, request.password, ip);

  if (decision.outcome !== "ok") {
    // Supabase answers an unknown address at once and a wrong password after
    // its hash, so without this the two are told apart from outside. A
    // successful login is slower than the floor already and is not held.
    const remaining = LOGIN_FAILURE_FLOOR_MS - (deps.now() - now);

    if (remaining > 0) {
      await (deps.wait ?? waitMs)(remaining);
    }
  }
```

(before the existing `invalid` / `unavailable` / refusal branches), with

```ts
function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
```

Note: `now` is the value read at the handler's start (already a parameter of `answerAccountLogin`), so the floor is measured from the handler's start as the spec says. For the fake-timer test, `deps.now()` must advance with the fake clock: in the first test the mutable `clock` does not advance, so `remaining` is the full 300 and `waitMs` under fake timers resolves at 300 — which is what the test asserts.

- [ ] **Step 4: Run** `pnpm exec vitest run src/http/loginHandler.test.ts` — PASS. Biome + eslint.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/http/loginHandler.ts packages/server/src/http/loginHandler.test.ts && git commit -m "feat(server): a failed account login is held to a 300 ms floor"
```

---

### Task 7: The two settings, the purge scheduler, and the wiring

**Files:**
- Modify: `packages/server/src/accounts/resolveAccountsMode.ts` (+ `.test.ts`)
- Create: `packages/server/src/accounts/unconfirmedPurge.ts` (+ `.test.ts`)
- Modify: `packages/server/src/http/accountLimits.ts` (+ `.test.ts`): tiered per-IP limiters
- Modify: `packages/server/src/index.ts`

**Interfaces:**
- `readSignupLevers(env: NodeJS.ProcessEnv): { readonly perHour: number; readonly perDay: number }` — defaults `EMAIL_SENDS_PER_HOUR_MAX` and `MAX_REGISTRATIONS_PER_DAY`; throws `RTC_SIGNUPS_PER_HOUR must be a positive integer` (likewise `_PER_DAY`) on anything else, never echoing the value.
- `startUnconfirmedPurge(options: PurgeScheduleOptions): { stop(): void }` with `interface PurgeScheduleOptions { readonly directory: Pick<AccountDirectory, "purgeUnconfirmedBefore">; readonly now: () => number; readonly retentionMs: number; readonly intervalMs: number; readonly firstRunDelayMs: number; readonly batch: number; readonly log: (line: string) => void }`.
- `createAccountLimits()` returns tiered limiters; `createLoginLimiter()` (new; `index.ts` today builds `loginRateLimit` inline with `createRateLimiter` and two `LOGIN_*` constants from `config/limits.ts` — move that call here and tier it) likewise.

- [ ] **Step 1: Write the failing tests**

`resolveAccountsMode.test.ts`:

```ts
describe("readSignupLevers", () => {
  it("defaults to the constants", () => {
    expect(readSignupLevers({})).toEqual({ perHour: 25, perDay: 200 });
  });

  it("reads positive integers, trimmed", () => {
    expect(readSignupLevers({ RTC_SIGNUPS_PER_HOUR: " 10 ", RTC_SIGNUPS_PER_DAY: "90" })).toEqual({ perHour: 10, perDay: 90 });
  });

  it.each(["0", "-1", "1.5", "ten", "", "25 "+"x"])("refuses %j for the hour, naming the setting and not the value", (value) => {
    expect(() => readSignupLevers({ RTC_SIGNUPS_PER_HOUR: value })).toThrow("RTC_SIGNUPS_PER_HOUR must be a positive integer");
  });

  it("refuses a bad day the same way", () => {
    expect(() => readSignupLevers({ RTC_SIGNUPS_PER_DAY: "many" })).toThrow("RTC_SIGNUPS_PER_DAY must be a positive integer");
  });
});
```

`unconfirmedPurge.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PurgeOutcome } from "#/accounts/AccountDirectory";
import { startUnconfirmedPurge } from "#/accounts/unconfirmedPurge";

describe("startUnconfirmedPurge", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a minute after start, then every hour, with the cutoff now minus the retention and the batch", async () => {
    vi.useFakeTimers();
    const calls: [number, number][] = [];
    const lines: string[] = [];
    const handle = startUnconfirmedPurge({
      directory: { purgeUnconfirmedBefore: (cutoff, limit) => { calls.push([cutoff, limit]); return Promise.resolve({ outcome: "purged", count: 2 }); } },
      now: () => Date.now(),
      retentionMs: 48 * 3_600_000,
      intervalMs: 3_600_000,
      firstRunDelayMs: 60_000,
      batch: 100,
      log: (line) => lines.push(line),
    });

    await vi.advanceTimersByTimeAsync(59_999);
    expect(calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual([[Date.now() - 48 * 3_600_000, 100]]);
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(2);
    expect(lines).toEqual(["[accounts] purged 2 unconfirmed accounts", "[accounts] purged 2 unconfirmed accounts"]);
    handle.stop();
    await vi.advanceTimersByTimeAsync(3_600_000);
    expect(calls).toHaveLength(2);
  });

  it("logs nothing for a run that purged nothing, and one line when the store did not answer", async () => {
    vi.useFakeTimers();
    const outcomes: PurgeOutcome[] = [{ outcome: "purged", count: 0 }, { outcome: "unavailable" }];
    const lines: string[] = [];
    startUnconfirmedPurge({
      directory: { purgeUnconfirmedBefore: () => Promise.resolve(outcomes.shift() ?? { outcome: "unavailable" }) },
      now: () => 0, retentionMs: 1, intervalMs: 10, firstRunDelayMs: 1, batch: 1,
      log: (line) => lines.push(line),
    });

    await vi.advanceTimersByTimeAsync(11);
    expect(lines).toEqual(["[accounts] purge unavailable"]);
  });

  it("does not hold the process open", () => {
    vi.useFakeTimers();
    const unref = vi.fn();
    vi.spyOn(globalThis, "setTimeout").mockImplementation((() => ({ unref })) as unknown as typeof setTimeout);
    vi.spyOn(globalThis, "setInterval").mockImplementation((() => ({ unref })) as unknown as typeof setInterval);

    startUnconfirmedPurge({ directory: { purgeUnconfirmedBefore: () => Promise.resolve({ outcome: "purged", count: 0 }) }, now: () => 0, retentionMs: 1, intervalMs: 10, firstRunDelayMs: 1, batch: 1, log: () => {} });

    expect(unref).toHaveBeenCalled();
  });
});
```

(If the `unref` spy proves awkward under fake timers, assert instead that `startUnconfirmedPurge` calls `.unref()` on the handles returned by injected `schedule` functions: add optional `setTimer`/`setRepeating` injection points to `PurgeScheduleOptions`. Either way the `unref` must be witnessed.)

`accountLimits.test.ts`: a case that `createAccountLimits().register` refuses the fifth /64 of one /48 after four spent their budgets at `REGISTER_RATE_LIMIT_MAX` each — i.e. the wider bucket is `WIDER_NETWORK_BUDGET_MULTIPLIER × max`:

```ts
  it("bounds a /48 at four /64s' worth of /register", () => {
    const { register } = createAccountLimits();
    const perKey = REGISTER_RATE_LIMIT_MAX;

    for (let network = 1; network <= 4; network += 1) {
      for (let i = 0; i < perKey; i += 1) {
        expect(register.hit(`2001:db8:1:${network}::`, 0)).toBe(true);
      }
    }

    expect(register.hit("2001:db8:1:5::", 0)).toBe(false);
    expect(register.hit("2001:db8:2:1::", 0)).toBe(true);
  });
```

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement**

`resolveAccountsMode.ts`:

```ts
/** The two levers that pause sign-up during abuse (spec §3.4), read like
 * `REGISTRATION_OPEN`: a set value must be a positive integer, or the server
 * does not start; the refusal names the setting, never the value. */
export function readSignupLevers(env: NodeJS.ProcessEnv): { readonly perHour: number; readonly perDay: number } {
  return {
    perHour: readPositiveInteger(env, "RTC_SIGNUPS_PER_HOUR", EMAIL_SENDS_PER_HOUR_MAX),
    perDay: readPositiveInteger(env, "RTC_SIGNUPS_PER_DAY", MAX_REGISTRATIONS_PER_DAY),
  };
}

function readPositiveInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];

  if (raw === undefined) {
    return fallback;
  }

  const value = raw.trim();

  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`);
  }

  return Number(value);
}
```

`unconfirmedPurge.ts`:

```ts
import type { AccountDirectory } from "./AccountDirectory.js";

export interface PurgeScheduleOptions {
  readonly directory: Pick<AccountDirectory, "purgeUnconfirmedBefore">;
  readonly now: () => number;
  readonly retentionMs: number;
  readonly intervalMs: number;
  readonly firstRunDelayMs: number;
  readonly batch: number;
  readonly log: (line: string) => void;
}

export interface PurgeSchedule {
  stop(): void;
}

/**
 * Deletes accounts never confirmed within the retention (spec §3.3): a first
 * run shortly after start, then one every interval, each bounded to one
 * batch. Both timers are unref'd, so the schedule never holds the process
 * open. It logs a count when it purged something and one line when the
 * store did not answer — never an id or an address.
 */
export function startUnconfirmedPurge(options: PurgeScheduleOptions): PurgeSchedule {
  let repeating: ReturnType<typeof setInterval> | undefined;

  async function runOnce(): Promise<void> {
    const result = await options.directory.purgeUnconfirmedBefore(options.now() - options.retentionMs, options.batch);

    if (result.outcome === "unavailable") {
      options.log("[accounts] purge unavailable");
    } else if (result.count > 0) {
      options.log(`[accounts] purged ${result.count} unconfirmed accounts`);
    }
  }

  const first = setTimeout(() => {
    void runOnce();
    repeating = setInterval(() => {
      void runOnce();
    }, options.intervalMs);
    repeating.unref();
  }, options.firstRunDelayMs);
  first.unref();

  return {
    stop(): void {
      clearTimeout(first);

      if (repeating !== undefined) {
        clearInterval(repeating);
      }
    },
  };
}
```

`accountLimits.ts`: a private `createTieredIpLimiter(max, windowMs)` returning `createTieredLimiter(createRateLimiter(max, windowMs), createRateLimiter(max * WIDER_NETWORK_BUDGET_MULTIPLIER, windowMs))`; `createAccountLimits()` uses it for all five; add `export function createLoginLimiter(): RateLimiter` using it with `LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS` (find the names `index.ts` uses today for `loginRateLimit`).

`index.ts`:
- `const signupLevers = readSignupLevers(process.env);` beside the account mode (startup refusal comment).
- `maxRegistrationsPerDay: signupLevers.perDay`, `sendFuses: createSendFuses(signupLevers.perHour)`.
- `loginRateLimit` becomes `createLoginLimiter()`.
- After the health probe is built: if `accountsMode.kind !== "disabled"`, `startUnconfirmedPurge({ directory: accountDirectory, now: readClock, retentionMs: PURGE_UNCONFIRMED_AFTER_MS, intervalMs: PURGE_INTERVAL_MS, firstRunDelayMs: PURGE_FIRST_RUN_DELAY_MS, batch: PURGE_BATCH, log: (line) => { console.log(line); } })` with a comment pointing at spec §3.3.

- [ ] **Step 4: Run** the server package's tests and `pnpm typecheck`; biome + eslint.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/accounts/resolveAccountsMode.ts packages/server/src/accounts/resolveAccountsMode.test.ts packages/server/src/accounts/unconfirmedPurge.ts packages/server/src/accounts/unconfirmedPurge.test.ts packages/server/src/http/accountLimits.ts packages/server/src/http/accountLimits.test.ts packages/server/src/index.ts && git commit -m "feat(server): sign-up levers as settings, the hourly purge of never-confirmed accounts, two-tier per-IP limits"
```

---

### Task 8: The probe's new check and the smoke's witnesses

**Files:**
- Modify: `packages/server/scripts/probe-accounts.ts`
- Modify: `tests/fullstack/accounts-journey.ts`
- Check: `tests/fullstack/_orchestration.ts` / `node-smoke.ts` — the server it starts must run the localhost origin policy (it does, unless it sets `FLY_APP_NAME` or leaves `RTC_DEPLOYED` set; the smoke already blanks `RTC_DEPLOYED`).

- [ ] **Step 1: Add the probe checks** (after "the profile row ignores a self-granted role…", inside the first account's `try`):

```ts
  const byEmail = await directory.findByEmail(email);
  check(
    "findByEmail finds the account by its address",
    byEmail.outcome === "found" && byEmail.account.id === signup.id,
    byEmail.outcome === "found" ? byEmail.account.status : byEmail.outcome,
  );

  const nobody = await directory.findByEmail(`probe-nobody-${Date.now()}@${emailDomain}`);
  check("findByEmail is missing for an unknown address", nobody.outcome === "missing", nobody.outcome);
```

Update the probe's header comment (it also proves the lookup; it never purges — spec §5).

- [ ] **Step 2: Add the journey's witnesses** (a new section before the sign-in part, each request with its own IP offset so no budget is shared; `postWith(httpBase, path, payload, headers)` generalizes `post`):

```ts
  // ── Browsers: only an allowed origin, only JSON (spec §3.1) ──
  const foreign = await postWith(httpBase, "/register", { email: NEW_EMAIL, displayName: "Journey" }, { Origin: "https://evil.example" });
  assert(foreign.status === 403 && foreign.body.error === "origin_not_allowed", `foreign origin refused (got ${foreign.status})`);
  assert(foreign.headers.get("access-control-allow-origin") === null, "no CORS header for a foreign origin");

  const nullOrigin = await postWith(httpBase, "/register", { email: NEW_EMAIL, displayName: "Journey" }, { Origin: "null" });
  assert(nullOrigin.status === 403, `null origin refused (got ${nullOrigin.status})`);

  const local = await postWith(httpBase, "/resend-code", { email: NEW_EMAIL }, { Origin: "http://localhost:5173" });
  assert(local.status === 202, `localhost origin allowed (got ${local.status})`);
  assert(local.headers.get("access-control-allow-origin") === "http://localhost:5173", "the allowed origin is echoed");
  assert(local.headers.get("vary") === "Origin", "Vary: Origin on an allowed answer");

  const plain = await fetch(`${httpBase}/resend-code`, { method: "POST", headers: { "Content-Type": "text/plain", "Fly-Client-IP": JOURNEY_IP }, body: JSON.stringify({ email: NEW_EMAIL }) });
  assert(plain.status === 415, `text/plain refused (got ${plain.status})`);

  console.log("  ✓ accounts: a foreign or null origin is refused, localhost is echoed, text/plain is 415; requests without Origin pass (every other call in this journey)");
```

(`Answer` gains `headers: Headers`; the existing `post` calls `postWith` with no extra headers. Mind the per-address send budget: the journey may send at most three emails per address; the `local` resend above is one of them — recount the existing sends for `NEW_EMAIL` and, if needed, use a second fresh address for the witnesses.)

- [ ] **Step 3: Run** the smoke locally: from the worktree root, after `pnpm build` (sequential, nothing else building), `pnpm --filter @rtc/tests test:fullstack:node`. Expected: PASS with the new line. Then `pnpm typecheck`, biome + eslint on both files.

- [ ] **Step 4: Commit**

```bash
git add packages/server/scripts/probe-accounts.ts tests/fullstack/accounts-journey.ts && git commit -m "test(server): the probe proves the lookup; the smoke witnesses the origin and content-type rules"
```

---

### Task 9: Docs

**Files:** `docs/STATUS.md`, `docs/DEPLOY.md`, `docs/privacy.md`, `docs/env-files.md`, `docs/authentication.md`, `supabase/README.md`, `packages/server/README.md`, `docs/superpowers/specs/2026-10-04-b2-user-management-design.md`, `docs/superpowers/specs/2026-10-13-b2a-hardening-design.md` (status line), `CLAUDE.md` (one sentence).

- [ ] **Step 1: `docs/STATUS.md`** — in the B2a entry: replace the "YOURS TO DO before B2a is live" list with what is done (2026-10-13: Cloudflare + Resend EU `auth.bettersoftware.io`; project `rtc-clone` in London with the migration, templates, OTP 8, SMTP, rate limit 60, IP forwarding; probe PASS; keep-alive chosen) and what remains (steps 10–13: `RTC_ALLOWED_ORIGINS` + the account secrets on Fly, deploy, first admin). Replace the "BLOCKING" list with: **hardening MERGED <date> (the PR that lands this line)**: items 1–7 as resolved, each in one clause pointing at the hardening spec; leave as still-open-but-not-blocking: the edge challenge (Turnstile/Cloudflare in front) as the remover of the sign-up denial levers, now tunable via `RTC_SIGNUPS_PER_HOUR`/`_PER_DAY`. Keep the B2c and B2b notes. Change the order line: "**Order:** deploy (DEPLOY §4 steps 10–13) → B2b → B2c → B3 → B4".

- [ ] **Step 2: `docs/DEPLOY.md` §4** — step 1: add "*Done 2026-10-13:* Cloudflare Registrar + DNS for `bettersoftware.io`; Resend (EU, free plan) through the project's custom SMTP, sending domain `auth.bettersoftware.io` (DKIM, SPF, DMARC p=none); `privacy@bettersoftware.io` forwards through Cloudflare Email Routing." Step 5: note the three fuses (25 + 15 + 15 = 55) under the 60-an-hour rate limit, and that raising `RTC_SIGNUPS_PER_HOUR` means raising the project's limit. Step 9: "*Done 2026-10-13: PASS.*" Step 11: a first line `fly secrets set --stage RTC_ALLOWED_ORIGINS=https://rtc-clone-react.vercel.app,https://rtc-clone-solid.vercel.app -a rtc-clone-server` with one sentence (required on a deployed server; the server refuses to start without it). Step 12's refusal list gains "`RTC_ALLOWED_ORIGINS` unset on a deployed machine; an entry that is not `scheme://host[:port]`; `RTC_SIGNUPS_PER_HOUR` / `RTC_SIGNUPS_PER_DAY` not a positive integer". Step 14: "*Decided 2026-10-13: keep-alive.*" The "Before opening registration" note: the blocking list is done; what remains before `REGISTRATION_OPEN=true` is the deploy itself and a look at Resend's dashboard in the first days.

- [ ] **Step 3: `docs/privacy.md`** — "How long, and how to delete it": deletion requests go to `privacy@bettersoftware.io` from the account's address (the GitHub-issue route stays as the alternative for someone who prefers it); add one sentence: an account whose address is never confirmed is deleted after 48 hours.

- [ ] **Step 4: `docs/env-files.md`** — three rows after `REGISTRATION_OPEN`: `RTC_ALLOWED_ORIGINS` (Fly secret, REQUIRED on a deployed server; comma-separated origins; unset on a dev machine = localhost on any port; `resolveOriginPolicy`), `RTC_SIGNUPS_PER_HOUR` (Fly secret, optional, default 25; the sign-up fuse; raise the project's email limit with it), `RTC_SIGNUPS_PER_DAY` (optional, default 200; `readSignupLevers`).

- [ ] **Step 5: `docs/authentication.md` §7** — §7.3 endpoints: a paragraph "Browsers" (the origin rule, the content-type rule, the 403/415 words, no strike; no `Origin` = not a browser = the mobile client) and a sentence on each send path answering before the send. §7.6 limits table: rows for `RESENDS_PER_HOUR_MAX`, `RESETS_PER_HOUR_MAX` (and the sum rule), `LOGIN_FAILURE_FLOOR_MS`, `PURGE_*`, `WIDER_NETWORK_BUDGET_MULTIPLIER`, `CORS_MAX_AGE_SECONDS`; the fuse bullet rewritten: three fuses, the lookup first, a spent fuse refuses every request on its path; `EMAIL_SENDS_PER_HOUR_MAX` is now the default of `RTC_SIGNUPS_PER_HOUR`.

- [ ] **Step 6: `supabase/README.md`** — step 5: the fuses sum (55) against the project's email limit (60); the "Keep these closed" list unchanged; a line that never-confirmed accounts are purged by the server after 48 hours, so the table editor rarely shows them.

- [ ] **Step 7: `packages/server/README.md`** — wherever the account endpoints or env are listed, the three settings and the origin rule in one sentence each.

- [ ] **Step 8: the parent spec** `2026-10-04-b2-user-management-design.md` — in §6's residual table, mark "Response-time oracle" and "Resend and reset mail is bounded per address only" *Resolved 2026-10-13 by [the hardening spec](2026-10-13-b2a-hardening-design.md)*; leave "A reset does not end sessions" (B2c). In §5.7's amended list, one sentence pointing at the hardening spec for the fuses, the purge and the origin rule.

- [ ] **Step 9: the hardening spec** — status line: "design approved 2026-10-13; built by `../plans/2026-10-13-b2a-hardening.md`". `CLAUDE.md`: in the "Demo accounts & auth env" paragraph's registered-accounts sentence, add "the POST routes accept a browser only from `RTC_ALLOWED_ORIGINS` (localhost on a dev machine)".

- [ ] **Step 10: Check and commit**

Run: `pnpm check:doc-links` from the worktree root — PASS. Biome on `CLAUDE.md` is not needed (markdown), but run `pnpm exec biome ci --error-on-warnings .` once to be sure nothing else moved.

```bash
git add docs/STATUS.md docs/DEPLOY.md docs/privacy.md docs/env-files.md docs/authentication.md supabase/README.md packages/server/README.md docs/superpowers/specs/2026-10-04-b2-user-management-design.md docs/superpowers/specs/2026-10-13-b2a-hardening-design.md CLAUDE.md && git commit -m "docs: the seven B2a blockers resolved; the rollout as it stands; three new settings"
```

---

### Closing (controller)

1. Whole-branch review (most capable model), one fix wave, one re-review.
2. Mutants, one per security rule (the controller writes `mutants.json` in the session scratchpad and copies the kill table into the rulings file before cleanup): the origin check inverted / `null` allowed / missing-Origin refused; content-type check removed; CORS header `*`; `peek` returning true always; the fuse `hit` before the count in register; the resend condition widened to any status; the reset condition including `blocked`; the spent-fuse check removed (a missing address answering `code_sent` while a found one is 503); the detach replaced by an await; the login floor removed or applied to `ok`; the purge filter dropping `!entry.seed` / `!entry.confirmed` / the cutoff; the 404-counts-as-purged branch; the `/48` multiplier; `readPositiveInteger` accepting `0`.
3. Rulings file `docs/superpowers/plans/2026-10-13-b2a-hardening-rulings.md`, committed with the PR.
4. Full gates, e2e and the smoke on the merged tree; catch-up triage per the shipping skill; PR; CI; code scanning; merge; cleanup.
