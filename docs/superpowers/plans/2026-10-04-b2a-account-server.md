# B2a — Account Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@rtc/server` registered accounts — register, confirm by emailed code, sign in only when confirmed and approved, reset a password — stored in Supabase and reached by nobody but the server.

**Architecture:** A new `packages/server/src/accounts/` holds an `AccountDirectory` port with three implementations (Supabase over plain `fetch`, an in-memory one for dev and e2e, and a disabled one), and an `AccountService` that owns the policy. Five new POST endpoints sit beside `/login` behind B1's ban list, rate limits and body cap. `/login` routes an identifier containing `@` to the accounts path and everything else to today's `AUTH_USERS` roster. The session token gains the account id and access level, and the WebSocket upgrade re-checks a registered account's status through a 60-second cache.

**Tech Stack:** TypeScript, Node 26 (`fetch`, `AbortSignal.timeout`, `node:crypto` scrypt), `ws` 8.21, vitest 5, Supabase Auth + PostgREST over HTTPS (no SDK), `scripts/mutation-check.mts`, `tests/fullstack/node-smoke.ts`.

**Spec:** [../specs/2026-10-04-b2-user-management-design.md](../specs/2026-10-04-b2-user-management-design.md) — §5 (server), §6 (failure modes), §9 (privacy), §10 (testing), §12 (the user's steps). This plan amends three points of it in Task 11.

**Rulings:** [2026-10-04-b2a-account-server-rulings.md](2026-10-04-b2a-account-server-rulings.md) — what the controller decided while executing this plan, including the places where the code as built departs from the code blocks below (the registration flow above all: a sign-up carries no password, the confirmation request does).

## Scope of B2a

In: domain validation rules, DTOs, token claims, the directory port and its three implementations, the policy service, six endpoints (five new plus `/login`), the upgrade re-check, `/health/accounts`, the keep-alive workflow, the migration, email templates, a live probe script, the privacy notice and docs.

Moved to B2c, where their first reader lives (YAGNI): `SessionUser.access`, the connection-scoped identity in `Ctx`, `sessionRegistry` (closing live sockets on a block), cache invalidation, and the directory's admin operations. In B2a a block made in the Supabase dashboard takes effect within 60 seconds at the next connect.

## Global Constraints

- **No new dependency in any package.** Supabase is reached with `fetch`. `@rtc/domain` stays rxjs-only at runtime.
- **Only `packages/server` knows Supabase exists.** No Supabase URL, key or SDK in a client, in `@rtc/shared` or in `@rtc/domain`.
- **Three account modes, never a silent default to the dev one:** `SUPABASE_URL` set → Supabase; `RTC_DEV_ACCOUNTS=1` → in-memory; neither → disabled. The in-memory directory has a fixed confirmation code and committed passwords, so the server refuses to start with `RTC_DEV_ACCOUNTS=1` when `FLY_APP_NAME` is set.
- **Logs never contain a password, a confirmation code, a token, a request body or an email address.** An IP address and an account id are fine.
- **The password rule is Graflyn's:** at least 12 characters, at most 72 bytes, with an uppercase letter, a lowercase letter, a digit and a special character. It is defined once, in `@rtc/domain`.
- **Every limit is a named constant** in `packages/server/src/config/limits.ts`.
- Intra-package imports use the `#/` alias in tests (`#/accounts/AccountService`) and `./x.js` relative imports in source, matching each package's existing files.
- Every function is named for its **effect** (`docs/handler-naming.md`). Function-typed deps (`now`, `fetchImpl`) are slots and stay nouns.
- Braces on every control statement; explicit return types on every function and typed callback; exported API above helpers in source; cases above `create*` factories in tests; JSON payloads as object literals + `JSON.stringify`; no inline object types as type arguments.
- A limiter or cache takes an injected `now`; no test sleeps on a real timer.
- Biome's `useExplicitType` is an error here: where a test in this plan overrides one directory method with an inline arrow (`findAccount: () => { … }`), give it the explicit return type from `AccountDirectory.ts` if Biome asks. `pnpm exec biome check --write <files>` sorts imports and formats; run it before each commit.
- If `pnpm lint:dead` reports an exported type that is only used inside its own file, drop the `export` rather than adding a consumer.
- Each security rule ships with a mutant in Task 11's `mutants.json` (scratchpad, not committed); the kill table goes in the PR body. A cross-package mutant (`@rtc/domain` → server) needs that package rebuilt before and after.
- Never run two builds in this checkout at once. After editing `@rtc/domain` or `@rtc/shared`, rebuild them one at a time (`pnpm --filter @rtc/domain build`, then `pnpm --filter @rtc/shared build`) before running server tests.
- No lint suppressions. On the FINAL tree: `pnpm exec biome ci --error-on-warnings .`, `pnpm lint:eslint`, `pnpm lint:eslint:types`, `pnpm typecheck`, `pnpm test`, `pnpm lint:dead`, `pnpm check:deps`, `pnpm lint:actions`, `pnpm lint:actions:security`, `pnpm check:doc-links`, `pnpm --filter @rtc/tests gates`, then `pnpm --filter @rtc/tests test:fullstack:node`.
- One PR. Outward steps (push, `gh pr create`, `gh pr merge`) are one per Bash call, batched at the end.

## Review Focus

Inputs and failures the spec implies but does not spell out. Each has a test in the owning task.

1. **The dev directory reaching production.** It accepts the code `000000` and seeds an admin with a committed password. A deployed server that fell back to it would hand out admin sessions → Task 9: `resolveAccountsMode` never defaults to in-memory and throws when `RTC_DEV_ACCOUNTS=1` meets `FLY_APP_NAME`.
2. **Signing an account token with an empty `AUTH_SECRET`.** The HMAC of an empty key is computable by anyone, so every token, including an admin one, would be forgeable → Task 3: `issueAccountSession` throws; Task 9: startup refuses either account mode without the secret.
3. **One person, several spellings.** `Ann@Desk.io`, ` ann@desk.io ` and `ann@desk.io` must be one account at every endpoint, or a block misses and a duplicate registers → Task 5: the service normalizes before every directory call.
4. **A token's account id reaching a query string.** The upgrade re-check interpolates the id into a PostgREST URL. A non-UUID id must be refused without a network call → Task 6.
5. **Supabase slow, paused or gone.** A free project pauses (HTTP 540); a socket can hang. Every call is bounded by a timeout and reads as `unavailable`; the upgrade then fails closed with 503, and an `unavailable` answer is never cached as a verdict → Tasks 6 and 8.

Also pinned: the connection cap is re-checked after the awaited status lookup (Task 8); a sign-up cannot set its own `role` or `approved` (Task 6's migration test); `/register` answers identically for a new and an existing address (Tasks 5 and 7).

## File map

| File | Responsibility |
|---|---|
| `packages/domain/src/auth/accessLevel.ts` | `AccessLevel` type |
| `packages/domain/src/auth/passwordPolicy.ts` | The password rules, as data plus one check |
| `packages/domain/src/auth/accountInput.ts` | Email, display-name and code normalizing and checks |
| `packages/shared/src/protocol/auth.ts` | Request, response and error DTOs with guards |
| `packages/server/src/auth/passwordHash.ts` | scrypt helpers shared by the roster and the dev directory |
| `packages/server/src/auth/token.ts` | Token claims: account id and access level |
| `packages/server/src/accounts/AccountDirectory.ts` | The port and its result types |
| `packages/server/src/accounts/DisabledAccountDirectory.ts` | Every operation `unavailable` |
| `packages/server/src/accounts/InMemoryAccountDirectory.ts` + `devAccounts.ts` | Dev and e2e directory with seeds |
| `packages/server/src/accounts/SupabaseAccountDirectory.ts` | The Supabase adapter |
| `packages/server/src/accounts/AccountService.ts` | The policy |
| `packages/server/src/accounts/sessionUserFor.ts` | Derives the profile card of a registered user |
| `packages/server/src/accounts/accountStatusCache.ts` | 60 s status cache for the upgrade |
| `packages/server/src/accounts/resolveAccountsMode.ts` | Env → mode, with the startup refusals |
| `packages/server/src/http/jsonResult.ts` | The JSON result shape shared by handlers |
| `packages/server/src/http/accountHandlers.ts` | The five new endpoint handlers |
| `packages/server/src/http/postRouter.ts` | One preflight, ban check, body cap and error mapping for all POST routes |
| `packages/server/src/http/accountsHealth.ts` | `/health/accounts` |
| `packages/server/scripts/probe-accounts.ts` | Live check of the adapter against a real project |
| `supabase/migrations/20261004000000_create_profiles.sql` | The `profiles` table and triggers |
| `supabase/templates/*.html`, `supabase/README.md` | Email templates and setup steps |
| `.github/workflows/accounts-keepalive.yml` | Twice-weekly directory read |
| `docs/privacy.md` | The privacy notice |

---

### Task 0: Worktree

- [ ] **Step 1: Create a ready worktree**

```bash
./scripts/new-worktree.sh b2a-account-server --ready
```

Expected: `state: READY`. All later commands run from that worktree.

---

### Task 1: Domain — password rule and account input checks

**Files:**
- Create: `packages/domain/src/auth/accessLevel.ts`
- Create: `packages/domain/src/auth/passwordPolicy.ts`, `packages/domain/src/auth/passwordPolicy.test.ts`
- Create: `packages/domain/src/auth/accountInput.ts`, `packages/domain/src/auth/accountInput.test.ts`
- Modify: `packages/domain/src/index.ts` (the `./auth/` export block near line 3)

**Interfaces:**
- Produces: `AccessLevel`; `PASSWORD_RULES`, `PasswordRule`, `PasswordRuleId`, `findPasswordViolation(password): PasswordRule | null`; `normalizeEmail`, `isValidEmail`, `normalizeDisplayName`, `isValidDisplayName`, `isConfirmationCode`, `initialsOf`.

- [ ] **Step 1: Write the failing tests**

`packages/domain/src/auth/passwordPolicy.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { findPasswordViolation, PASSWORD_RULES } from "./passwordPolicy.js";

describe("findPasswordViolation", () => {
  it("accepts a password that meets every rule", () => {
    expect(findPasswordViolation("Mcdc2026!desk")).toBeNull();
  });

  it.each([
    ["Short1!a", "min-length"],
    ["alllowercase1!", "uppercase"],
    ["ALLUPPERCASE1!", "lowercase"],
    ["NoDigitsHere!!", "digit"],
    ["NoSpecials1234", "special"],
  ])("rejects %s for the %s rule", (password: string, rule: string) => {
    expect(findPasswordViolation(password)?.id).toBe(rule);
  });

  it("counts BYTES against the ceiling, not characters", () => {
    // 4 + 35 × 2 = 74 bytes in 39 characters.
    const multibyte = `Aa1!${"é".repeat(35)}`;
    // 4 + 68 = 72 bytes exactly.
    const atLimit = `Aa1!${"x".repeat(68)}`;

    expect(findPasswordViolation(multibyte)?.id).toBe("max-length");
    expect(findPasswordViolation(atLimit)).toBeNull();
  });

  it("reports the first broken rule in display order", () => {
    expect(findPasswordViolation("a")?.id).toBe(PASSWORD_RULES[0]?.id);
  });
});
```

`packages/domain/src/auth/accountInput.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  initialsOf,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "./accountInput.js";

describe("normalizeEmail", () => {
  it("trims and lowercases, so one person has one spelling", () => {
    expect(normalizeEmail("  Ann@Desk.IO ")).toBe("ann@desk.io");
  });
});

describe("isValidEmail", () => {
  it.each(["ann@desk.io", "a.b+tag@sub.desk.io"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    "astark",
    "ann@desk",
    "@desk.io",
    "ann@",
    "ann @desk.io",
    "ann@@desk.io",
    `${"a".repeat(250)}@d.io`,
  ])("rejects %s", (email) => {
    expect(isValidEmail(email)).toBe(false);
  });
});

describe("display names", () => {
  it("collapses inner whitespace, newlines included", () => {
    expect(normalizeDisplayName("  Ann \n  Lee ")).toBe("Ann Lee");
  });

  it("accepts 2 to 40 characters and nothing else", () => {
    expect(isValidDisplayName("Al")).toBe(true);
    expect(isValidDisplayName("A")).toBe(false);
    expect(isValidDisplayName("x".repeat(40))).toBe(true);
    expect(isValidDisplayName("x".repeat(41))).toBe(false);
  });

  it("rejects a control character", () => {
    expect(isValidDisplayName("Ann\u0007Lee")).toBe(false);
  });

  it("derives initials from the first and last word, or two letters of one", () => {
    expect(initialsOf("Ann Lee")).toBe("AL");
    expect(initialsOf("ann marie lee")).toBe("AL");
    expect(initialsOf("Cher")).toBe("CH");
  });
});

describe("isConfirmationCode", () => {
  it("accepts exactly six digits", () => {
    expect(isConfirmationCode("000000")).toBe(true);
    expect(isConfirmationCode("12345")).toBe(false);
    expect(isConfirmationCode("1234567")).toBe(false);
    expect(isConfirmationCode("12345a")).toBe(false);
  });
});
```

- [ ] **Step 2: Run them and see them fail**

Run: `pnpm --filter @rtc/domain test passwordPolicy accountInput`
Expected: FAIL — cannot resolve `./passwordPolicy.js` / `./accountInput.js`.

- [ ] **Step 3: Implement**

`packages/domain/src/auth/accessLevel.ts`:

```ts
/** What a signed-in identity may do. Distinct from `SessionUser.role`, which
 * is a display label ("Senior FX Trader"). */
export type AccessLevel = "user" | "admin";
```

`packages/domain/src/auth/passwordPolicy.ts`:

```ts
export const PASSWORD_MIN_LENGTH = 12;

/** Supabase hashes with bcrypt, which reads at most 72 BYTES of input. */
export const PASSWORD_MAX_BYTES = 72;

export type PasswordRuleId =
  | "min-length"
  | "max-length"
  | "uppercase"
  | "lowercase"
  | "digit"
  | "special";

export interface PasswordRule {
  readonly id: PasswordRuleId;
  readonly label: string;
  readonly test: (password: string) => boolean;
}

/**
 * The sign-up password rule, in display order. One list feeds the form's
 * live checklist and the server's enforcement, so they cannot disagree.
 */
export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: "min-length",
    label: `At least ${PASSWORD_MIN_LENGTH} characters`,
    test: (password: string): boolean => {
      return password.length >= PASSWORD_MIN_LENGTH;
    },
  },
  {
    id: "max-length",
    label: `At most ${PASSWORD_MAX_BYTES} bytes`,
    test: (password: string): boolean => {
      return utf8ByteLength(password) <= PASSWORD_MAX_BYTES;
    },
  },
  {
    id: "uppercase",
    label: "One uppercase letter",
    test: (password: string): boolean => {
      return /[A-Z]/.test(password);
    },
  },
  {
    id: "lowercase",
    label: "One lowercase letter",
    test: (password: string): boolean => {
      return /[a-z]/.test(password);
    },
  },
  {
    id: "digit",
    label: "One number",
    test: (password: string): boolean => {
      return /[0-9]/.test(password);
    },
  },
  {
    id: "special",
    label: "One special character",
    test: (password: string): boolean => {
      return /[^A-Za-z0-9]/.test(password);
    },
  },
];

/** The first rule the password breaks, in display order; null when it passes. */
export function findPasswordViolation(password: string): PasswordRule | null {
  return (
    PASSWORD_RULES.find((rule) => {
      return !rule.test(password);
    }) ?? null
  );
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
```

`packages/domain/src/auth/accountInput.ts`:

```ts
export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRMATION_CODE_SHAPE = /^\d{6}$/;
const CONTROL_CHARACTER = /\p{Cc}/u;

/** One person, one spelling: every account lookup uses this form. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A pragmatic shape check on an already-normalized address. Whether the
 * mailbox exists is what the confirmation code proves. */
export function isValidEmail(email: string): boolean {
  return email.length <= EMAIL_MAX_LENGTH && EMAIL_SHAPE.test(email);
}

export function normalizeDisplayName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(name: string): boolean {
  return (
    name.length >= DISPLAY_NAME_MIN_LENGTH &&
    name.length <= DISPLAY_NAME_MAX_LENGTH &&
    !CONTROL_CHARACTER.test(name)
  );
}

export function isConfirmationCode(code: string): boolean {
  return CONFIRMATION_CODE_SHAPE.test(code);
}

/** First letters of the first and last word; two letters of a single word. */
export function initialsOf(displayName: string): string {
  const words = displayName.split(" ").filter((word) => {
    return word !== "";
  });
  const first = words[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1] ?? "") : "";
  const letters =
    last === "" ? first.slice(0, 2) : `${first.charAt(0)}${last.charAt(0)}`;

  return letters.toUpperCase();
}
```

In `packages/domain/src/index.ts`, add beside the existing `./auth/` exports (keep the block alphabetical by path):

```ts
export type { AccessLevel } from "./auth/accessLevel.js";
export {
  initialsOf,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "./auth/accountInput.js";
export type { PasswordRule, PasswordRuleId } from "./auth/passwordPolicy.js";
export {
  findPasswordViolation,
  PASSWORD_RULES,
} from "./auth/passwordPolicy.js";
```

`EMAIL_MAX_LENGTH`, the display-name bounds and the two password constants stay unexported from the index until a consumer needs them (knip).

- [ ] **Step 4: Run the tests and see them pass**

Run: `pnpm --filter @rtc/domain test passwordPolicy accountInput`
Expected: PASS.

- [ ] **Step 5: Rebuild and commit**

```bash
pnpm --filter @rtc/domain build
git add packages/domain/src
git commit -m "feat(domain): the account password rule and input checks"
```

---

### Task 2: Shared — account DTOs and guards

**Files:**
- Modify: `packages/shared/src/protocol/auth.ts`
- Modify: `packages/shared/src/protocol/auth.test.ts`

**Interfaces:**
- Produces: `RegisterRequestDto {email, displayName, password}`, `EmailRequestDto {email}`, `ConfirmEmailRequestDto {email, code}`, `ResetPasswordRequestDto {email, code, password}`, `AccountFlowStatus`, `AccountFlowResponseDto {status}`, `AccountErrorCode`, `AccountErrorDto {error, rule?}`, and the guards `isRegisterRequestDto`, `isEmailRequestDto`, `isConfirmEmailRequestDto`, `isResetPasswordRequestDto`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/shared/src/protocol/auth.test.ts` (add the four guards to its import from `./auth.js`):

```ts
describe("account request guards", () => {
  it("isRegisterRequestDto needs three string fields", () => {
    expect(
      isRegisterRequestDto({
        email: "ann@desk.io",
        displayName: "Ann",
        password: "x",
      }),
    ).toBe(true);
    expect(isRegisterRequestDto({ email: "ann@desk.io", password: "x" })).toBe(
      false,
    );
    expect(
      isRegisterRequestDto({ email: 1, displayName: "Ann", password: "x" }),
    ).toBe(false);
  });

  it("isEmailRequestDto needs a string email", () => {
    expect(isEmailRequestDto({ email: "ann@desk.io" })).toBe(true);
    expect(isEmailRequestDto({})).toBe(false);
    expect(isEmailRequestDto(null)).toBe(false);
  });

  it("isConfirmEmailRequestDto needs email and code", () => {
    expect(
      isConfirmEmailRequestDto({ email: "ann@desk.io", code: "000000" }),
    ).toBe(true);
    expect(isConfirmEmailRequestDto({ email: "ann@desk.io" })).toBe(false);
  });

  it("isResetPasswordRequestDto needs email, code and password", () => {
    expect(
      isResetPasswordRequestDto({
        email: "ann@desk.io",
        code: "000000",
        password: "x",
      }),
    ).toBe(true);
    expect(
      isResetPasswordRequestDto({ email: "ann@desk.io", code: "000000" }),
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/shared test auth`
Expected: FAIL — the guards are not exported.

- [ ] **Step 3: Implement**

Append to `packages/shared/src/protocol/auth.ts`:

```ts
export interface RegisterRequestDto {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

export interface EmailRequestDto {
  readonly email: string;
}

export interface ConfirmEmailRequestDto {
  readonly email: string;
  readonly code: string;
}

export interface ResetPasswordRequestDto {
  readonly email: string;
  readonly code: string;
  readonly password: string;
}

export type AccountFlowStatus =
  | "code_sent"
  | "pending_approval"
  | "password_changed";

export interface AccountFlowResponseDto {
  readonly status: AccountFlowStatus;
}

export type AccountErrorCode =
  | "banned"
  | "blocked"
  | "invalid_code"
  | "invalid_credentials"
  | "invalid_request"
  | "malformed_json"
  | "pending_approval"
  | "rate_limited"
  | "registration_closed"
  | "unavailable"
  | "unconfirmed";

export interface AccountErrorDto {
  readonly error: AccountErrorCode;
  /** Which input rule failed, on `invalid_request` (a `PasswordRuleId`,
   * `"email"` or `"display-name"`). */
  readonly rule?: string;
}

export function isRegisterRequestDto(
  value: unknown,
): value is RegisterRequestDto {
  return hasStringFields(value, ["email", "displayName", "password"]);
}

export function isEmailRequestDto(value: unknown): value is EmailRequestDto {
  return hasStringFields(value, ["email"]);
}

export function isConfirmEmailRequestDto(
  value: unknown,
): value is ConfirmEmailRequestDto {
  return hasStringFields(value, ["email", "code"]);
}

export function isResetPasswordRequestDto(
  value: unknown,
): value is ResetPasswordRequestDto {
  return hasStringFields(value, ["email", "code", "password"]);
}

function hasStringFields(value: unknown, fields: readonly string[]): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return fields.every((field) => {
    return typeof record[field] === "string";
  });
}
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter @rtc/shared test auth`
Expected: PASS.

- [ ] **Step 5: Rebuild and commit**

```bash
pnpm --filter @rtc/shared build
git add packages/shared/src/protocol
git commit -m "feat(shared): account request, response and error DTOs"
```

---

### Task 3: Token claims and the account session

**Files:**
- Modify: `packages/server/src/auth/token.ts`, `packages/server/src/auth/token.test.ts`
- Modify: `packages/server/src/auth/AuthService.ts`, `packages/server/src/auth/AuthService.test.ts`

**Interfaces:**
- Produces: `TokenAccount {accountId: string; access: AccessLevel}`; `VerifiedToken {username: string; accountId: string | null; access: AccessLevel}`; `signToken(username, secret, ttlMs, now, account: TokenAccount | null = null): string`; `AuthService.issueAccountSession(email: string, account: TokenAccount): string`.

- [ ] **Step 1: Write the failing tests**

In `token.test.ts`, change the first case's expectation and add four cases inside `describe("token", …)`:

```ts
  it("round-trips a valid, unexpired token", () => {
    const t = signToken("demo", SECRET, 60_000, NOW);
    expect(verifyToken(t, SECRET, NOW + 30_000)).toEqual({
      username: "demo",
      accountId: null,
      access: "user",
    });
  });

  it("round-trips the account id and access level", () => {
    const t = signToken("ann@desk.io", SECRET, 60_000, NOW, {
      accountId: "acc-1",
      access: "admin",
    });

    expect(verifyToken(t, SECRET, NOW)).toEqual({
      username: "ann@desk.io",
      accountId: "acc-1",
      access: "admin",
    });
  });

  it("rejects an access claim with no account id (a half-claim)", () => {
    const payload = JSON.stringify({ u: "demo", exp: 9e15, a: "admin" });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects an account id with no access claim", () => {
    const payload = JSON.stringify({ u: "demo", exp: 9e15, id: "acc-1" });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });

  it("rejects an access level it does not know", () => {
    const payload = JSON.stringify({
      u: "demo",
      exp: 9e15,
      id: "acc-1",
      a: "root",
    });

    expect(verifyToken(forge(payload), SECRET, NOW)).toBeNull();
  });
```

In `AuthService.test.ts`, add:

```ts
describe("issueAccountSession", () => {
  it("issues a token that verifies with the account's id and access", () => {
    const auth = new AuthService({
      secret: "s3cret",
      ttlMs: 60_000,
      credentials: new Map<string, string>(),
      now: (): number => {
        return 1_000;
      },
    });

    const token = auth.issueAccountSession("ann@desk.io", {
      accountId: "acc-1",
      access: "admin",
    });

    expect(auth.verifyToken(token)).toEqual({
      username: "ann@desk.io",
      accountId: "acc-1",
      access: "admin",
    });
  });

  it("refuses to sign with an empty secret (Review Focus 2)", () => {
    const auth = new AuthService({
      secret: "",
      ttlMs: 60_000,
      credentials: new Map<string, string>(),
    });

    expect(() => {
      return auth.issueAccountSession("ann@desk.io", {
        accountId: "acc-1",
        access: "user",
      });
    }).toThrow("AUTH_SECRET must be set to issue an account session");
  });
});
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/server test token AuthService`
Expected: FAIL — `toEqual` mismatch on `accountId`, and `issueAccountSession` is not a function.

- [ ] **Step 3: Implement**

Replace the top of `packages/server/src/auth/token.ts` down to and including `verifyToken` with:

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

import type { AccessLevel } from "@rtc/domain";

/** The registered account a token was issued for. Roster logins carry none. */
export interface TokenAccount {
  readonly accountId: string;
  readonly access: AccessLevel;
}

interface Payload {
  readonly u: string;
  readonly exp: number;
  readonly id?: string;
  readonly a?: AccessLevel;
}

export interface VerifiedToken {
  readonly username: string;
  /** Null for a roster login, which has no directory entry. */
  readonly accountId: string | null;
  readonly access: AccessLevel;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function signToken(
  username: string,
  secret: string,
  ttlMs: number,
  now: number,
  account: TokenAccount | null = null,
): string {
  const payload: Payload =
    account === null
      ? { u: username, exp: now + ttlMs }
      : {
          u: username,
          exp: now + ttlMs,
          id: account.accountId,
          a: account.access,
        };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyToken(
  token: string,
  secret: string,
  now: number,
): VerifiedToken | null {
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
    const claims = readClaims(payload);

    return claims !== null && payload.exp > now ? claims : null;
  } catch {
    return null;
  }
}

/** A token carries BOTH account claims or NEITHER. A half-claim is a
 * malformed token, never a quiet downgrade to `user`. */
function readClaims(payload: Payload): VerifiedToken | null {
  if (typeof payload.u !== "string" || typeof payload.exp !== "number") {
    return null;
  }

  if (payload.id === undefined && payload.a === undefined) {
    return { username: payload.u, accountId: null, access: "user" };
  }

  if (
    typeof payload.id !== "string" ||
    (payload.a !== "user" && payload.a !== "admin")
  ) {
    return null;
  }

  return { username: payload.u, accountId: payload.id, access: payload.a };
}
```

In `AuthService.ts`, import the type (`import type { TokenAccount, VerifiedToken } from "./token.js";`) and add this method after `login`:

```ts
  /** Signs a session for a registered account the caller has ALREADY
   * validated (`AccountService.login`). An empty secret would make every
   * token forgeable, an admin one included, so it is refused outright. */
  issueAccountSession(email: string, account: TokenAccount): string {
    if (!this.secret) {
      throw new Error("AUTH_SECRET must be set to issue an account session");
    }

    return signToken(email, this.secret, this.ttlMs, this.now(), account);
  }
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter @rtc/server test token AuthService`
Expected: PASS. Then `pnpm --filter @rtc/server test` — the whole package stays green (the upgrade-gate and login tests use `signToken`'s first four parameters only).

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/auth
git commit -m "feat(server): session tokens carry the account id and access level"
```

---

### Task 4: The account directory port, the disabled and the in-memory directories

**Files:**
- Create: `packages/server/src/auth/passwordHash.ts`
- Modify: `packages/server/src/auth/AuthService.ts` (use the extracted helpers)
- Create: `packages/server/src/accounts/AccountDirectory.ts`, `AccountDirectory.test.ts`
- Create: `packages/server/src/accounts/DisabledAccountDirectory.ts`
- Create: `packages/server/src/accounts/devAccounts.ts`
- Create: `packages/server/src/accounts/InMemoryAccountDirectory.ts`, `InMemoryAccountDirectory.test.ts`

**Interfaces:**
- Produces (all from `accounts/AccountDirectory.ts`):

```ts
export type AccountStatus = "unconfirmed" | "pending" | "active" | "blocked";
export interface AccountRecord {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
}
export interface SignUpInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}
export type SignUpOutcome =
  | "sent"
  | "rejected-email"
  | "rejected-password"
  | "unavailable";
export type SendOutcome = "sent" | "unavailable";
export type ConfirmOutcome = "confirmed" | "invalid_code" | "unavailable";
export type ResetOutcome = "changed" | "invalid_code" | "rejected" | "unavailable";
export type PasswordCheck =
  | { readonly outcome: "match"; readonly accountId: string }
  | { readonly outcome: "invalid" | "unconfirmed" | "unavailable" };
export type AccountLookup =
  | { readonly outcome: "found"; readonly account: AccountRecord }
  | { readonly outcome: "missing" | "unavailable" };
export type RegistrationCount =
  | { readonly outcome: "counted"; readonly count: number }
  | { readonly outcome: "unavailable" };
export interface AccountDirectory {
  readonly kind: "supabase" | "in-memory" | "disabled";
  signUp(input: SignUpInput, callerIp: string): Promise<SignUpOutcome>;
  resendCode(email: string, callerIp: string): Promise<SendOutcome>;
  confirmEmail(email: string, code: string, callerIp: string): Promise<ConfirmOutcome>;
  checkPassword(email: string, password: string, callerIp: string): Promise<PasswordCheck>;
  requestReset(email: string, callerIp: string): Promise<SendOutcome>;
  resetPassword(email: string, code: string, password: string, callerIp: string): Promise<ResetOutcome>;
  findAccount(accountId: string): Promise<AccountLookup>;
  countRegistrationsSince(sinceMs: number): Promise<RegistrationCount>;
  ping(): Promise<boolean>;
}
export function deriveAccountStatus(flags: AccountFlags): AccountStatus;
```

- `createDisabledAccountDirectory(): AccountDirectory`
- `createInMemoryAccountDirectory(options: InMemoryDirectoryOptions): AccountDirectory`, `DEV_CONFIRMATION_CODE = "000000"`
- `DEV_ACCOUNT_PASSWORD`, `DEV_ACCOUNT_SEEDS`, `DevAccountSeed`

`callerIp` exists so the Supabase adapter can forward it (`Sb-Forwarded-For`); without it Supabase would rate-limit every visitor as one IP, ours. Emails passed to the directory are already normalized by `AccountService`.

- [ ] **Step 1: Extract the scrypt helpers (refactor under existing tests)**

`packages/server/src/auth/passwordHash.ts`:

```ts
import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const SCRYPT_KEY_LENGTH = 32;
const SALT_LENGTH = 16;

const scryptAsync = promisify(scrypt);

export function createSalt(): Buffer {
  return randomBytes(SALT_LENGTH);
}

/** Startup only: a table built synchronously once. */
export function hashPasswordSync(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, SCRYPT_KEY_LENGTH);
}

/** S5 — hashes off the event loop (libuv threadpool), so a burst of logins
 * does not stall every live WebSocket's ticks. */
export function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, SCRYPT_KEY_LENGTH) as Promise<Buffer>;
}

export function digestsMatch(candidate: Buffer, digest: Buffer): boolean {
  return (
    candidate.length === digest.length && timingSafeEqual(candidate, digest)
  );
}
```

In `AuthService.ts`: delete the `node:crypto` and `node:util` imports, `SCRYPT_KEY_LENGTH`, `SALT_LENGTH`, `scryptAsync`, and the two private `hashPasswordSync` / `hashPassword` functions at the bottom (keep their doc comments' content — it now lives in `passwordHash.ts`). Import `{ createSalt, digestsMatch, hashPassword, hashPasswordSync } from "./passwordHash.js"`. Replace `randomBytes(SALT_LENGTH)` with `createSalt()` (two sites) and the comparison in `login` with:

```ts
    if (record === undefined || !digestsMatch(candidate, record.digest)) {
      return null;
    }
```

Run: `pnpm --filter @rtc/server test AuthService loginHandler`
Expected: PASS (behaviour unchanged).

- [ ] **Step 2: Write the failing tests**

`packages/server/src/accounts/AccountDirectory.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { deriveAccountStatus } from "./AccountDirectory.js";

describe("deriveAccountStatus", () => {
  it("is active only when confirmed, approved and not blocked", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: true, blocked: false }),
    ).toBe("active");
  });

  it("is pending when confirmed but not approved", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: false, blocked: false }),
    ).toBe("pending");
  });

  it("is unconfirmed before the email is confirmed, even if approved", () => {
    expect(
      deriveAccountStatus({ confirmed: false, approved: true, blocked: false }),
    ).toBe("unconfirmed");
  });

  it("blocked wins over everything", () => {
    expect(
      deriveAccountStatus({ confirmed: true, approved: true, blocked: true }),
    ).toBe("blocked");
    expect(
      deriveAccountStatus({ confirmed: false, approved: false, blocked: true }),
    ).toBe("blocked");
  });
});
```

`packages/server/src/accounts/InMemoryAccountDirectory.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "./AccountDirectory.js";
import { DEV_ACCOUNT_PASSWORD, DEV_ACCOUNT_SEEDS } from "./devAccounts.js";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "./InMemoryAccountDirectory.js";

