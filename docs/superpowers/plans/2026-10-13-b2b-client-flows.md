# B2b — Client Account Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a visitor create an account, confirm it with the emailed code, and reset a password from the login screen of both web clients, against the B2a server that shipped (PR #1000) and its hardening (PR #1004).

**Architecture:** The domain `AuthPort` grows the five account flows; `HttpAuthAdapter` implements them against the server's six endpoints and `AuthSimulator` answers `unavailable`. One new machine, `accountAccess`, drives the multi-step flows in all three application cores over one pure fold in `@rtc/core-logic` (`stepAccountAccess`), which also owns every input check and every line of copy, so the three machines are thin shells and the password a user chose on the create-account form is held in the machine's closure, never in its emitted state. The `auth` presenter exposes the port's account flows as `accounts` (machine factories take presenters only, by contract) and its view state gains the refusal reason. The login screen of each web client gains modes driven by the machine's phase, shown only when the page has a server URL, through the same `ViewModelShell` lane the demo hint uses.

**Tech Stack:** TypeScript, rxjs 7 / `@rx-state/core` (RxJS core), the async kernel (`createRunSlot`, `once`), Effect 3 (`createRunSlot`, `rpc`), React 19, SolidJS, vitest 5, Playwright (visual goldens + full-stack browser smoke), `scripts/mutation-check.mts`.

**Spec:** [../specs/2026-10-04-b2-user-management-design.md](../specs/2026-10-04-b2-user-management-design.md) — §7 (client, stage B2b) is the authority; §5.3–§5.4 (what the server answers), §6 (failure modes), §9 (privacy), §10 (testing). Where this plan departs from §7's letter it says so in the task and Task 14 amends the spec.

**Rulings:** [2026-10-13-b2b-client-flows-rulings.md](2026-10-13-b2b-client-flows-rulings.md) — written by the controller during execution.

## What B2a and the hardening fixed that §7 could not know

These facts bind every task below; the spec's §7 was written before they shipped.

| Fact | Consequence for the client |
|---|---|
| `/register` takes `email` + `displayName` only; the password travels with the code to `/confirm-email` (spec §5.3, amended) | The create-account form collects the password with the live checklist, the machine HOLDS it, and the code step sends it. It must never appear in the machine's emitted state (the devtools inspector records machine state). |
| Codes are **eight** digits (`isConfirmationCode`) | The code field takes 8 digits, `inputMode="numeric"`, `autoComplete="one-time-code"`; a code of the wrong shape never reaches the server (a wrong code is a ban strike). |
| `/register`, `/resend-code`, `/request-reset` answer `202 code_sent` before any mail is sent, and identically for a known and an unknown address | The code screen must be reachable WITHOUT requesting a new code ("I already have a code"), because a throttled address can still use the last code it received, and a repeat registration for a confirmed address sends nothing. |
| `400 invalid_request` with a password `rule` at `/confirm-email` does NOT spend the code; `rule: "password"` at `/reset-password` DOES | On a confirmation refusal the same code is retried with a different password (the machine drops the held password and shows the field); on a reset refusal the copy says the code has been used. |
| `200 password_unset` from `/confirm-email` | A notice: the address is confirmed, request a reset code to set a password. |
| `429 rate_limited` carries no `Retry-After`; `429 banned` does | Both read as `rate_limited` on the client: wait and retry. |
| Hardening: `403 origin_not_allowed`, `415 unsupported_media_type`, and the origin allowlist | Both read as `unavailable`, never as a wrong credential. The adapter always sends `Content-Type: application/json`. |
| `403 unconfirmed` is reachable only for an account whose password was set outside the server's flow | Still mapped: the sign-in form offers the code entry on it. |
| `REGISTRATION_OPEN=false` on the deployed server until B2b is deployed | `403 registration_closed` reads "Sign-up is paused for now". |
| The in-memory directory (`RTC_DEV_ACCOUNTS=1`) accepts code `00000000` and seeds `admin@` / `trader@` / `pending@` / `blocked@rtc.test`, password `Mcdc2026!desk`; it cannot produce `password_unset`, `unconfirmed` or a store-refused password | The full-stack browser smoke covers register → confirm → pending, the three seeded refusals and a reset; the contract tiers cover the rest through fakes. |

## Global Constraints

- **No new dependency in any package.** `@rtc/domain` and `@rtc/ws-effects` stay rxjs-only at runtime; `@rtc/core-logic` imports rxjs as types only (`core-logic-stays-pure`); the two sibling cores import rxjs values only in `bridge/`.
- **No client, `@rtc/shared` or `@rtc/domain` ever holds a Supabase URL, key or SDK.** The client talks only to our server's six endpoints.
- **The password and the code are never logged, never put in a machine's emitted state, never in a `data-*` attribute, and never in an error message.** The create-account password lives in the machine's closure (`held.password`) until the confirmation request leaves.
- **Every input is normalized and shape-checked in the fold before a request leaves the machine**: `normalizeEmail` + `isValidEmail`, `normalizeDisplayName` + `isValidDisplayName`, a trimmed code through `isConfirmationCode`, the password through `findPasswordViolation`. A malformed request is a ban strike on the server; the client must never send one.
- **All copy lives in `@rtc/core-logic` (`presenters/accountAccessCopy.ts`)**, imported by the machines (error text) and the UIs (titles, notices, button labels). No string literal a user reads is spelled in a component or a core.
- **Function names state their effect** (`docs/handler-naming.md`); function-typed deps and props are slots and stay `onX` / nouns. Intents: `startRegistration`, `startReset`, `startCodeEntry`, `returnToSignIn`, `register`, `requestReset`, `submitCode`, `resendCode`.
- **One import statement per module** (`rtc/one-import-per-module`); a types-only statement stays `import type`. **`create*` fixture factories below the cases** (`rtc/name-fixture-factories`, `rtc/newspaper-order`). **JSON payloads as object literals + `JSON.stringify`.** Braces on every control statement; explicit return types on every function and typed callback.
- **Fake timers for any timer-driven wait**; none is expected in this plan.
- **Core rules**: a machine folds no port that bursts, so no `collectTurns` case is needed; each machine's `dispose()` makes its intents inert and cancels a request in flight; a request superseded by a navigation never writes state (the run slot / an unsubscribe guards it). Each core's `createMachineFactories` keeps the `(presenters) => MachineFactories` signature of `CoreFactory`.
- **Testids** the e2e layer reads are declared once in `tests/browser/page-objects/contracts/testids.ts` (`TESTIDS.auth`); the ui-contract page object spells the same strings.
- **Visual goldens** are generated from `@rtc/client-react` only and asserted by both clients: the local `react-local/darwin-arm64` set on this Mac, the CI `react/` set by dispatching `update-visual-goldens.yml` with a `scenario_pattern` (an outward step: closing batch). The user accepts the new goldens by eye before merge (spec §7).
- Intra-package imports use `#/` in tests and `./x.js` relative imports in source where the package already does; `pnpm exec biome check --write <files>` before each commit.
- **Never run two builds in this checkout at once.** After editing `@rtc/domain`, `@rtc/shared`, `@rtc/core-api` or `@rtc/core-logic`, rebuild them one at a time in dependency order before running a downstream package's tests (`pnpm --filter @rtc/domain build`, then `@rtc/shared`, `@rtc/core-api`, `@rtc/core-logic`, `@rtc/client-adapters`). Grep `dist` for a new export before trusting a 0 s cached build.
- **The whole-repo typecheck is red between Task 4 and Task 6** (the two sibling cores lack the new member until their task lands) and the Solid contract suite is red between Task 9 and Task 10 — both by design; each task names the package-scoped commands that must be green at its commit.
- No lint suppressions. On the FINAL tree: `/rtc:gauntlet full`, then `pnpm --filter @rtc/tests test:fullstack:browser` and `pnpm test:e2e`.
- One PR. Outward steps (push, workflow dispatch, `gh pr create`, `gh pr merge`) are one per Bash call, batched at the end.

## Review Focus

Inputs and failures §7 implies but does not spell out. Each has a test in the owning task.

