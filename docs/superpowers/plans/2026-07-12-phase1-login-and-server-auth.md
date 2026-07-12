# Phase 1 — Login + Server-Side Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vercel HTTP Basic-Auth wall and shared WS token with a HUD login screen and genuine server-side authentication (hardcoded users, real validation), keeping server state shared.

**Architecture:** `AuthPort` is a first-class port with two impls chosen by client mode — `AuthSimulator` (in-process, local) and `HttpAuthAdapter` (`POST /login` on the Fly server, deployed). The server validates salted-scrypt credentials and issues a stateless HMAC-signed token; the token gates the WS upgrade (`verifyClient`) and is stored client-side (`SessionStore`) for stay-logged-in. An `AuthPresenter` (folding the old cosmetic `SessionPresenter`) drives an `AuthGate` → LoginScreen / App / genuine LockScreen.

**Tech Stack:** TypeScript, RxJS, `@rx-state/core`, React 19, `@react-rxjs/core`, native `ws`, `node:crypto`, Vitest, Playwright, pnpm workspaces + Turborepo.

## Global Constraints

- `@rtc/domain` and `@rtc/ws-effects` may depend on **rxjs only** at runtime — no other runtime deps. Auth crypto (`node:crypto`) lives in `@rtc/server`, never in domain.
- Imports use the `#/` subpath alias (never `@/`); Biome bans ≥2-up relative imports. tsc-built libs need `tsc --build && tsc-alias`.
- Braces mandatory on all control statements; arrow callbacks use block bodies (`(x) => { return … }`); no inline object types in casts (extract a named type); explicit return types on functions (Biome `useExplicitType`).
- Every new package-crossing type flows inward-only per `docs/architecture/06-package-dependencies.md`.
- Full gauntlet before any PR: `pnpm build && pnpm typecheck && pnpm test && pnpm exec biome ci . && pnpm lint:eslint && pnpm lint:eslint:types && pnpm lint:css && pnpm lint:dead && pnpm check:deps`. New source files must join `knip`/typecheck/eslint globs automatically (path-glob), but a **new package** would need manual wiring (none added here).
- On dep add: none required — auth uses `node:crypto` (built-in) only. Do **not** add `bcrypt`/`jose`/`jsonwebtoken`.
- Passwords never appear in committed code or logs. Production creds come from the `AUTH_USERS` env secret; local dev creds from a gitignored `.env`.
- Worktree isolation: all work in the existing `worktree-spec-phase1-login-auth` (or a fresh worktree off latest `origin/main`); never edit main directly (it auto-pushes).

---

## Build order & file map

Dependency-respecting (inward-out). Each task ends with an independently testable deliverable.

| # | Task | Package | Key files |
|---|---|---|---|
| 1 | Wire DTOs | shared | `src/protocol/auth.ts` |
| 2 | `SessionUser` + roster profiles + `AuthPort` | domain | `src/auth/sessionUser.ts`, `src/auth/roster.ts`, `src/ports/authPort.ts` |
| 3 | `AuthSimulator` | domain | `src/simulators/AuthSimulator.ts` |
| 4 | Token sign/verify | server | `src/auth/token.ts` |
| 5 | `AuthService` | server | `src/auth/AuthService.ts`, `src/auth/loadUsers.ts` |
| 6 | `/login` rate limiter | server | `src/auth/rateLimit.ts` |
| 7 | HTTP route + CORS + `verifyClient` | server | `src/index.ts`, delete `src/auth.ts` old path |
| 8 | `SessionStore` port + in-memory | client-core | `src/adapters/sessionStore.ts` |
| 9 | `HttpAuthAdapter` | client-core | `src/adapters/HttpAuthAdapter.ts` |
| 10 | `AuthPresenter` (folds SessionPresenter) | client-core | `src/presenters/AuthPresenter.ts` |
| 11 | Wire ports + WsAdapter token-from-store | client-core | `portFactory.ts`, `composition.ts`, `WsAdapter.ts`, `wsUrl.ts` |
| 12 | `useAuth()` seam | react-bindings | `src/createViewModel.ts` |
| 13 | `LocalStorageSessionStore` + `buildBrowserPorts` | client-react | `src/app/adapters/LocalStorageSessionStore.ts`, `buildBrowserPorts.ts` |
| 14 | `LoginScreen` | client-react | `src/ui/shell/auth/LoginScreen.tsx` (+ css) |
| 15 | Genuine `LockScreen` | client-react | `src/ui/shell/lock/LockScreen.tsx` |
| 16 | `AuthGate` + `AppRoot` | client-react | `src/ui/shell/auth/AuthGate.tsx`, `AppRoot.tsx` |
| 17 | `AccountMenu` logout/lock | client-react | `src/ui/shell/chrome/AccountMenu.tsx` |
| 18 | RN auto-login | client-react-native | `src/app/AppRoot.tsx`, `buildNativePorts.ts` |
| 19 | Env / deploy migration | root | `middleware.ts` (delete), `turbo.json`, `.github/workflows/deploy.yml`, `.env.example` |
| 20 | e2e login + visual goldens | tests / client-react | e2e harness, golden regen |

---

## Task 1: Wire DTOs (`@rtc/shared`)