const IP = "1.2.3.4";
const PASSWORD = "Mcdc2026!desk";

describe("InMemoryAccountDirectory", () => {
  it("a new sign-up is unconfirmed until the code is entered", async () => {
    const directory = createDirectory();

    expect(await directory.signUp(createSignUp("ann@desk.io"), IP)).toBe(
      "sent",
    );
    expect(await directory.checkPassword("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unconfirmed",
    });
    expect(await directory.confirmEmail("ann@desk.io", "111111", IP)).toBe(
      "invalid_code",
    );
    expect(
      await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP),
    ).toBe("confirmed");

    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    expect(check.outcome).toBe("match");
  });

  it("a confirmed sign-up is pending, never active, with the user role", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);
    const check = await directory.checkPassword("ann@desk.io", PASSWORD, IP);

    if (check.outcome !== "match") {
      throw new Error("expected a match");
    }

    expect(await directory.findAccount(check.accountId)).toEqual({
      outcome: "found",
      account: {
        id: check.accountId,
        email: "ann@desk.io",
        displayName: "Ann Lee",
        access: "user",
        status: "pending",
      },
    });
  });

  it("signing up an existing address answers `sent` and changes nothing", async () => {
    const directory = createDirectory();
    await directory.signUp(createSignUp("ann@desk.io"), IP);
    await directory.confirmEmail("ann@desk.io", DEV_CONFIRMATION_CODE, IP);

    expect(
      await directory.signUp(
        { email: "ann@desk.io", displayName: "Mallory", password: "Other2026!x" },
        IP,
      ),
    ).toBe("sent");
    expect(
      (await directory.checkPassword("ann@desk.io", PASSWORD, IP)).outcome,
    ).toBe("match");
    expect(
      (await directory.checkPassword("ann@desk.io", "Other2026!x", IP)).outcome,
    ).toBe("invalid");
  });

  it("an unknown address and a wrong password read the same", async () => {
    const directory = createDirectory();

    expect(await directory.checkPassword("nobody@desk.io", PASSWORD, IP)).toEqual(
      { outcome: "invalid" },
    );
    expect(
      await directory.checkPassword("trader@rtc.test", "Wrong2026!pass", IP),
    ).toEqual({ outcome: "invalid" });
  });

  it("a reset needs a request first, then the code", async () => {
    const directory = createDirectory();
    const next = "Fresh2026!pass";

    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toBe("invalid_code");

    await directory.requestReset("trader@rtc.test", IP);

    expect(
      await directory.resetPassword("trader@rtc.test", "111111", next, IP),
    ).toBe("invalid_code");
    expect(
      await directory.resetPassword(
        "trader@rtc.test",
        DEV_CONFIRMATION_CODE,
        next,
        IP,
      ),
    ).toBe("changed");
    expect(
      (await directory.checkPassword("trader@rtc.test", next, IP)).outcome,
    ).toBe("match");
    expect(
      (
        await directory.checkPassword(
          "trader@rtc.test",
          DEV_ACCOUNT_PASSWORD,
          IP,
        )
      ).outcome,
    ).toBe("invalid");
  });

  it("requesting a reset for an unknown address still answers `sent`", async () => {
    expect(await createDirectory().requestReset("nobody@desk.io", IP)).toBe(
      "sent",
    );
  });

  it("seeds one account per status, the admin included", async () => {
    const directory = createDirectory();
    const statuses = await Promise.all(
      DEV_ACCOUNT_SEEDS.map(async (seed) => {
        const found = await directory.findAccount(seed.id);

        return found.outcome === "found" ? found.account.status : "missing";
      }),
    );

    expect(statuses).toEqual(["active", "active", "pending", "blocked"]);
    expect(await directory.findAccount(DEV_ACCOUNT_SEEDS[0]?.id ?? "")).toEqual(
      {
        outcome: "found",
        account: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "admin@rtc.test",
          displayName: "Desk Admin",
          access: "admin",
          status: "active",
        },
      },
    );
  });

  it("counts registrations since a moment, seeds excluded by their age", async () => {
    let now = 10_000;
    const directory = createInMemoryAccountDirectory({
      now: (): number => {
        return now;
      },
      seeds: DEV_ACCOUNT_SEEDS,
    });

    now = 50_000;
    await directory.signUp(createSignUp("ann@desk.io"), IP);

    expect(await directory.countRegistrationsSince(40_000)).toEqual({
      outcome: "counted",
      count: 1,
    });
  });
});

function createDirectory(): AccountDirectory {
  return createInMemoryAccountDirectory({
    now: (): number => {
      return 1_000;
    },
    seeds: DEV_ACCOUNT_SEEDS,
  });
}