1. **The chosen password leaking through the machine's state** (the devtools inspector records every machine state; a password there is a password in a ring buffer). → Task 4: every state the machine emits across a full register → confirm journey is serialized and asserted not to contain the password; the type `AccountAccessState` has no password-typed field.
2. **An address or code reaching the server unnormalized or malformed** — `" Ann@Desk.io "` must leave as `ann@desk.io`; a 7-digit or space-padded code must not leave at all (a wrong code is a ban strike against the real owner's IP). → Task 4: the normalized values are what the port receives; a bad code and a bad address produce an error and no port call.
3. **A late outcome resurrecting a form the user left** — "Back to sign in" while a registration is in flight, then the server answers. → Task 4: the state stays `signIn`; Tasks 5 and 6 inherit the case through the shared suite.
4. **The origin policy's `403` or a `415` read as a wrong credential or a wrong code** — it is our deployment misconfigured, and the message must not send the user to re-type a password. → Task 2: both map to `unavailable` for `/login` and for every flow.
5. **`rule: "password"` meaning two different things** — at `/confirm-email` the code is not spent (retry with another password), at `/reset-password` it is (request a new code). → Task 4: the two copies differ and the held password is dropped only in the confirmation case; Task 2 passes `rule` through untouched.

Also pinned: the sign-in form shows no account links on a page without a server URL (Tasks 7 and 12); an empty-string `VITE_SERVER_URL` counts as none (Task 7); the demo-accounts hint renders only in the `signIn` phase (Task 8).

## File map

| File | Responsibility |
|---|---|
| `packages/domain/src/ports/authPort.ts` | `AuthFailureReason`, `AccountFlowStatus`, `AccountFlowFailure`, `AccountFlowOutcome`, `AccountFlowPort`, the five methods on `AuthPort` |
| `packages/domain/src/auth/accountInput.ts` | `AccountInputRule` + `isAccountInputRule` |
| `packages/domain/src/simulators/AuthSimulator.ts` | `createUnavailableAccountFlows()`; the simulator's five methods |
| `packages/shared/src/protocol/auth.ts` | `AccountFlowResponseDto.status` and `AccountErrorDto.rule` typed from domain; `isAccountFlowResponseDto`, `isAccountErrorDto` |
| `packages/server/src/accounts/AccountService.ts`, `packages/server/src/http/accountHandlers.ts` | `rule` narrowed to `AccountInputRule`; `AccountFlowStatus` imported from domain |
| `packages/core-logic/src/presenters/shellFolds.ts` | `describeAuthFailure` over the five reasons |
| `packages/client-core-rxjs/src/ports/delayedAuthPort.ts`, `packages/client-core-async/src/bridge/loginDelay.ts`, `packages/client-core-effect/src/bridge/loginDelay.ts` | The five flows pass through undelayed |
| `packages/client-adapters/src/adapters/HttpAuthAdapter.ts` | The six endpoints → outcomes |
| `packages/client-adapters/src/adapters/RoutingAuthPort.ts` | The five flows go to the live leg |
| `packages/core-api/src/presenters/auth.ts` | `AuthViewState.failure`; `AuthPresenter.accounts: AccountFlowPort` |
| `packages/core-api/src/machines/accountAccess.ts` | `AccountAccessState`, `AccountAccessIntents`, `RegistrationInput`, `CodeInput`, `AccountAccessFlow` |
| `packages/core-api/src/machine.ts` | `MachineFactories.accountAccess` |
| `packages/core-logic/src/presenters/accountAccessFold.ts` | `stepAccountAccess`, the input checks, `callAccountFlow`, `AccountRequest`, `AccountAccessHeld` |
| `packages/core-logic/src/presenters/accountAccessCopy.ts` | Every string: titles, labels, notices, errors, `PRIVACY_NOTICE_URL` |
| `packages/client-core-rxjs/src/presenters/AccountAccessMachine.ts` | The RxJS machine |
| `packages/client-core-async/src/machines/accountAccess.ts` | The async machine |
| `packages/client-core-effect/src/machines/accountAccess.ts` | The Effect machine |
| `packages/core-contract/src/harness/scriptedPorts.ts`, `packages/core-contract/src/suites/accountAccess.ts`, `packages/core-contract/src/registry.ts` | Scripted account flows; the `machines.accountAccess` suite |
| `packages/react-bindings/src/createViewModel.ts`, `packages/solid-bindings/src/createViewModel.ts` | `useAccountAccess`, `useRegistrationAvailable`, `ViewModelShell.registrationAvailable` |
| `packages/web-boot/src/buildBrowserPorts.ts`, `packages/web-boot/src/startWebClient.ts` | `offersRegistration(env)`; `WebClientPage.registrationAvailable` |
| `packages/client-react/src/AppRoot.tsx`, `packages/client-react/src/main.tsx`, `packages/client-solid/src/AppRoot.tsx`, `packages/client-solid/src/main.tsx` | Pass `registrationAvailable` into the shell |
| `packages/ui-contract/src/shared/harness/world.ts`, `packages/ui-contract/src/shared/mount.ts`, `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts` | The World's `accountAccess` subject, intent log and `registrationAvailable` |
| `packages/ui-contract/src/shared/pages/shell/auth/LoginScreenPage.ts`, `packages/ui-contract/src/specs/shell/auth/LoginScreen.accountAccess.contract.spec.ts` | Page object + the shared behavioural specs |
| `packages/client-react/src/ui/shell/auth/{LoginScreen,SignInForm,CreateAccountForm,EnterCodeForm,ResetRequestForm,AccountNotice,PasswordChecklist}.tsx`, `LoginScreen.module.css` | The React login screen with modes |
| `packages/client-solid/src/ui/shell/auth/…` (same seven files) | The Solid twin |
| `packages/ui-contract/src/visual/{appData,fixtures,scenarios,scenarioActions}.ts`, `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts` | Eight new login scenarios |
| `tests/browser/page-objects/contracts/{LoginScreen,testids}.ts`, `tests/browser/page-objects/playwright/LoginScreen.ts`, `tests/browser/scenarios/login.ts`, `tests/browser/playwright/login.spec.ts`, `tests/fullstack/browser/accounts.spec.ts` | e2e: the account journey over the real server |
| `docs/authentication.md`, `docs/STATUS.md`, `CLAUDE.md`, `docs/architecture/22-…`, `docs/architecture/23-…`, `packages/client-core-{async,effect}/README.md`, `docs/privacy.md`, the spec | Docs |

---

### Task 1: The port grows — domain, shared, simulator, every `AuthPort` implementer compiles

**Files:**
- Modify: `packages/domain/src/ports/authPort.ts`
- Modify: `packages/domain/src/auth/accountInput.ts` (+ `accountInput.test.ts`)
- Modify: `packages/domain/src/simulators/AuthSimulator.ts` (+ `AuthSimulator.test.ts`)
- Modify: `packages/domain/src/index.ts` (exports)
- Modify: `packages/shared/src/protocol/auth.ts` (+ its test file, if one exists beside it; else add `auth.test.ts`)
- Modify: `packages/server/src/accounts/AccountService.ts` (three `rule: string` → `AccountInputRule`), `packages/server/src/http/accountHandlers.ts` (`AccountFlowStatus` import from `@rtc/domain`)
- Modify: `packages/core-logic/src/presenters/shellFolds.ts` (+ `__tests__/shellFolds.test.ts`)
- Modify: `packages/client-core-rxjs/src/ports/delayedAuthPort.ts`, `packages/client-core-async/src/bridge/loginDelay.ts`, `packages/client-core-effect/src/bridge/loginDelay.ts` (+ each's test)
- Modify (compile only — fakes that build an `AuthPort` literal): `packages/client-core-rxjs/src/presenters/__tests__/AuthPresenter.test.ts`, `packages/client-core-rxjs/src/ports/delayedAuthPort.test.ts`, `packages/client-core-async/src/bridge/authDepsPrimitives.test.ts`, `packages/client-core-effect/src/bridge/authDepsPrimitives.test.ts`, `packages/client-core-async/src/hybridRelaunch.test.ts`, `packages/client-core-effect/src/hybridRelaunch.test.ts`, `packages/react-bindings/src/__tests__/authHooks.test.tsx`, `packages/solid-bindings/src/createViewModel.streams.test.tsx`, `packages/core-contract/src/harness/scriptedPorts.ts`, and anything else `pnpm typecheck` names.

**Interfaces:**
- Consumes: `PasswordRuleId`, `PASSWORD_RULES`, `normalizeEmail` … from `@rtc/domain` (existing).
- Produces (later tasks rely on these exact names):

```ts
// packages/domain/src/ports/authPort.ts
import type { Observable } from "rxjs";

import type { AccountInputRule } from "../auth/accountInput.js";
import type { SessionUser } from "../auth/sessionUser.js";

/** Why a sign-in was refused. The last three are only ever said after a
 * correct password (the server's rule, spec §5.4), so they reveal nothing
 * to a guesser. */
export type AuthFailureReason =
  | "invalid"
  | "unavailable"
  | "unconfirmed"
  | "pending"
  | "blocked";

export type AuthOutcome =
  | {
      readonly ok: true;
      readonly token: string;
      readonly user: SessionUser;
      readonly exp: number;
    }
  | { readonly ok: false; readonly reason: AuthFailureReason };

/** What an account flow answered: `code_sent` from a registration, a resend
 * or a reset request; `pending_approval` or `password_unset` from a
 * confirmation; `password_changed` from a reset. The wire spells the same
 * words (`AccountFlowResponseDto`). */
export type AccountFlowStatus =
  | "code_sent"
  | "pending_approval"
  | "password_changed"
  | "password_unset";

/** Why an account flow was refused. `invalid_input` carries the rule that
 * failed; `rate_limited` covers the per-IP limit, the per-address budget and
 * a ban alike (wait, then retry); `unavailable` is everything the user
 * cannot act on — the store down, the origin refused, a malformed answer. */
export type AccountFlowFailure =
  | "invalid_input"
  | "invalid_code"
  | "registration_closed"
  | "rate_limited"
  | "unavailable";

export type AccountFlowOutcome =
  | { readonly ok: true; readonly status: AccountFlowStatus }
  | {
      readonly ok: false;
      readonly reason: AccountFlowFailure;
      readonly rule?: AccountInputRule;
    };

export interface AuthPort {
  login(username: string, password: string): Observable<AuthOutcome>;
  /** Starts a registration. No password yet: one chosen before the mailbox
   * is proven could be an attacker's (spec §5.3); `confirmEmail` sets it.
   * Answers `code_sent` for a new and a known address alike. */
  register(email: string, displayName: string): Observable<AccountFlowOutcome>;
  resendCode(email: string): Observable<AccountFlowOutcome>;
  /** Proves the mailbox and sets the password in one request. */
  confirmEmail(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome>;
  requestPasswordReset(email: string): Observable<AccountFlowOutcome>;
  resetPassword(
    email: string,
    code: string,
    password: string,
  ): Observable<AccountFlowOutcome>;
}

/** The five account flows without `login` — what the `accountAccess`
 * machine is built on, and what `AuthPresenter.accounts` exposes. */
export type AccountFlowPort = Omit<AuthPort, "login">;
```

```ts
// packages/domain/src/auth/accountInput.ts — add
import { PASSWORD_RULES, type PasswordRuleId } from "./passwordPolicy.js";

/** Which input an account request broke: a password rule, the address, the
 * display name, or `password` when the store refused one the rule allowed
 * (spec §5.3 / §7). This is the vocabulary of `AccountErrorDto.rule`. */
export type AccountInputRule =
  | PasswordRuleId
  | "email"
  | "display-name"
  | "password";

const OTHER_INPUT_RULES: readonly string[] = ["email", "display-name", "password"];

export function isAccountInputRule(value: unknown): value is AccountInputRule {
  return (
    typeof value === "string" &&
    (OTHER_INPUT_RULES.includes(value) ||
      PASSWORD_RULES.some((rule) => {
        return rule.id === value;
      }))
  );
}
```

```ts
// packages/domain/src/simulators/AuthSimulator.ts — add, and use in the class
const ACCOUNT_FLOWS_UNAVAILABLE: AccountFlowOutcome = {
  ok: false,
  reason: "unavailable",
};

/** The account flows of a port with no account store behind it: every call
 * answers `unavailable`, synchronously. The simulator's own, and the one
 * every test fake that only cares about `login` spreads in. */
export function createUnavailableAccountFlows(): AccountFlowPort {
  function unavailable(): Observable<AccountFlowOutcome> {
    return of(ACCOUNT_FLOWS_UNAVAILABLE);
  }

  return {
    register: unavailable,
    resendCode: unavailable,
    confirmEmail: unavailable,
    requestPasswordReset: unavailable,
    resetPassword: unavailable,
  };
}
```

`AuthSimulator` gains the five methods by delegating to one private `flows = createUnavailableAccountFlows()` field (`register(email, displayName) { return this.flows.register(email, displayName); }` etc. — a class cannot spread an object into its prototype, so five one-line methods). Domain `index.ts` exports `AccountFlowFailure`, `AccountFlowOutcome`, `AccountFlowPort`, `AccountFlowStatus`, `AuthFailureReason` beside `AuthOutcome`/`AuthPort` (line ~215), `AccountInputRule` + `isAccountInputRule` beside `isValidEmail`, and `createUnavailableAccountFlows` beside `AuthSimulator`.

```ts
// packages/shared/src/protocol/auth.ts — the DTO types now name domain's
import type { AccountFlowStatus, AccountInputRule } from "@rtc/domain";
// remove shared's own `AccountFlowStatus`; keep `AccountErrorCode` (wire words incl. origin_not_allowed / unsupported_media_type)

export interface AccountFlowResponseDto {
  readonly status: AccountFlowStatus;
}

export interface AccountErrorDto {
  readonly error: AccountErrorCode;
  /** Which input rule failed, on `invalid_request`. */
  readonly rule?: AccountInputRule;
}

const ACCOUNT_FLOW_STATUSES: readonly string[] = [
  "code_sent",
  "pending_approval",
  "password_changed",
  "password_unset",
];

/** A success body: `{status}` with one of the four words. */
export function isAccountFlowResponseDto(
  value: unknown,
): value is AccountFlowResponseDto {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).status === "string" &&
    ACCOUNT_FLOW_STATUSES.includes((value as Record<string, unknown>).status as string)
  );
}

/** A failure body: `{error}` with a string, `rule` absent or a string. The
 * client maps the words it knows and reads anything else as unavailable. */
export function isAccountErrorDto(value: unknown): value is AccountErrorDto {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.error === "string" &&
    (record.rule === undefined || typeof record.rule === "string")
  );
}
```

`AccountService.ts`: the three `{ outcome: "invalid"; rule: string }` become `rule: AccountInputRule` (import from `@rtc/domain`; the literals it already returns — `"email"`, `"display-name"`, `violation.id`, `"password"` — all fit). `accountHandlers.ts`: `AccountFlowStatus` comes from `@rtc/domain` now.

```ts
// packages/core-logic/src/presenters/shellFolds.ts — replace describeAuthFailure
/** The error line a failed login or unlock shows, one per reason. */
export function describeAuthFailure(reason: AuthFailureReason): string {
  switch (reason) {
    case "invalid":
      return "Invalid credentials";
    case "unavailable":
      return "Service unavailable";
    case "unconfirmed":
      return "Email not confirmed";
    case "pending":
      return "Account awaiting approval";
    case "blocked":
      return "Account blocked";
  }
}
```

The three `withLoginDelay` copies delegate the five flows undelayed (the delay is a login-wait treatment; a flow's answer renders as a form state, not a wait screen):

```ts
  return {
    login(username: string, password: string): Observable<AuthOutcome> {
      /* unchanged */
    },
    register(email: string, displayName: string): Observable<AccountFlowOutcome> {
      return inner.register(email, displayName);
    },
    resendCode(email: string): Observable<AccountFlowOutcome> {
      return inner.resendCode(email);
    },
    confirmEmail(email: string, code: string, password: string): Observable<AccountFlowOutcome> {
      return inner.confirmEmail(email, code, password);
    },
    requestPasswordReset(email: string): Observable<AccountFlowOutcome> {
      return inner.requestPasswordReset(email);
    },
    resetPassword(email: string, code: string, password: string): Observable<AccountFlowOutcome> {
      return inner.resetPassword(email, code, password);
    },
  };
```

Every test fake that is an `AuthPort` literal gets `...createUnavailableAccountFlows(),` as its first member (import from `@rtc/domain`); `createFakeAuthPort`-style factories keep their shape otherwise. The core-contract harness (`scriptedPorts.ts`) gets its real scripting in Task 4; here it only compiles: give its `auth` the five members through `...createUnavailableAccountFlows()` INSIDE the `countCalls<AuthPort>({ … })` literal, before `login`.

- [ ] **Step 1: Write the failing domain tests**

In `packages/domain/src/auth/accountInput.test.ts` (new `describe("isAccountInputRule")`):

```ts
describe("isAccountInputRule", () => {
  it("accepts every password rule id and the three other rules", () => {
    for (const rule of PASSWORD_RULES) {
      expect(isAccountInputRule(rule.id)).toBe(true);
    }

    expect(isAccountInputRule("email")).toBe(true);
    expect(isAccountInputRule("display-name")).toBe(true);
    expect(isAccountInputRule("password")).toBe(true);
  });

  it("rejects an unknown word, a non-string and the server's error words", () => {
    expect(isAccountInputRule("invalid_code")).toBe(false);
    expect(isAccountInputRule("")).toBe(false);
    expect(isAccountInputRule(12)).toBe(false);
    expect(isAccountInputRule(undefined)).toBe(false);
  });
});
```

In `packages/domain/src/simulators/AuthSimulator.test.ts`:

```ts
  it("answers every account flow with unavailable, synchronously — a simulator offers no registration", () => {
    const simulator = new AuthSimulator({ demo: "pw" });
    const seen: AccountFlowOutcome[] = [];

    simulator.register("a@b.co", "Ann").subscribe((o) => seen.push(o));
    simulator.resendCode("a@b.co").subscribe((o) => seen.push(o));
    simulator.confirmEmail("a@b.co", "12345678", "Pass!word2026x").subscribe((o) => seen.push(o));
    simulator.requestPasswordReset("a@b.co").subscribe((o) => seen.push(o));
    simulator.resetPassword("a@b.co", "12345678", "Pass!word2026x").subscribe((o) => seen.push(o));

    expect(seen).toEqual(Array(5).fill({ ok: false, reason: "unavailable" }));
  });
```

In `packages/core-logic/src/presenters/__tests__/shellFolds.test.ts`:

```ts
  it.each([
    ["invalid", "Invalid credentials"],
    ["unavailable", "Service unavailable"],
    ["unconfirmed", "Email not confirmed"],
    ["pending", "Account awaiting approval"],
    ["blocked", "Account blocked"],
  ] as const)("describeAuthFailure(%s) → %s", (reason, text) => {
    expect(describeAuthFailure(reason)).toBe(text);
  });
```

In each `withLoginDelay` test (three files): "the five account flows pass through undelayed and reach the inner port with the same arguments" — a recording inner port (`...createUnavailableAccountFlows()` overridden with recording arrows), `delayMs` returning 5_000 under fake timers, subscribe `register("a@b.co", "Ann")`, assert the outcome arrived WITHOUT advancing timers and the inner saw `["a@b.co", "Ann"]`.

In shared's test: `isAccountFlowResponseDto({ status: "code_sent" })` true; `{ status: "ok" }` false; `isAccountErrorDto({ error: "invalid_request", rule: "email" })` true; `{ error: 4 }` false; `{ error: "x", rule: 3 }` false.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @rtc/domain test -- accountInput AuthSimulator` → FAIL (`isAccountInputRule` is not exported; `register` is not a function). Same for core-logic and shared.

- [ ] **Step 3: Implement** the code above; add the five methods to every fake; narrow the server's rule type.

- [ ] **Step 4: Build in order and verify**

```bash
pnpm --filter @rtc/domain build && pnpm --filter @rtc/shared build && pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-logic build
pnpm --filter @rtc/domain test && pnpm --filter @rtc/shared test && pnpm --filter @rtc/core-logic test && pnpm --filter @rtc/server test
pnpm typecheck
```

Expected: all PASS; the typecheck is green (every `AuthPort` literal has the five members).

- [ ] **Step 5: Commit**

```bash
git add -A packages/domain packages/shared packages/server packages/core-logic packages/client-core-rxjs packages/client-core-async packages/client-core-effect packages/react-bindings packages/solid-bindings packages/core-contract
git commit -m "feat(domain): the auth port gains the five account flows and the three refusal reasons"
```

---

### Task 2: `HttpAuthAdapter` speaks the six endpoints; the routing port sends the flows live

**Files:**
- Modify: `packages/client-adapters/src/adapters/HttpAuthAdapter.ts` (+ `HttpAuthAdapter.test.ts`)
- Modify: `packages/client-adapters/src/adapters/RoutingAuthPort.ts` (+ `RoutingAuthPort.test.ts`)

**Interfaces:**
- Consumes: Task 1's `AccountFlowOutcome`, `AuthFailureReason`, `isAccountFlowResponseDto`, `isAccountErrorDto`, `isAccountInputRule`.
- Produces: nothing new; the adapters implement the grown `AuthPort`.

The adapter never logs anything. Status mapping, exactly:

| Endpoint | Status / body | Outcome |
|---|---|---|
| `/login` | 200 `{token,user,exp}` | ok |
| `/login` | 401 | `invalid` |
| `/login` | 403 `error: "unconfirmed"` / `"pending_approval"` / `"blocked"` | `unconfirmed` / `pending` / `blocked` |
| `/login` | 403 anything else (`origin_not_allowed`), 415, 429, 5xx, network error, unparsable body | `unavailable` |
| flow | 200 or 202 with `isAccountFlowResponseDto` | `{ ok: true, status }` |
| flow | 400 `error: "invalid_request"` | `{ ok: false, reason: "invalid_input", rule }` — `rule` only when `isAccountInputRule(body.rule)` |
| flow | 400 `error: "invalid_code"` | `invalid_code` |
| flow | 403 `error: "registration_closed"` | `registration_closed` |
| flow | 429 (`rate_limited` or `banned`) | `rate_limited` |
| flow | everything else (400 `malformed_json`, 403 other, 413, 415, 5xx, a 200 with an unknown status, network error) | `unavailable` |

```ts
// HttpAuthAdapter.ts — shape of the additions
const FLOW_UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

  register(email: string, displayName: string): Observable<AccountFlowOutcome> {
    return this.flow("/register", { email, displayName });
  }
  // resendCode → "/resend-code" { email }; confirmEmail → "/confirm-email" { email, code, password };
  // requestPasswordReset → "/request-reset" { email }; resetPassword → "/reset-password" { email, code, password }

  private flow(path: string, body: Record<string, string>): Observable<AccountFlowOutcome> {
    return defer(() => {
      return from(this.postFlow(path, body));
    }).pipe(
      catchError((): Observable<AccountFlowOutcome> => {
        return of(FLOW_UNAVAILABLE);
      }),
    );
  }

  private async postFlow(path: string, body: Record<string, string>): Promise<AccountFlowOutcome> {
    const response = await this.fetchImpl(`${this.httpBaseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await readJson(response);

    if (response.status === 200 || response.status === 202) {
      return isAccountFlowResponseDto(payload)
        ? { ok: true, status: payload.status }
        : FLOW_UNAVAILABLE;
    }

    if (response.status === 429) {
      return { ok: false, reason: "rate_limited" };
    }

    const error = isAccountErrorDto(payload) ? payload : null;

    if (response.status === 400 && error?.error === "invalid_code") {
      return { ok: false, reason: "invalid_code" };
    }

    if (response.status === 400 && error?.error === "invalid_request") {
      return isAccountInputRule(error.rule)
        ? { ok: false, reason: "invalid_input", rule: error.rule }
        : { ok: false, reason: "invalid_input" };
    }

    if (response.status === 403 && error?.error === "registration_closed") {
      return { ok: false, reason: "registration_closed" };
    }

    return FLOW_UNAVAILABLE;
  }

/** The body as JSON, or null when it is not JSON — a refusal from a proxy
 * or the origin policy may carry none. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
```

`postLogin` gains, between the 401 and the fallthrough:

```ts
    if (response.status === 403) {
      const payload = await readJson(response);
      const error = isAccountErrorDto(payload) ? payload.error : null;

      if (error === "unconfirmed") {
        return { ok: false, reason: "unconfirmed" };
      }

      if (error === "pending_approval") {
        return { ok: false, reason: "pending" };
      }

      if (error === "blocked") {
        return { ok: false, reason: "blocked" };
      }
    }
```

`createRoutingAuthPort` returns the five flows as `deps.live`'s, each error-isolated to `unavailable` like `askServer`:

```ts
  function liveFlow(call: (live: AuthPort) => Observable<AccountFlowOutcome>): Observable<AccountFlowOutcome> {
    return defer(() => {
      return call(deps.live);
    }).pipe(
      catchError((): Observable<AccountFlowOutcome> => {
        return of(FLOW_UNAVAILABLE);
      }),
    );
  }

  return {
    login(...) { /* unchanged */ },
    register: (email: string, displayName: string) => {
      return liveFlow((live) => {
        return live.register(email, displayName);
      });
    },
    // the other four alike
  };
```

- [ ] **Step 1: Write the failing adapter tests** — in `HttpAuthAdapter.test.ts`, a `describe("account flows")` with `it.each` over the five methods: `[name, path, args, body]`, asserting URL, method, `Content-Type`, and the JSON body; then one case per row of the mapping table above (202 code_sent → ok; 200 with `{status:"nonsense"}` → unavailable; 400 invalid_request rule min-length → invalid_input with rule; 400 invalid_request rule "bogus" → invalid_input without rule; 400 invalid_code; 400 malformed_json → unavailable; 403 registration_closed; 403 origin_not_allowed → unavailable; 415 → unavailable; 429 rate_limited and 429 banned → rate_limited; 503; `fetchImpl` rejecting → unavailable; a 202 with a non-JSON body → unavailable). For `/login`: 403 unconfirmed / pending_approval / blocked → the three reasons; 403 origin_not_allowed → unavailable; 415 → unavailable. Fixtures through `createJsonResponse(body, status)` / the file's existing `jsonResponse` helper.
- [ ] **Step 2: Run** `pnpm --filter @rtc/client-adapters test -- HttpAuthAdapter` → FAIL (`register is not a function`).
- [ ] **Step 3: Implement** as above.
- [ ] **Step 4: Routing tests** — in `RoutingAuthPort.test.ts`: "each account flow is sent to the live leg with the same arguments and never to the demo leg" (recording `live`, a `demo` whose flows throw if called); "an erroring live flow reads as unavailable".
- [ ] **Step 5: Run** `pnpm --filter @rtc/client-adapters test` → PASS; `pnpm --filter @rtc/client-adapters build`.
- [ ] **Step 6: Commit** `feat(client-adapters): the HTTP auth adapter speaks the six account endpoints; the hybrid port sends the flows live`

---

### Task 3: The auth view state says WHY — `failure` beside `error`, in three cores

**Files:**
- Modify: `packages/core-api/src/presenters/auth.ts`
- Modify: `packages/client-core-rxjs/src/presenters/AuthPresenter.ts` (+ `__tests__/AuthPresenter.test.ts`)
- Modify: `packages/client-core-async/src/presenters/shell.ts`, `packages/client-core-effect/src/presenters/shell.ts` (+ their `shell.test.ts`)
- Modify: `packages/core-contract/src/suites/auth.ts`
- Modify (every `AuthViewState` literal gains `failure: null`): `packages/client-core-async/src/bridge/transportGate.test.ts`, `packages/client-core-effect/src/bridge/transportGate.test.ts`, `packages/ui-contract/src/shared/harness/world.ts` (`DEFAULT_AUTH` / the seed merge), `packages/ui-contract/src/visual/fixtures.ts`, `packages/ui-contract/src/specs/shell/auth/LoginScreen.contract.spec.ts`, `packages/ui-contract/src/specs/shell/lock/LockScreen.wait.contract.spec.ts`, `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`, `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts`, `packages/client-react-native/src/ui/shell/auth/LoginScreen.test.tsx`, `packages/client-react-native/tests/visual/fake/shell.ts`, `packages/client-react-native/tests/visual/scenarios.tsx`, `packages/client-react-native/tests/pages/LoginScreenPage.tsx`, `packages/client-react-native/tests/pages/LockScreenPage.tsx`, `packages/solid-bindings/src/createViewModel.ts` (if it spells a literal), and anything else `pnpm typecheck` names.

**Interfaces:**
- Produces:

```ts
// packages/core-api/src/presenters/auth.ts — AuthViewState gains
  /** Why the last attempt failed, or null; `error` is its text. The sign-in
   * form branches on it: `unconfirmed` offers the code entry (spec §7). */
  readonly failure: AuthFailureReason | null;

// and AuthPresenter gains
  /** The port's five account flows, for the `accountAccess` machine — a
   * machine factory is handed presenters only (`CoreFactory`), so the
   * flows reach it through here. Pass-through: nothing is written to
   * `state$`, and no outcome is observed by this presenter. */
  readonly accounts: AccountFlowPort;
```

Each core: `failure: null` in its signed-out constant and its authenticated writes; `failure: outcome.reason` wherever `error: describeAuthFailure(outcome.reason)` is written (login AND unlock refusals); `accounts: deps.auth` (async, effect) / `readonly accounts: AccountFlowPort = this.auth` (rxjs — the delayed port, whose flows pass through). This is the spec's "the `auth` presenter changes only by mapping the new failure reasons" plus the `accounts` seam the factory contract forces (Task 14 amends §7).

- [ ] **Step 1: Extend the auth contract suite** (`packages/core-contract/src/suites/auth.ts`) — all three cores run it:

```ts
    it.each([
      ["invalid", "Invalid credentials"],
      ["unavailable", "Service unavailable"],
      ["unconfirmed", "Email not confirmed"],
      ["pending", "Account awaiting approval"],
      ["blocked", "Account blocked"],
    ] as const)(
      "a login refused with %s is signed out with that reason and its text",
      async (reason, text) => {
        await withFakeClock(async () => {
          vi.setSystemTime(NOW);
          const h = makeHarness();

          try {
            const c = collect(h.app.presenters.auth.state$);
            h.app.presenters.auth.login(DEMO.username, "pw");
            await settle();
            h.driver.resolveLogin({ ok: false, reason });
            await settle();
            expect(c.values.at(-1)).toEqual({
              ...SIGNED_OUT,
              error: text,
              failure: reason,
              waitVariant: DEFAULT_LOGIN_WAIT_VARIANT,
            });
            c.unsubscribe();
          } finally {
            await h.teardown();
          }
        });
      },
    );

    it("a refused unlock keeps the session locked and carries the reason", …)  // blocked → locked:true, unlocking:false, failure:"blocked", error:"Account blocked"

    it("accounts is the port's account flows: each call reaches the port once with the same arguments and is not counted as a login", async () => {
      // uses Task 1's compile-only harness: `h.driver.portCalls()` or the
      // counted `auth.register` tally — assert ONE `auth.register` call after
      // subscribing `h.app.presenters.auth.accounts.register("a@b.co", "Ann")`,
      // and that `pendingLogins()` is empty. (Task 4 replaces the harness's
      // unavailable flows with scripted queues; keep this case independent of
      // the outcome.)
    });
```

`SIGNED_OUT` in the suite gains `failure: null`; the existing successful-login cases need no change beyond the constant.

- [ ] **Step 2: Run** `pnpm --filter @rtc/client-core-rxjs test -- coreContract` → FAIL on `failure`.
- [ ] **Step 3: Implement** in core-api and the three cores; add `failure: null` to every literal the typecheck names; the World's default auth state gains `failure: null` and its seed merge keeps accepting `Partial<AuthViewState>`.
- [ ] **Step 4: Verify** `pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-contract build`, then `pnpm --filter @rtc/client-core-rxjs test && pnpm --filter @rtc/client-core-async test && pnpm --filter @rtc/client-core-effect test && pnpm typecheck` → PASS / green.
- [ ] **Step 5: Commit** `feat(core-api): the auth view state carries the refusal reason; the auth presenter exposes the account flows`

---

### Task 4: The `accountAccess` contract, fold and copy; the RxJS machine; the contract suite

**Files:**
- Create: `packages/core-api/src/machines/accountAccess.ts`; modify `packages/core-api/src/machines/index.ts`, `packages/core-api/src/machine.ts`
- Create: `packages/core-logic/src/presenters/accountAccessFold.ts`, `packages/core-logic/src/presenters/accountAccessCopy.ts`, `packages/core-logic/src/presenters/__tests__/accountAccessFold.test.ts`; modify `packages/core-logic/src/index.ts`
- Create: `packages/client-core-rxjs/src/presenters/AccountAccessMachine.ts`; modify `packages/client-core-rxjs/src/composition.ts` (`createMachineFactories`)
- Modify: `packages/core-contract/src/harness/scriptedPorts.ts`; create `packages/core-contract/src/suites/accountAccess.ts`; modify `packages/core-contract/src/registry.ts`
- Modify: `packages/web-boot/src/devtools/presenterManifest.ts` is NOT touched (machines are instrumented generically by `instrumentMachineFactories`).

**Interfaces:**
- Consumes: Task 1's domain types and checks; Task 3's `AuthPresenter.accounts`.
- Produces (every later task relies on these names):

```ts
// packages/core-api/src/machines/accountAccess.ts
/** Which emailed code the code step is for. */
export type AccountAccessFlow = "signup" | "reset";

/** The login screen's account flows, by phase. `signIn` is the machine at
 * rest (the ordinary sign-in form). No phase ever carries a password or a
 * code: the machine holds the chosen password in its closure until the
 * confirmation request leaves (spec §5.3). */
export type AccountAccessState =
  | { readonly phase: "signIn" }
  | {
      readonly phase: "register";
      readonly busy: boolean;
      readonly error: string | null;
    }
  | {
      readonly phase: "code";
      readonly flow: AccountAccessFlow;
      /** The address the code went to, when this machine sent it; null when
       * the user arrived with a code of their own and types the address. */
      readonly email: string | null;
      /** True while the machine holds the password chosen on the
       * create-account form; the form shows a password field when false. */
      readonly passwordHeld: boolean;
      /** True right after a resend the server accepted. */
      readonly resent: boolean;
      readonly busy: boolean;
      readonly error: string | null;
    }
  | {
      readonly phase: "requestReset";
      readonly busy: boolean;
      readonly error: string | null;
    }
  | { readonly phase: "pendingApproval"; readonly email: string }
  | { readonly phase: "passwordUnset"; readonly email: string }
  | { readonly phase: "passwordChanged"; readonly email: string };

export interface RegistrationInput {
  readonly email: string;
  readonly displayName: string;
  readonly password: string;
}

/** What the code form submits. `email` and `password` are read only when
 * the machine holds none (`email === null` / `passwordHeld === false`). */
export interface CodeInput {
  readonly email?: string;
  readonly code: string;
  readonly password?: string;
}

export interface AccountAccessIntents {
  startRegistration(): void;
  startReset(): void;
  /** "I already have a code": the sign-up code step with nothing held. */
  startCodeEntry(): void;
  returnToSignIn(): void;
  register(input: RegistrationInput): void;
  requestReset(email: string): void;
  submitCode(input: CodeInput): void;
  /** Sends a fresh code to the held address, or to `email` when none is held. */
  resendCode(email?: string): void;
}
```

```ts
// packages/core-api/src/machine.ts — MachineFactories gains
  /** The login screen's create-account / confirm / reset flows. One per
   * login-screen mount; at rest it is the plain sign-in form (`signIn`). */
  accountAccess: () => Machine<AccountAccessState, AccountAccessIntents>;
```

```ts
// packages/core-logic/src/presenters/accountAccessCopy.ts — every string, once
export const PRIVACY_NOTICE_URL =
  "https://github.com/bettersoftware-io/ReactiveTraderCloudClone/blob/main/docs/privacy.md";

export const TITLE_PREFIX = "REACTIVE TRADER OS · ";

/** The login panel's title for a phase (the sign-in title is unchanged). */
export function describeAccountAccessTitle(state: AccountAccessState): string {
  switch (state.phase) {
    case "signIn":
      return `${TITLE_PREFIX}SIGN IN`;
    case "register":
      return `${TITLE_PREFIX}CREATE ACCOUNT`;
    case "code":
      return state.flow === "reset"
        ? `${TITLE_PREFIX}RESET PASSWORD`
        : `${TITLE_PREFIX}CONFIRM EMAIL`;
    case "requestReset":
      return `${TITLE_PREFIX}RESET PASSWORD`;
    case "pendingApproval":
      return `${TITLE_PREFIX}AWAITING APPROVAL`;
    case "passwordUnset":
      return `${TITLE_PREFIX}SET A PASSWORD`;
    case "passwordChanged":
      return `${TITLE_PREFIX}PASSWORD CHANGED`;
  }
}

export const ACCOUNT_ACCESS_COPY = {
  createAccountLink: "Create account ▸",
  forgotPasswordLink: "Forgot password?",
  haveCodeLink: "I already have a code",
  backToSignInLink: "Back to sign in",
  resendLink: "Resend code",
  enterCodeAfterUnconfirmed: "Enter confirmation code ▸",
  emailLabel: "Email",
  displayNameLabel: "Display name",
  passwordLabel: "Password",
  newPasswordLabel: "New password",
  codeLabel: "8-digit code",
  registerSubmit: "CREATE ACCOUNT ▸",
  confirmSubmit: "CONFIRM ▸",
  setPasswordSubmit: "SET PASSWORD ▸",
  requestResetSubmit: "SEND RESET CODE ▸",
  busySubmit: "SENDING",
  codeSentTo: "Code sent to",
  codeResent: "A new code is on its way",
  privacyLead: "By creating an account you agree to the",
  privacyLink: "privacy notice",
  pendingApprovalNotice:
    "Your email is confirmed. An administrator approves each account by hand; sign in once you have been approved.",
  passwordUnsetNotice:
    "Your email is confirmed, but no password could be stored. Request a reset code to set one.",
  passwordChangedNotice: "Your password has been changed. Sign in with it.",
  requestResetAction: "SEND RESET CODE ▸",
  signInAction: "SIGN IN ▸",
} as const;

export const EMAIL_INPUT_ERROR = "Enter a valid email address";
export const DISPLAY_NAME_INPUT_ERROR =
  "Display name: 2 to 40 characters, with at least one letter or digit";
export const CODE_INPUT_ERROR = "Enter the 8-digit code from the email";
export const PASSWORD_REQUIRED_ERROR = "Choose a password";

/** "Password: at least 12 characters" — the checklist label, lowercased. */
export function describePasswordRule(rule: PasswordRuleId): string {
  const found = PASSWORD_RULES.find((candidate) => {
    return candidate.id === rule;
  });

  return `Password: ${(found?.label ?? rule).toLowerCase()}`;
}

/** The error line for a refused account flow. Which request it refused
 * matters twice: a spent code (`password` at a reset) and a throttled SEND
 * (the last code still works). */
export function describeAccountFailure(
  refusal: AccountFlowRefusal,
  request: AccountRequestKind,
): string {
  switch (refusal.reason) {
    case "invalid_input":
      return describeInputRule(refusal.rule, request);
    case "invalid_code":
      return "That code is not valid or has expired";
    case "registration_closed":
      return "Sign-up is paused for now";
    case "rate_limited":
      return isSend(request)
        ? "Too many codes requested. The last code you received still works"
        : "Too many attempts. Wait a few minutes and try again";
    case "unavailable":
      return "The live desk is unavailable right now. Try again shortly";
  }
}

function describeInputRule(rule: AccountInputRule | undefined, request: AccountRequestKind): string {
  if (rule === undefined) {
    return "The request was refused";
  }

  if (rule === "email") {
    return EMAIL_INPUT_ERROR;
  }

  if (rule === "display-name") {
    return DISPLAY_NAME_INPUT_ERROR;
  }

  if (rule === "password") {
    return request === "resetPassword"
      ? "That code has been used. Request a new one and choose a different password"
      : "That password was refused. Request a reset code to set one";
  }

  return describePasswordRule(rule);
}

function isSend(request: AccountRequestKind): boolean {
  return request === "register" || request === "resendCode" || request === "requestPasswordReset";
}
```

(`AccountFlowRefusal = Extract<AccountFlowOutcome, { ok: false }>` and `AccountRequestKind = AccountRequest["kind"]` are defined in the fold file and imported here; the copy file imports `PASSWORD_RULES`, `PasswordRuleId`, `AccountInputRule` from `@rtc/domain` and `AccountAccessState` from `@rtc/core-api`.)

```ts
// packages/core-logic/src/presenters/accountAccessFold.ts
import type { AccountAccessState, CodeInput, RegistrationInput, Stream } from "@rtc/core-api";
import {
  type AccountFlowOutcome,
  type AccountFlowPort,
  findPasswordViolation,
  isConfirmationCode,
  isValidDisplayName,
  isValidEmail,
  normalizeDisplayName,
  normalizeEmail,
} from "@rtc/domain";

import {
  CODE_INPUT_ERROR,
  describeAccountFailure,
  describePasswordRule,
  DISPLAY_NAME_INPUT_ERROR,
  EMAIL_INPUT_ERROR,
  PASSWORD_REQUIRED_ERROR,
} from "#/presenters/accountAccessCopy";

export const ACCOUNT_ACCESS_IDLE: AccountAccessState = { phase: "signIn" };

export type AccountFlowRefusal = Extract<AccountFlowOutcome, { readonly ok: false }>;

/** What the machine holds across steps and never emits: the address a code
 * went to, and the password chosen on the create-account form, which
 * travels with the code (spec §5.3). */
export interface AccountAccessHeld {
  readonly email: string | null;
  readonly password: string | null;
}

export const NOTHING_HELD: AccountAccessHeld = { email: null, password: null };

/** One call for the machine to make on its port's account flows. Transient:
 * it carries the password to the port and is never emitted. */
export type AccountRequest =
  | { readonly kind: "register"; readonly email: string; readonly displayName: string }
  | { readonly kind: "resendCode"; readonly email: string }
  | { readonly kind: "confirmEmail"; readonly email: string; readonly code: string; readonly password: string }
  | { readonly kind: "requestPasswordReset"; readonly email: string }
  | { readonly kind: "resetPassword"; readonly email: string; readonly code: string; readonly password: string };

export type AccountRequestKind = AccountRequest["kind"];

export type AccountAccessEvent =
  | { readonly kind: "startRegistration" }
  | { readonly kind: "startReset" }
  | { readonly kind: "startCodeEntry" }
  | { readonly kind: "returnToSignIn" }
  | { readonly kind: "register"; readonly input: RegistrationInput }
  | { readonly kind: "requestReset"; readonly email: string }
  | { readonly kind: "submitCode"; readonly input: CodeInput }
  | { readonly kind: "resendCode"; readonly email: string | undefined }
  | { readonly kind: "settled"; readonly request: AccountRequest; readonly outcome: AccountFlowOutcome };

export interface AccountAccessStep {
  readonly state: AccountAccessState;
  readonly held: AccountAccessHeld;
  /** The port call this event asks for, or null. A `settled` event never asks for one. */
  readonly request: AccountRequest | null;
}

export type InputCheck =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

export function checkEmailInput(raw: string): InputCheck {
  const email = normalizeEmail(raw);

  return isValidEmail(email) ? { ok: true, value: email } : { ok: false, error: EMAIL_INPUT_ERROR };
}

export function checkDisplayNameInput(raw: string): InputCheck {
  const name = normalizeDisplayName(raw);

  return isValidDisplayName(name) ? { ok: true, value: name } : { ok: false, error: DISPLAY_NAME_INPUT_ERROR };
}

export function checkCodeInput(raw: string): InputCheck {
  const code = raw.trim();

  return isConfirmationCode(code) ? { ok: true, value: code } : { ok: false, error: CODE_INPUT_ERROR };
}

/** The password is sent as typed (no trimming: a leading space is part of
 * it); an empty one is "choose a password", not a rule. */
export function checkPasswordInput(raw: string): InputCheck {
  if (raw.length === 0) {
    return { ok: false, error: PASSWORD_REQUIRED_ERROR };
  }

  const violation = findPasswordViolation(raw);

  return violation === null
    ? { ok: true, value: raw }
    : { ok: false, error: describePasswordRule(violation.id) };
}

/** Dispatches a request to the port. Pure wiring: no rxjs value here. */
export function callAccountFlow(port: AccountFlowPort, request: AccountRequest): Stream<AccountFlowOutcome> {
  switch (request.kind) {
    case "register":
      return port.register(request.email, request.displayName);
    case "resendCode":
      return port.resendCode(request.email);
    case "confirmEmail":
      return port.confirmEmail(request.email, request.code, request.password);
    case "requestPasswordReset":
      return port.requestPasswordReset(request.email);
    case "resetPassword":
      return port.resetPassword(request.email, request.code, request.password);
  }
}

/** One step of the login screen's account flows: the next state, what the
 * machine now holds, and the port call to make (if any). The one fold all
 * three cores run, so a core is a store, a request slot and this. */
export function stepAccountAccess(
  state: AccountAccessState,
  held: AccountAccessHeld,
  event: AccountAccessEvent,
): AccountAccessStep {
  switch (event.kind) {
    case "startRegistration":
      return go({ phase: "register", busy: false, error: null }, NOTHING_HELD);
    case "startReset":
      return go({ phase: "requestReset", busy: false, error: null }, NOTHING_HELD);
    case "startCodeEntry":
      return go(codeStep("signup", null, false), NOTHING_HELD);
    case "returnToSignIn":
      return go(ACCOUNT_ACCESS_IDLE, NOTHING_HELD);
    case "register":
      return state.phase === "register" ? beginRegistration(event.input) : stay(state, held);
    case "requestReset":
      return state.phase === "requestReset" || state.phase === "passwordUnset"
        ? beginResetRequest(event.email)
        : stay(state, held);
    case "submitCode":
      return state.phase === "code" ? beginCode(state, held, event.input) : stay(state, held);
    case "resendCode":
      return state.phase === "code" ? beginResend(state, held, event.email) : stay(state, held);
    case "settled":
      return settle(state, held, event.request, event.outcome);
  }
}

function stay(state: AccountAccessState, held: AccountAccessHeld): AccountAccessStep {
  return { state, held, request: null };
}

function go(state: AccountAccessState, held: AccountAccessHeld, request: AccountRequest | null = null): AccountAccessStep {
  return { state, held, request };
}

function codeStep(
  flow: AccountAccessFlow,
  email: string | null,
  passwordHeld: boolean,
  patch: Partial<Pick<CodePhase, "busy" | "error" | "resent">> = {},
): CodePhase {
  return { phase: "code", flow, email, passwordHeld, resent: false, busy: false, error: null, ...patch };
}

type CodePhase = Extract<AccountAccessState, { readonly phase: "code" }>;

function beginRegistration(input: RegistrationInput): AccountAccessStep {
  const email = checkEmailInput(input.email);
  const displayName = checkDisplayNameInput(input.displayName);
  const password = checkPasswordInput(input.password);
  const failed = [email, displayName, password].find((check) => {
    return !check.ok;
  });

  if (failed !== undefined && !failed.ok) {
    return go({ phase: "register", busy: false, error: failed.error }, NOTHING_HELD);
  }

  if (!email.ok || !displayName.ok || !password.ok) {
    return go({ phase: "register", busy: false, error: "The request was refused" }, NOTHING_HELD); // unreachable; narrows the types
  }

  return go(
    { phase: "register", busy: true, error: null },
    { email: email.value, password: password.value },
    { kind: "register", email: email.value, displayName: displayName.value },
  );
}

function beginResetRequest(raw: string): AccountAccessStep {
  const email = checkEmailInput(raw);

  if (!email.ok) {
    return go({ phase: "requestReset", busy: false, error: email.error }, NOTHING_HELD);
  }

  return go(
    { phase: "requestReset", busy: true, error: null },
    { email: email.value, password: null },
    { kind: "requestPasswordReset", email: email.value },
  );
}

/** The address and the password come from what is held when held, else
 * from the form. Neither typed value becomes held: the field stays on the
 * form, so a typo can be fixed after a refusal. */
function beginCode(state: CodePhase, held: AccountAccessHeld, input: CodeInput): AccountAccessStep {
  const email = held.email !== null ? ok(held.email) : checkEmailInput(input.email ?? "");
  const code = checkCodeInput(input.code);
  const password = held.password !== null ? ok(held.password) : checkPasswordInput(input.password ?? "");
  const failed = [email, code, password].find((check) => {
    return !check.ok;
  });

  if (failed !== undefined && !failed.ok) {
    return go({ ...state, busy: false, error: failed.error }, held);
  }

  if (!email.ok || !code.ok || !password.ok) {
    return stay(state, held); // unreachable; narrows the types
  }

  const request: AccountRequest =
    state.flow === "signup"
      ? { kind: "confirmEmail", email: email.value, code: code.value, password: password.value }
      : { kind: "resetPassword", email: email.value, code: code.value, password: password.value };

  return go({ ...state, busy: true, error: null, resent: false }, held, request);
}

function beginResend(state: CodePhase, held: AccountAccessHeld, raw: string | undefined): AccountAccessStep {
  const email = held.email !== null ? ok(held.email) : checkEmailInput(raw ?? "");

  if (!email.ok) {
    return go({ ...state, busy: false, error: email.error }, held);
  }

  const request: AccountRequest =
    state.flow === "signup"
      ? { kind: "resendCode", email: email.value }
      : { kind: "requestPasswordReset", email: email.value };

  return go({ ...state, busy: true, error: null, resent: false }, held, request);
}

function ok(value: string): InputCheck {
  return { ok: true, value };
}

/** A settled request lands only on the phase that made it: a request the
 * user navigated away from (the slot cancels it, but belt and braces)
 * changes nothing. */
function settle(
  state: AccountAccessState,
  held: AccountAccessHeld,
  request: AccountRequest,
  outcome: AccountFlowOutcome,
): AccountAccessStep {
  switch (request.kind) {
    case "register":
      if (state.phase !== "register") {
        return stay(state, held);
      }

      return outcome.ok
        ? go(codeStep("signup", request.email, true), held)
        : go({ phase: "register", busy: false, error: describeAccountFailure(outcome, request.kind) }, NOTHING_HELD);
    case "requestPasswordReset":
      if (state.phase === "requestReset") {
        return outcome.ok
          ? go(codeStep("reset", request.email, false), held)
          : go({ phase: "requestReset", busy: false, error: describeAccountFailure(outcome, request.kind) }, NOTHING_HELD);
      }

      return state.phase === "code" ? settleResend(state, held, request.kind, outcome) : stay(state, held);
    case "resendCode":
      return state.phase === "code" ? settleResend(state, held, request.kind, outcome) : stay(state, held);
    case "confirmEmail":
      return state.phase === "code" ? settleConfirmation(state, held, request, outcome) : stay(state, held);
    case "resetPassword":
      return state.phase === "code" ? settleReset(state, held, request, outcome) : stay(state, held);
  }
}

function settleResend(state: CodePhase, held: AccountAccessHeld, kind: AccountRequestKind, outcome: AccountFlowOutcome): AccountAccessStep {
  return outcome.ok
    ? go({ ...state, busy: false, error: null, resent: true }, held)
    : go({ ...state, busy: false, resent: false, error: describeAccountFailure(outcome, kind) }, held);
}

/** `pending_approval` and `password_unset` end the flow. A password RULE
 * refusal did not spend the code (spec §5.3): the held password is dropped
 * and the form shows the field, so the same code is retried with another
 * password. Any other refusal keeps what is held. */
function settleConfirmation(state: CodePhase, held: AccountAccessHeld, request: AccountRequest & { readonly kind: "confirmEmail" }, outcome: AccountFlowOutcome): AccountAccessStep {
  if (outcome.ok) {
    return outcome.status === "password_unset"
      ? go({ phase: "passwordUnset", email: request.email }, NOTHING_HELD)
      : go({ phase: "pendingApproval", email: request.email }, NOTHING_HELD);
  }

  const error = describeAccountFailure(outcome, request.kind);
  const passwordRefused = outcome.reason === "invalid_input" && isPasswordRule(outcome.rule);

  return passwordRefused
    ? go({ ...state, busy: false, error, passwordHeld: false }, { email: held.email, password: null })
    : go({ ...state, busy: false, error }, held);
}

function settleReset(state: CodePhase, held: AccountAccessHeld, request: AccountRequest & { readonly kind: "resetPassword" }, outcome: AccountFlowOutcome): AccountAccessStep {
  return outcome.ok
    ? go({ phase: "passwordChanged", email: request.email }, NOTHING_HELD)
    : go({ ...state, busy: false, error: describeAccountFailure(outcome, request.kind) }, held);
}

function isPasswordRule(rule: AccountInputRule | undefined): boolean {
  return rule !== undefined && rule !== "email" && rule !== "display-name" && rule !== "password";
}
```

(The implementer runs biome and fixes line lengths / `AccountAccessFlow` and `AccountInputRule` imports. The two "unreachable; narrows the types" branches exist because `Array.find` loses the discriminant; an implementer who finds a cleaner narrowing that keeps every branch covered may use it and say so in the report.)

```ts
// packages/client-core-rxjs/src/presenters/AccountAccessMachine.ts
import { type StateObservable, state } from "@rx-state/core";
import { BehaviorSubject, type Observable, of, type Subscription } from "rxjs";
import { catchError } from "rxjs/operators";

import type { AccountAccessIntents, AccountAccessState, CodeInput, Machine, RegistrationInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_IDLE,
  type AccountAccessEvent,
  type AccountAccessHeld,
  type AccountRequest,
  callAccountFlow,
  NOTHING_HELD,
  stepAccountAccess,
} from "@rtc/core-logic";
import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows: a `BehaviorSubject` fed by
 * `stepAccountAccess`, one request in flight at most (a new request or a
 * navigation unsubscribes the old one, so a late answer never lands), the
 * chosen password held in this closure and never emitted. An erroring port
 * stream reads as `unavailable`. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const subject = new BehaviorSubject<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const state$: StateObservable<AccountAccessState> = state(subject, ACCOUNT_ACCESS_IDLE);
  let held: AccountAccessHeld = NOTHING_HELD;
  let inFlight: Subscription | null = null;
  let disposed = false;

  function cancelRequest(): void {
    inFlight?.unsubscribe();
    inFlight = null;
  }

  function apply(event: AccountAccessEvent): void {
    if (disposed) {
      return;
    }

    const step = stepAccountAccess(subject.value, held, event);
    held = step.held;

    if (step.state !== subject.value) {
      subject.next(step.state);
    }

    if (step.request !== null) {
      send(step.request);
    } else if (event.kind !== "settled") {
      cancelRequest();
    }
  }

  function send(request: AccountRequest): void {
    cancelRequest();
    inFlight = callAccountFlow(accounts, request)
      .pipe(
        catchError((): Observable<AccountFlowOutcome> => {
          return of(UNAVAILABLE);
        }),
      )
      .subscribe((outcome) => {
        apply({ kind: "settled", request, outcome });
      });
  }

  return {
    state$,
    intents: {
      startRegistration: () => { apply({ kind: "startRegistration" }); },
      startReset: () => { apply({ kind: "startReset" }); },
      startCodeEntry: () => { apply({ kind: "startCodeEntry" }); },
      returnToSignIn: () => { apply({ kind: "returnToSignIn" }); },
      register: (input: RegistrationInput) => { apply({ kind: "register", input }); },
      requestReset: (email: string) => { apply({ kind: "requestReset", email }); },
      submitCode: (input: CodeInput) => { apply({ kind: "submitCode", input }); },
      resendCode: (email?: string) => { apply({ kind: "resendCode", email }); },
    },
    dispose: () => {
      disposed = true;
      cancelRequest();
    },
  };
}
```

A synchronous port (`of(...)`) answers inside `subscribe`, before `inFlight` is assigned: `apply({settled})` then runs re-entrantly and the later assignment stores an already-closed subscription — harmless (`unsubscribe` on a closed subscription is a no-op), but the implementer adds the one-line comment. `createMachineFactories` (rxjs `composition.ts`) adds `accountAccess: () => createAccountAccessMachine(presenters.auth.accounts)`.

**The contract harness** (`scriptedPorts.ts`): one pending queue for the five flows, counted under `auth.` like `login`:

```ts
/** One account flow the core has subscribed. The password and the code are
 * recorded so a suite can prove the HELD password travelled with the code. */