**Files:**
- Create: `packages/shared/src/protocol/auth.ts`
- Modify: `packages/shared/src/index.ts` (re-export)
- Test: `packages/shared/src/protocol/auth.test.ts`

**Interfaces — Produces:**
```ts
export interface SessionUserDto { readonly name: string; readonly initials: string; readonly role: string; readonly id: string; readonly email: string; readonly desk: string; readonly clearance: string; }
export interface LoginRequestDto { readonly username: string; readonly password: string; }
export interface LoginResponseDto { readonly token: string; readonly user: SessionUserDto; readonly exp: number; }
export function isLoginRequestDto(v: unknown): v is LoginRequestDto;
```

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { isLoginRequestDto } from "#/protocol/auth";

describe("isLoginRequestDto", () => {
  it("accepts a well-formed login body", () => {
    expect(isLoginRequestDto({ username: "demo", password: "x" })).toBe(true);
  });
  it("rejects missing/mistyped fields", () => {
    expect(isLoginRequestDto({ username: "demo" })).toBe(false);
    expect(isLoginRequestDto({ username: 1, password: "x" })).toBe(false);
    expect(isLoginRequestDto(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**
Run: `pnpm --filter @rtc/shared exec vitest run src/protocol/auth.test.ts`
Expected: FAIL — cannot find module `#/protocol/auth`.

- [ ] **Step 3: Write minimal implementation**
```ts
// packages/shared/src/protocol/auth.ts
export interface SessionUserDto {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
  readonly email: string;
  readonly desk: string;
  readonly clearance: string;
}

export interface LoginRequestDto {
  readonly username: string;
  readonly password: string;
}

export interface LoginResponseDto {
  readonly token: string;
  readonly user: SessionUserDto;
  readonly exp: number;
}

export function isLoginRequestDto(value: unknown): value is LoginRequestDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const v = value as Record<string, unknown>;
  return typeof v.username === "string" && typeof v.password === "string";
}
```
Add to `packages/shared/src/index.ts`: `export * from "./protocol/auth.js";` (match the file's existing export style).

- [ ] **Step 4: Run test to verify it passes**
Run: `pnpm --filter @rtc/shared exec vitest run src/protocol/auth.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/shared/src/protocol/auth.ts packages/shared/src/protocol/auth.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): auth wire DTOs (LoginRequest/Response, SessionUserDto)"
```

---

## Task 2: `SessionUser` + roster profiles + `AuthPort` (`@rtc/domain`)

**Files:**
- Create: `packages/domain/src/auth/sessionUser.ts`, `packages/domain/src/auth/roster.ts`, `packages/domain/src/ports/authPort.ts`
- Modify: `packages/domain/src/index.ts` (re-exports); later remove `SessionUser` from `client-core` SessionPresenter (Task 10)
- Test: `packages/domain/src/auth/roster.test.ts`

**Interfaces — Produces:**
```ts
export interface SessionUser { readonly name; initials; role; id; email; desk; clearance: string; } // same shape as SessionUserDto
export interface RosterEntry { readonly username: string; readonly user: SessionUser; }
export const ROSTER: readonly RosterEntry[]; // profiles only — NO passwords
export function findRosterUser(username: string): RosterEntry | undefined;

// authPort.ts
export type AuthOutcome =
  | { readonly ok: true; readonly token: string; readonly user: SessionUser }
  | { readonly ok: false; readonly reason: "invalid" | "unavailable" };
export interface AuthPort { login(username: string, password: string): Observable<AuthOutcome>; }
```

- [ ] **Step 1: Write the failing test**
```ts
import { describe, expect, it } from "vitest";
import { findRosterUser, ROSTER } from "#/auth/roster";

describe("roster", () => {
  it("contains only public profiles (no password fields)", () => {
    for (const entry of ROSTER) {
      expect(entry).not.toHaveProperty("password");
      expect(typeof entry.user.name).toBe("string");
    }
  });
  it("looks up by username", () => {
    expect(findRosterUser("demo")?.user.name).toBeDefined();
    expect(findRosterUser("nobody")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rtc/domain exec vitest run src/auth/roster.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement**
```ts
// packages/domain/src/auth/sessionUser.ts
export interface SessionUser {
  readonly name: string;
  readonly initials: string;
  readonly role: string;
  readonly id: string;
  readonly email: string;
  readonly desk: string;
  readonly clearance: string;
}
```
```ts
// packages/domain/src/auth/roster.ts
import type { SessionUser } from "./sessionUser.js";

export interface RosterEntry {
  readonly username: string;
  readonly user: SessionUser;
}

// PUBLIC profiles only. Passwords live in the AUTH_USERS secret (server) or a
// gitignored dev .env (simulator) — never here.
export const ROSTER: readonly RosterEntry[] = [
  { username: "astark", user: { name: "Anthony Stark", initials: "AS", role: "Senior FX Trader", id: "TRD-0042", email: "a.stark@reactivetrader.io", desk: "G10 Spot · London", clearance: "LEVEL 4 · FULL" } },
  { username: "nromanoff", user: { name: "Natasha Romanoff", initials: "NR", role: "Credit Trader", id: "TRD-0071", email: "n.romanoff@reactivetrader.io", desk: "Credit · London", clearance: "LEVEL 3 · DESK" } },
  { username: "tchalla", user: { name: "T'Challa", initials: "TC", role: "Head of Equities", id: "TRD-0007", email: "t.challa@reactivetrader.io", desk: "Equities · New York", clearance: "LEVEL 5 · FULL" } },
  { username: "demo", user: { name: "Demo Operator", initials: "DO", role: "Read-Only Guest", id: "TRD-0000", email: "demo@reactivetrader.io", desk: "Demo · Cloud", clearance: "LEVEL 1 · VIEW" } },
];

export function findRosterUser(username: string): RosterEntry | undefined {
  return ROSTER.find((entry) => {
    return entry.username === username;
  });
}
```
```ts
// packages/domain/src/ports/authPort.ts
import type { Observable } from "rxjs";
import type { SessionUser } from "../auth/sessionUser.js";

export type AuthOutcome =
  | { readonly ok: true; readonly token: string; readonly user: SessionUser }
  | { readonly ok: false; readonly reason: "invalid" | "unavailable" };

export interface AuthPort {
  login(username: string, password: string): Observable<AuthOutcome>;
}
```
Re-export all three from `packages/domain/src/index.ts` (match existing grouping).

- [ ] **Step 4: Run** the test → PASS. Also `pnpm --filter @rtc/domain typecheck`.

- [ ] **Step 5: Commit** `feat(domain): SessionUser entity, public roster, AuthPort interface`

---

## Task 3: `AuthSimulator` (`@rtc/domain`)

**Files:**
- Create: `packages/domain/src/simulators/AuthSimulator.ts`
- Modify: `packages/domain/src/index.ts`
- Test: `packages/domain/src/simulators/AuthSimulator.test.ts`

**Interfaces — Consumes:** `AuthPort`, `ROSTER`, `findRosterUser`, `SessionUser` (Task 2). **Produces:**
```ts
export interface DevCredentials { readonly [username: string]: string; } // username -> dev password (injected)
export class AuthSimulator implements AuthPort {
  constructor(devCredentials: DevCredentials);
  login(username: string, password: string): Observable<AuthOutcome>;
}
```

- [ ] **Step 1: Failing test**
```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";
import { AuthSimulator } from "#/simulators/AuthSimulator";

const sim = new AuthSimulator({ demo: "localpass", astark: "localpass" });

describe("AuthSimulator", () => {
  it("returns ok + roster profile + a token on correct dev credentials", async () => {
    const r = await firstValueFrom(sim.login("demo", "localpass"));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.user.name).toBe("Demo Operator");
      expect(typeof r.token).toBe("string");
      expect(r.token.length).toBeGreaterThan(0);
    }
  });
  it("rejects a wrong password", async () => {
    const r = await firstValueFrom(sim.login("demo", "nope"));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
  it("rejects an unknown user", async () => {
    const r = await firstValueFrom(sim.login("ghost", "x"));
    expect(r).toEqual({ ok: false, reason: "invalid" });
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rtc/domain exec vitest run src/simulators/AuthSimulator.test.ts` → FAIL.

- [ ] **Step 3: Implement**
```ts
// packages/domain/src/simulators/AuthSimulator.ts
import { type Observable, of } from "rxjs";
import type { AuthOutcome, AuthPort } from "../ports/authPort.js";
import { findRosterUser } from "../auth/roster.js";

export interface DevCredentials {
  readonly [username: string]: string;
}

/**
 * In-process AuthPort for local simulator mode. Validates the public roster
 * against injected dev-only credentials (supplied by the client shell from a
 * gitignored .env). The token is cosmetic — simulator mode has no WS to gate —
 * but the flow is identical to the real HttpAuthAdapter.
 */
export class AuthSimulator implements AuthPort {
  constructor(private readonly devCredentials: DevCredentials) {}

  login(username: string, password: string): Observable<AuthOutcome> {
    const entry = findRosterUser(username);
    const expected = this.devCredentials[username];

    if (!entry || expected === undefined || password !== expected) {
      return of({ ok: false, reason: "invalid" });
    }

    const token = `sim.${username}.${entry.user.id}`;
    return of({ ok: true, token, user: entry.user });
  }
}
```
Re-export from `index.ts`.

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Commit** `feat(domain): AuthSimulator (in-process login for simulator mode)`

---

## Task 4: Token sign/verify (`@rtc/server`)

**Files:**
- Create: `packages/server/src/auth/token.ts`
- Test: `packages/server/src/auth/token.test.ts`

**Interfaces — Produces:**
```ts
export function signToken(username: string, secret: string, ttlMs: number, now: number): string;
export function verifyToken(token: string, secret: string, now: number): { username: string } | null;
```
`now` is injected (ms epoch) so tests are deterministic — do NOT call `Date.now()` inside.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { signToken, verifyToken } from "#/auth/token";

const SECRET = "test-secret";
const NOW = 1_000_000;

describe("token", () => {
  it("round-trips a valid, unexpired token", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 30_000)).toEqual({ username: "demo" });
  });
  it("rejects after expiry", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 61_000)).toBeNull();
  });
  it("rejects a tampered payload", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    const [payload, sig] = t.split(".");
    const forged = `${Buffer.from('{"u":"admin","exp":9e15}').toString("base64url")}.${sig}`;
    expect(verifyToken(forged, SECRET, NOW)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, "other-secret", NOW)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rtc/server exec vitest run src/auth/token.test.ts` → FAIL.

- [ ] **Step 3: Implement**
```ts
// packages/server/src/auth/token.ts
import { createHmac, timingSafeEqual } from "node:crypto";

interface Payload {
  readonly u: string;
  readonly exp: number;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(
  username: string,
  secret: string,
  ttlMs: number,
  now: number,
): string {
  const payload: Payload = { u: username, exp: now + ttlMs };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string,
  now: number,
): { username: string } | null {
  const dot = token.indexOf(".");

  if (dot < 0) {
    return null;
  }

  const encoded = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);
  const expectedSig = sign(encoded, secret);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);

  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Payload;

    if (typeof payload.u !== "string" || typeof payload.exp !== "number") {
      return null;
    }

    return payload.exp > now ? { username: payload.u } : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Commit** `feat(server): stateless HMAC-signed session token (sign/verify)`

---

## Task 5: `AuthService` (`@rtc/server`)

**Files:**
- Create: `packages/server/src/auth/AuthService.ts`, `packages/server/src/auth/loadUsers.ts`
- Test: `packages/server/src/auth/AuthService.test.ts`

**Interfaces — Consumes:** `signToken`/`verifyToken` (Task 4), `ROSTER`/`findRosterUser` (Task 2). **Produces:**
```ts
export function parseAuthUsers(raw: string | undefined): Map<string, string>; // "user:pass,user2:pass2" -> Map
export interface AuthServiceOptions { readonly secret: string; readonly ttlMs: number; readonly credentials: Map<string, string>; readonly now?: () => number; }
export class AuthService {
  constructor(opts: AuthServiceOptions);
  login(username: string, password: string): { token: string; user: SessionUserDto } | null;
  verifyToken(token: string): { username: string } | null;
}
```
`AuthService` scrypt-hashes each configured password once at construction (salt per user) and `timingSafeEqual`-compares on login.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { AuthService, parseAuthUsers } from "#/auth/AuthService";

const svc = new AuthService({
  secret: "s",
  ttlMs: 60_000,
  credentials: parseAuthUsers("demo:localpass,astark:hunter2"),
  now: () => 1_000_000,
});

describe("AuthService", () => {
  it("issues a token + profile on valid credentials", () => {
    const r = svc.login("demo", "localpass");
    expect(r?.user.name).toBe("Demo Operator");
    expect(svc.verifyToken(r!.token)).toEqual({ username: "demo" });
  });
  it("rejects a wrong password", () => {
    expect(svc.login("demo", "nope")).toBeNull();
  });
  it("rejects a username in the roster but not configured with a password", () => {
    expect(svc.login("tchalla", "x")).toBeNull(); // no cred in AUTH_USERS
  });
  it("parseAuthUsers ignores blanks and trims", () => {
    const m = parseAuthUsers(" a:1 , b:2 ,");
    expect(m.get("a")).toBe("1");
    expect(m.get("b")).toBe("2");
    expect(m.size).toBe(2);
  });
});
```

- [ ] **Step 2: Run** `pnpm --filter @rtc/server exec vitest run src/auth/AuthService.test.ts` → FAIL.

- [ ] **Step 3: Implement** `loadUsers.ts` (`parseAuthUsers`) then `AuthService.ts`. Use `node:crypto` `scryptSync` + `randomBytes` for per-user salt, `timingSafeEqual` for compare. `login` requires BOTH a roster profile (Task 2) AND a configured password; on match returns `{ token: signToken(username, secret, ttlMs, now()), user: rosterEntry.user }`. `verifyToken` delegates to Task 4 with `now()`. `now` defaults to `() => Date.now()` in production but is injected in tests.
```ts
// sketch of the hash/compare core:
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
function hash(pw: string, salt: Buffer): Buffer { return scryptSync(pw, salt, 32); }
// at construction: for each [user, pw] → { salt: randomBytes(16), digest: hash(pw, salt) }
// login: const rec = table.get(username); if (!rec) return null;
//        const candidate = hash(password, rec.salt);
//        if (candidate.length !== rec.digest.length || !timingSafeEqual(candidate, rec.digest)) return null;
//        const entry = findRosterUser(username); if (!entry) return null;
//        return { token: signToken(...), user: entry.user };
```

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: Commit** `feat(server): AuthService — scrypt roster validation + token issuance`

---

## Task 6: `/login` rate limiter (`@rtc/server`)

**Files:**
- Create: `packages/server/src/auth/rateLimit.ts`
- Test: `packages/server/src/auth/rateLimit.test.ts`

**Interfaces — Produces:**
```ts
export interface RateLimiter { hit(key: string, now: number): boolean; } // true = allowed, false = throttled
export function createRateLimiter(maxPerWindow: number, windowMs: number): RateLimiter;
```
Fixed-window per-key counter (in-memory `Map<string, {count, windowStart}>`). `now` injected.

- [ ] **Step 1: Failing test**
```ts
import { describe, expect, it } from "vitest";
import { createRateLimiter } from "#/auth/rateLimit";

describe("rateLimit", () => {
  it("allows up to max then throttles within the window", () => {
    const rl = createRateLimiter(3, 1000);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 100)).toBe(true);
    expect(rl.hit("ip", 200)).toBe(true);
    expect(rl.hit("ip", 300)).toBe(false); // 4th within window
  });
  it("resets after the window", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.hit("ip", 0)).toBe(true);
    expect(rl.hit("ip", 500)).toBe(false);
    expect(rl.hit("ip", 1500)).toBe(true); // new window
  });
  it("keys independently", () => {
    const rl = createRateLimiter(1, 1000);
    expect(rl.hit("a", 0)).toBe(true);
    expect(rl.hit("b", 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3:** implement the fixed-window map. **Step 4:** → PASS.
- [ ] **Step 5: Commit** `feat(server): in-memory per-IP rate limiter for /login`

---

## Task 7: HTTP `/login` route + CORS + `verifyClient` (`@rtc/server`)

**Files:**
- Modify: `packages/server/src/index.ts` (add route + CORS preflight + rate-limit; swap `verifyClient` to `AuthService.verifyToken`)
- Modify/Delete: `packages/server/src/auth.ts` — replace `isAuthorizedUpgrade` body to delegate to a passed verifier, or inline in index. Keep a thin, tested seam.
- Test: `packages/server/src/auth.test.ts` (update), `packages/server/src/login.route.test.ts` (new — pure handler unit, not a live socket)

**Interfaces — Consumes:** `AuthService` (Task 5), `createRateLimiter` (Task 6), `isLoginRequestDto` (Task 1).

Extract the request handling into a pure, testable function so no real HTTP server is needed in the unit test:
```ts
// Produces (in index.ts or a src/http/loginHandler.ts):
export function handleLogin(bodyText: string, ip: string, deps: { auth: AuthService; rateLimit: RateLimiter; now: () => number }):
  { status: 200 | 400 | 401 | 429; body: string; headers?: Record<string,string> };
export function authorizeUpgrade(reqUrl: string | undefined, auth: AuthService): boolean; // parses ?access= → verifyToken
```

- [ ] **Step 1: Failing test** (`login.route.test.ts`) — assert 429 when rate-limited, 400 on malformed JSON, 401 on bad creds, 200 + `LoginResponseDto` on success; and `authorizeUpgrade` accepts a freshly-signed token, rejects a bad one.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `handleLogin` (rate-limit first → 429; parse+validate → 400; `auth.login` → 401/200 with CORS headers) and `authorizeUpgrade` (extract `access` query param via `new URL(reqUrl, "http://localhost")`, `auth.verifyToken`). Wire into `index.ts`: construct `AuthService` from env (`AUTH_SECRET`, `AUTH_USERS`, `AUTH_TTL_MS` default e.g. 8h) + `createRateLimiter`; in the `createServer` callback handle `POST /login` and `OPTIONS /login` (preflight: `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type`); set `verifyClient` to `authorizeUpgrade(info.req.url, auth)`. Remove `WS_ACCESS_TOKEN`. Use the client IP from `req.socket.remoteAddress` (or `x-forwarded-for` first hop on Fly).
- [ ] **Step 4: Run** the route test + `pnpm --filter @rtc/server test` → PASS.
- [ ] **Step 5: Commit** `feat(server): POST /login (rate-limited, CORS) + token-gated WS upgrade`

---

## Task 8: `SessionStore` port + in-memory adapter (`@rtc/client-core`)

**Files:**
- Create: `packages/client-core/src/adapters/sessionStore.ts`
- Modify: `packages/client-core/src/index.ts`
- Test: `packages/client-core/src/adapters/sessionStore.test.ts`

**Interfaces — Produces:**
```ts
export interface StoredSession { readonly token: string; readonly user: SessionUser; readonly exp: number; }
export interface SessionStore { read(): StoredSession | null; write(session: StoredSession): void; clear(): void; }
export class InMemorySessionStore implements SessionStore { /* holds one StoredSession | null */ }
```

- [ ] **Step 1–4:** TDD `InMemorySessionStore` (read null initially; write→read; clear→null; expired entries are still returned by `read()` — expiry is the presenter's concern, keep the store dumb). **Step 5: Commit** `feat(client-core): SessionStore port + in-memory adapter`

---

## Task 9: `HttpAuthAdapter` (`@rtc/client-core`)

**Files:**
- Create: `packages/client-core/src/adapters/HttpAuthAdapter.ts`
- Modify: `packages/client-core/src/index.ts`
- Test: `packages/client-core/src/adapters/HttpAuthAdapter.test.ts`

**Interfaces — Consumes:** `AuthPort`/`AuthOutcome` (Task 2), `LoginResponseDto` (Task 1). **Produces:**
```ts
export class HttpAuthAdapter implements AuthPort {
  constructor(httpBaseUrl: string, fetchImpl?: typeof fetch);
  login(username: string, password: string): Observable<AuthOutcome>;
}
export function wsUrlToHttpBase(wsUrl: string): string; // ws:// -> http://, wss:// -> https://
```

- [ ] **Step 1: Failing test** — inject a stub `fetch`:
```ts
// 200 → { ok:true, token, user }; 401 → { ok:false, reason:"invalid" }; network throw/429 → { ok:false, reason:"unavailable" }
// asserts POST to `${base}/login` with JSON body { username, password } and Content-Type header
// wsUrlToHttpBase("wss://x/y") === "https://x/y"
```
- [ ] **Step 2–4:** implement with `defer(() => from(fetchImpl(...)))` → map status → `AuthOutcome` (200 parses `LoginResponseDto`; 401→invalid; else→unavailable; catch→unavailable). Do not log credentials.
- [ ] **Step 5: Commit** `feat(client-core): HttpAuthAdapter (POST /login) + ws→http base helper`

---

## Task 10: `AuthPresenter` (`@rtc/client-core`) — folds `SessionPresenter`

**Files:**
- Create: `packages/client-core/src/presenters/AuthPresenter.ts`
- Delete: `packages/client-core/src/presenters/SessionPresenter.ts` (move `DEMO_USER` usage to the `demo` roster entry; keep a `SessionUser` re-export from domain for back-compat imports)
- Modify: `composition.ts` (construct `AuthPresenter` instead of `SessionPresenter`), `index.ts`
- Test: `packages/client-core/src/presenters/AuthPresenter.test.ts`

**Interfaces — Consumes:** `AuthPort` (Task 2), `SessionStore`/`StoredSession` (Task 8), `SessionUser` (Task 2). **Produces:**
```ts
export type AuthStatus = "unauthenticated" | "authenticating" | "authenticated";
export interface AuthViewState { readonly status: AuthStatus; readonly user: SessionUser | null; readonly locked: boolean; readonly error: string | null; }
export class AuthPresenter {
  readonly state$: Observable<AuthViewState>;
  constructor(auth: AuthPort, store: SessionStore, now?: () => number);
  login(username: string, password: string): void;
  unlock(password: string): void;
  lock(): void;
  logout(): void;
}
```

- [ ] **Step 1: Failing test** (drive via a fake `AuthPort` returning `of(outcome)` and an `InMemorySessionStore`):
```ts
// resume: store has a non-expired StoredSession → initial state authenticated + user
// resume expired: store entry with exp < now → unauthenticated + store cleared
// login success: status authenticating → authenticated, user set, store.write called
// login failure: error set, status back to unauthenticated
// lock(): locked true (still authenticated); unlock(goodPw): locked false; unlock(badPw): error, still locked
// logout(): store.clear, status unauthenticated, user null
```
- [ ] **Step 2–4:** implement as a `BehaviorSubject<AuthViewState>` machine. On construct, read store; if `entry && entry.exp > now()` → authenticated, else clear + unauthenticated. `login`/`unlock` subscribe `auth.login(...)`; on `ok` write store (`{token,user,exp: now()+TTL}` — reuse a shared `SESSION_TTL_MS`) and transition. Keep the username of the current session for `unlock`. `state$ = subject.pipe(shareReplay({bufferSize:1, refCount:true}))`.
- [ ] **Step 5: Commit** `feat(client-core): AuthPresenter (login/unlock/lock/logout, resume) replacing SessionPresenter`

---

## Task 11: Wire ports + WsAdapter token-from-store (`@rtc/client-core`)

**Files:**
- Modify: `portFactory.ts` (add `auth: AuthPort` + `sessionStore: SessionStore` to `TransportPorts`/`PortFactoryDeps`; `createSimulatorPorts` takes an injected `AuthPort`; `createWsRealPorts` takes `HttpAuthAdapter`), `composition.ts` (`AppPorts` gains `auth`, `sessionStore`; construct `AuthPresenter`), `WsAdapter.ts` (accept a `() => string | undefined` token provider; build `?access=` at connect time via `buildWsUrl`; on upgrade-rejected close, emit an `unauthorized` connection event), `wsUrl.ts` (unchanged helper; now called at connect time)
- Test: update `portFactory.test.ts`; `WsAdapter.test.ts` (token read at connect; unauthorized event on immediate close with 401-style code)

**Interfaces — Consumes:** Tasks 2/8/9/10. **Produces:** `AppPorts.auth: AuthPort`, `AppPorts.sessionStore: SessionStore`; `WsAdapter` constructor `(baseUrl: string, tokenProvider: () => string | undefined)`.

- [ ] Steps: (1) failing tests for the new port wiring + WsAdapter token-at-connect; (2) run→fail; (3) implement — thread `auth`/`sessionStore` through the factories and `createApp`; change `WsAdapter` to read `sessionStore.read()?.token` (via the injected provider) when opening the socket, and surface a `gatewayUnauthorized` event the connection machine maps to logout; (4) run the client-core suite → PASS; (5) commit `feat(client-core): thread AuthPort/SessionStore through ports; WsAdapter reads token at connect`.

Note: the connection-events → `logout()` binding is finalized in Task 16 (the App subscribes it), but the `WsAdapter` event is emitted here.

---

## Task 12: `useAuth()` seam (`@rtc/react-bindings`)

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` (add `useAuth`; remove/alias `useSession`)
- Test: `packages/react-bindings/src/__tests__/authHooks.test.tsx`

**Interfaces — Produces:** `viewModel.useAuth(): { status; user; locked; error; login; unlock; lock; logout }` — a `bind(presenters.auth.state$, …)` for the view state plus stable command callbacks (mirror the existing `useSession`/`useIncident` wiring exactly).

- [ ] Steps: (1) RTL test that a component reading `useAuth()` sees `status`/`user` and can call `login` (mirror `themePreferenceHooks.test.tsx` / `creditRfqHooks.test.tsx` setup with `createApp` + a fake `AuthPort`); (2)→fail; (3) implement `const [useAuthState] = bind(presenters.auth.state$, { status:"unauthenticated", user:null, locked:false, error:null })` + stable `login/unlock/lock/logout` closures; expose `useAuth`; (4)→PASS; (5) commit `feat(react-bindings): useAuth() ViewModel seam`.

---

## Task 13: `LocalStorageSessionStore` + `buildBrowserPorts` (`@rtc/client-react`)

**Files:**
- Create: `packages/client-react/src/app/adapters/LocalStorageSessionStore.ts` (model on `LocalStoragePreferencesAdapter`; key `rtc-session`; JSON-serialize `StoredSession`; tolerate parse errors → null)
- Modify: `packages/client-react/src/app/buildBrowserPorts.ts` (create the store; in the `url` branch build `HttpAuthAdapter(wsUrlToHttpBase(url))`; in the simulator branch build `AuthSimulator(devCreds)` where `devCreds` come from `import.meta.env.VITE_DEV_AUTH` JSON; pass `sessionStore` + `auth` into the factories; construct `WsAdapter(url, () => sessionStore.read()?.token)` — no baked `VITE_WS_TOKEN`)
- Create: `.env.example` (documents `VITE_SERVER_URL`, `VITE_DEV_AUTH='{"demo":"localpass"}'`)
- Test: `LocalStorageSessionStore.test.ts` (uses the jsdom-storage shim per `reference_node26_localstorage_jsdom`)

- [ ] Steps: (1) failing store test (write→read round-trips `StoredSession`; corrupt JSON→null; clear); (2)→fail; (3) implement store + rewire `buildBrowserPorts` (remove `token`/`VITE_WS_TOKEN` read); (4)→PASS + `pnpm --filter @rtc/client-react typecheck`; (5) commit `feat(client-react): LocalStorageSessionStore + auth-aware buildBrowserPorts`.

---

## Task 14: `LoginScreen` (`@rtc/client-react`)

**Files:**
- Create: `packages/client-react/src/ui/shell/auth/LoginScreen.tsx`, `LoginScreen.module.css` (reuse `LockScreen.module.css` panel classes; add `.field`/`.input`/`.error`)
- Test: `packages/client-react/tests/ui/contract/specs/shell/auth/LoginScreen.contract.spec.ts` (framework-neutral, per the swap-trio) + a react unit if needed

**Interfaces — Consumes:** `useAuth()` (Task 12). Renders the HUD panel (grid, `HudLogo` badge), title `REACTIVE TRADER OS · SIGN IN`, `data-testid="login-username"` + `data-testid="login-password"` inputs, an error line (`data-testid="login-error"` bound to `error`), and `AUTHENTICATE ▸` (`data-testid="login-submit"`). Submit → `login(username, password)`; disable while `status === "authenticating"`.

- [ ] Steps: (1) contract spec — typing creds + submit calls `login` with them; `error` renders when the auth state has an error; submit disabled while authenticating (drive via a fake ViewModel per the existing contract harness); (2)→fail; (3) implement the component + CSS (mirror `LockScreen.tsx` structure); (4) run contract spec + `pnpm --filter @rtc/client-react exec vitest run …LoginScreen…` → PASS; (5) commit `feat(client-react): LoginScreen (HUD sign-in mirroring the lock screen)`.

---

## Task 15: Genuine `LockScreen` (`@rtc/client-react`)

**Files:**
- Modify: `packages/client-react/src/ui/shell/lock/LockScreen.tsx` (migrate `useSession`→`useAuth`; add a `data-testid="lock-password"` input; `AUTHENTICATE ▸` → `unlock(password)`; show `error`); keep the identity block (now from the real `user`)
- Test: update `LockScreen` contract/unit specs

- [ ] Steps: (1) update/failing test — entering a password + clicking authenticate calls `unlock(password)`; a wrong-password `error` renders; (2)→fail; (3) implement; (4)→PASS; (5) commit `feat(client-react): genuine lock re-auth (password-validated unlock)`.

---

## Task 16: `AuthGate` + `AppRoot` (`@rtc/client-react`)

**Files:**
- Create: `packages/client-react/src/ui/shell/auth/AuthGate.tsx`
- Modify: `packages/client-react/src/AppRoot.tsx` (wrap the App in `<AuthGate>` inside `BootGate`; subscribe the connection `gatewayUnauthorized` → `logout()` binding)
- Test: `AuthGate.contract.spec.ts`

**Interfaces — Consumes:** `useAuth()`. `AuthGate` renders: `status !== "authenticated"` → `<LoginScreen>`; else `children` (the App) with `<LockScreen>` overlaid (LockScreen already self-hides unless `locked`).

- [ ] Steps: (1) contract spec — unauthenticated shows login-screen testid and NOT the app; authenticated shows children; (2)→fail; (3) implement `AuthGate` + wire into `AppRoot`; (4)→PASS + a manual `pnpm dev` smoke (simulator mode: login with a `VITE_DEV_AUTH` cred → app renders; lock → password unlock; logout → back to login); (5) commit `feat(client-react): AuthGate wiring login/app/lock into the boot flow`.

---

## Task 17: `AccountMenu` logout/lock (`@rtc/client-react`)

**Files:**
- Modify: `packages/client-react/src/ui/shell/chrome/AccountMenu.tsx` (add a **Logout** row → `logout()`; wire the existing Lock row → `lock()`; show the real `user` identity)
- Test: update `AccountMenu` contract/unit spec

- [ ] Steps: (1) failing test — clicking Logout calls `logout()`, Lock calls `lock()`; (2)→fail; (3) implement; (4)→PASS; (5) commit `feat(client-react): account menu Logout + genuine Lock`.

---

## Task 18: RN auto-login (`@rtc/client-react-native`)

**Files:**
- Modify: `packages/client-react-native/src/app/buildNativePorts.ts` (build `HttpAuthAdapter` + a native `SessionStore` (AsyncStorage-backed) like the web one; provide the `demo` credential from `EXPO_PUBLIC_DEMO_USER`/`EXPO_PUBLIC_DEMO_PASS`), `src/app/AppRoot.tsx` (on mount, if no stored session, call `auth.login(demoUser, demoPass)` then proceed — a minimal auto-login; no RN login UI yet)
- Test: RN unit for the auto-login effect (mock AuthPort)

- [ ] Steps: (1) failing test — with no stored session, AppRoot triggers `login` with the demo creds; with a stored session, it does not; (2)→fail; (3) implement AsyncStorage `SessionStore` + auto-login effect; remove `EXPO_PUBLIC_WS_TOKEN` usage; (4)→PASS + `pnpm --filter @rtc/client-react-native test`; (5) commit `feat(rn): auto-login with demo credential (keeps mobile connected)`.

---

## Task 19: Env / deploy migration (root)

**Files:**
- Delete: `middleware.ts`
- Modify: `turbo.json` (remove `VITE_WS_TOKEN` from `build.env`; add nothing client-side), `.github/workflows/deploy.yml` (drop the `VITE_WS_TOKEN` grep-guard + `WS_ACCESS_TOKEN` Fly secret step; add a note that `AUTH_SECRET`/`AUTH_USERS` are set as Fly secrets by hand), `packages/client-react/.env.example` (from Task 13), root `README`/docs (document `AUTH_SECRET`, `AUTH_USERS` format, "ask us for credentials", local `VITE_DEV_AUTH`)
- Test: `pnpm check:doc-links`; grep guards green

- [ ] Steps: (1) delete middleware + edit configs; (2) run `pnpm check:doc-links` + `pnpm exec biome ci .`; (3) commit `chore(deploy): remove Basic-Auth wall + shared WS token; document AUTH_SECRET/AUTH_USERS`. **Human step (call out in PR):** set Fly secrets `AUTH_SECRET`, `AUTH_USERS`; remove `SITE_PASSWORD`, `WS_ACCESS_TOKEN`, `VITE_WS_TOKEN` from Vercel/Fly.

---

## Task 20: e2e login + visual goldens

**Files:**
- Modify: the Playwright harness (`tests/…` app + real-stack smokes) to authenticate first — fastest path: seed `localStorage['rtc-session']` with a valid `StoredSession` before load (for the real-stack smoke, obtain a token via `POST /login` in a `beforeAll`); plus **one** coverage test that drives the actual login form.
- Modify: visual goldens — add a **LoginScreen** golden; re-pin the **LockScreen** golden (adds the password field), across the full theme matrix per `project_visual_goldens_dual_set`.
- Test: `pnpm test:e2e:no-cypress`; visual regen.

- [ ] Steps: (1) update harness + add the form-driven login e2e; (2) run e2e green; (3) regen + review goldens (LoginScreen new; LockScreen changed); (4) commit `test: e2e login flow + login/lock visual goldens`.

---

## Self-Review notes

- **Spec coverage:** every spec §3–§10 maps to a task (DTOs→T1; AuthPort/roster→T2; AuthSimulator→T3; token→T4; AuthService→T5; rate-limit→T6; route/verifyClient→T7; SessionStore→T8; HttpAuthAdapter→T9; AuthPresenter→T10; wiring/WsAdapter→T11; useAuth→T12; store/buildBrowserPorts→T13; LoginScreen→T14; genuine LockScreen→T15; AuthGate→T16; AccountMenu→T17; RN→T18; env→T19; e2e/goldens→T20). §11 Phase-2 is out of scope by design.
- **Determinism:** all token/service/rate-limit code takes an injected `now` — no `Date.now()` in tested units (also required by the workflow-script/journal rules elsewhere in the repo).
- **Type consistency:** `AuthOutcome`, `SessionUser`, `StoredSession`, `AuthViewState`, `SessionUserDto` names are used identically across tasks; `SessionUser` (domain entity) and `SessionUserDto` (shared wire) are intentionally distinct but same-shape.
- **Gate reminder:** run the full gauntlet + `test:ui:contract` coverage (≥95%) before the PR; new UI (LoginScreen, AuthGate, AccountMenu, LockScreen) needs contract coverage.