interface SignUp {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

function createSignUp(email: string): SignUp {
  return { email, displayName: "Ann Lee", password: PASSWORD };
}
```

- [ ] **Step 3: Run and see them fail**

Run: `pnpm --filter @rtc/server test accounts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

`packages/server/src/accounts/AccountDirectory.ts` — the types exactly as listed under **Interfaces** above, with these doc comments and this function:

```ts
import type { AccessLevel } from "@rtc/domain";

/** Derived, never stored (spec §5.1). */
export type AccountStatus = "unconfirmed" | "pending" | "active" | "blocked";

// … AccountRecord, SignUpInput and the outcome types exactly as in the
// Interfaces block above …

export interface AccountFlags {
  readonly confirmed: boolean;
  readonly approved: boolean;
  readonly blocked: boolean;
}

/**
 * Where accounts live. Every method resolves; none rejects — an unreachable
 * store is the value `unavailable`, so a caller cannot forget to handle it.
 * Emails arrive already normalized (`AccountService`). `callerIp` is the
 * end user's address, for a store that rate-limits per caller.
 */
export interface AccountDirectory {
  // … the nine members exactly as in the Interfaces block above …
}

/** A block wins over everything; then an unconfirmed email; then approval. */
export function deriveAccountStatus(flags: AccountFlags): AccountStatus {
  if (flags.blocked) {
    return "blocked";
  }

  if (!flags.confirmed) {
    return "unconfirmed";
  }

  return flags.approved ? "active" : "pending";
}
```

(Write the elided types out in full from the Interfaces block; they are repeated there verbatim so this file and its consumers agree.)

`packages/server/src/accounts/DisabledAccountDirectory.ts`:

```ts
import type {
  AccountDirectory,
  AccountLookup,
  ConfirmOutcome,
  PasswordCheck,
  RegistrationCount,
  ResetOutcome,
  SendOutcome,
  SignUpOutcome,
} from "./AccountDirectory.js";

/**
 * The directory of a server with no account store configured: every
 * operation is `unavailable`. Registered logins then answer 503 and the
 * roster path is untouched. Also the base that tests override one method of.
 */
export function createDisabledAccountDirectory(): AccountDirectory {
  return {
    kind: "disabled",
    signUp: (): Promise<SignUpOutcome> => {
      return Promise.resolve("unavailable");
    },
    resendCode: (): Promise<SendOutcome> => {
      return Promise.resolve("unavailable");
    },
    confirmEmail: (): Promise<ConfirmOutcome> => {
      return Promise.resolve("unavailable");
    },
    checkPassword: (): Promise<PasswordCheck> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    requestReset: (): Promise<SendOutcome> => {
      return Promise.resolve("unavailable");
    },
    resetPassword: (): Promise<ResetOutcome> => {
      return Promise.resolve("unavailable");
    },
    findAccount: (): Promise<AccountLookup> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    countRegistrationsSince: (): Promise<RegistrationCount> => {
      return Promise.resolve({ outcome: "unavailable" });
    },
    ping: (): Promise<boolean> => {
      return Promise.resolve(false);
    },
  };
}
```

`packages/server/src/accounts/devAccounts.ts`:

```ts
import type { AccessLevel } from "@rtc/domain";

import type { AccountStatus } from "./AccountDirectory.js";

export interface DevAccountSeed {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly status: AccountStatus;
}

/** DEV ONLY, committed like the demo roster's `mcdc2026`. It can never work
 * on a deployed server: `resolveAccountsMode` refuses the in-memory
 * directory there. */
export const DEV_ACCOUNT_PASSWORD = "Mcdc2026!desk";

/** One account per status, so dev and e2e can exercise each without an
 * admin API. `.test` is a reserved TLD: these addresses can never exist. */
export const DEV_ACCOUNT_SEEDS: readonly DevAccountSeed[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "admin@rtc.test",
    displayName: "Desk Admin",
    access: "admin",
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "trader@rtc.test",
    displayName: "Guest Trader",
    access: "user",
    status: "active",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "pending@rtc.test",
    displayName: "Pending Guest",
    access: "user",
    status: "pending",
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "blocked@rtc.test",
    displayName: "Blocked Guest",
    access: "user",
    status: "blocked",
  },
];
```

`packages/server/src/accounts/InMemoryAccountDirectory.ts`:

```ts
import { randomUUID } from "node:crypto";

import type { AccessLevel } from "@rtc/domain";

import {
  createSalt,
  digestsMatch,
  hashPassword,
  hashPasswordSync,
} from "../auth/passwordHash.js";
import {
  type AccountDirectory,
  type AccountLookup,
  type ConfirmOutcome,
  deriveAccountStatus,
  type PasswordCheck,
  type RegistrationCount,
  type ResetOutcome,
  type SendOutcome,
  type SignUpInput,
  type SignUpOutcome,
} from "./AccountDirectory.js";
import { DEV_ACCOUNT_PASSWORD, type DevAccountSeed } from "./devAccounts.js";

/** The code every dev confirmation and reset accepts. There is no mailbox. */
export const DEV_CONFIRMATION_CODE = "000000";

export interface InMemoryDirectoryOptions {
  readonly now: () => number;
  readonly seeds: readonly DevAccountSeed[];
}

interface Entry {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly access: AccessLevel;
  readonly createdAt: number;
  salt: Buffer;
  digest: Buffer;
  confirmed: boolean;
  approved: boolean;
  blocked: boolean;
  resetRequested: boolean;
}

/**
 * The account directory for local dev and e2e (`RTC_DEV_ACCOUNTS=1`): a Map,
 * scrypt hashes, one fixed code. It mirrors the Supabase adapter's observable
 * behaviour — an existing address signs up as `sent`, an unknown address and
 * a wrong password are both `invalid` — so the policy above it is exercised
 * the same way against either.
 */
export function createInMemoryAccountDirectory(
  options: InMemoryDirectoryOptions,
): AccountDirectory {
  const byEmail = new Map<string, Entry>();
  const dummySalt = createSalt();

  for (const seed of options.seeds) {
    const salt = createSalt();

    byEmail.set(seed.email, {
      id: seed.id,
      email: seed.email,
      displayName: seed.displayName,
      access: seed.access,
      createdAt: 0,
      salt,
      digest: hashPasswordSync(DEV_ACCOUNT_PASSWORD, salt),
      confirmed: seed.status !== "unconfirmed",
      approved: seed.status === "active",
      blocked: seed.status === "blocked",
      resetRequested: false,
    });
  }

  function findById(accountId: string): Entry | undefined {
    for (const entry of byEmail.values()) {
      if (entry.id === accountId) {
        return entry;
      }
    }

    return undefined;
  }

  return {
    kind: "in-memory",

    async signUp(input: SignUpInput): Promise<SignUpOutcome> {
      if (byEmail.has(input.email)) {
        return "sent";
      }

      const salt = createSalt();

      byEmail.set(input.email, {
        id: randomUUID(),
        email: input.email,
        displayName: input.displayName,
        access: "user",
        createdAt: options.now(),
        salt,
        digest: await hashPassword(input.password, salt),
        confirmed: false,
        approved: false,
        blocked: false,
        resetRequested: false,
      });

      return "sent";
    },

    resendCode(): Promise<SendOutcome> {
      return Promise.resolve("sent");
    },

    confirmEmail(email: string, code: string): Promise<ConfirmOutcome> {
      const entry = byEmail.get(email);

      if (entry === undefined || entry.confirmed || !isDevCode(code)) {
        return Promise.resolve("invalid_code");
      }

      entry.confirmed = true;

      return Promise.resolve("confirmed");
    },

    async checkPassword(
      email: string,
      password: string,
    ): Promise<PasswordCheck> {
      const entry = byEmail.get(email);
      const candidate = await hashPassword(password, entry?.salt ?? dummySalt);

      if (entry === undefined || !digestsMatch(candidate, entry.digest)) {
        return { outcome: "invalid" };
      }

      return entry.confirmed
        ? { outcome: "match", accountId: entry.id }
        : { outcome: "unconfirmed" };
    },

    requestReset(email: string): Promise<SendOutcome> {
      const entry = byEmail.get(email);

      if (entry !== undefined) {
        entry.resetRequested = true;
      }

      return Promise.resolve("sent");
    },

    async resetPassword(
      email: string,
      code: string,
      password: string,
    ): Promise<ResetOutcome> {
      const entry = byEmail.get(email);

      if (entry === undefined || !entry.resetRequested || !isDevCode(code)) {
        return "invalid_code";
      }

      const salt = createSalt();

      entry.salt = salt;
      entry.digest = await hashPassword(password, salt);
      entry.resetRequested = false;

      return "changed";
    },

    findAccount(accountId: string): Promise<AccountLookup> {
      const entry = findById(accountId);

      if (entry === undefined) {
        return Promise.resolve({ outcome: "missing" });
      }

      return Promise.resolve({
        outcome: "found",
        account: {
          id: entry.id,
          email: entry.email,
          displayName: entry.displayName,
          access: entry.access,
          status: deriveAccountStatus(entry),
        },
      });
    },

    countRegistrationsSince(sinceMs: number): Promise<RegistrationCount> {
      let count = 0;

      for (const entry of byEmail.values()) {
        if (entry.createdAt >= sinceMs) {
          count += 1;
        }
      }

      return Promise.resolve({ outcome: "counted", count });
    },

    ping(): Promise<boolean> {
      return Promise.resolve(true);
    },
  };
}

function isDevCode(code: string): boolean {
  return code === DEV_CONFIRMATION_CODE;
}
```

- [ ] **Step 5: Run and see them pass**

Run: `pnpm --filter @rtc/server test accounts AuthService`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/auth packages/server/src/accounts
git commit -m "feat(server): the account directory port, with disabled and in-memory directories"
```

---

### Task 5: `AccountService` — the policy

**Files:**
- Create: `packages/server/src/accounts/AccountService.ts`, `AccountService.test.ts`
- Create: `packages/server/src/accounts/sessionUserFor.ts`, `sessionUserFor.test.ts`

**Interfaces:**
- Consumes: `AccountDirectory` and its types (Task 4); `findPasswordViolation`, `normalizeEmail`, `isValidEmail`, `normalizeDisplayName`, `isValidDisplayName`, `isConfirmationCode`, `initialsOf` (Task 1); the request DTOs (Task 2).
- Produces:

```ts
export interface AccountServiceOptions {
  readonly directory: AccountDirectory;
  readonly now: () => number;
  readonly registrationOpen: boolean;
  readonly maxRegistrationsPerDay: number;
}
export type RegisterOutcome =
  | { readonly outcome: "code_sent" | "closed" | "unavailable" }
  | { readonly outcome: "invalid"; readonly rule: string };
export type SendCodeOutcome = "code_sent" | "invalid" | "unavailable";
export type ConfirmEmailOutcome = "confirmed" | "invalid_code" | "unavailable";
export type ResetPasswordOutcome =
  | { readonly outcome: "changed" | "invalid_code" | "unavailable" }
  | { readonly outcome: "invalid"; readonly rule: string };
export type LoginDecision =
  | { readonly outcome: "ok"; readonly account: AccountRecord }
  | {
      readonly outcome:
        | "invalid"
        | "unconfirmed"
        | "pending"
        | "blocked"
        | "unavailable";
    };
export interface AccountService {
  register(request: RegisterRequestDto, callerIp: string): Promise<RegisterOutcome>;
  resendCode(rawEmail: string, callerIp: string): Promise<SendCodeOutcome>;
  confirmEmail(rawEmail: string, code: string, callerIp: string): Promise<ConfirmEmailOutcome>;
  requestReset(rawEmail: string, callerIp: string): Promise<SendCodeOutcome>;
  resetPassword(request: ResetPasswordRequestDto, callerIp: string): Promise<ResetPasswordOutcome>;
  login(rawEmail: string, password: string, callerIp: string): Promise<LoginDecision>;
}
export function createAccountService(options: AccountServiceOptions): AccountService;
```

- `sessionUserFor(account: AccountRecord): SessionUserDto`

- [ ] **Step 1: Write the failing tests**

`packages/server/src/accounts/AccountService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { AccountDirectory } from "./AccountDirectory.js";
import {
  type AccountService,
  createAccountService,
} from "./AccountService.js";
import { DEV_ACCOUNT_PASSWORD, DEV_ACCOUNT_SEEDS } from "./devAccounts.js";
import { createDisabledAccountDirectory } from "./DisabledAccountDirectory.js";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "./InMemoryAccountDirectory.js";

const IP = "1.2.3.4";
const PASSWORD = "Mcdc2026!desk";

describe("AccountService.register", () => {
  it("sends a code for a valid request", async () => {
    const { service } = createService();

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
  });

  it.each([
    [{ email: "not-an-email" }, "email"],
    [{ displayName: "A" }, "display-name"],
    [{ password: "short" }, "min-length"],
    [{ password: "nouppercase2026!" }, "uppercase"],
  ])("names the broken rule for %o", async (override, rule) => {
    const { service } = createService();

    expect(
      await service.register({ ...createRegistration(), ...override }, IP),
    ).toEqual({ outcome: "invalid", rule });
  });

  it("normalizes the address and the display name before the directory sees them (Review Focus 3)", async () => {
    const { service, directory } = createService();
    const signUp = vi.spyOn(directory, "signUp");

    await service.register(
      {
        email: "  Ann@Desk.IO ",
        displayName: "  Ann   Lee ",
        password: PASSWORD,
      },
      IP,
    );

    expect(signUp).toHaveBeenCalledWith(
      { email: "ann@desk.io", displayName: "Ann Lee", password: PASSWORD },
      IP,
    );
  });

  it("answers the same for an address that already has an account", async () => {
    const { service } = createService();

    expect(
      await service.register(
        { ...createRegistration(), email: "trader@rtc.test" },
        IP,
      ),
    ).toEqual({ outcome: "code_sent" });
  });

  it("is closed when registration is switched off, before any validation", async () => {
    const { service, directory } = createService({ registrationOpen: false });
    const signUp = vi.spyOn(directory, "signUp");

    expect(
      await service.register({ ...createRegistration(), email: "bad" }, IP),
    ).toEqual({ outcome: "closed" });
    expect(signUp).not.toHaveBeenCalled();
  });

  it("is closed once the day's registrations reach the cap", async () => {
    const { service } = createService({ maxRegistrationsPerDay: 1 });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "code_sent",
    });
    expect(
      await service.register(
        { ...createRegistration(), email: "bob@desk.io" },
        IP,
      ),
    ).toEqual({ outcome: "closed" });
  });

  it("is unavailable when the directory cannot count or cannot sign up", async () => {
    const service = createAccountService({
      directory: createDisabledAccountDirectory(),
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "unavailable",
    });
  });

  it("maps the directory's own rejections to a named rule", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      countRegistrationsSince: () => {
        return Promise.resolve({ outcome: "counted", count: 0 });
      },
      signUp: () => {
        return Promise.resolve("rejected-email");
      },
    };
    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.register(createRegistration(), IP)).toEqual({
      outcome: "invalid",
      rule: "email",
    });
  });
});

describe("AccountService.login", () => {
  it.each([
    ["trader@rtc.test", "ok"],
    ["admin@rtc.test", "ok"],
    ["pending@rtc.test", "pending"],
    ["blocked@rtc.test", "blocked"],
  ])("%s signs in as %s", async (email, outcome) => {
    const { service } = createService();

    expect(
      (await service.login(email, DEV_ACCOUNT_PASSWORD, IP)).outcome,
    ).toBe(outcome);
  });

  it("reveals pending and blocked only after a correct password", async () => {
    const { service } = createService();

    expect(
      await service.login("blocked@rtc.test", "Wrong2026!pass", IP),
    ).toEqual({ outcome: "invalid" });
  });

  it("is unconfirmed before the code is entered", async () => {
    const { service } = createService();
    await service.register(createRegistration(), IP);

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unconfirmed",
    });
  });

  it("matches a differently spelled address to the same account (Review Focus 3)", async () => {
    const { service } = createService();

    expect(
      (await service.login("  TRADER@rtc.test ", DEV_ACCOUNT_PASSWORD, IP))
        .outcome,
    ).toBe("ok");
  });

  it("carries the account on success", async () => {
    const { service } = createService();
    const decision = await service.login(
      "admin@rtc.test",
      DEV_ACCOUNT_PASSWORD,
      IP,
    );

    expect(decision).toEqual({
      outcome: "ok",
      account: {
        id: "00000000-0000-4000-8000-000000000001",
        email: "admin@rtc.test",
        displayName: "Desk Admin",
        access: "admin",
        status: "active",
      },
    });
  });

  it("is unavailable when the password checks but the profile cannot be read", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      checkPassword: () => {
        return Promise.resolve({ outcome: "match", accountId: "acc-1" });
      },
    };
    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "unavailable",
    });
  });

  it("is invalid when the password checks but the profile is gone", async () => {
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      checkPassword: () => {
        return Promise.resolve({ outcome: "match", accountId: "acc-1" });
      },
      findAccount: () => {
        return Promise.resolve({ outcome: "missing" });
      },
    };
    const service = createAccountService({
      directory,
      now: createClock(),
      registrationOpen: true,
      maxRegistrationsPerDay: 10,
    });

    expect(await service.login("ann@desk.io", PASSWORD, IP)).toEqual({
      outcome: "invalid",
    });
  });
});

describe("AccountService codes and resets", () => {
  it("confirms with the right code and reports a wrong one", async () => {
    const { service } = createService();
    await service.register(createRegistration(), IP);

    expect(await service.confirmEmail("ann@desk.io", "111111", IP)).toBe(
      "invalid_code",
    );
    expect(
      await service.confirmEmail(" Ann@Desk.io", DEV_CONFIRMATION_CODE, IP),
    ).toBe("confirmed");
  });

  it("refuses a malformed code without asking the directory", async () => {
    const { service, directory } = createService();
    const confirm = vi.spyOn(directory, "confirmEmail");

    expect(await service.confirmEmail("ann@desk.io", "12ab", IP)).toBe(
      "invalid_code",
    );
    expect(confirm).not.toHaveBeenCalled();
  });

  it("resend and request-reset reject only a malformed address", async () => {
    const { service } = createService();

    expect(await service.resendCode("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.requestReset("nobody@desk.io", IP)).toBe("code_sent");
    expect(await service.resendCode("nope", IP)).toBe("invalid");
    expect(await service.requestReset("nope", IP)).toBe("invalid");
  });

  it("a reset enforces the password rule before the directory is asked", async () => {
    const { service, directory } = createService();
    const reset = vi.spyOn(directory, "resetPassword");

    expect(
      await service.resetPassword(
        {
          email: "trader@rtc.test",
          code: DEV_CONFIRMATION_CODE,
          password: "weak",
        },
        IP,
      ),
    ).toEqual({ outcome: "invalid", rule: "min-length" });
    expect(reset).not.toHaveBeenCalled();
  });

  it("a requested reset changes the password", async () => {
    const { service } = createService();
    await service.requestReset("trader@rtc.test", IP);

    expect(
      await service.resetPassword(
        {
          email: "trader@rtc.test",
          code: DEV_CONFIRMATION_CODE,
          password: "Fresh2026!pass",
        },
        IP,
      ),
    ).toEqual({ outcome: "changed" });
    expect(
      (await service.login("trader@rtc.test", "Fresh2026!pass", IP)).outcome,
    ).toBe("ok");
  });
});

interface ServiceOverrides {
  readonly registrationOpen?: boolean;
  readonly maxRegistrationsPerDay?: number;
}

interface ServiceFixture {
  readonly service: AccountService;
  readonly directory: AccountDirectory;
}

function createService(overrides: ServiceOverrides = {}): ServiceFixture {
  const now = createClock();
  const directory = createInMemoryAccountDirectory({
    now,
    seeds: DEV_ACCOUNT_SEEDS,
  });
  const service = createAccountService({
    directory,
    now,
    registrationOpen: overrides.registrationOpen ?? true,
    maxRegistrationsPerDay: overrides.maxRegistrationsPerDay ?? 10,
  });

  return { service, directory };
}

/** A day past zero, so the seeds (created at 0) fall outside the daily window. */
function createClock(): () => number {
  return (): number => {
    return 2 * 24 * 60 * 60 * 1_000;
  };
}

interface Registration {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

function createRegistration(): Registration {
  return { email: "ann@desk.io", displayName: "Ann Lee", password: PASSWORD };
}
```

`packages/server/src/accounts/sessionUserFor.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AccountRecord } from "./AccountDirectory.js";
import { sessionUserFor } from "./sessionUserFor.js";

describe("sessionUserFor", () => {
  it("derives a user's profile card", () => {
    expect(sessionUserFor(createAccount("user"))).toEqual({
      name: "Ann Lee",
      initials: "AL",
      role: "Guest Trader",
      id: "USR-1F3A",
      email: "ann@desk.io",
      desk: "Guest · Cloud",
      clearance: "LEVEL 2 · DESK",
    });
  });

  it("derives an admin's profile card", () => {
    const user = sessionUserFor(createAccount("admin"));

    expect(user.role).toBe("Desk Administrator");
    expect(user.clearance).toBe("LEVEL 5 · ADMIN");
  });
});

function createAccount(access: "user" | "admin"): AccountRecord {
  return {
    id: "1f3a9c2e-0000-4000-8000-000000000000",
    email: "ann@desk.io",
    displayName: "Ann Lee",
    access,
    status: "active",
  };
}
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/server test AccountService sessionUserFor`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`packages/server/src/accounts/AccountService.ts` (types exactly as under **Interfaces**, then):

```ts
import {
  findPasswordViolation,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@rtc/domain";
import type { RegisterRequestDto, ResetPasswordRequestDto } from "@rtc/shared";

import type { AccountDirectory, AccountRecord } from "./AccountDirectory.js";

const DAY_MS = 24 * 60 * 60 * 1_000;

// … the option, outcome and service types from the Interfaces block …

/**
 * The account policy (spec §5.4, §5.7), over whichever directory is
 * configured. Three rules live here and nowhere else: an address is
 * normalized before any lookup; registration can be closed or capped per
 * day; and a login succeeds only for an `active` account, with the reason
 * it did not revealed only after the password was right.
 */
export function createAccountService(
  options: AccountServiceOptions,
): AccountService {
  const { directory } = options;

  async function register(
    request: RegisterRequestDto,
    callerIp: string,
  ): Promise<RegisterOutcome> {
    if (!options.registrationOpen) {
      return { outcome: "closed" };
    }

    const email = readEmail(request.email);

    if (email === null) {
      return { outcome: "invalid", rule: "email" };
    }

    const displayName = normalizeDisplayName(request.displayName);

    if (!isValidDisplayName(displayName)) {
      return { outcome: "invalid", rule: "display-name" };
    }

    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    const counted = await directory.countRegistrationsSince(
      options.now() - DAY_MS,
    );

    if (counted.outcome === "unavailable") {
      return { outcome: "unavailable" };
    }

    if (counted.count >= options.maxRegistrationsPerDay) {
      return { outcome: "closed" };
    }

    const sent = await directory.signUp(
      { email, displayName, password: request.password },
      callerIp,
    );

    if (sent === "rejected-email") {
      return { outcome: "invalid", rule: "email" };
    }

    if (sent === "rejected-password") {
      return { outcome: "invalid", rule: "password" };
    }

    return { outcome: sent === "sent" ? "code_sent" : "unavailable" };
  }

  async function resendCode(
    rawEmail: string,
    callerIp: string,
  ): Promise<SendCodeOutcome> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return "invalid";
    }

    const sent = await directory.resendCode(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  async function confirmEmail(
    rawEmail: string,
    code: string,
    callerIp: string,
  ): Promise<ConfirmEmailOutcome> {
    const email = readEmail(rawEmail);

    if (email === null || !isConfirmationCode(code)) {
      return "invalid_code";
    }

    return directory.confirmEmail(email, code, callerIp);
  }

  async function requestReset(
    rawEmail: string,
    callerIp: string,
  ): Promise<SendCodeOutcome> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return "invalid";
    }

    const sent = await directory.requestReset(email, callerIp);

    return sent === "sent" ? "code_sent" : "unavailable";
  }

  async function resetPassword(
    request: ResetPasswordRequestDto,
    callerIp: string,
  ): Promise<ResetPasswordOutcome> {
    const violation = findPasswordViolation(request.password);

    if (violation !== null) {
      return { outcome: "invalid", rule: violation.id };
    }

    const email = readEmail(request.email);

    if (email === null || !isConfirmationCode(request.code)) {
      return { outcome: "invalid_code" };
    }

    const changed = await directory.resetPassword(
      email,
      request.code,
      request.password,
      callerIp,
    );

    if (changed === "rejected") {
      return { outcome: "invalid", rule: "password" };
    }

    return { outcome: changed };
  }

  async function login(
    rawEmail: string,
    password: string,
    callerIp: string,
  ): Promise<LoginDecision> {
    const email = readEmail(rawEmail);

    if (email === null) {
      return { outcome: "invalid" };
    }

    const check = await directory.checkPassword(email, password, callerIp);

    if (check.outcome !== "match") {
      return { outcome: check.outcome };
    }

    const found = await directory.findAccount(check.accountId);

    if (found.outcome === "unavailable") {
      return { outcome: "unavailable" };
    }

    if (found.outcome === "missing") {
      return { outcome: "invalid" };
    }

    if (found.account.status !== "active") {
      return { outcome: found.account.status };
    }

    return { outcome: "ok", account: found.account };
  }

  return {
    register,
    resendCode,
    confirmEmail,
    requestReset,
    resetPassword,
    login,
  };
}

/** The one place an address is normalized; null when it is not an address. */
function readEmail(raw: string): string | null {
  const email = normalizeEmail(raw);

  return isValidEmail(email) ? email : null;
}
```

`packages/server/src/accounts/sessionUserFor.ts`:

```ts
import { initialsOf } from "@rtc/domain";
import type { SessionUserDto } from "@rtc/shared";

import type { AccountRecord } from "./AccountDirectory.js";

const BADGE_LENGTH = 4;

/** The profile card of a registered user (spec §5.5). The roster's cards
 * are hand-written; a registered user's is derived from the account. */
export function sessionUserFor(account: AccountRecord): SessionUserDto {
  const admin = account.access === "admin";
  const badge = account.id
    .replaceAll("-", "")
    .slice(0, BADGE_LENGTH)
    .toUpperCase();

  return {
    name: account.displayName,
    initials: initialsOf(account.displayName),
    role: admin ? "Desk Administrator" : "Guest Trader",
    id: `USR-${badge}`,
    email: account.email,
    desk: "Guest · Cloud",
    clearance: admin ? "LEVEL 5 · ADMIN" : "LEVEL 2 · DESK",
  };
}
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter @rtc/server test AccountService sessionUserFor`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/accounts
git commit -m "feat(server): AccountService — the registration, validation and login policy"
```

---

### Task 6: The Supabase adapter, the migration and the probe

**Files:**
- Create: `packages/server/src/accounts/SupabaseAccountDirectory.ts`, `SupabaseAccountDirectory.test.ts`
- Create: `supabase/migrations/20261004000000_create_profiles.sql`
- Create: `packages/server/src/accounts/migrations.test.ts`
- Create: `supabase/templates/confirm-signup.html`, `supabase/templates/reset-password.html`, `supabase/README.md`
- Create: `packages/server/scripts/probe-accounts.ts`
- Modify: `packages/server/package.json` (one script), `knip.json` (one entry)

**Interfaces:**
- Consumes: `AccountDirectory` and its types (Task 4).
- Produces: `createSupabaseAccountDirectory(options: SupabaseDirectoryOptions): AccountDirectory` with `SupabaseDirectoryOptions {url: string; secretKey: string; timeoutMs: number; fetchImpl?: typeof fetch}`.

Supabase REST calls used (all with headers `apikey: <secret>` and `Authorization: Bearer <secret>`, plus `Sb-Forwarded-For: <callerIp>` on caller-driven ones):

| Operation | Request | Success | Mapped refusals |
|---|---|---|---|
| `signUp` | `POST /auth/v1/signup` `{email, password, data: {display_name}}` | 2xx → `sent` | `weak_password` → `rejected-password`; `email_address_invalid` → `rejected-email`; `user_already_exists` / `email_exists` → `sent`; any other 4xx → `unavailable` |
| `resendCode` | `POST /auth/v1/resend` `{type: "signup", email}` | any answer → `sent` | — (a per-address 429 must not reveal the account) |
| `confirmEmail` | `POST /auth/v1/verify` `{type: "email", email, token}` | 2xx → `confirmed` | 4xx → `invalid_code` |
| `checkPassword` | `POST /auth/v1/token?grant_type=password` `{email, password}` | 2xx with `user.id` → `match` | `email_not_confirmed` → `unconfirmed`; 429 → `unavailable`; other 4xx → `invalid` |
| `requestReset` | `POST /auth/v1/recover` `{email}` | any answer → `sent` | — |
| `resetPassword` | `POST /auth/v1/verify` `{type: "recovery", email, token}` then `PUT /auth/v1/user` `{password}` with the returned `access_token` as the bearer | 2xx → `changed` | verify 4xx → `invalid_code`; update 4xx → `rejected` |
| `findAccount` | `GET /rest/v1/profiles?id=eq.<uuid>&select=…` | one row → `found`; none → `missing` | malformed row → `unavailable` |
| `countRegistrationsSince` | `GET /rest/v1/profiles?select=id&created_at=gte.<iso>` with `Prefer: count=exact`, `Range: 0-0` | `Content-Range: …/N` → `counted` | unparseable → `unavailable` |
| `ping` | `GET /rest/v1/profiles?select=id&limit=1` | 2xx → `true` | else `false` |

In every operation a thrown `fetch` (timeout, DNS, reset) and any status ≥ 500 (540 is a paused project) is `unavailable`. These shapes come from Supabase's documentation; Step 7's probe is what proves them against a real project.

- [ ] **Step 1: Write the failing adapter tests**

`packages/server/src/accounts/SupabaseAccountDirectory.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "./AccountDirectory.js";
import { createSupabaseAccountDirectory } from "./SupabaseAccountDirectory.js";

const IP = "203.0.113.9";
const ACCOUNT_ID = "1f3a9c2e-0000-4000-8000-000000000000";

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
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/server test SupabaseAccountDirectory`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the adapter**

`packages/server/src/accounts/SupabaseAccountDirectory.ts`:

```ts
import {
  type AccountDirectory,
  type AccountLookup,
  type AccountRecord,
  type ConfirmOutcome,
  deriveAccountStatus,
  type PasswordCheck,
  type RegistrationCount,
  type ResetOutcome,
  type SendOutcome,
  type SignUpInput,
  type SignUpOutcome,
} from "./AccountDirectory.js";

export interface SupabaseDirectoryOptions {
  /** The project URL, e.g. `https://abcd.supabase.co`. */
  readonly url: string;
  /** A SECRET API key (`sb_secret_…`). Server-side only; it bypasses RLS. */
  readonly secretKey: string;
  readonly timeoutMs: number;
  readonly fetchImpl?: typeof fetch;
}