export interface AccountCall {
  readonly kind: "register" | "resendCode" | "confirmEmail" | "requestPasswordReset" | "resetPassword";
  readonly email: string;
  readonly displayName?: string;
  readonly code?: string;
  readonly password?: string;
}
// driver gains:
  pendingAccountCalls(): readonly AccountCall[];
  /** Settle the OLDEST pending account flow (next + complete). */
  resolveAccountCall(outcome: AccountFlowOutcome): void;
  /** Error the OLDEST pending account flow. */
  failAccountCall(error: unknown): void;
```

The `auth` literal replaces Task 1's `...createUnavailableAccountFlows()` with five arrows opening `accountCalls.open({ kind: "register", email, displayName })` etc.

**The suite** `packages/core-contract/src/suites/accountAccess.ts`, `describeAccountAccessContract(label, makeHarness)`, registered as `"machines.accountAccess"`. Fixtures (below the cases): `createRegistration()` → `{ email: "  Ann@Desk.io ", displayName: "  Ann   Stark ", password: STRONG }` with `STRONG = "Correct-Horse-9x"`, `WEAK = "short"`, `CODE = " 12345678 "`. Cases, each `try { … } finally { m.dispose(); await h.teardown(); }` with `collect(m.state$)` and `await settle()` after each intent and each resolve:

1. "starts at signIn synchronously; each start intent moves to its idle phase and back without a port call" — `startRegistration` → `{phase:"register",busy:false,error:null}`; `startReset` → requestReset; `startCodeEntry` → `{phase:"code",flow:"signup",email:null,passwordHeld:false,resent:false,busy:false,error:null}`; `returnToSignIn` → signIn; `h.driver.pendingAccountCalls()` is `[]` throughout.
2. "register refuses a bad address, a bad display name and a weak password locally, in that order, with no port call" — three `register` calls with one field broken each; assert `error` texts `EMAIL_INPUT_ERROR`, `DISPLAY_NAME_INPUT_ERROR`, `"Password: at least 12 characters"` (spell the strings in the suite — core-contract may not import core-logic); no pending call.
3. "a valid register is busy, sends the NORMALIZED address and display name, and lands on the code step holding the password" — pending call `{ kind:"register", email:"ann@desk.io", displayName:"Ann Stark" }`; resolve `code_sent` → `codeStep signup, email "ann@desk.io", passwordHeld true`.
4. "the held password travels with the code; pending_approval ends the flow" — after 3, `submitCode({ code: CODE })` → pending `{ kind:"confirmEmail", email:"ann@desk.io", code:"12345678", password: STRONG }`; resolve `pending_approval` → `{ phase:"pendingApproval", email:"ann@desk.io" }`.
5. "the password never appears in any emitted state" — over cases 3 and 4's journey, `JSON.stringify(c.values)` does not contain `STRONG`.
6. "password_unset ends on its notice, and requestReset from there sends a reset code" — resolve confirm with `password_unset` → passwordUnset; `requestReset("ann@desk.io")` → pending `requestPasswordReset`; resolve code_sent → `codeStep reset, email, passwordHeld false`; `submitCode({ code: CODE, password: "Reset-Horse-7y" })` → pending `resetPassword` with that password; resolve `password_changed` → passwordChanged.
7. "a password rule refusal at the confirmation drops the held password and keeps the code retryable" — resolve confirm `{ ok:false, reason:"invalid_input", rule:"min-length" }` → code with `passwordHeld:false`, error `"Password: at least 12 characters"`; `submitCode({ code: CODE })` → error `"Choose a password"`, no call; `submitCode({ code: CODE, password: "Another-Horse-3z" })` → pending confirm with the new password.
8. "a wrong code keeps the held password: the next submit needs the code only" — resolve `invalid_code` → error "That code is not valid or has expired", `passwordHeld` still true; `submitCode({ code: "87654321" })` → pending confirm with `STRONG`.
9. "a code of the wrong shape and a bad typed address never leave" — from `startCodeEntry`: `submitCode({ code:"1234567" , email:"a@b.co", password: STRONG})` → `CODE_INPUT_ERROR`, no call; `submitCode({ email:"not an address", code: CODE, password: STRONG })` → `EMAIL_INPUT_ERROR`; `submitCode({ email:" A@B.co ", code: CODE, password: STRONG })` → pending confirm `email:"a@b.co"`, and the state's `email` stays `null`.
10. "resend sends to the held address and reports it; a throttled resend says the last code still works; in the reset flow a resend is a reset request" — signup code step: `resendCode()` → pending `resendCode "ann@desk.io"`; resolve code_sent → `resent:true`; `resendCode()` again, resolve `rate_limited` → error "Too many codes requested. The last code you received still works", `resent:false`. Reset flow: `resendCode()` → pending `requestPasswordReset`.
11. "a refused registration says why" — `it.each`: `registration_closed` → "Sign-up is paused for now"; `rate_limited` → "Too many codes requested. The last code you received still works"; `unavailable` → "The live desk is unavailable right now. Try again shortly"; and `failAccountCall(new Error("boom"))` → the unavailable text; each leaves `busy:false`.
12. "a spent code at the reset says so" — reset flow, resolve `{ ok:false, reason:"invalid_input", rule:"password" }` → "That code has been used. Request a new one and choose a different password".
13. "returnToSignIn while a request is in flight drops the late answer" — register (busy) → `returnToSignIn` → signIn; `pendingAccountCalls()` is `[]` (the subscription was dropped); for a core that keeps the queue entry, `resolveAccountCall(code_sent)` must still leave the state `signIn` with no later emission.
14. "dispose makes the intents inert and a fresh subscription yields the current value synchronously" — mirror the notional suite's last case.

- [ ] **Step 1: Write the fold's unit tests** (`accountAccessFold.test.ts`, core-logic) — the four `check*Input` functions (normalization, each failure text), `callAccountFlow` dispatch (a recording `AccountFlowPort`), `describeAccountFailure` for every reason × the two request classes, `describeAccountAccessTitle` per phase, and `stepAccountAccess` for each branch of `settle` including the "settled on another phase changes nothing" guard. Then write the contract suite above and register it.
- [ ] **Step 2: Run** `pnpm --filter @rtc/core-logic test -- accountAccess` → FAIL (module missing).
- [ ] **Step 3: Implement** core-api types, the fold, the copy, exports (`core-logic/src/index.ts`: `export * from "#/presenters/accountAccessFold"; export * from "#/presenters/accountAccessCopy";`), the RxJS machine, the factory entry, the harness scripting, the registry entry.
- [ ] **Step 4: Verify** `pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-logic build && pnpm --filter @rtc/core-contract build`, then `pnpm --filter @rtc/core-logic test && pnpm --filter @rtc/core-contract test && pnpm --filter @rtc/client-core-rxjs test` → PASS. `pnpm typecheck` is EXPECTED red in `@rtc/client-core-async` and `@rtc/client-core-effect` only (missing `accountAccess`); anything else red is a defect.
- [ ] **Step 5: Commit** `feat(core): the accountAccess machine — contract, fold, copy, the RxJS implementation and its suite`

---

### Task 5: The async core's `accountAccess`

**Files:**
- Create: `packages/client-core-async/src/machines/accountAccess.ts` (+ `accountAccess.test.ts` — one case: the factory is wired and a `register` reaches the port; the contract suite is the real test)
- Modify: `packages/client-core-async/src/composition.ts` (`nativeMachines` gains `accountAccess`)

**Interfaces:**
- Consumes: Task 4's `stepAccountAccess`, `callAccountFlow`, `ACCOUNT_ACCESS_IDLE`, `NOTHING_HELD`; `presenters.auth.accounts`; the kernel's `createStore`, `createRunSlot`, `once` (`#/bridge/in`), `storeToStateStream`.