/** Supabase's OTP type for an emailed sign-up confirmation code. */
const CONFIRM_OTP_TYPE = "email";
const RECOVERY_OTP_TYPE = "recovery";

const UUID_SHAPE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_RANGE_TOTAL = /\/(\d+)$/;
const PROFILE_COLUMNS =
  "id,email,display_name,role,approved,blocked,email_confirmed_at";

type Reply =
  | {
      readonly kind: "ok";
      readonly body: unknown;
      readonly contentRange: string | null;
    }
  | {
      readonly kind: "refused";
      readonly status: number;
      readonly errorCode: string;
    }
  | { readonly kind: "unreachable" };

interface Call {
  readonly method: "GET" | "POST" | "PUT";
  readonly path: string;
  readonly body?: unknown;
  /** Replaces the secret key as the bearer (a user's own session). */
  readonly bearer?: string;
  readonly callerIp?: string;
  readonly headers?: Record<string, string>;
}

const UNREACHABLE: Reply = { kind: "unreachable" };

/**
 * The account directory over Supabase's REST endpoints — Auth for
 * credentials and codes, PostgREST for the `profiles` table — with plain
 * `fetch`. Supabase's own session tokens are used inside one call and
 * dropped; nothing here is ever sent to a browser. A timeout, a network
 * failure or any 5xx (540 is a paused project) is `unavailable`.
 */
export function createSupabaseAccountDirectory(
  options: SupabaseDirectoryOptions,
): AccountDirectory {
  const fetchImpl = options.fetchImpl ?? fetch;
  const base = options.url.replace(/\/+$/, "");

  async function call(request: Call): Promise<Reply> {
    const headers: Record<string, string> = {
      apikey: options.secretKey,
      Authorization: `Bearer ${request.bearer ?? options.secretKey}`,
      ...request.headers,
    };

    if (request.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (request.callerIp !== undefined) {
      headers["Sb-Forwarded-For"] = request.callerIp;
    }

    let response: Response;

    try {
      response = await fetchImpl(`${base}${request.path}`, {
        method: request.method,
        headers,
        body:
          request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: AbortSignal.timeout(options.timeoutMs),
      });
    } catch {
      return UNREACHABLE;
    }

    if (response.status >= 500) {
      return UNREACHABLE;
    }

    const body = await readJson(response);

    if (response.ok) {
      return {
        kind: "ok",
        body,
        contentRange: response.headers.get("content-range"),
      };
    }

    return {
      kind: "refused",
      status: response.status,
      errorCode: readErrorCode(body),
    };
  }

  /** Verifies an emailed code; on success Supabase answers with a session. */
  function verifyCode(
    type: string,
    email: string,
    token: string,
    callerIp: string,
  ): Promise<Reply> {
    return call({
      method: "POST",
      path: "/auth/v1/verify",
      body: { type, email, token },
      callerIp,
    });
  }

  return {
    kind: "supabase",

    async signUp(input: SignUpInput, callerIp: string): Promise<SignUpOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/signup",
        body: {
          email: input.email,
          password: input.password,
          data: { display_name: input.displayName },
        },
        callerIp,
      });

      if (reply.kind === "ok") {
        return "sent";
      }

      if (reply.kind === "unreachable") {
        return "unavailable";
      }

      if (reply.errorCode === "weak_password") {
        return "rejected-password";
      }

      if (reply.errorCode === "email_address_invalid") {
        return "rejected-email";
      }

      return reply.errorCode === "user_already_exists" ||
        reply.errorCode === "email_exists"
        ? "sent"
        : "unavailable";
    },

    async resendCode(email: string, callerIp: string): Promise<SendOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/resend",
        body: { type: "signup", email },
        callerIp,
      });

      return sendOutcomeOf(reply);
    },

    async confirmEmail(
      email: string,
      code: string,
      callerIp: string,
    ): Promise<ConfirmOutcome> {
      const reply = await verifyCode(CONFIRM_OTP_TYPE, email, code, callerIp);

      if (reply.kind === "unreachable") {
        return "unavailable";
      }

      return reply.kind === "ok" ? "confirmed" : "invalid_code";
    },

    async checkPassword(
      email: string,
      password: string,
      callerIp: string,
    ): Promise<PasswordCheck> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/token?grant_type=password",
        body: { email, password },
        callerIp,
      });

      if (reply.kind === "unreachable") {
        return { outcome: "unavailable" };
      }

      if (reply.kind === "refused") {
        if (reply.errorCode === "email_not_confirmed") {
          return { outcome: "unconfirmed" };
        }

        return { outcome: reply.status === 429 ? "unavailable" : "invalid" };
      }

      const accountId = readString(readField(reply.body, "user"), "id");

      return accountId === null
        ? { outcome: "unavailable" }
        : { outcome: "match", accountId };
    },

    async requestReset(email: string, callerIp: string): Promise<SendOutcome> {
      const reply = await call({
        method: "POST",
        path: "/auth/v1/recover",
        body: { email },
        callerIp,
      });

      return sendOutcomeOf(reply);
    },

    async resetPassword(
      email: string,
      code: string,
      password: string,
      callerIp: string,
    ): Promise<ResetOutcome> {
      const verified = await verifyCode(
        RECOVERY_OTP_TYPE,
        email,
        code,
        callerIp,
      );

      if (verified.kind === "unreachable") {
        return "unavailable";
      }

      if (verified.kind === "refused") {
        return "invalid_code";
      }

      const session = readString(verified.body, "access_token");

      if (session === null) {
        return "unavailable";
      }

      const updated = await call({
        method: "PUT",
        path: "/auth/v1/user",
        body: { password },
        bearer: session,
        callerIp,
      });

      if (updated.kind === "unreachable") {
        return "unavailable";
      }

      return updated.kind === "ok" ? "changed" : "rejected";
    },

    async findAccount(accountId: string): Promise<AccountLookup> {
      // The id comes from a token claim and goes into a query string.
      if (!UUID_SHAPE.test(accountId)) {
        return { outcome: "missing" };
      }

      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?id=eq.${accountId}&select=${PROFILE_COLUMNS}`,
      });

      if (reply.kind !== "ok" || !Array.isArray(reply.body)) {
        return { outcome: "unavailable" };
      }

      if (reply.body.length === 0) {
        return { outcome: "missing" };
      }

      const account = toAccountRecord(reply.body[0]);

      return account === null
        ? { outcome: "unavailable" }
        : { outcome: "found", account };
    },

    async countRegistrationsSince(sinceMs: number): Promise<RegistrationCount> {
      const since = encodeURIComponent(new Date(sinceMs).toISOString());
      const reply = await call({
        method: "GET",
        path: `/rest/v1/profiles?select=id&created_at=gte.${since}`,
        headers: { Prefer: "count=exact", Range: "0-0" },
      });

      if (reply.kind !== "ok" || reply.contentRange === null) {
        return { outcome: "unavailable" };
      }

      const total = CONTENT_RANGE_TOTAL.exec(reply.contentRange)?.[1];

      return total === undefined
        ? { outcome: "unavailable" }
        : { outcome: "counted", count: Number(total) };
    },

    async ping(): Promise<boolean> {
      const reply = await call({
        method: "GET",
        path: "/rest/v1/profiles?select=id&limit=1",
      });

      return reply.kind === "ok";
    },
  };
}

/** A code was sent, as far as the caller may know. A REFUSAL (a per-address
 * rate limit, say) must read the same as success, or it would reveal that
 * the address has an account. Only an unreachable store is `unavailable`. */
function sendOutcomeOf(reply: Reply): SendOutcome {
  return reply.kind === "unreachable" ? "unavailable" : "sent";
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readField(value: unknown, field: string): unknown {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  return (value as Record<string, unknown>)[field];
}

function readString(value: unknown, field: string): string | null {
  const found = readField(value, field);

  return typeof found === "string" ? found : null;
}

/** Supabase Auth answers `{error_code}` today; its token endpoint used to
 * answer OAuth-style `{error, error_description}`. Both are read. */
function readErrorCode(body: unknown): string {
  const code = readString(body, "error_code");

  if (code !== null) {
    return code;
  }

  if (readString(body, "error") !== "invalid_grant") {
    return "unknown";
  }

  const description = readString(body, "error_description") ?? "";

  return description.toLowerCase().includes("not confirmed")
    ? "email_not_confirmed"
    : "invalid_credentials";
}

function toAccountRecord(row: unknown): AccountRecord | null {
  const id = readString(row, "id");
  const email = readString(row, "email");
  const displayName = readString(row, "display_name");
  const role = readField(row, "role");
  const approved = readField(row, "approved");
  const blocked = readField(row, "blocked");

  if (
    id === null ||
    email === null ||
    displayName === null ||
    (role !== "user" && role !== "admin") ||
    typeof approved !== "boolean" ||
    typeof blocked !== "boolean"
  ) {
    return null;
  }

  return {
    id,
    email,
    displayName,
    access: role,
    status: deriveAccountStatus({
      confirmed: readString(row, "email_confirmed_at") !== null,
      approved,
      blocked,
    }),
  };
}
```

Run: `pnpm --filter @rtc/server test SupabaseAccountDirectory`
Expected: PASS.

- [ ] **Step 4: Write the failing migration test**

`packages/server/src/accounts/migrations.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// packages/server/src/accounts → the repo root's supabase/migrations.
const MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../../supabase/migrations", import.meta.url),
);

/**
 * The `profiles` table is private to the server by construction: RLS on, no
 * policy, so the anon and authenticated roles can do nothing. A later
 * migration that added a policy, or let sign-up metadata set a privilege,
 * would open it without any server code changing — so the SQL is pinned.
 */
describe("supabase migrations", () => {
  const sql = readAllMigrations();

  it("enables row-level security on profiles", () => {
    expect(sql).toMatch(
      /alter table public\.profiles enable row level security/i,
    );
  });

  it("defines no policy at all", () => {
    expect(sql).not.toMatch(/create\s+policy/i);
  });

  it("revokes table access from the anon and authenticated roles", () => {
    expect(sql).toMatch(
      /revoke all on public\.profiles from anon, authenticated/i,
    );
  });

  it("reads only the display name from sign-up metadata", () => {
    const reads = sql.match(/raw_user_meta_data\s*->>\s*'[^']+'/g) ?? [];

    expect(reads.length).toBeGreaterThan(0);

    for (const read of reads) {
      expect(read).toContain("'display_name'");
    }
  });

  it("pins the search path of every security-definer function", () => {
    const definers = sql.match(/security definer[^;$]*/gi) ?? [];

    expect(definers.length).toBeGreaterThan(0);

    for (const definer of definers) {
      expect(definer).toMatch(/set search_path = ''/i);
    }
  });
});

function readAllMigrations(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => {
      return name.endsWith(".sql");
    })
    .sort()
    .map((name) => {
      return readFileSync(join(MIGRATIONS_DIR, name), "utf8");
    })
    .join("\n");
}
```

Run: `pnpm --filter @rtc/server test migrations`
Expected: FAIL — the directory does not exist.

- [ ] **Step 5: Write the migration, the templates and the README**

`supabase/migrations/20261004000000_create_profiles.sql`:

```sql
-- B2a: account profiles (docs/superpowers/specs/2026-10-04-b2-user-management-design.md §5.1).
--
-- PRIVATE TO THE SERVER. Row-level security is on and NO policy is defined,
-- so the anon and authenticated roles can do nothing here. Only the server's
-- secret key (service_role, which bypasses RLS) reads or writes. No browser
-- ever talks to this project.
--
-- packages/server/src/accounts/migrations.test.ts pins these properties.

create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  email              text not null,
  display_name       text not null,
  role               text not null default 'user' check (role in ('user', 'admin')),
  approved           boolean not null default false,
  blocked            boolean not null default false,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create index profiles_created_at_idx on public.profiles (created_at);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;

-- One profile per sign-up. Reads ONLY display_name from the sign-up
-- metadata: role and approved always start at their defaults, so a sign-up
-- cannot grant itself anything.
create function public.create_profile_for_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, email_confirmed_at)
  values (
    new.id,
    new.email,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), 'Guest'), 40),
    new.email_confirmed_at
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.create_profile_for_user();

-- Mirrors the confirmation timestamp, so the server reads one table.
create function public.sync_profile_confirmation()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles
  set email_confirmed_at = new.email_confirmed_at
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.sync_profile_confirmation();

revoke execute on function public.create_profile_for_user() from public, anon, authenticated;
revoke execute on function public.sync_profile_confirmation() from public, anon, authenticated;
```

`supabase/templates/confirm-signup.html`:

```html
<h2>Confirm your Reactive Trader account</h2>
<p>Enter this code on the sign-in screen:</p>
<p style="font-size: 28px; letter-spacing: 6px; font-family: monospace;">{{ .Token }}</p>
<p>The code expires soon. If you did not create an account, ignore this email.</p>
<p>After you confirm, an administrator approves the account before it can sign in. Demo accounts work in the meantime.</p>
```

`supabase/templates/reset-password.html`:

```html
<h2>Reset your Reactive Trader password</h2>
<p>Enter this code on the reset screen, with your new password:</p>
<p style="font-size: 28px; letter-spacing: 6px; font-family: monospace;">{{ .Token }}</p>
<p>The code expires soon. If you did not ask for a reset, ignore this email; your password is unchanged.</p>
```

`supabase/README.md`:

```markdown
# Supabase — account store

The server's private account store (B2 design:
[`docs/superpowers/specs/2026-10-04-b2-user-management-design.md`](../docs/superpowers/specs/2026-10-04-b2-user-management-design.md)).
Only `@rtc/server` talks to it. No client has its URL or a key.

## One-time setup

1. Create a project in London (`eu-west-2`).
2. Apply `migrations/` in filename order (SQL editor, or `supabase db push`).
3. **Authentication → Emails:** paste `templates/confirm-signup.html` into
   *Confirm signup* and `templates/reset-password.html` into *Reset
   password*. Both print a 6-digit code (`{{ .Token }}`), not a link.
4. **Authentication → Sign In / Providers → Email:** *Confirm email* on;
   minimum password length 12.
5. **Authentication → Emails → SMTP settings:** a custom sender. The built-in
   one allows only a couple of emails an hour.
6. **Authentication → Rate limits:** enable IP address forwarding
   (`Sb-Forwarded-For`), so Supabase limits each visitor, not our server's
   one address.
7. Create a **secret** API key (`sb_secret_…`) and set, on Fly:
   `flyctl secrets set SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SECRET_KEY=sb_secret_…`
8. Run the probe (below) before the first deploy.
9. After your own first sign-up: in the table editor set your `profiles` row
   to `role = 'admin'`, `approved = true`.

## Probing a real project

`pnpm --filter @rtc/server accounts:probe` drives the server's Supabase
adapter against the project named by `SUPABASE_URL` / `SUPABASE_SECRET_KEY`
and prints one line per check. It creates one throwaway account and deletes
it. Run it after setup and whenever Supabase changes its Auth API.

## Approving and blocking

Until the in-app Users panel (B2c): edit `approved` / `blocked` on the
`profiles` row in the table editor. A change takes effect at the account's
next sign-in, and within a minute for an open session's next connect.
```

Run: `pnpm --filter @rtc/server test migrations`
Expected: PASS.

- [ ] **Step 6: Write the probe script**

`packages/server/scripts/probe-accounts.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Live check of `SupabaseAccountDirectory` against a REAL project. The unit
 * tests replay Supabase's documented responses; this proves the real ones
 * still match. It needs SUPABASE_URL and SUPABASE_SECRET_KEY, creates ONE
 * throwaway account through the admin API (so no email is sent and no inbox
 * is needed), walks it through confirm → sign-in → reset, and deletes it.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… pnpm --filter @rtc/server accounts:probe
 *
 * Prints account ids and outcomes only — never a key, a password or a code.
 */
import { createSupabaseAccountDirectory } from "../src/accounts/SupabaseAccountDirectory.ts";

const url = process.env.SUPABASE_URL ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY ?? "";

if (url === "" || secretKey === "") {
  console.error("probe: set SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(2);
}

const PROBE_IP = "203.0.113.1";
const email = `probe-${Date.now()}@rtc-probe.dev`;
const firstPassword = "Probe2026!first";
const secondPassword = "Probe2026!second";
const directory = createSupabaseAccountDirectory({
  url,
  secretKey,
  timeoutMs: 10_000,
});

let failures = 0;

function check(label: string, pass: boolean, detail: string): void {
  if (!pass) {
    failures += 1;
  }

  console.log(`  ${pass ? "✓" : "✗"} ${label} (${detail})`);
}

interface GeneratedLink {
  readonly id: string;
  readonly email_otp: string;
}

/** Admin API: creates (or re-issues for) a user and returns the emailed
 * code WITHOUT sending an email. */
async function generateCode(
  type: "signup" | "recovery",
): Promise<GeneratedLink> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/auth/v1/admin/generate_link`,
    {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type,
        email,
        password: firstPassword,
        data: { display_name: "Probe Account" },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`generate_link ${type} answered ${response.status}`);
  }

  return (await response.json()) as GeneratedLink;
}