```ts
// packages/client-core-async/src/machines/accountAccess.ts
import type { AccountAccessIntents, AccountAccessState, CodeInput, Machine, RegistrationInput } from "@rtc/core-api";
import {
  ACCOUNT_ACCESS_IDLE,
  type AccountAccessEvent,
  type AccountAccessHeld,
  type AccountRequest,
  callAccountFlow,
  NOTHING_HELD,
  stepAccountAccess,
} from "@rtc/core-logic";
import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { createRunSlot } from "#/kernel/runSlot";
import { createStore } from "#/kernel/store";

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows on a Store and a run slot: the RxJS
 * machine's one-request-at-a-time over `createRunSlot` (a new request or a
 * navigation ends the run in flight; `once` then rejects with the abort and
 * `ifCurrent` keeps that answer off the store). The chosen password is held
 * here and never emitted. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const store = createStore<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const slot = createRunSlot(store);
  let held: AccountAccessHeld = NOTHING_HELD;

  function apply(event: AccountAccessEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const step = stepAccountAccess(store.get(), held, event);
    held = step.held;
    store.set(step.state);

    if (step.request !== null) {
      send(step.request);
    } else if (event.kind !== "settled") {
      slot.end();
    }
  }

  function send(request: AccountRequest): void {
    slot.start(async (run) => {
      let outcome: AccountFlowOutcome;

      try {
        outcome = await once(callAccountFlow(accounts, request), run.signal);
      } catch {
        outcome = UNAVAILABLE;
      }

      run.ifCurrent(() => {
        apply({ kind: "settled", request, outcome });
      });
    });
  }

  return {
    state$: storeToStateStream(store),
    intents: { /* the eight intents, each `apply({ kind, … })` as in the RxJS machine */ },
    dispose: () => {
      slot.dispose();
    },
  };
}
```