async function deleteAccount(accountId: string): Promise<number> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/auth/v1/admin/users/${accountId}`,
    {
      method: "DELETE",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
    },
  );

  return response.status;
}

console.log("accounts probe: starting");
check("ping", await directory.ping(), "profiles table reachable");

const signup = await generateCode("signup");

try {
  const before = await directory.checkPassword(email, firstPassword, PROBE_IP);
  check(
    "sign-in before confirming",
    before.outcome === "unconfirmed",
    before.outcome,
  );

  const wrong = await directory.confirmEmail(email, "000000", PROBE_IP);
  check("a wrong code", wrong === "invalid_code", wrong);

  const confirmed = await directory.confirmEmail(
    email,
    signup.email_otp,
    PROBE_IP,
  );
  check("the right code", confirmed === "confirmed", confirmed);

  const after = await directory.checkPassword(email, firstPassword, PROBE_IP);
  check("sign-in after confirming", after.outcome === "match", after.outcome);

  const bad = await directory.checkPassword(email, "Wrong2026!pass", PROBE_IP);
  check("a wrong password", bad.outcome === "invalid", bad.outcome);

  const found = await directory.findAccount(signup.id);
  check(
    "the profile row",
    found.outcome === "found" &&
      found.account.status === "pending" &&
      found.account.access === "user" &&
      found.account.displayName === "Probe Account",
    found.outcome === "found"
      ? `${found.account.status}/${found.account.access}`
      : found.outcome,
  );

  const counted = await directory.countRegistrationsSince(
    Date.now() - 60 * 60 * 1_000,
  );
  check(
    "registration count",
    counted.outcome === "counted" && counted.count >= 1,
    counted.outcome === "counted" ? String(counted.count) : counted.outcome,
  );

  const recovery = await generateCode("recovery");
  const reset = await directory.resetPassword(
    email,
    recovery.email_otp,
    secondPassword,
    PROBE_IP,
  );
  check("password reset", reset === "changed", reset);

  const relogin = await directory.checkPassword(
    email,
    secondPassword,
    PROBE_IP,
  );
  check(
    "sign-in with the new password",
    relogin.outcome === "match",
    relogin.outcome,
  );
} finally {
  const status = await deleteAccount(signup.id);
  check("cleanup", status === 200, `delete answered ${status}`);
}

console.log(
  failures === 0
    ? "accounts probe: PASS"
    : `accounts probe: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
```

In `packages/server/package.json` `scripts`, add after `"dev"`:

```json
    "accounts:probe": "tsx scripts/probe-accounts.ts",
```

Run: `pnpm --filter @rtc/server accounts:probe`
Expected: exit 2 with `probe: set SUPABASE_URL and SUPABASE_SECRET_KEY` (no project is configured here; the real run is a rollout step in Task 11's hand-off).

In `knip.json`, the `packages/server` workspace: add the script as an entry, the way `packages/client-react-native` lists `scripts/liveWsSmoke.ts`:

```json
    "packages/server": {
      "entry": ["src/index.ts", "scripts/probe-accounts.ts"],
      "project": "src/**/*.ts"
    },
```

Run: `pnpm lint:dead`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/server supabase
git commit -m "feat(server): the Supabase account directory, its migration and a live probe"
```

---

### Task 7: The account endpoints and the `@` branch of `/login`

**Files:**
- Create: `packages/server/src/http/jsonResult.ts`
- Create: `packages/server/src/http/accountHandlers.ts`, `accountHandlers.test.ts`
- Modify: `packages/server/src/http/loginHandler.ts`, `loginHandler.test.ts`
- Modify: `packages/server/src/auth/banList.ts` (two strike reasons)
- Modify: `packages/server/src/config/limits.ts`

**Interfaces:**
- Consumes: `AccountService` (Task 5), `sessionUserFor` (Task 5), `AuthService.issueAccountSession` (Task 3), the DTO guards (Task 2).
- Produces: `HttpResult {status: number; body: string; headers?: Record<string, string>}`, `jsonResult(status, body, extraHeaders?)`; `AccountRateLimits`, `AccountHandlerDeps`; the five handlers, each `(bodyText: string, ip: string, deps: AccountHandlerDeps) => Promise<HttpResult>`: `registerAccount`, `resendConfirmationCode`, `confirmEmailAddress`, `requestPasswordReset`, `resetAccountPassword`; `LoginHandlerDeps` gains `readonly accounts: AccountService`.

- [ ] **Step 1: Add the limits and the strike reasons**

Append to `packages/server/src/config/limits.ts`:

```ts
/** B2 — body cap for the account endpoints, by bytes RECEIVED. */
export const ACCOUNT_MAX_BODY_BYTES = 4 * 1024;

/** B2 — `/register` per IP. A person registers once. */
export const REGISTER_RATE_LIMIT_MAX = 5;
export const REGISTER_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/** B2 — `/resend-code` and `/request-reset` per IP, each. Each sends an email. */
export const SEND_CODE_RATE_LIMIT_MAX = 5;
export const SEND_CODE_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/** B2 — `/confirm-email` and `/reset-password` per IP, each. Bounds guessing
 * a 6-digit code; Supabase also expires and rate-limits codes. */
export const CODE_ENTRY_RATE_LIMIT_MAX = 10;
export const CODE_ENTRY_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

/** B2 — registrations per day across the whole service: a fuse against a
 * scripted flood. Counted in the account store, so a restart keeps it. */
export const MAX_REGISTRATIONS_PER_DAY = 200;

/** B2 — one account-store call. A slow Supabase must not hold a request. */
export const ACCOUNT_DIRECTORY_TIMEOUT_MS = 5_000;

/** B2 — how long the upgrade trusts a cached account status, and how many
 * accounts the cache holds. A dashboard block lands within this window. */
export const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;
export const ACCOUNT_STATUS_CACHE_MAX_ENTRIES = 1_000;

/** B2 — `/health/accounts` re-reads the store at most this often. */
export const ACCOUNTS_HEALTH_CACHE_MS = 60_000;
```

In `banList.ts`, extend the union and the weights:

```ts
export type StrikeReason =
  | "login-failed"
  | "login-rate-limited"
  | "account-rate-limited"
  | "code-failed"
  | "frame-too-large"
  | "message-flood";

export const STRIKE_WEIGHT: Readonly<Record<StrikeReason, number>> = {
  "login-failed": 1,
  "login-rate-limited": 2,
  "account-rate-limited": 2,
  "code-failed": 1,
  "frame-too-large": 3,
  "message-flood": 3,
};
```

- [ ] **Step 2: Extract `jsonResult`**

`packages/server/src/http/jsonResult.ts`:

```ts
export interface HttpResult {
  readonly status: number;
  readonly body: string;
  readonly headers?: Record<string, string>;
}

const JSON_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json",
};

export function jsonResult(
  status: number,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): HttpResult {
  return {
    status,
    body: JSON.stringify(body),
    headers: { ...JSON_CORS_HEADERS, ...extraHeaders },
  };
}
```

In `loginHandler.ts`: delete `JSON_CORS_HEADERS`, the `LoginHandlerResult` interface and the private `jsonResult` at the bottom; import `{ type HttpResult, jsonResult } from "./jsonResult.js"`; change `authenticateLoginRequest`'s return type to `Promise<HttpResult>`.

Run: `pnpm --filter @rtc/server test loginHandler`
Expected: PASS (behaviour unchanged). If `LoginHandlerResult` is imported elsewhere (`grep -rn LoginHandlerResult packages/server/src`), switch those imports to `HttpResult`.

- [ ] **Step 3: Write the failing handler tests**

`packages/server/src/http/accountHandlers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createAccountService } from "#/accounts/AccountService";
import { DEV_ACCOUNT_SEEDS } from "#/accounts/devAccounts";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";
import {
  createInMemoryAccountDirectory,
  DEV_CONFIRMATION_CODE,
} from "#/accounts/InMemoryAccountDirectory";
import { type BanList, createBanList } from "#/auth/banList";
import { createRateLimiter, type RateLimiter } from "#/auth/rateLimit";

import {
  type AccountHandlerDeps,
  confirmEmailAddress,
  registerAccount,
  requestPasswordReset,
  resendConfirmationCode,
  resetAccountPassword,
} from "./accountHandlers.js";

const IP = "1.2.3.4";
const PASSWORD = "Mcdc2026!desk";

describe("registerAccount", () => {
  it("answers 202 code_sent for a valid registration", async () => {
    const result = await registerAccount(createRegisterBody(), IP, createDeps());

    expect(result.status).toBe(202);
    expect(JSON.parse(result.body)).toEqual({ status: "code_sent" });
    expect(result.headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("answers identically for an address that already has an account", async () => {
    const deps = createDeps();
    const fresh = await registerAccount(createRegisterBody(), IP, deps);
    const existing = await registerAccount(
      createRegisterBody({ email: "trader@rtc.test" }),
      IP,
      deps,
    );

    expect(existing.status).toBe(fresh.status);
    expect(existing.body).toBe(fresh.body);
  });

  it("answers 400 with the broken rule", async () => {
    const result = await registerAccount(
      createRegisterBody({ password: "short" }),
      IP,
      createDeps(),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "min-length",
    });
  });

  it("answers 400 for malformed JSON and for a wrong shape", async () => {
    const deps = createDeps();

    expect((await registerAccount("{nope", IP, deps)).status).toBe(400);
    expect(
      JSON.parse(
        (await registerAccount(JSON.stringify({ email: "a@b.io" }), IP, deps))
          .body,
      ),
    ).toEqual({ error: "invalid_request" });
  });

  it("answers 403 when registration is closed", async () => {
    const result = await registerAccount(
      createRegisterBody(),
      IP,
      createDeps({ registrationOpen: false }),
    );

    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error: "registration_closed" });
  });

  it("answers 503 when the directory is unavailable", async () => {
    const result = await registerAccount(
      createRegisterBody(),
      IP,
      createDeps({ directory: createDisabledAccountDirectory() }),
    );

    expect(result.status).toBe(503);
    expect(JSON.parse(result.body)).toEqual({ error: "unavailable" });
  });

  it("a banned caller is answered before the body is parsed or the service asked", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    banList.strike(IP, "login-failed", 500);
    const deps = createDeps({ banList });
    const register = vi.spyOn(deps.accounts, "register");

    const result = await registerAccount("{nope", IP, deps);

    expect(result.status).toBe(429);
    expect(JSON.parse(result.body)).toEqual({ error: "banned" });
    expect(result.headers?.["Retry-After"]).toBe("30");
    expect(register).not.toHaveBeenCalled();
  });

  it("past the rate limit it answers 429 and strikes the caller", async () => {
    const banList = createBanList({
      strikesToBan: 2,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps({ banList, limiter: createRateLimiter(1, 60_000) });

    expect((await registerAccount(createRegisterBody(), IP, deps)).status).toBe(
      202,
    );

    const limited = await registerAccount(createRegisterBody(), IP, deps);

    expect(limited.status).toBe(429);
    expect(JSON.parse(limited.body)).toEqual({ error: "rate_limited" });
    // One rate-limit hit weighs 2 = the threshold.
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

describe("confirmEmailAddress", () => {
  it("answers 200 pending_approval for the right code", async () => {
    const deps = createDeps();
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(
      JSON.stringify({ email: "ann@desk.io", code: DEV_CONFIRMATION_CODE }),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "pending_approval" });
  });

  it("a wrong code is 400 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps({ banList });
    await registerAccount(createRegisterBody(), IP, deps);

    const result = await confirmEmailAddress(
      JSON.stringify({ email: "ann@desk.io", code: "111111" }),
      IP,
      deps,
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_code" });
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

describe("resendConfirmationCode and requestPasswordReset", () => {
  it("answer 202 whether or not the address has an account", async () => {
    const deps = createDeps();
    const body = JSON.stringify({ email: "nobody@desk.io" });

    expect((await resendConfirmationCode(body, IP, deps)).status).toBe(202);
    expect((await requestPasswordReset(body, IP, deps)).status).toBe(202);
  });

  it("answer 400 for a malformed address", async () => {
    const deps = createDeps();
    const body = JSON.stringify({ email: "nope" });

    expect((await resendConfirmationCode(body, IP, deps)).status).toBe(400);
    expect((await requestPasswordReset(body, IP, deps)).status).toBe(400);
  });
});

describe("resetAccountPassword", () => {
  it("answers 200 password_changed after a requested reset", async () => {
    const deps = createDeps();
    await requestPasswordReset(
      JSON.stringify({ email: "trader@rtc.test" }),
      IP,
      deps,
    );

    const result = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      deps,
    );

    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: "password_changed" });
  });

  it("a weak new password is 400 with its rule, and no strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const result = await resetAccountPassword(
      createResetBody("weak"),
      IP,
      createDeps({ banList }),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({
      error: "invalid_request",
      rule: "min-length",
    });
    expect(banList.isBanned(IP, 1_000)).toBe(false);
  });

  it("a wrong code is 400 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const result = await resetAccountPassword(
      createResetBody("Fresh2026!pass"),
      IP,
      createDeps({ banList }),
    );

    expect(result.status).toBe(400);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_code" });
    expect(banList.isBanned(IP, 1_000)).toBe(true);
  });
});

interface DepsOverrides {
  readonly directory?: AccountDirectory;
  readonly banList?: BanList;
  readonly limiter?: RateLimiter;
  readonly registrationOpen?: boolean;
}

/** Permissive defaults: generous limiters and a ban list no test reaches. */
function createDeps(overrides: DepsOverrides = {}): AccountHandlerDeps {
  const now = (): number => {
    return 2 * 24 * 60 * 60 * 1_000;
  };
  const limiter = overrides.limiter ?? createRateLimiter(100, 60_000);

  return {
    accounts: createAccountService({
      directory:
        overrides.directory ??
        createInMemoryAccountDirectory({ now, seeds: DEV_ACCOUNT_SEEDS }),
      now,
      registrationOpen: overrides.registrationOpen ?? true,
      maxRegistrationsPerDay: 100,
    }),
    banList:
      overrides.banList ??
      createBanList({
        strikesToBan: 100,
        strikeWindowMs: 60_000,
        banMs: 60_000,
        maxEntries: 10,
      }),
    limits: {
      register: limiter,
      resendCode: limiter,
      confirmEmail: limiter,
      requestReset: limiter,
      resetPassword: limiter,
    },
    now: (): number => {
      return 1_000;
    },
  };
}

interface RegisterOverrides {
  readonly email?: string;
  readonly password?: string;
}

function createRegisterBody(overrides: RegisterOverrides = {}): string {
  return JSON.stringify({
    email: overrides.email ?? "ann@desk.io",
    displayName: "Ann Lee",
    password: overrides.password ?? PASSWORD,
  });
}

function createResetBody(password: string): string {
  return JSON.stringify({
    email: "trader@rtc.test",
    code: DEV_CONFIRMATION_CODE,
    password,
  });
}
```

In `loginHandler.test.ts`: add `accounts` to `createDeps` and add the account-login cases. Change the factory section:

```ts
interface DepsOverrides {
  readonly rateLimit?: RateLimiter;
  readonly banList?: BanList;
  readonly now?: () => number;
  readonly accounts?: AccountService;
}

function createAccounts(): AccountService {
  const now = (): number => {
    return 2 * 24 * 60 * 60 * 1_000;
  };

  return createAccountService({
    directory: createInMemoryAccountDirectory({ now, seeds: DEV_ACCOUNT_SEEDS }),
    now,
    registrationOpen: true,
    maxRegistrationsPerDay: 100,
  });
}
```

and in `createDeps`'s returned object add `accounts: overrides.accounts ?? createAccounts(),`. Add the imports (`AccountService`, `createAccountService` from `#/accounts/AccountService`; `DEV_ACCOUNT_PASSWORD`, `DEV_ACCOUNT_SEEDS` from `#/accounts/devAccounts`; `createInMemoryAccountDirectory` from `#/accounts/InMemoryAccountDirectory`; `createDisabledAccountDirectory` from `#/accounts/DisabledAccountDirectory`). Add this block inside `describe("authenticateLoginRequest", …)`:

```ts
  it("signs a registered, active account in with its derived profile and claims", async () => {
    const auth = createAuth(createClock(1_000));
    const deps = createDeps(auth);

    const result = await authenticateLoginRequest(
      createLoginBody("admin@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );
    const parsed = JSON.parse(result.body) as LoginResponseDto;

    expect(result.status).toBe(200);
    expect(parsed.user.name).toBe("Desk Admin");
    expect(parsed.user.email).toBe("admin@rtc.test");
    expect(parsed.exp).toBe(1_000 + TTL_MS);
    expect(auth.verifyToken(parsed.token)).toEqual({
      username: "admin@rtc.test",
      accountId: "00000000-0000-4000-8000-000000000001",
      access: "admin",
    });
  });

  it.each([
    ["pending@rtc.test", "pending_approval"],
    ["blocked@rtc.test", "blocked"],
  ])("refuses %s with 403 %s and no strike", async (email, error) => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps(createAuth(createClock(1_000)), { banList });

    const result = await authenticateLoginRequest(
      createLoginBody(email, DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(403);
    expect(JSON.parse(result.body)).toEqual({ error });
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(false);
  });

  it("a wrong password for a registered address is 401 and a strike", async () => {
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    const deps = createDeps(createAuth(createClock(1_000)), { banList });

    const result = await authenticateLoginRequest(
      createLoginBody("blocked@rtc.test", "Wrong2026!pass"),
      "1.2.3.4",
      deps,
    );

    expect(result.status).toBe(401);
    expect(JSON.parse(result.body)).toEqual({ error: "invalid_credentials" });
    expect(banList.isBanned("1.2.3.4", 1_000)).toBe(true);
  });

  it("answers 503 for a registered address when the directory is unavailable, and still serves the roster", async () => {
    const deps = createDeps(createAuth(createClock(1_000)), {
      accounts: createAccountService({
        directory: createDisabledAccountDirectory(),
        now: createClock(1_000),
        registrationOpen: true,
        maxRegistrationsPerDay: 100,
      }),
    });

    const account = await authenticateLoginRequest(
      createLoginBody("trader@rtc.test", DEV_ACCOUNT_PASSWORD),
      "1.2.3.4",
      deps,
    );
    const roster = await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(account.status).toBe(503);
    expect(JSON.parse(account.body)).toEqual({ error: "unavailable" });
    expect(roster.status).toBe(200);
  });

  it("never sends a roster username to the account service", async () => {
    const deps = createDeps(createAuth(createClock(1_000)));
    const login = vi.spyOn(deps.accounts, "login");

    await authenticateLoginRequest(
      createLoginBody("demo", "localpass"),
      "1.2.3.4",
      deps,
    );

    expect(login).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run and see them fail**

Run: `pnpm --filter @rtc/server test accountHandlers loginHandler`
Expected: FAIL — `accountHandlers.js` not found; `accounts` is not a known property of `LoginHandlerDeps`.

- [ ] **Step 5: Implement**

`packages/server/src/http/accountHandlers.ts`:

```ts
import {
  type AccountErrorDto,
  type AccountFlowResponseDto,
  type AccountFlowStatus,
  isConfirmEmailRequestDto,
  isEmailRequestDto,
  isRegisterRequestDto,
  isResetPasswordRequestDto,
} from "@rtc/shared";

import type { AccountService } from "../accounts/AccountService.js";
import type { BanList } from "../auth/banList.js";
import type { RateLimiter } from "../auth/rateLimit.js";
import { type HttpResult, jsonResult } from "./jsonResult.js";

export interface AccountRateLimits {
  readonly register: RateLimiter;
  readonly resendCode: RateLimiter;
  readonly confirmEmail: RateLimiter;
  readonly requestReset: RateLimiter;
  readonly resetPassword: RateLimiter;
}

export interface AccountHandlerDeps {
  readonly accounts: AccountService;
  readonly banList: BanList;
  readonly limits: AccountRateLimits;
  readonly now: () => number;
}

/** `POST /register`. Answers `code_sent` for a new AND an existing address,
 * so it never reveals who is registered. */
export async function registerAccount(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.register,
    isRegisterRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const result = await deps.accounts.register(admitted.dto, ip);

  if (result.outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: result.rule });
  }

  if (result.outcome === "closed") {
    return errorResult(403, { error: "registration_closed" });
  }

  return result.outcome === "code_sent"
    ? flowResult(202, "code_sent")
    : errorResult(503, { error: "unavailable" });
}

/** `POST /resend-code`. */
export async function resendConfirmationCode(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.resendCode,
    isEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  return sendCodeResult(await deps.accounts.resendCode(admitted.dto.email, ip));
}

/** `POST /confirm-email`. A wrong code is a ban strike. */
export async function confirmEmailAddress(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.confirmEmail,
    isConfirmEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const outcome = await deps.accounts.confirmEmail(
    admitted.dto.email,
    admitted.dto.code,
    ip,
  );

  if (outcome === "invalid_code") {
    return refuseCode(ip, deps);
  }

  return outcome === "confirmed"
    ? flowResult(200, "pending_approval")
    : errorResult(503, { error: "unavailable" });
}

/** `POST /request-reset`. */
export async function requestPasswordReset(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.requestReset,
    isEmailRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  return sendCodeResult(
    await deps.accounts.requestReset(admitted.dto.email, ip),
  );
}

/** `POST /reset-password`. A wrong code is a ban strike; a weak password is not. */
export async function resetAccountPassword(
  bodyText: string,
  ip: string,
  deps: AccountHandlerDeps,
): Promise<HttpResult> {
  const admitted = admit(
    bodyText,
    ip,
    deps.limits.resetPassword,
    isResetPasswordRequestDto,
    deps,
  );

  if (!admitted.ok) {
    return admitted.result;
  }

  const result = await deps.accounts.resetPassword(admitted.dto, ip);

  if (result.outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: result.rule });
  }

  if (result.outcome === "invalid_code") {
    return refuseCode(ip, deps);
  }

  return result.outcome === "changed"
    ? flowResult(200, "password_changed")
    : errorResult(503, { error: "unavailable" });
}

type Admission<T> =
  | { readonly ok: true; readonly dto: T }
  | { readonly ok: false; readonly result: HttpResult };

/**
 * The checks every account endpoint shares, cheapest first: the ban list (a
 * Map lookup — a banned caller never reaches JSON parsing), the per-IP rate
 * limit (a hit is a strike), then the JSON and its shape.
 */
function admit<T>(
  bodyText: string,
  ip: string,
  limiter: RateLimiter,
  isDto: (value: unknown) => value is T,
  deps: AccountHandlerDeps,
): Admission<T> {
  const now = deps.now();
  const bannedUntil = deps.banList.bannedUntil(ip, now);

  if (bannedUntil !== null) {
    return {
      ok: false,
      result: jsonResult(
        429,
        { error: "banned" },
        { "Retry-After": String(Math.ceil((bannedUntil - now) / 1_000)) },
      ),
    };
  }

  if (!limiter.hit(ip, now)) {
    deps.banList.strike(ip, "account-rate-limited", now);

    return { ok: false, result: errorResult(429, { error: "rate_limited" }) };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { ok: false, result: errorResult(400, { error: "malformed_json" }) };
  }

  if (!isDto(parsed)) {
    return {
      ok: false,
      result: errorResult(400, { error: "invalid_request" }),
    };
  }

  return { ok: true, dto: parsed };
}

function refuseCode(ip: string, deps: AccountHandlerDeps): HttpResult {
  deps.banList.strike(ip, "code-failed", deps.now());

  return errorResult(400, { error: "invalid_code" });
}

function sendCodeResult(
  outcome: "code_sent" | "invalid" | "unavailable",
): HttpResult {
  if (outcome === "invalid") {
    return errorResult(400, { error: "invalid_request", rule: "email" });
  }

  return outcome === "code_sent"
    ? flowResult(202, "code_sent")
    : errorResult(503, { error: "unavailable" });
}

function flowResult(status: number, flow: AccountFlowStatus): HttpResult {
  const body: AccountFlowResponseDto = { status: flow };

  return jsonResult(status, body);
}

function errorResult(status: number, body: AccountErrorDto): HttpResult {
  return jsonResult(status, body);
}
```

In `loginHandler.ts`, add to the imports:

```ts
import type { AccountErrorDto } from "@rtc/shared";

import type { AccountService } from "../accounts/AccountService.js";
import { sessionUserFor } from "../accounts/sessionUserFor.js";
```

add `readonly accounts: AccountService;` to `LoginHandlerDeps`, update the doc comment's last sentence to "…then `AuthService.login` for a roster username, or `AccountService.login` for an email address.", and replace the tail of `authenticateLoginRequest` from `const result = await deps.auth.login(…)` to the end of the function with:

```ts
  // An email address is a registered account; anything else is the roster.
  // The demo usernames contain no `@`, so the two can never collide.
  if (parsed.username.includes("@")) {
    return answerAccountLogin(parsed, ip, now, deps);
  }

  const result = await deps.auth.login(parsed.username, parsed.password);

  if (result === null) {
    deps.banList.strike(ip, "login-failed", now);

    return jsonResult(401, { error: "invalid_credentials" });
  }

  const response: LoginResponseDto = {
    token: result.token,
    user: result.user,
    exp: now + deps.auth.ttlMs,
  };

  return jsonResult(200, response);
}
```

and add below the exported functions:

```ts
const ACCOUNT_REFUSALS: Readonly<
  Record<"unconfirmed" | "pending" | "blocked", AccountErrorDto>
> = {
  unconfirmed: { error: "unconfirmed" },
  pending: { error: "pending_approval" },
  blocked: { error: "blocked" },
};

/** The registered-account leg of `/login` (spec §5.4). Only a wrong
 * password is a strike: `unconfirmed`, `pending` and `blocked` are told to
 * someone who proved they own the account. */
async function answerAccountLogin(
  request: LoginRequestDto,
  ip: string,
  now: number,
  deps: LoginHandlerDeps,
): Promise<HttpResult> {
  const decision = await deps.accounts.login(
    request.username,
    request.password,
    ip,
  );

  if (decision.outcome === "invalid") {
    deps.banList.strike(ip, "login-failed", now);

    return jsonResult(401, { error: "invalid_credentials" });
  }

  if (decision.outcome === "unavailable") {
    return jsonResult(503, { error: "unavailable" });
  }

  if (decision.outcome !== "ok") {
    return jsonResult(403, ACCOUNT_REFUSALS[decision.outcome]);
  }

  const response: LoginResponseDto = {
    token: deps.auth.issueAccountSession(decision.account.email, {
      accountId: decision.account.id,
      access: decision.account.access,
    }),
    user: sessionUserFor(decision.account),
    exp: now + deps.auth.ttlMs,
  };

  return jsonResult(200, response);
}
```

(`LoginRequestDto` joins the existing `@rtc/shared` type import.)

- [ ] **Step 6: Run and see them pass**

Run: `pnpm --filter @rtc/server test accountHandlers loginHandler banList`
Expected: PASS. `pnpm --filter @rtc/server typecheck` will fail in `index.ts` (it does not pass `accounts` yet) — that is Task 9; note it and continue.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): account endpoints and the registered-account leg of /login"
```

---

### Task 8: The status cache and the upgrade re-check

**Files:**
- Create: `packages/server/src/accounts/accountStatusCache.ts`, `accountStatusCache.test.ts`
- Modify: `packages/server/src/http/loginHandler.ts` (`describeUpgrade` returns the verified token; two new rejection reasons)
- Modify: `packages/server/src/http/upgradeGate.ts`, `upgradeGate.test.ts`

**Interfaces:**
- Consumes: `AccountDirectory.findAccount` (Task 4), `VerifiedToken` (Task 3).
- Produces: `CachedStatus = AccountStatus | "missing" | "unavailable"`; `AccountStatusCache {statusOf(accountId: string): Promise<CachedStatus>}`; `createAccountStatusCache(options: {directory: Pick<AccountDirectory, "findAccount">; ttlMs: number; maxEntries: number; now: () => number})`; `decideUpgrade(url, ip, deps): Promise<UpgradeVerdict>` with `UpgradeGateDeps.accountStatus: AccountStatusCache`; `UpgradeVerdict.status: 200 | 401 | 403 | 429 | 503`; `UpgradeRejection` gains `"account-not-active"` and `"accounts-unavailable"`.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/accounts/accountStatusCache.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AccountLookup, AccountStatus } from "./AccountDirectory.js";
import { createAccountStatusCache } from "./accountStatusCache.js";

describe("accountStatusCache", () => {
  it("asks the directory once within the TTL and again after it", async () => {
    const lookups = createLookups(["active", "blocked"]);
    let now = 1_000;
    const cache = createAccountStatusCache({
      directory: lookups,
      ttlMs: 60_000,
      maxEntries: 10,
      now: (): number => {
        return now;
      },
    });

    expect(await cache.statusOf("acc-1")).toBe("active");
    now = 60_999;
    expect(await cache.statusOf("acc-1")).toBe("active");
    expect(lookups.calls).toBe(1);

    now = 61_000;
    expect(await cache.statusOf("acc-1")).toBe("blocked");
    expect(lookups.calls).toBe(2);
  });

  it("caches a missing account as missing", async () => {
    const lookups = createLookups(["missing"]);
    const cache = createCache(lookups);

    expect(await cache.statusOf("acc-1")).toBe("missing");
    expect(await cache.statusOf("acc-1")).toBe("missing");
    expect(lookups.calls).toBe(1);
  });

  it("never caches unavailable — the next call asks again (Review Focus 5)", async () => {
    const lookups = createLookups(["unavailable", "active"]);
    const cache = createCache(lookups);

    expect(await cache.statusOf("acc-1")).toBe("unavailable");
    expect(await cache.statusOf("acc-1")).toBe("active");
    expect(lookups.calls).toBe(2);
  });

  it("holds at most maxEntries, dropping the oldest", async () => {
    const lookups = createLookups(["active", "active", "active", "blocked"]);
    const cache = createAccountStatusCache({
      directory: lookups,
      ttlMs: 60_000,
      maxEntries: 2,
      now: (): number => {
        return 1_000;
      },
    });

    await cache.statusOf("acc-1");
    await cache.statusOf("acc-2");
    await cache.statusOf("acc-3");

    // acc-1 was evicted, so it is looked up again.
    expect(await cache.statusOf("acc-1")).toBe("blocked");
    expect(lookups.calls).toBe(4);
  });
});

type Scripted = AccountStatus | "missing" | "unavailable";

interface ScriptedLookups {
  calls: number;
  findAccount(accountId: string): Promise<AccountLookup>;
}

/** Answers each lookup with the next scripted status, counting calls. */
function createLookups(script: readonly Scripted[]): ScriptedLookups {
  const lookups: ScriptedLookups = {
    calls: 0,
    findAccount(accountId: string): Promise<AccountLookup> {
      const next = script[lookups.calls] ?? "unavailable";
      lookups.calls += 1;

      if (next === "missing" || next === "unavailable") {
        return Promise.resolve({ outcome: next });
      }

      return Promise.resolve({
        outcome: "found",
        account: {
          id: accountId,
          email: "ann@desk.io",
          displayName: "Ann Lee",
          access: "user",
          status: next,
        },
      });
    },
  };

  return lookups;
}

function createCache(
  lookups: ScriptedLookups,
): ReturnType<typeof createAccountStatusCache> {
  return createAccountStatusCache({
    directory: lookups,
    ttlMs: 60_000,
    maxEntries: 10,
    now: (): number => {
      return 1_000;
    },
  });
}
```

Replace `packages/server/src/http/upgradeGate.test.ts`'s cases and factories with (keep its imports, adding `type CachedStatus` from `#/accounts/accountStatusCache`):

```ts
describe("decideUpgrade", () => {
  it("accepts a valid roster token without asking for an account status", async () => {
    const deps = createDeps();

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: true, status: 200 });
    expect(deps.asked).toEqual([]);
  });

  it("rejects a banned IP with 429 before looking at the token (Review Focus 4)", async () => {
    const deps = createDeps();
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    deps.banList.strike("1.2.3.4", "message-flood", 0);
    const verify = vi.spyOn(deps.auth, "verifyToken");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: false, status: 429, reason: "banned" });
    expect(verify).not.toHaveBeenCalled();
  });

  it("rejects with 503 when the connection caps are hit, naming which", async () => {
    const perIp = createDeps({ maxPerIp: 1 });
    perIp.connections.acquire("1.2.3.4");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", perIp),
    ).toEqual({ ok: false, status: 503, reason: "too-many-from-ip" });

    const total = createDeps({ maxTotal: 1 });
    total.connections.acquire("9.9.9.9");

    expect(
      await decideUpgrade(`/?access=${createToken()}`, "1.2.3.4", total),
    ).toEqual({ ok: false, status: 503, reason: "too-many-connections" });
  });

  it("rejects a missing or bad token with 401 and the existing reasons", async () => {
    const deps = createDeps();

    expect(await decideUpgrade("/", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-token",
    });
    expect(await decideUpgrade("/?access=nope", "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "invalid-token",
    });
    expect(await decideUpgrade(undefined, "1.2.3.4", deps)).toEqual({
      ok: false,
      status: 401,
      reason: "no-url",
    });
  });

  it("accepts a registered account's token only while the account is active", async () => {
    const deps = createDeps({ status: "active" });

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: true, status: 200 });
    expect(deps.asked).toEqual(["acc-1"]);
  });

  it.each(["blocked", "pending", "unconfirmed", "missing"] as const)(
    "rejects a still-valid token of a %s account with 403",
    async (status) => {
      const deps = createDeps({ status });

      expect(
        await decideUpgrade(
          `/?access=${createAccountToken()}`,
          "1.2.3.4",
          deps,
        ),
      ).toEqual({ ok: false, status: 403, reason: "account-not-active" });
    },
  );

  it("fails closed with 503 when the account store is unavailable", async () => {
    const deps = createDeps({ status: "unavailable" });

    expect(
      await decideUpgrade(`/?access=${createAccountToken()}`, "1.2.3.4", deps),
    ).toEqual({ ok: false, status: 503, reason: "accounts-unavailable" });
  });

  it("re-checks the caps after the awaited status, so concurrent upgrades cannot overshoot", async () => {
    const deps = createDeps({ status: "active", maxPerIp: 1 });
    const pending = decideUpgrade(
      `/?access=${createAccountToken()}`,
      "1.2.3.4",
      deps,
    );

    // Another upgrade from the same IP completes while the status is awaited.
    deps.connections.acquire("1.2.3.4");

    expect(await pending).toEqual({
      ok: false,
      status: 503,
      reason: "too-many-from-ip",
    });
  });
});

const SECRET = "s";
const NOW = 1_000;

interface GateOverrides {
  readonly maxPerIp?: number;
  readonly maxTotal?: number;
  readonly status?: CachedStatus;
}

interface GateFixture extends UpgradeGateDeps {
  /** The account ids the gate asked a status for, in order. */
  readonly asked: string[];
}

function createDeps(overrides: GateOverrides = {}): GateFixture {
  const asked: string[] = [];

  return {
    asked,
    auth: new AuthService({
      secret: SECRET,
      ttlMs: 60_000,
      credentials: parseAuthUsers("demo:pw"),
      now: (): number => {
        return NOW;
      },
    }),
    banList: createBanList({
      strikesToBan: 5,
      strikeWindowMs: 60_000,
      banMs: 60_000,
      maxEntries: 10,
    }),
    connections: createConnectionGuard({
      maxTotal: overrides.maxTotal ?? 10,
      maxPerIp: overrides.maxPerIp ?? 10,
    }),
    accountStatus: {
      statusOf: (accountId: string): Promise<CachedStatus> => {
        asked.push(accountId);

        return Promise.resolve(overrides.status ?? "active");
      },
    },
    now: (): number => {
      return NOW;
    },
  };
}

/** A token signed the way a successful roster login would sign it. */
function createToken(): string {
  return signToken("demo", SECRET, 60_000, NOW);
}

/** A token signed the way a successful registered-account login would. */
function createAccountToken(): string {
  return signToken("ann@desk.io", SECRET, 60_000, NOW, {
    accountId: "acc-1",
    access: "user",
  });
}
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/server test accountStatusCache upgradeGate`
Expected: FAIL — cache module not found; `accountStatus` is not in `UpgradeGateDeps`; the verdicts are not promises.

- [ ] **Step 3: Implement**

`packages/server/src/accounts/accountStatusCache.ts`:

```ts
import type { AccountDirectory, AccountStatus } from "./AccountDirectory.js";

export type CachedStatus = AccountStatus | "missing" | "unavailable";

export interface AccountStatusCache {
  statusOf(accountId: string): Promise<CachedStatus>;
}

export interface AccountStatusCacheOptions {
  readonly directory: Pick<AccountDirectory, "findAccount">;
  readonly ttlMs: number;
  readonly maxEntries: number;
  readonly now: () => number;
}

interface Entry {
  readonly status: CachedStatus;
  readonly readAt: number;
}

/**
 * The upgrade's view of an account's status (spec §5.6): one directory read
 * per account per `ttlMs`, so a reconnect storm costs one lookup. A verdict
 * is cached; `unavailable` is NOT a verdict and is asked again next time.
 * Bounded: past `maxEntries` the oldest entry is dropped.
 */
export function createAccountStatusCache(
  options: AccountStatusCacheOptions,
): AccountStatusCache {
  const entries = new Map<string, Entry>();

  return {
    async statusOf(accountId: string): Promise<CachedStatus> {
      const now = options.now();
      const cached = entries.get(accountId);

      if (cached !== undefined && now < cached.readAt + options.ttlMs) {
        return cached.status;
      }

      const found = await options.directory.findAccount(accountId);
      const status: CachedStatus =
        found.outcome === "found" ? found.account.status : found.outcome;

      if (status !== "unavailable") {
        entries.delete(accountId);

        if (entries.size >= options.maxEntries) {
          const oldest = entries.keys().next().value;

          if (oldest !== undefined) {
            entries.delete(oldest);
          }
        }

        entries.set(accountId, { status, readAt: now });
      }

      return status;
    },
  };
}
```

In `loginHandler.ts`, change the upgrade types and `describeUpgrade`:

```ts
export type UpgradeRejection =
  | "no-url"
  | "no-token"
  | "invalid-token"
  | "banned"
  | "too-many-connections"
  | "too-many-from-ip"
  | "account-not-active"
  | "accounts-unavailable";

export type UpgradeDecision =
  | { readonly ok: true; readonly token: VerifiedToken }
  | { readonly ok: false; readonly reason: UpgradeRejection };
```

(extend the doc comment above `UpgradeRejection` with: "`account-not-active` is a registered account that is blocked, unapproved, unconfirmed or deleted since the token was issued; `accounts-unavailable` is the account store failing to answer — the gate fails closed.") and in `describeUpgrade` replace the last two statements with:

```ts
  const token = auth.verifyToken(access);

  if (token === null) {
    return { ok: false, reason: "invalid-token" };
  }

  return { ok: true, token };
```

Add `import type { VerifiedToken } from "../auth/token.js";`. `authorizeUpgrade` keeps returning `describeUpgrade(reqUrl, auth).ok`.

The existing `describeUpgrade` case in `loginHandler.test.ts` (its last expectation, near line 187) expects `{ ok: true }`; a success now carries the token. Change it to:

```ts
    expect(describeUpgrade(`/?access=${login.token}`, auth)).toEqual({
      ok: true,
      token: { username: "demo", accountId: null, access: "user" },
    });
```

Replace `packages/server/src/http/upgradeGate.ts` with:

```ts
import type { AccountStatusCache } from "../accounts/accountStatusCache.js";
import type { AuthService } from "../auth/AuthService.js";
import type { BanList } from "../auth/banList.js";
import type { ConnectionGuard } from "../socket/connectionGuard.js";
import { describeUpgrade, type UpgradeRejection } from "./loginHandler.js";

export interface UpgradeGateDeps {
  readonly auth: AuthService;
  readonly banList: BanList;
  readonly connections: ConnectionGuard;
  readonly accountStatus: AccountStatusCache;
  readonly now: () => number;
}

export interface UpgradeVerdict {
  readonly ok: boolean;
  readonly status: 200 | 401 | 403 | 429 | 503;
  readonly reason?: UpgradeRejection;
}

/** The whole upgrade decision, cheapest check first: a banned IP costs a Map
 * lookup (429), a capped IP or a full server costs two (503), then the token
 * is verified (401 on any of `describeUpgrade`'s reasons). A registered
 * account's token is then re-checked against the account's CURRENT status
 * (spec §5.6): a token lives eight hours, a block must not wait for it. The
 * caps are a CHECK here — `index.ts` acquires the slot on `connection` and
 * releases it on `close`, so a handshake that never completes holds none. */
export async function decideUpgrade(
  url: string | undefined,
  ip: string,
  deps: UpgradeGateDeps,
): Promise<UpgradeVerdict> {
  if (deps.banList.isBanned(ip, deps.now())) {
    return { ok: false, status: 429, reason: "banned" };
  }

  const capacity = deps.connections.canAccept(ip);

  if (capacity !== "ok") {
    return { ok: false, status: 503, reason: capacity };
  }

  const decision = describeUpgrade(url, deps.auth);

  if (!decision.ok) {
    return { ok: false, status: 401, reason: decision.reason };
  }

  // A roster login has no directory entry to re-check.
  if (decision.token.accountId === null) {
    return { ok: true, status: 200 };
  }

  const status = await deps.accountStatus.statusOf(decision.token.accountId);

  if (status === "unavailable") {
    return { ok: false, status: 503, reason: "accounts-unavailable" };
  }

  if (status !== "active") {
    return { ok: false, status: 403, reason: "account-not-active" };
  }

  // The await let other upgrades through: check the caps again.
  const recheck = deps.connections.canAccept(ip);

  if (recheck !== "ok") {
    return { ok: false, status: 503, reason: recheck };
  }

  return { ok: true, status: 200 };
}
```

- [ ] **Step 4: Run and see them pass**

Run: `pnpm --filter @rtc/server test accountStatusCache upgradeGate loginHandler connectionLog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src
git commit -m "feat(server): the upgrade re-checks a registered account's status"
```

---

### Task 9: Composition — modes, the POST router, `/health/accounts`, wiring

**Files:**
- Create: `packages/server/src/accounts/resolveAccountsMode.ts`, `resolveAccountsMode.test.ts`
- Create: `packages/server/src/http/postRouter.ts`, `postRouter.test.ts`
- Create: `packages/server/src/http/accountsHealth.ts`, `accountsHealth.test.ts`
- Modify: `packages/server/src/index.ts`
- Modify: `package.json` (root: four dev scripts), `turbo.json`, `tests/fullstack/_orchestration.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–8.
- Produces: `AccountsMode`, `resolveAccountsMode(env: NodeJS.ProcessEnv): AccountsMode`, `createAccountDirectory(mode, deps): AccountDirectory`, `isRegistrationOpen(env): boolean`; `PostRoute {maxBodyBytes: number; handle: (bodyText: string, ip: string) => Promise<HttpResult>}`, `createPostRouter(deps: PostRouterDeps): (req: IncomingMessage, res: ServerResponse) => boolean`; `DirectoryHealth = "up" | "down" | "in-memory" | "disabled"`, `createAccountsHealth(options): {read(): Promise<DirectoryHealth>}`.

- [ ] **Step 1: Write the failing tests**

`packages/server/src/accounts/resolveAccountsMode.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import {
  createAccountDirectory,
  isRegistrationOpen,
  resolveAccountsMode,
} from "./resolveAccountsMode.js";