`nativeMachines`: `accountAccess: () => createAccountAccessMachine(presenters.auth.accounts)`.

- [ ] **Step 1: Run** `pnpm --filter @rtc/client-core-async test -- coreContract` → FAIL (`machines.accountAccess is not a function`).
- [ ] **Step 2: Implement** as above.
- [ ] **Step 3: Verify** `pnpm --filter @rtc/client-core-async test && pnpm --filter @rtc/client-core-async test:coverage` → PASS, coverage ≥ 95 % / branches ≥ 85 %.
- [ ] **Step 4: Commit** `feat(client-core-async): the accountAccess machine, native`

---

### Task 6: The Effect core's `accountAccess`

**Files:**
- Create: `packages/client-core-effect/src/machines/accountAccess.ts` (+ `accountAccess.test.ts`, one wiring case)
- Modify: `packages/client-core-effect/src/composition.ts` (`nativeMachines`)

```ts
// packages/client-core-effect/src/machines/accountAccess.ts
import { Effect } from "effect";

import type { AccountAccessIntents, AccountAccessState, CodeInput, Machine, RegistrationInput } from "@rtc/core-api";
import { ACCOUNT_ACCESS_IDLE, type AccountAccessEvent, type AccountAccessHeld, type AccountRequest, callAccountFlow, NOTHING_HELD, stepAccountAccess } from "@rtc/core-logic";
import type { AccountFlowOutcome, AccountFlowPort } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import { rpc } from "#/bridge/rpc";
import { createSyncRef } from "#/bridge/syncRef";
import { createRunSlot, type Run } from "#/machines/runSlot";

const UNAVAILABLE: AccountFlowOutcome = { ok: false, reason: "unavailable" };

/** The login screen's account flows on a `SyncRef` and a run slot under a
 * detached host (one per mount, like `orderTicket`). A request is one `rpc`
 * fiber; `catchAll` turns a failed port stream into `unavailable` and sees
 * failures only, so a superseding navigation's interrupt ends the run
 * silently; `guarded` keeps a superseded answer off the ref. The chosen
 * password is held here and never emitted. */
export function createAccountAccessMachine(
  accounts: AccountFlowPort,
): Machine<AccountAccessState, AccountAccessIntents> {
  const host = createDetachedHost();
  const ref = createSyncRef<AccountAccessState>(ACCOUNT_ACCESS_IDLE);
  const slot = createRunSlot(host, ref);
  let held: AccountAccessHeld = NOTHING_HELD;

  function apply(event: AccountAccessEvent): void {
    if (slot.isDisposed()) {
      return;
    }

    const step = stepAccountAccess(ref.get(), held, event);
    held = step.held;
    ref.set(() => {
      return step.state;
    });

    if (step.request !== null) {
      send(step.request);
    } else if (event.kind !== "settled") {
      slot.end();
    }
  }

  function send(request: AccountRequest): void {
    slot.start((run: Run<AccountAccessState>) => {
      return rpc(callAccountFlow(accounts, request)).pipe(
        Effect.catchAll(() => {
          return Effect.succeed(UNAVAILABLE);
        }),
        Effect.flatMap((outcome: AccountFlowOutcome) => {
          return run.guarded(
            Effect.sync(() => {
              apply({ kind: "settled", request, outcome });
            }),
          );
        }),
      );
    });
  }

  return {
    state$: ref.stateStream(),
    intents: { /* the eight intents */ },
    dispose: () => {
      slot.dispose();
    },
  };
}
```