describe("resolveAccountsMode", () => {
  it("is disabled when nothing is configured — never the dev directory (Review Focus 1)", () => {
    expect(resolveAccountsMode({})).toEqual({ kind: "disabled" });
    expect(resolveAccountsMode({ AUTH_SECRET: "s" })).toEqual({
      kind: "disabled",
    });
  });

  it("is supabase when the URL, the key and the secret are all set", () => {
    expect(
      resolveAccountsMode({
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_x",
        AUTH_SECRET: "s",
      }),
    ).toEqual({
      kind: "supabase",
      url: "https://proj.supabase.co",
      secretKey: "sb_secret_x",
    });
  });

  it.each([
    [
      { SUPABASE_URL: "https://proj.supabase.co", AUTH_SECRET: "s" },
      "SUPABASE_SECRET_KEY must be set when SUPABASE_URL is configured",
    ],
    [
      {
        SUPABASE_URL: "http://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: "s",
      },
      "SUPABASE_URL must be an https URL",
    ],
    [
      { SUPABASE_URL: "https://proj.supabase.co", SUPABASE_SECRET_KEY: "k" },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      { RTC_DEV_ACCOUNTS: "1" },
      "AUTH_SECRET must be set when accounts are enabled",
    ],
    [
      {
        SUPABASE_URL: "https://proj.supabase.co",
        SUPABASE_SECRET_KEY: "k",
        AUTH_SECRET: "s",
        RTC_DEV_ACCOUNTS: "1",
      },
      "RTC_DEV_ACCOUNTS and SUPABASE_URL cannot both be set",
    ],
  ])("refuses %o", (env, message) => {
    expect(() => {
      return resolveAccountsMode(env);
    }).toThrow(message);
  });

  it("is in-memory only when asked for by name", () => {
    expect(
      resolveAccountsMode({ RTC_DEV_ACCOUNTS: "1", AUTH_SECRET: "s" }),
    ).toEqual({ kind: "in-memory" });
    expect(
      resolveAccountsMode({ RTC_DEV_ACCOUNTS: "true", AUTH_SECRET: "s" }),
    ).toEqual({ kind: "disabled" });
  });

  it("refuses the dev directory on a deployed machine (Review Focus 1)", () => {
    expect(() => {
      return resolveAccountsMode({
        RTC_DEV_ACCOUNTS: "1",
        AUTH_SECRET: "s",
        FLY_APP_NAME: "rtc-clone-server",
      });
    }).toThrow("RTC_DEV_ACCOUNTS is refused on a deployed machine");
  });
});

describe("createAccountDirectory", () => {
  it("builds the directory its mode names", () => {
    const deps = {
      now: (): number => {
        return 0;
      },
      timeoutMs: 5_000,
    };

    expect(createAccountDirectory({ kind: "disabled" }, deps).kind).toBe(
      "disabled",
    );
    expect(createAccountDirectory({ kind: "in-memory" }, deps).kind).toBe(
      "in-memory",
    );
    expect(
      createAccountDirectory(
        { kind: "supabase", url: "https://p.supabase.co", secretKey: "k" },
        deps,
      ).kind,
    ).toBe("supabase");
  });
});

describe("isRegistrationOpen", () => {
  it("is open unless REGISTRATION_OPEN is exactly `false`", () => {
    expect(isRegistrationOpen({})).toBe(true);
    expect(isRegistrationOpen({ REGISTRATION_OPEN: "true" })).toBe(true);
    expect(isRegistrationOpen({ REGISTRATION_OPEN: "false" })).toBe(false);
  });
});
```

`packages/server/src/http/accountsHealth.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import type { AccountDirectory } from "#/accounts/AccountDirectory";
import { createDisabledAccountDirectory } from "#/accounts/DisabledAccountDirectory";

import { createAccountsHealth } from "./accountsHealth.js";

describe("accountsHealth", () => {
  it("names a disabled and an in-memory directory without pinging", async () => {
    const disabled = createAccountsHealth({
      directory: createDisabledAccountDirectory(),
      cacheMs: 60_000,
      now: createClock(),
    });
    const inMemory = createAccountsHealth({
      directory: { ...createDisabledAccountDirectory(), kind: "in-memory" },
      cacheMs: 60_000,
      now: createClock(),
    });

    expect(await disabled.read()).toBe("disabled");
    expect(await inMemory.read()).toBe("in-memory");
  });

  it("pings a supabase directory at most once per cache window", async () => {
    let pings = 0;
    let up = true;
    let now = 1_000;
    const directory: AccountDirectory = {
      ...createDisabledAccountDirectory(),
      kind: "supabase",
      ping: () => {
        pings += 1;

        return Promise.resolve(up);
      },
    };
    const health = createAccountsHealth({
      directory,
      cacheMs: 60_000,
      now: (): number => {
        return now;
      },
    });

    expect(await health.read()).toBe("up");
    up = false;
    now = 60_999;
    expect(await health.read()).toBe("up");
    expect(pings).toBe(1);

    now = 61_000;
    expect(await health.read()).toBe("down");
    expect(pings).toBe(2);
  });
});

function createClock(): () => number {
  return (): number => {
    return 1_000;
  };
}
```

`packages/server/src/http/postRouter.test.ts`:

```ts
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createBanList } from "#/auth/banList";

import { jsonResult } from "./jsonResult.js";
import { createPostRouter, type PostRoute } from "./postRouter.js";

let server: Server | undefined;

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

  it("answers the preflight for a known route", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    const response = await fetch(`${base}/echo`, { method: "OPTIONS" });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
  });

  it("leaves an unknown path and a GET to the caller (404 here)", async () => {
    const base = await startRouter({ "/echo": createEchoRoute() });

    expect((await fetch(`${base}/nope`, { method: "POST" })).status).toBe(404);
    expect((await fetch(`${base}/echo`)).status).toBe(404);
  });

  it("answers 413 past the route's body cap", async () => {
    const base = await startRouter({
      "/echo": { ...createEchoRoute(), maxBodyBytes: 8 },
    });

    const response = await fetch(`${base}/echo`, {
      method: "POST",
      body: "x".repeat(64),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: "body_too_large" });
  });

  it("answers a banned caller 429 without running the route", async () => {
    let ran = false;
    const banList = createBanList({
      strikesToBan: 1,
      strikeWindowMs: 60_000,
      banMs: 30_000,
      maxEntries: 10,
    });
    banList.strike("9.9.9.9", "login-failed", 500);
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
      banList,
    );

    const response = await fetch(`${base}/echo`, { method: "POST", body: "x" });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(await response.json()).toEqual({ error: "banned" });
    expect(ran).toBe(false);
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
});

function createEchoRoute(): PostRoute {
  return {
    maxBodyBytes: 1_024,
    handle: (bodyText: string) => {
      return Promise.resolve(jsonResult(200, { bodyText }));
    },
  };
}

/** A real node:http server on an ephemeral port, with the router in front
 * of a 404 — the same position it has in `index.ts`. */
async function startRouter(
  routes: Record<string, PostRoute>,
  banList = createBanList({
    strikesToBan: 100,
    strikeWindowMs: 60_000,
    banMs: 60_000,
    maxEntries: 10,
  }),
): Promise<string> {
  const route = createPostRouter({
    routes: new Map<string, PostRoute>(Object.entries(routes)),
    banList,
    clientIp: (): string => {
      return "9.9.9.9";
    },
    now: (): number => {
      return 1_000;
    },
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
```

- [ ] **Step 2: Run and see them fail**

Run: `pnpm --filter @rtc/server test resolveAccountsMode accountsHealth postRouter`
Expected: FAIL — three modules not found.

- [ ] **Step 3: Implement the three units**

`packages/server/src/accounts/resolveAccountsMode.ts`:

```ts
import type { AccountDirectory } from "./AccountDirectory.js";
import { createDisabledAccountDirectory } from "./DisabledAccountDirectory.js";
import { DEV_ACCOUNT_SEEDS } from "./devAccounts.js";
import { createInMemoryAccountDirectory } from "./InMemoryAccountDirectory.js";
import { createSupabaseAccountDirectory } from "./SupabaseAccountDirectory.js";

export type AccountsMode =
  | {
      readonly kind: "supabase";
      readonly url: string;
      readonly secretKey: string;
    }
  | { readonly kind: "in-memory" }
  | { readonly kind: "disabled" };

export interface AccountDirectoryDeps {
  readonly now: () => number;
  readonly timeoutMs: number;
}

/**
 * Which account store this process uses. Three modes, and the dev one is
 * NEVER a default: it accepts a fixed code and seeds an admin with a
 * committed password, so it must be asked for by name and is refused on a
 * deployed machine (Fly sets `FLY_APP_NAME` on every one). Throws at startup
 * on a half-configured environment, the way `AuthService` refuses
 * `AUTH_USERS` without `AUTH_SECRET`.
 */
export function resolveAccountsMode(env: NodeJS.ProcessEnv): AccountsMode {
  const url = env.SUPABASE_URL ?? "";
  const devAccounts = env.RTC_DEV_ACCOUNTS === "1";

  if (url !== "" && devAccounts) {
    throw new Error("RTC_DEV_ACCOUNTS and SUPABASE_URL cannot both be set");
  }

  if (url === "" && !devAccounts) {
    return { kind: "disabled" };
  }

  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET must be set when accounts are enabled");
  }

  if (devAccounts) {
    if (env.FLY_APP_NAME) {
      throw new Error("RTC_DEV_ACCOUNTS is refused on a deployed machine");
    }

    return { kind: "in-memory" };
  }

  if (!url.startsWith("https://")) {
    throw new Error("SUPABASE_URL must be an https URL");
  }

  const secretKey = env.SUPABASE_SECRET_KEY ?? "";

  if (secretKey === "") {
    throw new Error(
      "SUPABASE_SECRET_KEY must be set when SUPABASE_URL is configured",
    );
  }

  return { kind: "supabase", url, secretKey };
}

export function createAccountDirectory(
  mode: AccountsMode,
  deps: AccountDirectoryDeps,
): AccountDirectory {
  if (mode.kind === "supabase") {
    return createSupabaseAccountDirectory({
      url: mode.url,
      secretKey: mode.secretKey,
      timeoutMs: deps.timeoutMs,
    });
  }

  if (mode.kind === "in-memory") {
    return createInMemoryAccountDirectory({
      now: deps.now,
      seeds: DEV_ACCOUNT_SEEDS,
    });
  }

  return createDisabledAccountDirectory();
}

/** The no-deploy switch for sign-up: `REGISTRATION_OPEN=false` closes it. */
export function isRegistrationOpen(env: NodeJS.ProcessEnv): boolean {
  return env.REGISTRATION_OPEN !== "false";
}
```

Note the check order against the test table: the `https` test passes `AUTH_SECRET`, and the missing-key test passes an `https` URL, so each refusal is reached by exactly one case.

`packages/server/src/http/accountsHealth.ts`:

```ts
import type { AccountDirectory } from "../accounts/AccountDirectory.js";

export type DirectoryHealth = "up" | "down" | "in-memory" | "disabled";

export interface AccountsHealth {
  read(): Promise<DirectoryHealth>;
}

export interface AccountsHealthOptions {
  readonly directory: Pick<AccountDirectory, "kind" | "ping">;
  readonly cacheMs: number;
  readonly now: () => number;
}

/**
 * `/health/accounts`: one cheap read of the account store, at most once per
 * `cacheMs`, so a public GET cannot be turned into a query flood. The
 * keep-alive workflow calls it twice a week — that read is what keeps a
 * free-plan Supabase project from being paused for inactivity — and fails
 * loudly on `down`, which is how a paused project is noticed.
 */
export function createAccountsHealth(
  options: AccountsHealthOptions,
): AccountsHealth {
  let lastRead = Number.NEGATIVE_INFINITY;
  let last: DirectoryHealth = "down";

  return {
    async read(): Promise<DirectoryHealth> {
      if (options.directory.kind !== "supabase") {
        return options.directory.kind;
      }

      const now = options.now();

      if (now < lastRead + options.cacheMs) {
        return last;
      }

      lastRead = now;
      last = (await options.directory.ping()) ? "up" : "down";

      return last;
    },
  };
}
```

`packages/server/src/http/postRouter.ts`:

```ts
import type { IncomingMessage, ServerResponse } from "node:http";

import type { BanList } from "../auth/banList.js";
import type { HttpResult } from "./jsonResult.js";
import { BodyTooLargeError, readBodyWithLimit } from "./readBody.js";

export interface PostRoute {
  /** Body cap, by bytes RECEIVED (S2). */
  readonly maxBodyBytes: number;
  readonly handle: (bodyText: string, ip: string) => Promise<HttpResult>;
}

export interface PostRouterDeps {
  readonly routes: ReadonlyMap<string, PostRoute>;
  readonly banList: Pick<BanList, "bannedUntil">;
  readonly clientIp: (req: IncomingMessage) => string;
  readonly now: () => number;
}

/**
 * Every JSON POST route goes through the same four steps, written once:
 * the CORS preflight, the §9.2 ban check before the body is even read, the
 * S2 body cap by bytes received, and one error mapping (413 for an
 * oversized body, 500 for anything a handler throws). Returns `false` for a
 * path or method it does not own, so the caller's routing continues.
 */
export function createPostRouter(
  deps: PostRouterDeps,
): (req: IncomingMessage, res: ServerResponse) => boolean {
  return (req: IncomingMessage, res: ServerResponse): boolean => {
    const route = req.url === undefined ? undefined : deps.routes.get(req.url);

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
    // checks again; this saves the read).
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
        // unread (413): close the connection after the status.
        const tooLarge = err instanceof BodyTooLargeError;

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
```

Run: `pnpm --filter @rtc/server test resolveAccountsMode accountsHealth postRouter`
Expected: PASS.

- [ ] **Step 4: Wire `index.ts`**

Imports — add (Biome sorts them):

```ts
import { createAccountService } from "./accounts/AccountService.js";
import { createAccountStatusCache } from "./accounts/accountStatusCache.js";
import {
  createAccountDirectory,
  isRegistrationOpen,
  resolveAccountsMode,
} from "./accounts/resolveAccountsMode.js";
import {
  type AccountHandlerDeps,
  confirmEmailAddress,
  registerAccount,
  requestPasswordReset,
  resendConfirmationCode,
  resetAccountPassword,
} from "./http/accountHandlers.js";
import { createAccountsHealth } from "./http/accountsHealth.js";
import { createPostRouter, type PostRoute } from "./http/postRouter.js";
```

Remove `BodyTooLargeError` and `readBodyWithLimit` from the `./http/readBody.js` import (keep `declaredLengthExceeds`). Add to the `./config/limits.js` import: `ACCOUNT_DIRECTORY_TIMEOUT_MS`, `ACCOUNT_MAX_BODY_BYTES`, `ACCOUNT_STATUS_CACHE_MAX_ENTRIES`, `ACCOUNT_STATUS_CACHE_TTL_MS`, `ACCOUNTS_HEALTH_CACHE_MS`, `CODE_ENTRY_RATE_LIMIT_MAX`, `CODE_ENTRY_RATE_LIMIT_WINDOW_MS`, `MAX_REGISTRATIONS_PER_DAY`, `REGISTER_RATE_LIMIT_MAX`, `REGISTER_RATE_LIMIT_WINDOW_MS`, `SEND_CODE_RATE_LIMIT_MAX`, `SEND_CODE_RATE_LIMIT_WINDOW_MS`.

After the `connections` guard and the `readClock` function, add (the route table below needs `auth`, `loginRateLimit` and `banList`, all declared above this point):

```ts
// ── Accounts (B2) ───────────────────────────────────────────────

// Throws on a half-configured environment, and on the dev directory being
// asked for on a deployed machine — before the server listens.
const accountsMode = resolveAccountsMode(process.env);
const accountDirectory = createAccountDirectory(accountsMode, {
  now: readClock,
  timeoutMs: ACCOUNT_DIRECTORY_TIMEOUT_MS,
});
const accounts = createAccountService({
  directory: accountDirectory,
  now: readClock,
  registrationOpen: isRegistrationOpen(process.env),
  maxRegistrationsPerDay: MAX_REGISTRATIONS_PER_DAY,
});
const accountStatus = createAccountStatusCache({
  directory: accountDirectory,
  ttlMs: ACCOUNT_STATUS_CACHE_TTL_MS,
  maxEntries: ACCOUNT_STATUS_CACHE_MAX_ENTRIES,
  now: readClock,
});
const accountsHealth = createAccountsHealth({
  directory: accountDirectory,
  cacheMs: ACCOUNTS_HEALTH_CACHE_MS,
  now: readClock,
});
const accountDeps: AccountHandlerDeps = {
  accounts,
  banList,
  limits: {
    register: createRateLimiter(
      REGISTER_RATE_LIMIT_MAX,
      REGISTER_RATE_LIMIT_WINDOW_MS,
    ),
    resendCode: createRateLimiter(
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW_MS,
    ),
    confirmEmail: createRateLimiter(
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ),
    requestReset: createRateLimiter(
      SEND_CODE_RATE_LIMIT_MAX,
      SEND_CODE_RATE_LIMIT_WINDOW_MS,
    ),
    resetPassword: createRateLimiter(
      CODE_ENTRY_RATE_LIMIT_MAX,
      CODE_ENTRY_RATE_LIMIT_WINDOW_MS,
    ),
  },
  now: readClock,
};
```

After `clientIp` (the function near the MCP block), add the route table:

```ts
// ── POST routes ─────────────────────────────────────────────────

const POST_ROUTES: ReadonlyMap<string, PostRoute> = new Map<string, PostRoute>([
  [
    "/login",
    {
      maxBodyBytes: LOGIN_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return authenticateLoginRequest(bodyText, ip, {
          auth,
          accounts,
          rateLimit: loginRateLimit,
          banList,
          now: readClock,
        });
      },
    },
  ],
  [
    "/register",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return registerAccount(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/resend-code",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return resendConfirmationCode(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/confirm-email",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return confirmEmailAddress(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/request-reset",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return requestPasswordReset(bodyText, ip, accountDeps);
      },
    },
  ],
  [
    "/reset-password",
    {
      maxBodyBytes: ACCOUNT_MAX_BODY_BYTES,
      handle: (bodyText: string, ip: string) => {
        return resetAccountPassword(bodyText, ip, accountDeps);
      },
    },
  ],
]);

const servePostRoute = createPostRouter({
  routes: POST_ROUTES,
  banList,
  clientIp,
  now: readClock,
});
```

In the `createServer` callback: update the comment above it to say HTTP carries `/health`, `/health/accounts`, the six POST routes and `/mcp`; delete the two `/login` blocks (`OPTIONS` and `POST`) entirely; and after the `/health` block add:

```ts
  if (req.url === "/health/accounts" && req.method === "GET") {
    accountsHealth
      .read()
      .then((directory) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, directory }));
      })
      .catch(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, directory: "down" }));
      });
    return;
  }

  if (servePostRoute(req, res)) {
    return;
  }
```

`gateDeps` gains `accountStatus,`. Replace the `verifyClient` body with:

```ts
    decideUpgrade(info.req.url, clientIp(info.req), gateDeps).then(
      (verdict) => {
        if (!verdict.ok && verdict.reason) {
          connectionLog.recordRejectedUpgrade(verdict.reason);
        }

        done(
          verdict.ok,
          verdict.status,
          verdict.ok ? undefined : verdict.reason,
        );
      },
      () => {
        // The gate never rejects by design; if it ever does, fail closed.
        connectionLog.recordRejectedUpgrade("accounts-unavailable");
        done(false, 503, "accounts-unavailable");
      },
    );
```

and extend the comment above `verifyClient` with: "A registered account's token is then re-checked against the account's current status (403, or 503 when the account store does not answer)."

In the `listen` callback add, after the `/login` line:

```ts
  console.log(
    `  HTTP:  /register /resend-code /confirm-email /request-reset /reset-password`,
  );
  console.log(`  Accounts: ${accountDirectory.kind}`);
```

- [ ] **Step 5: Dev scripts, turbo env and the smoke's server**

In the root `package.json`, add `RTC_DEV_ACCOUNTS=1` right after `AUTH_SECRET=dev-local-secret` in the four scripts `dev:ws`, `dev:react:fs`, `dev:solid:fs`, `dev:ios:fs`.

In `turbo.json` `globalPassThroughEnv`, add after `"AUTH_TTL_MS"`: `"RTC_DEV_ACCOUNTS"`, `"SUPABASE_URL"`, `"SUPABASE_SECRET_KEY"`, `"REGISTRATION_OPEN"`.

In `tests/fullstack/_orchestration.ts` `startServer`'s `env`, add after `AUTH_USERS: "demo:demo",`:

```ts
        // The in-memory account directory (fixed code, seeded accounts) —
        // see packages/server/src/accounts/devAccounts.ts.
        RTC_DEV_ACCOUNTS: "1",
```

- [ ] **Step 6: Typecheck, test, boot**

Run: `pnpm --filter @rtc/server typecheck`
Expected: PASS.

Run: `pnpm --filter @rtc/server test`
Expected: PASS.

Run (boots the real server for two seconds, then stops it):

```bash
AUTH_USERS=demo:demo AUTH_SECRET=s RTC_DEV_ACCOUNTS=1 PORT=4188 RTC_JARVIS_FAKE=1 pnpm --filter @rtc/server exec tsx src/index.ts > "$TMPDIR/b2a-boot.log" 2>&1 &
SERVER_PID=$!
curl --silent --fail --retry 30 --retry-delay 1 --retry-connrefused http://127.0.0.1:4188/health/accounts > "$TMPDIR/b2a-health.json"
cat "$TMPDIR/b2a-health.json"
kill "$SERVER_PID"
```

Expected: `{"ok":true,"directory":"in-memory"}`.

Run: `FLY_APP_NAME=x AUTH_SECRET=s RTC_DEV_ACCOUNTS=1 PORT=4189 pnpm --filter @rtc/server exec tsx src/index.ts`
Expected: exits non-zero with `RTC_DEV_ACCOUNTS is refused on a deployed machine`.

- [ ] **Step 7: Commit**

```bash
git add packages/server/src package.json turbo.json tests/fullstack/_orchestration.ts
git commit -m "feat(server): wire accounts — modes, the POST router and /health/accounts"
```

---

### Task 10: The smoke journey and the keep-alive workflow

**Files:**
- Create: `tests/fullstack/accounts-journey.ts`
- Modify: `tests/fullstack/node-smoke.ts`
- Create: `.github/workflows/accounts-keepalive.yml`

**Interfaces:**
- Consumes: the running server (Task 9) with `RTC_DEV_ACCOUNTS=1`.
- Produces: `runAccountsJourney(httpBase: string, wsBase: string): Promise<void>`.

- [ ] **Step 1: Write the journey**

`tests/fullstack/accounts-journey.ts`:

```ts
/**
 * The B2a account journey over the REAL server and its in-memory account
 * directory (`RTC_DEV_ACCOUNTS=1`, set by `startServer`): register, refused
 * until confirmed, refused until approved; a seeded active account signs in
 * and opens a WebSocket; a seeded blocked one is refused. The unit tests
 * cover each rule; this proves they are wired to real routes.
 *
 * Every request sends its own `Fly-Client-IP`, so the journey's deliberate
 * failures never strike the IP the rest of the smoke uses.
 */
const JOURNEY_IP = "198.51.100.77";
const DEV_PASSWORD = "Mcdc2026!desk";
const DEV_CODE = "000000";

interface Answer {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) {
    throw new Error(`assertion failed: ${message}`);
  }
}

async function post(
  httpBase: string,
  path: string,
  payload: Record<string, string>,
): Promise<Answer> {
  const response = await fetch(`${httpBase}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Fly-Client-IP": JOURNEY_IP,
    },
    body: JSON.stringify(payload),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

/** Opens a socket with the token and resolves true once it is open. */
function opensSocket(wsBase: string, token: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `${wsBase}/?access=${encodeURIComponent(token)}`,
    );
    const timer = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 10_000);

    socket.addEventListener("open", () => {
      clearTimeout(timer);
      socket.close();
      resolve(true);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export async function runAccountsJourney(
  httpBase: string,
  wsBase: string,
): Promise<void> {
  const health = await fetch(`${httpBase}/health/accounts`);
  const healthBody = (await health.json()) as Record<string, unknown>;
  assert(
    healthBody.directory === "in-memory",
    `/health/accounts directory (got ${String(healthBody.directory)})`,
  );

  const email = `journey-${Date.now()}@rtc.test`;
  const credentials = { username: email, password: DEV_PASSWORD };

  const weak = await post(httpBase, "/register", {
    email,
    displayName: "Journey Guest",
    password: "weak",
  });
  assert(
    weak.status === 400 && weak.body.rule === "min-length",
    `weak password refused with its rule (got ${weak.status} ${String(weak.body.rule)})`,
  );

  const registered = await post(httpBase, "/register", {
    email,
    displayName: "Journey Guest",
    password: DEV_PASSWORD,
  });
  assert(
    registered.status === 202 && registered.body.status === "code_sent",
    `register (got ${registered.status})`,
  );

  const unconfirmed = await post(httpBase, "/login", credentials);
  assert(
    unconfirmed.status === 403 && unconfirmed.body.error === "unconfirmed",
    `login before confirming (got ${unconfirmed.status} ${String(unconfirmed.body.error)})`,
  );

  const wrongCode = await post(httpBase, "/confirm-email", {
    email,
    code: "111111",
  });
  assert(wrongCode.status === 400, `wrong code (got ${wrongCode.status})`);

  const confirmed = await post(httpBase, "/confirm-email", {
    email,
    code: DEV_CODE,
  });
  assert(
    confirmed.status === 200 && confirmed.body.status === "pending_approval",
    `confirm (got ${confirmed.status})`,
  );

  const pending = await post(httpBase, "/login", credentials);
  assert(
    pending.status === 403 && pending.body.error === "pending_approval",
    `login before approval (got ${pending.status} ${String(pending.body.error)})`,
  );
  console.log(
    "  ✓ accounts: register → unconfirmed → confirmed → pending approval",
  );

  const blocked = await post(httpBase, "/login", {
    username: "blocked@rtc.test",
    password: DEV_PASSWORD,
  });
  assert(
    blocked.status === 403 && blocked.body.error === "blocked",
    `blocked account (got ${blocked.status} ${String(blocked.body.error)})`,
  );

  const active = await post(httpBase, "/login", {
    username: "trader@rtc.test",
    password: DEV_PASSWORD,
  });
  assert(active.status === 200, `active account (got ${active.status})`);
  const token = active.body.token;
  assert(typeof token === "string", "active login carries a token");
  assert(
    await opensSocket(wsBase, token),
    "an active account's token opens a WebSocket",
  );
  console.log(
    "  ✓ accounts: blocked refused; an active account signs in and connects",
  );
}
```

- [ ] **Step 2: Call it from the node smoke**

In `tests/fullstack/node-smoke.ts`, add the import beside `loginForToken`:

```ts
import { runAccountsJourney } from "./accounts-journey.ts";
```

and in the `Main` block, after `await runChecks();`:

```ts
  await runAccountsJourney(`http://${HOST}:${PORT}`, `ws://${HOST}:${PORT}`);
```

- [ ] **Step 3: Run the smoke**

Run: `pnpm --filter @rtc/server build` then `pnpm --filter @rtc/tests test:fullstack:node > "$TMPDIR/b2a-smoke.log" 2>&1; echo "exit=$?"; tail -20 "$TMPDIR/b2a-smoke.log"`
Expected: `exit=0`, both `✓ accounts:` lines, and `full-stack smoke (node socket): PASS`.

Then prove the journey can fail. In `packages/server/src/accounts/AccountService.ts` change `if (found.account.status !== "active") {` to `if (false) {`, rerun the smoke, and see `login before approval (got 200 …)`. **Restore the line** and rerun to green.

- [ ] **Step 4: The keep-alive workflow**

`.github/workflows/accounts-keepalive.yml`:

```yaml
name: Accounts keep-alive

# Twice a week: asks the deployed server to make one cheap read of its
# account store (GET /health/accounts — see
# packages/server/src/http/accountsHealth.ts). A free-plan Supabase project
# is paused after a quiet week; this read is the activity that prevents it.
# Supabase does not guarantee that, so the job also FAILS when the store is
# "down" — which is how a paused project gets noticed (GitHub emails the
# failure). "disabled" (no SUPABASE_URL on the server yet) passes quietly.
on:
  schedule:
    - cron: "17 7 * * 1,4"
  workflow_dispatch:

# No checkout, no token use: this job only makes one HTTPS request.
permissions: {}

jobs:
  ping:
    name: read the account store
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: GET /health/accounts
        env:
          ACCOUNTS_HEALTH_URL: https://rtc-clone-server.fly.dev/health/accounts
        run: |
          set -euo pipefail
          # The machine scales to zero: the first request wakes it, so retry.
          body="$(curl --silent --show-error --fail --retry 4 --retry-delay 15 --retry-all-errors --max-time 30 "${ACCOUNTS_HEALTH_URL}")"
          echo "${body}"
          directory="$(printf '%s' "${body}" | jq -r '.directory')"
          if [ "${directory}" = "down" ]; then
            echo "::error::The account store is down. A paused Supabase project reads as down: restore it in the Supabase dashboard."
            exit 1
          fi
```

Run: `pnpm lint:actions` and `pnpm lint:actions:security`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/fullstack .github/workflows/accounts-keepalive.yml
git commit -m "test(fullstack): the account journey over the real server; ci: accounts keep-alive"
```

---

### Task 11: Docs, the spec amendments, mutants and the final gates

**Files:**
- Create: `docs/privacy.md`
- Modify: `docs/superpowers/specs/2026-10-04-b2-user-management-design.md`
- Modify: `docs/authentication.md`, `docs/DEPLOY.md`, `CLAUDE.md`, `docs/STATUS.md`, `packages/server/README.md`

- [ ] **Step 1: The privacy notice**

`docs/privacy.md`:

```markdown
# Privacy notice

Reactive Trader Cloud Clone is a demonstration project. Demo accounts store
nothing about you. This notice covers **registered accounts** only.

## What is stored

| Data | Why |
|---|---|
| Your email address | To confirm the account is yours, to send a password-reset code, and as your sign-in name |
| Your display name | Shown in the app's profile menu |
| When the account was created, and whether it is confirmed, approved or blocked | To run the approval step |
| A hash of your password | Held by Supabase Auth; the project's own code never stores or logs the password |

Nothing else is collected. There is no tracking and no advertising. Trades
and prices in the app are simulated and are not kept.

## Where

In a Supabase project hosted in London (United Kingdom). Emails are sent
through that project's configured email provider.

## How long, and how to delete it

The account is kept until you ask for it to be deleted. To delete it, open an
issue at <https://github.com/bettersoftware-io/ReactiveTraderCloudClone/issues>
or email the maintainer from the account's address. Deletion removes the
account and its profile.

## Server logs

The server logs IP addresses with connection and sign-in outcomes, to detect
abuse. It does not log email addresses, passwords, codes or message contents.
```

- [ ] **Step 2: Amend the spec**

In `docs/superpowers/specs/2026-10-04-b2-user-management-design.md`:

1. §5.1 — replace the paragraph and bullet about the `account_directory` view. The `profiles` table gains `email text not null` and `email_confirmed_at timestamptz`, kept in step with `auth.users` by two triggers; there is no view. Reason, in one sentence: a view over `auth.users` in the exposed schema is the pattern Supabase's own advisor flags, and one table the server reads is simpler.
2. §5.5 and §5.6 — add one sentence to each: "`SessionUser.access`, the connection-scoped identity and `sessionRegistry` land in B2c, where their first reader (the admin effects) lives; in B2a a block made in the dashboard applies within the 60-second cache window at the next connect."
3. §5.8 — replace the first bullet: the in-memory directory is selected by `RTC_DEV_ACCOUNTS=1`, **never** by `SUPABASE_URL` being unset (that is `disabled`), and is refused when `FLY_APP_NAME` is set. Add `disabled` to the `/health/accounts` values.
4. §5.2 — add to the Supabase adapter's row: it forwards the caller's IP as `Sb-Forwarded-For`, so Supabase's per-IP limits apply to each visitor, not to our server's one address.
5. §11 — in the B2a row, replace "token and identity changes" with "token claims", and add "the probe script".
6. §12 — add two rows before the Fly secrets row: enable IP forwarding in the project's Auth rate-limit settings; run `pnpm --filter @rtc/server accounts:probe` and see `PASS`.

- [ ] **Step 3: The other docs**

- `docs/authentication.md` — add a section `## 7. Registered accounts (B2a)` after §6: the three modes and their env (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`; `RTC_DEV_ACCOUNTS=1`; neither), the six endpoints with their answers (copy the spec §5.3 table), the login decision (spec §5.4), the upgrade re-check, the dev accounts (`admin@rtc.test`, `trader@rtc.test`, `pending@rtc.test`, `blocked@rtc.test`, password `Mcdc2026!desk`, code `000000`), and where the pieces live (the file map of this plan). Update §5 "What's committed vs. what stays secret": the dev account password is committed; `SUPABASE_SECRET_KEY` is a Fly secret and never in a client.
- `docs/DEPLOY.md` — under "One-time setup" add `### 4. Supabase (account store)` pointing at [`supabase/README.md`](../supabase/README.md) and listing the two Fly secrets and `REGISTRATION_OPEN=false` as the no-deploy sign-up switch.
- `CLAUDE.md` — in "Demo accounts & auth env", append: registered accounts (B2a) are an email + password checked by the **server** against its account store — Supabase in production (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`, server-only), an in-memory directory in dev (`RTC_DEV_ACCOUNTS=1`, baked into `dev:ws` / `dev:*:fs`, seeded with `admin@` / `trader@` / `pending@` / `blocked@rtc.test`, password `Mcdc2026!desk`, code `000000`, refused on a deployed machine), disabled otherwise; an identifier with `@` takes that path, anything else the `AUTH_USERS` roster. In the "Published Reports Are Stale By Default" table add a row: `accounts-keepalive.yml` | cron (Mon + Thu 07:17) | — (fails when the account store is down, e.g. a paused Supabase project).
- `packages/server/README.md` — add the new endpoints and env vars wherever it lists `/login` and `AUTH_USERS`.
- `docs/STATUS.md` — in the public-launch line: replace "B2 user management is NEXT." with "B2 user management IN PROGRESS: B2a account server MERGED 2026-10-04 (the PR that landed this line); B2b client flows NEXT, then B2c Users panel." and replace the "**Order:** B2 user management (… still to be written into §5 B2; …)" clause with a summary of B2a (Supabase behind the Fly server, email + approval, six endpoints, three modes, upgrade re-check) plus the user's steps from spec §12 as "YOURS TO DO before B2a is live". Link the B2 spec and this plan.

Run: `pnpm check:doc-links`
Expected: PASS.

- [ ] **Step 4: Mutants**

Write `mutants.json` in the scratchpad (not committed) and run `pnpm mutation-check <path> --keep-going`. Each `find` matches exactly once in its file.

```json
[
  {
    "name": "password minimum length is enforced",
    "file": "packages/domain/src/auth/passwordPolicy.ts",
    "find": "return password.length >= PASSWORD_MIN_LENGTH;",
    "replace": "return password.length >= 1;",
    "test": "pnpm --filter @rtc/domain test passwordPolicy"
  },
  {
    "name": "the password ceiling counts bytes",
    "file": "packages/domain/src/auth/passwordPolicy.ts",
    "find": "return utf8ByteLength(password) <= PASSWORD_MAX_BYTES;",
    "replace": "return password.length <= PASSWORD_MAX_BYTES;",
    "test": "pnpm --filter @rtc/domain test passwordPolicy"
  },
  {
    "name": "a half-claimed token is rejected",
    "file": "packages/server/src/auth/token.ts",
    "find": "typeof payload.id !== \"string\" ||",
    "replace": "false ||",
    "test": "pnpm --filter @rtc/server test token"
  },
  {
    "name": "an account session is never signed with an empty secret",
    "file": "packages/server/src/auth/AuthService.ts",
    "find": "if (!this.secret) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test AuthService"
  },
  {
    "name": "only an active account signs in",
    "file": "packages/server/src/accounts/AccountService.ts",
    "find": "if (found.account.status !== \"active\") {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test AccountService"
  },
  {
    "name": "an address is normalized before any lookup",
    "file": "packages/server/src/accounts/AccountService.ts",
    "find": "const email = normalizeEmail(raw);",
    "replace": "const email = raw;",
    "test": "pnpm --filter @rtc/server test AccountService"
  },
  {
    "name": "the daily registration cap closes sign-up",
    "file": "packages/server/src/accounts/AccountService.ts",
    "find": "if (counted.count >= options.maxRegistrationsPerDay) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test AccountService"
  },
  {
    "name": "the registration switch closes sign-up",
    "file": "packages/server/src/accounts/AccountService.ts",
    "find": "if (!options.registrationOpen) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test AccountService"
  },
  {
    "name": "a non-UUID account id never reaches a query string",
    "file": "packages/server/src/accounts/SupabaseAccountDirectory.ts",
    "find": "if (!UUID_SHAPE.test(accountId)) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test SupabaseAccountDirectory"
  },
  {
    "name": "a 5xx (paused project) is unavailable, not a wrong password",
    "file": "packages/server/src/accounts/SupabaseAccountDirectory.ts",
    "find": "if (response.status >= 500) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test SupabaseAccountDirectory"
  },
  {
    "name": "a refused resend never reveals the account",
    "file": "packages/server/src/accounts/SupabaseAccountDirectory.ts",
    "find": "return reply.kind === \"unreachable\" ? \"unavailable\" : \"sent\";",
    "replace": "return reply.kind === \"ok\" ? \"sent\" : \"unavailable\";",
    "test": "pnpm --filter @rtc/server test SupabaseAccountDirectory"
  },
  {
    "name": "a banned caller is answered before the body is parsed",
    "file": "packages/server/src/http/accountHandlers.ts",
    "find": "if (bannedUntil !== null) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test accountHandlers"
  },
  {
    "name": "a wrong code is a ban strike",
    "file": "packages/server/src/http/accountHandlers.ts",
    "find": "deps.banList.strike(ip, \"code-failed\", deps.now());",
    "replace": "",
    "test": "pnpm --filter @rtc/server test accountHandlers"
  },
  {
    "name": "an email address takes the account leg of /login",
    "file": "packages/server/src/http/loginHandler.ts",
    "find": "if (parsed.username.includes(\"@\")) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test loginHandler"
  },
  {
    "name": "the upgrade refuses an account that is no longer active",
    "file": "packages/server/src/http/upgradeGate.ts",
    "find": "if (status !== \"active\") {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test upgradeGate"
  },
  {
    "name": "the upgrade fails closed when the store is unavailable",
    "file": "packages/server/src/http/upgradeGate.ts",
    "find": "return { ok: false, status: 503, reason: \"accounts-unavailable\" };",
    "replace": "return { ok: true, status: 200 };",
    "test": "pnpm --filter @rtc/server test upgradeGate"
  },
  {
    "name": "the caps are re-checked after the awaited status",
    "file": "packages/server/src/http/upgradeGate.ts",
    "find": "if (recheck !== \"ok\") {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test upgradeGate"
  },
  {
    "name": "unavailable is never cached as a verdict",
    "file": "packages/server/src/accounts/accountStatusCache.ts",
    "find": "if (status !== \"unavailable\") {",
    "replace": "if (true) {",
    "test": "pnpm --filter @rtc/server test accountStatusCache"
  },
  {
    "name": "the dev directory is refused on a deployed machine",
    "file": "packages/server/src/accounts/resolveAccountsMode.ts",
    "find": "if (env.FLY_APP_NAME) {",
    "replace": "if (false) {",
    "test": "pnpm --filter @rtc/server test resolveAccountsMode"
  },
  {
    "name": "the migration keeps profiles closed to the anon role",
    "file": "supabase/migrations/20261004000000_create_profiles.sql",
    "find": "alter table public.profiles enable row level security;",
    "replace": "",
    "test": "pnpm --filter @rtc/server test migrations"
  }
]
```

The two `@rtc/domain` mutants run domain's own test, so no rebuild is needed. Expected: every row `KILLED`. A `SURVIVED` row is a finding about the test — strengthen the test, do not delete the mutant. An `ERROR` row means the `find` no longer matches once: correct the anchor and rerun that row.

- [ ] **Step 5: Gates on the final tree**

Capture each to a file and check the exit code; never pipe a gate into `tail`.

```bash
pnpm exec biome ci --error-on-warnings .
pnpm lint:eslint
pnpm lint:eslint:types
pnpm typecheck
pnpm test
pnpm lint:dead
pnpm check:deps
pnpm lint:actions
pnpm lint:actions:security
pnpm check:doc-links
pnpm --filter @rtc/tests gates
pnpm build
pnpm --filter @rtc/tests test:fullstack:node
pnpm test:e2e
```

Expected: all PASS. `pnpm test:e2e` is unchanged behaviour (its flows use roster usernames), so it guards against a regression in `/login` and the upgrade.

- [ ] **Step 6: Commit**

```bash
git add docs CLAUDE.md packages/server/README.md
git commit -m "docs: B2a account server — privacy notice, auth and deploy docs, spec amendments"
```

- [ ] **Step 7: Closing batch (one outward step per call)**

1. `git push -u origin worktree-b2a-account-server`
2. `gh pr create --title "feat(server): B2a — registered accounts behind the server (Supabase, email + approval)" --body-file <scratchpad>/pr-body.md` — the body summarizes the change, lists the user's rollout steps from spec §12, pastes the mutant kill table, and ends with the Claude Code attribution lines.
3. Watch CI (`gh run list`, matched on the head SHA). When green, check code scanning: `gh api "repos/bettersoftware-io/ReactiveTraderCloudClone/code-scanning/alerts?ref=refs/pull/<N>/merge&state=open" --jq length` → `0`.
4. `gh pr merge <N> --merge --subject "Merge PR #<N>: feat(server): B2a — registered accounts behind the server"`
5. Confirm the merge commit is an ancestor of `origin/main`; remove the worktree and branch.

## Hand-off after merge

B2a merged is not B2a live. These are the user's, in order (spec §12, `supabase/README.md`): create the Supabase project and apply the migration; set up the email sender; paste the two templates; enable IP forwarding; create a secret key and set the two Fly secrets; run `pnpm --filter @rtc/server accounts:probe` and see `PASS`; dispatch `deploy.yml`; sign up once and mark that account admin. Until the secrets are set the deployed server runs in `disabled` mode: registered logins answer 503 and everything else is as it was.

If the probe prints a `✗`, the adapter's mapping for that operation does not match the live API. That is a follow-up PR against `SupabaseAccountDirectory.ts` (the constants `CONFIRM_OTP_TYPE` / `RECOVERY_OTP_TYPE` and `readErrorCode` are the likely sites), with the unit test's replayed response corrected to the real one.