Check `createSyncRef`'s API before writing (`ref.get()` / `ref.set(fn)` as `notional.ts` uses; if `get` is absent, read the current value from a local variable updated on every write). `nativeMachines`: `accountAccess: () => createAccountAccessMachine(presenters.auth.accounts)`.

- [ ] **Step 1: Run** `pnpm --filter @rtc/client-core-effect test -- coreContract` → FAIL.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify** `pnpm --filter @rtc/client-core-effect test && pnpm --filter @rtc/client-core-effect test:coverage` → PASS; **`pnpm typecheck` is green again from here.**
- [ ] **Step 4: Commit** `feat(client-core-effect): the accountAccess machine, native`

---

### Task 7: The bindings and the shell lane — `useAccountAccess`, `useRegistrationAvailable`

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts`; create `packages/react-bindings/src/createViewModel.accountAccess.test.tsx`
- Modify: `packages/solid-bindings/src/createViewModel.ts`; create `packages/solid-bindings/src/createViewModel.accountAccess.test.tsx`
- Modify: `packages/web-boot/src/buildBrowserPorts.ts` (+ its test), `packages/web-boot/src/startWebClient.ts` (+ `startWebClient.test.ts`)
- Modify: `packages/client-react/src/AppRoot.tsx`, `packages/client-react/src/main.tsx`, `packages/client-solid/src/AppRoot.tsx`, `packages/client-solid/src/main.tsx`
- Modify (fakes that implement the whole `ViewModel`): `packages/client-react-native/tests/visual/fake/shell.ts`, `packages/client-react-native/tests/visual/fake/sliceTypes.ts`, `packages/client-react/tests/ui/pages/AppRootPage.tsx`, `packages/client-solid/tests/ui/pages/AppPage.tsx`, and anything else the typecheck names. (The ui-contract World and the two `viewModelFromWorld` files are Task 8's.)

**Interfaces:**
- Produces:

```ts
// both bindings — ViewModelShell gains
  /** True when the page has a server to register with (a server URL); the
   * login screen then offers "Create account" and "Forgot password?".
   * Omitted (false) on a simulator-only page, where the flows would only
   * ever answer unavailable. */
  readonly registrationAvailable?: boolean;

// ViewModel gains
  /** The login screen's account flows — a per-mount machine: phase, busy,
   * error, plus the eight intents. */
  useAccountAccess: () => UseAccountAccessResult;
  /** Not a hook: the shell's `registrationAvailable`, false by default. */
  useRegistrationAvailable: () => boolean;

// react: type UseAccountAccessResult = { state: AccountAccessState } & AccountAccessIntents;
// solid: type UseAccountAccessResult = { state: Accessor<AccountAccessState> } & AccountAccessIntents;
```

Implementation mirrors `useNotional` / `useDemoAccounts`: `useAccountAccess: () => useMachine(() => machines.accountAccess())`; `const registrationAvailable = shell?.registrationAvailable ?? false;` `useRegistrationAvailable: () => registrationAvailable`.

```ts
// packages/web-boot/src/buildBrowserPorts.ts — add
/** Whether the login screen offers registration: only a page with a server
 * URL has anywhere to send a sign-up. An empty string is no URL (the
 * `dev:*:sim` scripts set `VITE_SERVER_URL=`). */
export function offersRegistration(env: WebBootEnv): boolean {
  return env.serverUrl !== undefined && env.serverUrl !== "";
}
```

`WebClientPage` gains `readonly registrationAvailable: boolean;` set from `offersRegistration(env)` beside `demoAccounts`. Both `AppRoot`s take a required `registrationAvailable: boolean` prop and pass it into the shell; both `main.tsx` pass `page.registrationAvailable`.

- [ ] **Step 1: Tests first** — react: `createViewModel.accountAccess.test.tsx`: "useRegistrationAvailable reads the shell (true / omitted → false)"; "useAccountAccess builds one machine per mount and its intents reach it" (renderHook over a `ViewModelProvider`, `startRegistration()` → `state.phase === "register"`; built like `createViewModel.demoAccounts.test.ts`'s `createHooksInputs`). Solid twin. web-boot: `offersRegistration` for `undefined`, `""`, `"ws://x"`; `startWebClient.test.ts`: the page passed to `createView` carries `registrationAvailable` true with a URL and false without.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement**; update the RN and page fakes with `useAccountAccess` (state `{ phase: "signIn" }`, no-op intents) and `useRegistrationAvailable: () => false`.
- [ ] **Step 4: Verify** `pnpm --filter @rtc/react-bindings test && pnpm --filter @rtc/solid-bindings test && pnpm --filter @rtc/web-boot test && pnpm --filter @rtc/web-boot test:coverage && pnpm typecheck` → PASS / green; `pnpm --filter @rtc/client-react-native typecheck` green.
- [ ] **Step 5: Commit** `feat(bindings): useAccountAccess and the registrationAvailable shell lane`

---

### Task 8: The UI contract — World, page object and the shared specs (red until Tasks 9 and 10)

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts`, `packages/ui-contract/src/shared/mount.ts`
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts`, `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts`
- Modify: `packages/ui-contract/src/shared/pages/shell/auth/LoginScreenPage.ts`
- Create: `packages/ui-contract/src/specs/shell/auth/LoginScreen.accountAccess.contract.spec.ts`
- Modify: `packages/ui-contract/src/specs/shell/auth/LoginScreen.contract.spec.ts` (two cases: the hint renders only in `signIn`; no links without registration)

**Interfaces:**
- Produces, in `World`:

```ts
  /** Reactive accountAccess machine state backing useAccountAccess. */
  readonly accountAccess: BehaviorSubject<AccountAccessState>;
  /** Backs useRegistrationAvailable; a plain value like `demoAccounts`. */
  readonly registrationAvailable: boolean;
// CommandResults gains
  /** Each navigation intent of useAccountAccess(), in order. */
  accountNavigations: Array<"startRegistration" | "startReset" | "startCodeEntry" | "returnToSignIn">;
  accountRegister: RegistrationInput[];
  accountRequestReset: string[];
  accountSubmitCode: CodeInput[];
  accountResendCode: Array<string | undefined>;
// WorldSeeds / MountOptions gain
  accountAccess?: AccountAccessState;        // defaults to { phase: "signIn" }
  registrationAvailable?: boolean;           // defaults to false
```

The two `viewModelFromWorld` fakes implement `useAccountAccess` as: `state` from the subject; the four navigation intents RECORD and MOVE the subject to that phase's idle state (`startRegistration` → `{ phase: "register", busy: false, error: null }`, `startCodeEntry` → the empty signup code step, `startReset` → `{ phase: "requestReset", … }`, `returnToSignIn` → `{ phase: "signIn" }`), the four request intents only record (a spec seeds busy / error / later phases directly); `useRegistrationAvailable: () => world.registrationAvailable`.

**Page object additions** (`LoginScreenPage`), each reading a testid the components will carry:

| Method | Testid / behaviour |
|---|---|
| `phase(): string` | `login-screen`'s `data-phase` attribute |
| `hasCreateAccountLink()`, `openCreateAccount()` | `login-create-account` |
| `hasForgotPasswordLink()`, `openForgotPassword()` | `login-forgot-password` |
| `openCodeEntry()` | `login-have-code` (create-account form) or `login-enter-code` (sign-in form after `unconfirmed`); `hasEnterCodeOffer()` for the latter |
| `goBack()` | `login-back` |
| `typeEmail(v)`, `typeDisplayName(v)`, `typeNewPassword(v)`, `typeCode(v)` | `login-email`, `login-display-name`, `login-new-password`, `login-code` |
| `hasEmailField()`, `hasNewPasswordField()` | presence of the two |
| `checklist(): Array<{ label: string; met: boolean }>` | every `login-password-rule` with `data-met="true|false"` |
| `codeSentTo(): string` | `login-code-email` text ("" when absent) |
| `hasResent()` , `resend()` | `login-resent`, `login-resend` |
| `notice(): string`, `takeNoticeAction()` | `login-notice`, `login-notice-action` |
| `privacyHref(): string` | `login-privacy`'s `href` |
| `submitLabel(): string` | `login-submit` text |
| `registerArgs()`, `codeArgs()`, `resetRequestArgs()`, `resendArgs()`, `navigations()` | the command log |

`submit()`, `error()`, `isSubmitDisabled()`, `title()` keep working in every phase (one `login-submit`, one `login-error`, one `login-title`).

**Specs** (`LoginScreen.accountAccess.contract.spec.ts`), all through `mount(LoginScreen, { … })`; `STRONG = "Correct-Horse-9x"`:

Sign-in phase:
1. no links when `registrationAvailable` is false (default); both links when true; the demo hint still renders (seed `demoAccounts`).
2. "Create account" records `startRegistration` and the title reads CREATE ACCOUNT; "Forgot password?" records `startReset` and the title reads RESET PASSWORD.
3. with `auth: { status: "unauthenticated", error: "Email not confirmed", failure: "unconfirmed" }` and registration available, `hasEnterCodeOffer()` is true and clicking it records `startCodeEntry`; with `failure: "pending"` / `"blocked"` the error text renders and there is no offer; with `failure: "unconfirmed"` but NO registration available there is no offer either.

Register phase (`accountAccess: { phase: "register", busy: false, error: null }`):
4. fields present; `checklist()` has six rows, all unmet, labels equal `PASSWORD_RULES[i].label` in order.
5. typing `STRONG` meets all six; typing `"short"` meets only `lowercase` (and `max-length`).
6. submit records `register({ email, displayName, password })` exactly as typed — `" Ann@Desk.io "` stays untrimmed here (normalization is the machine's).
7. `busy: true` disables submit and its label reads SENDING; a seeded `error` renders in `login-error`.
8. `privacyHref()` is `PRIVACY_NOTICE_URL`; "I already have a code" records `startCodeEntry`; "Back to sign in" records `returnToSignIn`; no demo hint in this phase.

Code phase:
9. signup, `email: "ann@desk.io"`, `passwordHeld: true`: `codeSentTo()` is "ann@desk.io", no email field, no password field, no checklist; typing a code and submitting records `submitCode({ code })` with neither `email` nor `password` keys; submit label CONFIRM.
10. `passwordHeld: false`: the password field and checklist render; submit records `{ code, password }`.
11. `email: null`: the email field renders; submit records `{ email, code, password }`.
12. `resent: true` shows `login-resent`; "Resend code" records `resendCode(undefined)` when the email is held, and `resendCode(typedEmail)` when the field is shown.
13. flow `reset`: the title reads RESET PASSWORD, the password label reads "New password", submit label SET PASSWORD.
14. the code input has `inputMode="numeric"`, `maxLength` 8 and `autocomplete` `one-time-code` (read the attributes).

Request-reset phase:
15. email field + SEND RESET CODE; submit records `requestReset(email)`; `busy` disables.

Notices:
16. `pendingApproval`: `notice()` is the pending copy and names the email; the action records `returnToSignIn`.
17. `passwordUnset`: the action records `requestReset("ann@desk.io")` (the email from state).
18. `passwordChanged`: the action records `returnToSignIn`.

Spell copy strings via the `ACCOUNT_ACCESS_COPY` / `PRIVACY_NOTICE_URL` imports from `@rtc/core-logic` (ui-contract depends on it).

- [ ] **Step 1: Write** the World changes, the two fakes, the page object and the spec file.
- [ ] **Step 2: Run** `pnpm --filter @rtc/ui-contract build && pnpm --filter @rtc/client-react test:ui:contract -- accountAccess` → FAIL on every new case with "element not found" (the components do not exist yet) — and the OLD `LoginScreen.contract.spec.ts` cases still PASS (the World default phase is `signIn`). `pnpm typecheck` green.
- [ ] **Step 3: Commit** `test(ui-contract): the login screen's account-flow specs, page object and World seams (red until the screens land)`

---

### Task 9: The React login screen gains its modes

**Files:**
- Modify: `packages/client-react/src/ui/shell/auth/LoginScreen.tsx`, `LoginScreen.module.css`
- Create: `packages/client-react/src/ui/shell/auth/SignInForm.tsx`, `CreateAccountForm.tsx`, `EnterCodeForm.tsx`, `ResetRequestForm.tsx`, `AccountNotice.tsx`, `PasswordChecklist.tsx`

**Interfaces:**
- Consumes: `useAuth` (now with `failure`), `useDemoAccounts`, `useRegistrationAvailable`, `useAccountAccess`; `describeAccountAccessTitle`, `ACCOUNT_ACCESS_COPY`, `PRIVACY_NOTICE_URL` from `@rtc/core-logic`; `PASSWORD_RULES` from `@rtc/domain`.

Shape (dumb components; every string from the copy module; every input `value`/`onChange` in local state; nothing logged):

```tsx
// LoginScreen.tsx — the shell: badge, title, one form by phase, the hint in signIn only
export function LoginScreen(): ReactElement {
  const { useAuth, useDemoAccounts, useRegistrationAvailable, useAccountAccess } = useViewModel();
  const auth = useAuth();
  const account = useAccountAccess();
  const demoAccounts = useDemoAccounts();
  const registrationAvailable = useRegistrationAvailable();
  const { state } = account;
  const authenticating = auth.state.status === "authenticating";
  const reactorWaiting = authenticating && auth.state.waitVariant === "reactor";

  return (
    <div data-testid="login-screen" data-phase={state.phase} className={styles.overlay}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.panel}>
        <div className={styles.badge} aria-hidden="true">{/* unchanged */}</div>
        <div data-testid="login-title" className={styles.title}>
          {describeAccountAccessTitle(state)}
        </div>
        {state.phase === "signIn" ? (
          <>
            <SignInForm
              auth={auth.state}
              registrationAvailable={registrationAvailable}
              onLogin={auth.login}
              onCreateAccount={account.startRegistration}
              onForgotPassword={account.startReset}
              onEnterCode={account.startCodeEntry}
              demoAccounts={demoAccounts}
            />
          </>
        ) : null}
        {state.phase === "register" ? <CreateAccountForm state={state} onRegister={account.register} onHaveCode={account.startCodeEntry} onBack={account.returnToSignIn} /> : null}
        {state.phase === "code" ? <EnterCodeForm state={state} onSubmit={account.submitCode} onResend={account.resendCode} onBack={account.returnToSignIn} /> : null}
        {state.phase === "requestReset" ? <ResetRequestForm state={state} onRequest={account.requestReset} onBack={account.returnToSignIn} /> : null}
        {state.phase === "pendingApproval" || state.phase === "passwordUnset" || state.phase === "passwordChanged" ? (
          <AccountNotice state={state} onRequestReset={account.requestReset} onSignIn={account.returnToSignIn} />
        ) : null}
      </div>
    </div>
  );
}
```

- `SignInForm` is today's form (username, password, wait treatments, error, AUTHENTICATE, `DemoAccountsHint`) plus: under the error, when `auth.failure === "unconfirmed"` AND `registrationAvailable`, a text button `login-enter-code` reading `enterCodeAfterUnconfirmed`; under the hint, when `registrationAvailable`, a `.links` row with `login-create-account` and `login-forgot-password` text buttons (`type="button"`, `className={styles.link}`), disabled while authenticating. The demo-hint row-focus behaviour (`stageSignIn`) is unchanged.
- `CreateAccountForm`: `login-email` (`type="email"`, `autoComplete="email"`), `login-display-name` (`autoComplete="nickname"`), `login-new-password` (`type="password"`, `autoComplete="new-password"`) followed by `<PasswordChecklist password={password} />`; `login-error`; `login-submit` (`registerSubmit`, or `busySubmit` + disabled while `state.busy`); a `.privacy` line: `privacyLead` + `<a data-testid="login-privacy" href={PRIVACY_NOTICE_URL} target="_blank" rel="noreferrer">privacyLink</a>`; `.links`: `login-have-code`, `login-back`.
- `PasswordChecklist`: `<ul data-testid="login-password-checklist" className={styles.checklist}>` with one `<li data-testid="login-password-rule" data-rule={rule.id} data-met={String(rule.test(password))} className={met ? styles.ruleMet : styles.rule}>` per `PASSWORD_RULES` entry: a `✓`/`·` glyph (`aria-hidden`) and the label.
- `EnterCodeForm`: when `state.email !== null`, `<div data-testid="login-code-email" className={styles.sentTo}>{codeSentTo} <strong>{state.email}</strong></div>`, else the `login-email` field; `login-code` (`inputMode="numeric"`, `maxLength={8}`, `autoComplete="one-time-code"`, `pattern="[0-9]*"`); when `!state.passwordHeld`, `login-new-password` (label `newPasswordLabel` in the reset flow, `passwordLabel` otherwise) + checklist; `login-resent` hint when `state.resent`; `login-error`; `login-submit` (`setPasswordSubmit` in the reset flow, `confirmSubmit` otherwise; `busySubmit` + disabled while busy); `.links`: `login-resend` (calls `onResend(state.email === null ? typedEmail : undefined)`), `login-back`. On submit it passes `{ code }` plus `email` only when the field is shown and `password` only when the field is shown — exactly the keys the spec asserts.
- `ResetRequestForm`: `login-email`, `login-error`, `login-submit` (`requestResetSubmit`), `.links`: `login-back`.
- `AccountNotice`: `<p data-testid="login-notice" className={styles.notice}>` with the phase's copy and the email on its own line; `login-notice-action` button: `requestResetAction` → `onRequestReset(state.email)` for `passwordUnset`, `signInAction` → `onSignIn()` otherwise.
- CSS additions in `LoginScreen.module.css` (static, no animation — the login overlay is a permanently-rendered HUD; nothing here may animate anything but `opacity`/`transform`, and nothing needs to): `.links` (flex, space-between, mono 10px, letter-spacing .1em, margin-top 14px), `.link` (transparent button, `var(--accent-primary)`, underline on hover/focus-visible, `cursor: pointer`), `.checklist` (list-style none, grid 2 columns, gap 4px 12px, mono 10px), `.rule` (`var(--text-muted)`), `.ruleMet` (`var(--accent-positive, #22c55e)`), `.sentTo` (mono 11px, `var(--text-secondary)`), `.resent` (mono 10px, `var(--accent-positive, #22c55e)`), `.notice` (display font 12px, line-height 1.5, `var(--text-secondary)`, margin 0 0 18px), `.privacy` (mono 10px, `var(--text-muted)`, `a` in `var(--accent-primary)`). Check `docs/performance.md` once; nothing here animates.

- [ ] **Step 1: Run** `pnpm --filter @rtc/client-react test:ui:contract -- LoginScreen` → the new spec is RED.
- [ ] **Step 2: Implement** the seven files and the CSS.
- [ ] **Step 3: Verify** `pnpm --filter @rtc/client-react test:ui:contract` → every LoginScreen / AuthGate / AppRoot spec PASS; `pnpm --filter @rtc/client-react test:ui:contract:coverage` ≥ 95 %; `pnpm --filter @rtc/client-react lint` (biome + the css lint: `pnpm lint:css`); `pnpm typecheck` green. Then a 60-second eyeball: `pnpm dev:react:fs` in the worktree, sign out, click through Create account → code (`00000000`) → notice, and Forgot password with `pending@rtc.test`; fix anything that looks wrong before committing (the goldens come in Task 11).
- [ ] **Step 4: Commit** `feat(client-react): the login screen gains create-account, confirm-code and reset modes`

---

### Task 10: The Solid twin

**Files:**
- Modify: `packages/client-solid/src/ui/shell/auth/LoginScreen.tsx`, `LoginScreen.module.css` (copy the React stylesheet's additions verbatim)
- Create: the same six component files under `packages/client-solid/src/ui/shell/auth/`

Same structure, same testids, same copy imports; Solid idioms as the existing `LoginScreen.tsx` uses them: `createSignal` for field values, `<Show>` / `<Switch><Match>` for the phase branches, `class` not `className`, `onInput` not `onChange`, `autocomplete` lowercase, `state()` accessor reads, `ref={el}` for the focus hand-off. `useAccountAccess()` returns `{ state: Accessor<AccountAccessState> } & intents`.

- [ ] **Step 1: Run** `pnpm --filter @rtc/client-solid test:ui:contract -- LoginScreen` → RED.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Verify** `pnpm --filter @rtc/client-solid test:ui:contract` PASS; `test:ui:contract:coverage` ≥ 95 %, branches ≥ 85 %; `pnpm lint:css`; `pnpm typecheck`; the same 60-second eyeball with `pnpm dev:solid:fs`.
- [ ] **Step 4: Commit** `feat(client-solid): the login screen's account modes, at parity`

---

### Task 11: Visual scenarios and goldens — eight new login shots, both sets

**Files:**
- Modify: `packages/ui-contract/src/visual/appData.ts` (`accountAccess?: AccountAccessState`, `registrationAvailable?: boolean`), `fixtures.ts`, `scenarios.ts`, `scenarioActions.ts`
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts`, `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts` (`useAccountAccess` → `data.accountAccess ?? { phase: "signIn" }` with no-op intents; `useRegistrationAvailable` → `data.registrationAvailable ?? false`)
- Add: the PNGs under `packages/ui-contract/goldens/playwright/__screenshots__/react-local/darwin-arm64/visual.spec.ts/<skin>/` (local run) and `…/react/visual.spec.ts/<skin>/` (the dispatched workflow's auto-commit)

Scenarios (all `componentKey: "LoginScreen"`, all `fullPage: true` in `scenarioActions.ts` like `login/demo-hint`), fixtures through `makeAppData`:

| Scenario | Fixture |
|---|---|
| `login/live-links` | `registrationAvailable: true` (no demo accounts: the plain live build's sign-in form with the two links) |
| `login/create-account` | `accountAccess: { phase: "register", busy: false, error: null }` |
| `login/create-account-checklist` | the same, plus `steps: [{ type: "login-new-password", text: "Abc123!!" }]` — four rules met, two unmet |
| `login/enter-code` | `{ phase: "code", flow: "signup", email: "ann@desk.io", passwordHeld: true, resent: false, busy: false, error: null }` |
| `login/enter-code-reset` | `{ phase: "code", flow: "reset", email: "ann@desk.io", passwordHeld: false, resent: true, busy: false, error: null }` |
| `login/reset-request` | `{ phase: "requestReset", busy: false, error: "Enter a valid email address" }` |
| `login/pending-approval` | `{ phase: "pendingApproval", email: "ann@desk.io" }` |
| `login/password-unset` | `{ phase: "passwordUnset", email: "ann@desk.io" }` |

Existing login goldens must not change: `registrationAvailable` defaults false and the phase defaults to `signIn`.

- [ ] **Step 1: Add** the fixtures, scenarios, actions and fake-view-model fields; `pnpm --filter @rtc/ui-contract build`; `pnpm --filter @rtc/ui-contract test` (the scenarios drift test) PASS.
- [ ] **Step 2: Generate the local set** (this Mac; the worktree is installed and built):

```bash
cd packages/client-react && SCENARIO_PATTERN='login/(live-links|create-account|create-account-checklist|enter-code|enter-code-reset|reset-request|pending-approval|password-unset)__' pnpm test:ui:visual:playwright:react:update
```

Expected: 80 new PNGs under `react-local/darwin-arm64`, no other file modified (`git status` shows only additions; a MODIFIED existing golden is a regression — stop and diagnose). Then assert, without `--update`, react AND solid: `pnpm --filter @rtc/client-react test:ui:visual:playwright:react` and `pnpm --filter @rtc/client-solid test:ui:visual:playwright:solid` with the same `SCENARIO_PATTERN` → PASS (Solid at pixel parity).
- [ ] **Step 3: Send the user the eight `classic-dark` PNGs** with `SendUserFile` and name what each shows; acceptance is theirs (spec §7). A requested change is a fix round on Task 9/10, then a regen.
- [ ] **Step 4: Commit** `test(visual): eight login-screen scenarios for the account flows (local goldens)`
- [ ] **Step 5 (closing batch, after the branch is pushed):** dispatch the x86 set — one Bash call:

```bash
gh workflow run update-visual-goldens.yml --ref worktree-b2b-client-flows -f scenario_pattern='login/(live-links|create-account|create-account-checklist|enter-code|enter-code-reset|reset-request|pending-approval|password-unset)__'
```

Wait for the run (~30 min; `gh run list --workflow=update-visual-goldens.yml --branch worktree-b2b-client-flows`), `git pull`, then verify the auto-commit: `git show --name-only --format= HEAD | grep -v "__screenshots__/react/"` is empty and the count is 80. The auto-commit is `[skip ci]`: the rulings commit (close-out) lands AFTER it so the branch head has a CI run.

---

### Task 12: End to end — the account journey over the real server

**Files:**
- Modify: `tests/browser/page-objects/contracts/testids.ts` (`TESTIDS.auth` gains `loginCreateAccount`, `loginForgotPassword`, `loginHaveCode`, `loginBack`, `loginEmail`, `loginDisplayName`, `loginNewPassword`, `loginCode`, `loginCodeEmail`, `loginResend`, `loginNotice`, `loginNoticeAction`, `loginPhase` = `"login-screen"`'s `data-phase`)
- Modify: `tests/browser/page-objects/contracts/LoginScreen.ts`, `tests/browser/page-objects/playwright/LoginScreen.ts`, `tests/browser/scenarios/login.ts`
- Modify: `tests/browser/playwright/login.spec.ts` (one case)
- Create: `tests/fullstack/browser/accounts.spec.ts`

**Interfaces:**
- `LoginScreenPO` gains: `hasCreateAccountLink(): Promise<boolean>`, `openCreateAccount()`, `openForgotPassword()`, `typeEmail(v)`, `typeDisplayName(v)`, `typeNewPassword(v)`, `typeCode(v)`, `waitPhase(expected, timeoutMs)`, `waitCodeSentTo(email, timeoutMs)`, `waitNotice(containsText, timeoutMs)`, `takeNoticeAction()`, `goBack()`.
- `scenarios/login.ts` gains one helper per PO method plus `registerAndConfirm(ctx, email, displayName, password)` (the whole create → code → pending ride) and `expectAccountLinksAbsent(ctx)`.

`tests/browser/playwright/login.spec.ts` (simulator mode, no server URL) adds: "offers no account links in simulator mode" → `expectAccountLinksAbsent`.

`tests/fullstack/browser/accounts.spec.ts` (the real server with `RTC_DEV_ACCOUNTS=1`, the real client with `VITE_SERVER_URL`; same `_context.ts` as `fullstack.spec.ts`; the login PO opens its own unseeded context). One `test.describe.serial`:

1. **register → confirm → awaiting approval, then refused at sign-in**: `openLoginScreen`; `expectLoginTitle "… SIGN IN"`; `openCreateAccount`; `expectLoginTitle "… CREATE ACCOUNT"`; type `e2e-${Date.now()}@rtc.test`, `E2E Guest`, `Correct-Horse-9x`; submit; `waitCodeSentTo(email)`; `typeCode("00000000")`; submit; `waitNotice("administrator")`; `takeNoticeAction` (back to sign in); type the email + password; submit; `expectLoginError "Account awaiting approval"`.
2. **a blocked seed is refused**: `blocked@rtc.test` / `Mcdc2026!desk` → `expectLoginError "Account blocked"`.
3. **an active seed signs in**: `trader@rtc.test` / `Mcdc2026!desk` → `expectAppShellVisible`, `expectLoginScreenGone`.
4. **forgot password changes a seed's password**: `openForgotPassword`; type `pending@rtc.test`; submit; `waitCodeSentTo`; `typeCode("00000000")`; `typeNewPassword("Reset-Horse-7y")`; submit; `waitNotice("changed")`; `takeNoticeAction`; sign in `pending@rtc.test` / `Reset-Horse-7y` → `expectLoginError "Account awaiting approval"` (the password changed; approval still gates). Uses the PENDING seed so the active seed keeps its password for every other spec.

Budget check against `packages/server/src/config/limits.ts` for one IP (the browser cannot set `Fly-Client-IP`): 1 register (max 5/h), 1 confirm + 1 reset (code entry 10/10 min, 5 per address/15 min), 1 reset request (send 5/h), 4 logins (10/min) — within every bound, and the two 403s are not strikes.

- [ ] **Step 1: Write** testids, PO contract + Playwright impl, scenario helpers, the two specs.
- [ ] **Step 2: Run** `pnpm --filter @rtc/tests test:fullstack:browser` → PASS (it boots the server and the React client; ~3 min). Then `pnpm --filter @rtc/tests test:browser:playwright` for `login.spec.ts` → PASS. `pnpm --filter @rtc/tests gates` (the testid / scenario-layer gates 9–11) → PASS.
- [ ] **Step 3: Commit** `test(e2e): the account journey over the real server — register, confirm, refused while pending, blocked, reset`

---

### Task 13: Mutation proof

**Files:** `<scratchpad>/b2b-mutants.json` (not committed); the kill table goes in the PR body and the rulings file.

At least these mutants, each `find` matching exactly once, each expected RED:

| # | File | Mutation | Test that must fail |
|---|---|---|---|
| 1 | `accountAccessFold.ts` | `checkEmailInput`: return `raw` instead of `normalizeEmail(raw)` | suite case 3 (normalized address) |
| 2 | `accountAccessFold.ts` | `checkCodeInput`: drop `.trim()` | suite case 4 (`" 12345678 "`) |
| 3 | `accountAccessFold.ts` | `settleConfirmation`: `passwordHeld: false` → `true` | suite case 7 |
| 4 | `accountAccessFold.ts` | `settleConfirmation`: `password: null` → `password: held.password` | suite case 7 (the old password would be resent) |
| 5 | `accountAccessFold.ts` | `settle` `register`: drop the `state.phase !== "register"` guard | suite case 13 |
| 6 | `accountAccessFold.ts` | `beginCode` reset flow: `"resetPassword"` → `"confirmEmail"` | suite case 6 |
| 7 | `accountAccessCopy.ts` | `isSend`: drop `request === "resendCode"` | suite case 10 (throttled resend copy) |
| 8 | `accountAccessCopy.ts` | `describeInputRule`: swap the two `password` texts | suite case 12 + fold unit test |
| 9 | `HttpAuthAdapter.ts` | login 403 `"blocked"` → `"pending"` reason | adapter test |
| 10 | `HttpAuthAdapter.ts` | flow: `response.status === 403 && error?.error === "registration_closed"` → `response.status === 403` | adapter test (origin_not_allowed must be unavailable) |
| 11 | `HttpAuthAdapter.ts` | drop `isAccountInputRule(error.rule)` check (pass rule through) | adapter test ("bogus" rule) |
| 12 | `RoutingAuthPort.ts` | `liveFlow` calls `deps.demo` instead of `deps.live` | routing test |
| 13 | `AuthSimulator.ts` | `createUnavailableAccountFlows` answers `{ ok: true, status: "code_sent" }` | simulator test |
| 14 | `shellFolds.ts` | `describeAuthFailure` `"pending"` → `"blocked"` text | shellFolds test + auth suite |
| 15 | `buildBrowserPorts.ts` | `offersRegistration`: drop the `!== ""` check | web-boot test |
| 16 | `AccountAccessMachine.ts` (rxjs) | `apply`: drop `cancelRequest()` on navigation | suite case 13 (rxjs) |
| 17 | `AccountPresenter` (each core) | `failure: outcome.reason` → `failure: null` | auth suite (per core) |

Cross-package mutants (`core-logic` → cores, `domain` → everything) need the mutated package rebuilt before and after; `scripts/mutation-check.mts` runs the `test` command as given, so give each row a command that includes the rebuild (`pnpm --filter @rtc/core-logic build && pnpm --filter @rtc/client-core-rxjs test -- coreContract`). Any SURVIVED row is a finding about the test: add the test, re-run.

- [ ] **Step 1:** write the spec, `node scripts/mutation-check.mts <scratchpad>/b2b-mutants.json --keep-going`.
- [ ] **Step 2:** all rows KILLED; `git status` clean afterwards.

---

### Task 14: Docs — what B2b is, how to drive it, what moved

**Files:**
- Modify: `docs/authentication.md` — new `### 7.9 The client flows (B2b)`: the phase diagram (tall, ≤ 4 boxes per rank), who holds what (the password in the machine's closure, never in state), the input checks that run before a request, the copy table (reason → text), where the pieces live (the file map's client rows), and the dev recipe (`pnpm dev:react:fs`, the seeds, code `00000000`).
- Modify: `docs/STATUS.md` — the B2 line: B2b MERGED (PR #, date), B2c NEXT; the "B2b notes" paragraph becomes "resolved in B2b (…)" with one clause per note; the deploy step for B2b: redeploy BOTH clients (Vercel) and, once the server is on #1004, `REGISTRATION_OPEN=true` is the user's switch (DEPLOY §4 step 15).
- Modify: `CLAUDE.md` — Current Status: 75 → **76** members (`accountAccess`, 2026-10-13) in the two places it is counted; the Demo accounts paragraph: one sentence that the login screen offers Create account / Forgot password only on a page with a server URL, against the registered-accounts endpoints.
- Modify: `docs/architecture/22-pluggable-application-core.md` (line ~559: 75 → 76, 12 → 13 machines) and `docs/architecture/23-application-cores-explained.md` (lines ~23, ~133, ~247–248, ~903: 75 → 76; "61 + 13 + 2"); `packages/client-core-async/README.md` line ~111 and `packages/client-core-effect/README.md` line ~393 ("All 76 … `accountAccess` added 2026-10-13").
- Modify: `docs/privacy.md` — one sentence under "What is stored": the create-account form links this notice.
- Modify: the spec §7 — an *Amended 2026-10-13 (B2b as built)* block: `AuthPresenter.accounts` (the factory contract forces a presenter seam), `AuthViewState.failure`, the `accountAccess` phases, the "I already have a code" entry, `registrationAvailable` as the lane's name, the copy module, React Native untouched; §11's B2b row: "Ships" as built.
- Modify: `docs/DEPLOY.md` §4 step 15's note: B2b is what makes `REGISTRATION_OPEN=true` worth flipping (the clients can now register).

- [ ] **Step 1:** write; `pnpm check:doc-links` PASS; `pnpm exec biome ci --error-on-warnings .` (prose files are not biome's, but the run is cheap and catches a stray json).
- [ ] **Step 2: Commit** `docs: B2b client flows — how the login screen's account modes work, STATUS, member count 76`

---

## Close-out (controller)

1. **Gauntlet on the final tree:** `/rtc:gauntlet full`; then `pnpm --filter @rtc/tests test:fullstack:browser`, `pnpm --filter @rtc/tests test:fullstack:hybrid`, `pnpm --filter @rtc/tests test:fullstack:node`, `pnpm test:e2e`.
2. **Whole-branch review** on the most capable model; one fix wave; scoped re-review.
3. **Rulings file** `docs/superpowers/plans/2026-10-13-b2b-client-flows-rulings.md`: every ruling, the deferred-finding triage, the mutant table; committed LAST (after the goldens auto-commit, so the branch head carries a CI run).
4. **Closing batch**, one outward step per Bash call: `git push -u origin worktree-b2b-client-flows` → dispatch `update-visual-goldens.yml` (Task 11 step 5) → pull the auto-commit, verify → commit the rulings, push → `gh pr create` → CI on the head SHA (`gh run list` matched on `headSha`; required: `typecheck · test · build · gates` + three e2e jobs) → code-scanning check → Rule 3 triage → `gh pr merge --merge --subject "Merge PR #N: feat(client): B2b — the login screen's account flows"` → `git merge-base --is-ancestor` → worktree removed from outside it.
5. **Tell the user** what they still do: the goldens they accepted are in; redeploy both clients (Vercel) and the server (DEPLOY §4 steps 9–15 if not yet done); flip `REGISTRATION_OPEN=true` when they want the door open; B2c is next.

## Self-review

- **Spec coverage (§7):** `AuthPort` additions — T1; `HttpAuthAdapter` / `AuthSimulator` / routing — T2 (+T1); the `accountAccess` machine in three cores with a `@rtc/core-contract` suite — T4–T6; the `auth` presenter's new failure reasons — T1/T3; login-screen modes in both clients with the live checklist — T9/T10; `unconfirmed` offers the code entry, `pending`/`blocked` a message — T8 case 3 + T9; links only with a server URL through the shell lane (`registrationAvailable`) — T7/T8; the privacy line — T9; contract specs + goldens, the user's acceptance — T8/T11; the B2a amendments (password held until the code step, `pending_approval`, `password_unset`, the retryable password rule, 429, `invalid_code`, `unavailable`) — T4 cases 4, 6, 7, 10, 11; typed `rule` — T1. §13's RN exclusion holds (T7 only keeps RN compiling).
- **Placeholders:** none — the one `/* the eight intents */` in T5/T6 points at the RxJS machine's listed intents in T4.
- **Type consistency:** `AccountFlowOutcome`, `AccountFlowPort`, `AccountAccessState`, `RegistrationInput`, `CodeInput`, `AccountRequest`, `AccountAccessHeld`, `stepAccountAccess`, `callAccountFlow`, `describeAccountAccessTitle`, `ACCOUNT_ACCESS_COPY`, `PRIVACY_NOTICE_URL`, `offersRegistration`, `registrationAvailable`, `useAccountAccess`, `useRegistrationAvailable` are spelled the same in every task.
- **Review Focus:** 1 → T4 case 5; 2 → T4 cases 3, 9; 3 → T4 case 13; 4 → T2 table rows; 5 → T4 cases 7, 12 + T2 rule pass-through.
