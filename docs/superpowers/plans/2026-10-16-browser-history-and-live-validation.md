# Browser History and Live Field Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Browser Back/Forward move between login modes and workspace tabs through hash routes, and the login forms check the address, display name and code live, in both web clients.

**Architecture:** Types in `@rtc/core-api` (`AppRoute`, `RouteHistory`); the grammar, the two route-sync controllers and the field-feedback helpers as pure code in `@rtc/core-logic`; one DOM adapter over `history`/`popstate` in `@rtc/web-boot`, handed to the view through the view-model shell like the demo accounts; two thin hooks per client. The cores and the React Native app do not change (RN's fake view model gains one inert member).

**Tech Stack:** TypeScript, React 19.2 (`useEffectEvent`), SolidJS, Vitest, the shared `@rtc/ui-contract` specs, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-16-browser-history-and-live-validation-design.md](../specs/2026-10-16-browser-history-and-live-validation-design.md)

**Rulings made during execution:** [2026-10-16-browser-history-and-live-validation-rulings.md](2026-10-16-browser-history-and-live-validation-rulings.md)

## Global Constraints

- Hash routes, exactly: `#/fx`, `#/credit`, `#/equities`, `#/admin`, `#/sign-in`, `#/create-account`, `#/forgot-password`, `#/enter-code`. Anything else reads as no route. The query string and the path are never read or written by routing.
- The machines are the source of truth; the URL mirrors them. Back/Forward becomes an intent, never a state write.
- Nothing secret in a URL or in `history.state`: routes carry a mode name or a tab only.
- `@rtc/core-api` stays types-only (grep gate 42). `@rtc/core-logic` gets no DOM and no rxjs value. `@rtc/web-boot` gets no React/Solid.
- Inline error test id `login-field-error`, `data-field` one of `email`, `display-name`, `code`. Copy comes from `@rtc/core-logic`'s existing constants; no new user-facing strings.
- Repo rules apply: functions named by effect (`docs/handler-naming.md`), one import statement per module, fixture factories named `create*`, fake timers for timer-driven waits, no new `.js` files.
- Never run two builds in one checkout at once.

## Review Focus

1. **A popstate that fires while a request is in flight** (register busy, user presses Back): the opening intent must supersede it, and the late answer must not move the screen. The fold already guarantees the second half; the sync must call the intent, not skip it because "the phase already shows".
2. **Re-entrant observe**: in Solid, an intent called inside an effect can re-enter `observe` before the outer call returns. Each controller sets its own bookkeeping before calling an intent (the code below does).
3. **React StrictMode double effects**: the controllers are created, disposed and created again on mount; the second mount must be idempotent (no double push).
4. **A tab change the URL caused must not push**: Back to `#/fx` → `switchTab("fx")` → observe(`fx`) must find the URL already matching.
5. **A form whose fields change**: the code step shows the email field only when `state.email === null`; the submit gate must consider only the fields on screen.

---

### Task 1: Route types and grammar

**Files:**
- Create: `packages/core-api/src/routes.ts`
- Modify: `packages/core-api/src/index.ts` (add `export type * from "#/routes";`)
- Create: `packages/core-logic/src/routes/appRoutes.ts`
- Create: `packages/core-logic/src/routes/__tests__/appRoutes.test.ts`
- Modify: `packages/core-logic/src/index.ts` (add `export * from "#/routes/appRoutes";` in alphabetical position)

**Interfaces:**
- Produces: `AppRoute`, `AccountRouteMode`, `AccountNavigation`, `RouteHistory` (core-api); `parseAppRoute`, `formatAppRoute`, `isSameRoute`, `workspaceRoute`, `accountRoute` (core-logic).

- [ ] **Step 1: Write `packages/core-api/src/routes.ts`**

```ts
import type { WorkspaceTab } from "#/layout";

/** A login-screen mode a URL can name. The code step of the reset flow and
 * the three notices have no route of their own (spec §6). */
export type AccountRouteMode = "signIn" | "register" | "requestReset" | "enterCode";

/** The four `accountAccess` intents that only change the screen. */
export type AccountNavigation =
  | "returnToSignIn"
  | "startRegistration"
  | "startReset"
  | "startCodeEntry";

/** What a hash route names: a workspace tab or a login-screen mode. */
export type AppRoute =
  | { readonly area: "workspace"; readonly tab: WorkspaceTab }
  | { readonly area: "account"; readonly mode: AccountRouteMode };

/** The page's history, as routes. A subscriber hears history traversal
 * (Back, Forward, an edited hash) only — never this port's own push or
 * replace. A host without one (React Native, most tests) has no routing. */
export interface RouteHistory {
  /** The route the URL names now, or null for none. */
  current(): AppRoute | null;
  /** A new history entry. */
  push(route: AppRoute): void;
  /** Rewrites the current history entry. */
  replace(route: AppRoute): void;
  subscribe(listener: (route: AppRoute | null) => void): () => void;
}
```

- [ ] **Step 2: Write the failing test `packages/core-logic/src/routes/__tests__/appRoutes.test.ts`**

```ts
import { describe, expect, it } from "vitest";

import type { AppRoute } from "@rtc/core-api";

import {
  accountRoute,
  formatAppRoute,
  isSameRoute,
  parseAppRoute,
  workspaceRoute,
} from "#/routes/appRoutes";

describe("app routes", () => {
  it.each([
    ["#/fx", workspaceRoute("fx")],
    ["#/credit", workspaceRoute("credit")],
    ["#/equities", workspaceRoute("equities")],
    ["#/admin", workspaceRoute("admin")],
    ["#/sign-in", accountRoute("signIn")],
    ["#/create-account", accountRoute("register")],
    ["#/forgot-password", accountRoute("requestReset")],
    ["#/enter-code", accountRoute("enterCode")],
  ])("reads %s and writes it back", (hash, route) => {
    expect(parseAppRoute(hash)).toEqual(route);
    expect(formatAppRoute(route)).toBe(hash);
  });

  it.each(["", "#", "#/", "#fx", "#/FX", "#/fx/", "#/fx?x=1", "#/nope", "/fx"])(
    "reads %j as no route",
    (hash) => {
      expect(parseAppRoute(hash)).toBeNull();
    },
  );

  it("compares routes by value", () => {
    const routes: readonly (AppRoute | null)[] = [
      null,
      workspaceRoute("fx"),
      workspaceRoute("credit"),
      accountRoute("signIn"),
      accountRoute("register"),
    ];

    for (const a of routes) {
      for (const b of routes) {
        expect(isSameRoute(a, b)).toBe(a === b);
      }
    }

    expect(isSameRoute(workspaceRoute("fx"), workspaceRoute("fx"))).toBe(true);
  });
});
```

Note `routes` holds distinct objects, so `a === b` is identity here, and the last line checks value equality across two fresh objects.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rtc/core-api build && pnpm --filter @rtc/core-logic test appRoutes`
Expected: FAIL, cannot resolve `#/routes/appRoutes`.

- [ ] **Step 4: Write `packages/core-logic/src/routes/appRoutes.ts`**

```ts
import type { AccountRouteMode, AppRoute, WorkspaceTab } from "@rtc/core-api";

export function workspaceRoute(tab: WorkspaceTab): AppRoute {
  return { area: "workspace", tab };
}

export function accountRoute(mode: AccountRouteMode): AppRoute {
  return { area: "account", mode };
}

/** One table for both directions, so the reader and the writer cannot
 * disagree. */
const ROUTE_SLUGS: readonly (readonly [string, AppRoute])[] = [
  ["fx", workspaceRoute("fx")],
  ["credit", workspaceRoute("credit")],
  ["equities", workspaceRoute("equities")],
  ["admin", workspaceRoute("admin")],
  ["sign-in", accountRoute("signIn")],
  ["create-account", accountRoute("register")],
  ["forgot-password", accountRoute("requestReset")],
  ["enter-code", accountRoute("enterCode")],
];

const HASH_PREFIX = "#/";

export function isSameRoute(a: AppRoute | null, b: AppRoute | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  if (a.area === "workspace") {
    return b.area === "workspace" && a.tab === b.tab;
  }

  return b.area === "account" && a.mode === b.mode;
}

/** The route a `location.hash` names; null for an empty, unknown or
 * malformed hash. */
export function parseAppRoute(hash: string): AppRoute | null {
  if (!hash.startsWith(HASH_PREFIX)) {
    return null;
  }

  const slug = hash.slice(HASH_PREFIX.length);
  const entry = ROUTE_SLUGS.find(([candidate]) => {
    return candidate === slug;
  });

  return entry === undefined ? null : entry[1];
}

export function formatAppRoute(route: AppRoute): string {
  const entry = ROUTE_SLUGS.find(([, candidate]) => {
    return isSameRoute(candidate, route);
  });

  // Every AppRoute has a row: the table covers both unions exhaustively.
  return `${HASH_PREFIX}${entry?.[0] ?? ""}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @rtc/core-logic test appRoutes`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @rtc/core-api typecheck && pnpm --filter @rtc/core-logic typecheck`

```bash
git add packages/core-api/src/routes.ts packages/core-api/src/index.ts packages/core-logic/src/routes packages/core-logic/src/index.ts
git commit -m "feat(routes): hash-route grammar and the RouteHistory port type"
```

---

### Task 2: The two route-sync controllers

**Files:**
- Create: `packages/core-logic/src/routes/accountRouteSync.ts`
- Create: `packages/core-logic/src/routes/workspaceRouteSync.ts`
- Create: `packages/core-logic/src/routes/__tests__/createFakeRouteHistory.ts` (test helper, not exported from the package)
- Create: `packages/core-logic/src/routes/__tests__/accountRouteSync.test.ts`
- Create: `packages/core-logic/src/routes/__tests__/workspaceRouteSync.test.ts`
- Modify: `packages/core-logic/src/index.ts` (export both modules)

**Interfaces:**
- Consumes: Task 1's types and grammar; `AccountAccessState`, `AccountAccessIntents`, `WorkspaceTab` from `@rtc/core-api`.
- Produces:
  - `accountRouteOf(state: AccountAccessState): AppRoute`
  - `accountRouteShows(state: AccountAccessState, route: AppRoute | null): boolean`
  - `createAccountRouteSync(deps: AccountRouteSyncDeps): AccountRouteSync` with `observe(state)`, `navigate(navigation: AccountNavigation)`, `dispose()`
  - `createWorkspaceRouteSync(deps: WorkspaceRouteSyncDeps): WorkspaceRouteSync` with `observe(tab)`, `dispose()`

- [ ] **Step 1: Write the fake history `packages/core-logic/src/routes/__tests__/createFakeRouteHistory.ts`**

```ts
import type { AppRoute, RouteHistory } from "@rtc/core-api";

import { formatAppRoute, parseAppRoute } from "#/routes/appRoutes";

export interface FakeRouteHistory extends RouteHistory {
  /** Every push and replace, in order, as `push #/x` / `replace #/x`. */
  readonly writes: string[];
  /** Simulates Back/Forward (or an edited hash) landing on `hash`. */
  traverse(hash: string): void;
}

export function createFakeRouteHistory(initialHash = ""): FakeRouteHistory {
  let hash = initialHash;
  const writes: string[] = [];
  const listeners = new Set<(route: AppRoute | null) => void>();

  return {
    writes,
    current: () => {
      return parseAppRoute(hash);
    },
    push: (route) => {
      hash = formatAppRoute(route);
      writes.push(`push ${hash}`);
    },
    replace: (route) => {
      hash = formatAppRoute(route);
      writes.push(`replace ${hash}`);
    },
    subscribe: (listener) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    traverse: (next) => {
      hash = next;

      for (const listener of [...listeners]) {
        listener(parseAppRoute(next));
      }
    },
  };
}
```

- [ ] **Step 2: Write the failing account test `accountRouteSync.test.ts`**

Drive a real fold so the test sees real phase changes: a tiny harness that holds `AccountAccessState`, applies `stepAccountAccess` for the four navigation events, and feeds each new state back into `sync.observe`. Cases (one `it` each; exact assertions on `history.writes` and the harness's recorded intents):

1. `accountRouteOf` — one case per row of spec §6: `signIn` → `#/sign-in`; `register` → `#/create-account`; `requestReset` → `#/forgot-password`; `code` signup → `#/enter-code`; `code` reset → `#/forgot-password`; each notice → `#/sign-in`.
2. `accountRouteShows` — sign-in shows on `#/sign-in` and on every workspace route; `register` does not show on a workspace route; `null` shows nothing.
3. Mount on `""` → writes `["replace #/sign-in"]`, no intent but `returnToSignIn`'s no-op.
4. Mount on `#/create-account` with registration → intent `startRegistration`, no writes.
5. Mount on `#/create-account` without registration → writes `["replace #/sign-in"]`, phase stays `signIn`.
6. Mount on `#/credit` → no writes, phase `signIn` (URL kept).
7. `navigate("startRegistration")` from sign-in → writes `["push #/create-account"]`, then the intent; the following `observe` writes nothing.
8. `navigate("returnToSignIn")` while the URL is already `#/sign-in` (a notice) → no write, intent called.
9. A result: state moves `register` (busy) → `code` signup with an email (feed it to `observe` directly) → writes `["replace #/enter-code"]`.
10. A reset-flow code step → `replace #/forgot-password` only if the URL is not already `#/forgot-password` (it is, after `navigate("startReset")`, so no write).
11. A notice after `#/enter-code` → `replace #/sign-in`.
12. Traverse to `#/sign-in` while `register` is busy → intent `returnToSignIn` is called (Review Focus 1); traverse to `#/create-account` → `startRegistration`; traverse to `#/credit` → `returnToSignIn`, no write.
13. Traverse to `#/enter-code` without registration → `replace #/sign-in` and `returnToSignIn`.
14. `dispose()` → a later traverse calls nothing.

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @rtc/core-logic test accountRouteSync`
Expected: FAIL, module not found.

- [ ] **Step 4: Write `packages/core-logic/src/routes/accountRouteSync.ts`**

```ts
import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
  AccountRouteMode,
  AppRoute,
  RouteHistory,
} from "@rtc/core-api";

import { accountRoute, isSameRoute } from "#/routes/appRoutes";

const NAVIGATION_MODES: Readonly<Record<AccountNavigation, AccountRouteMode>> = {
  returnToSignIn: "signIn",
  startRegistration: "register",
  startReset: "requestReset",
  startCodeEntry: "enterCode",
};

const MODE_NAVIGATIONS: Readonly<Record<AccountRouteMode, AccountNavigation>> = {
  signIn: "returnToSignIn",
  register: "startRegistration",
  requestReset: "startReset",
  enterCode: "startCodeEntry",
};

/** The route the URL shows for a phase (spec §6). The reset code step has
 * no route of its own: no intent reopens it with nothing held. */
export function accountRouteOf(state: AccountAccessState): AppRoute {
  switch (state.phase) {
    case "register":
      return accountRoute("register");
    case "requestReset":
      return accountRoute("requestReset");
    case "code":
      return accountRoute(state.flow === "signup" ? "enterCode" : "requestReset");
    case "signIn":
    case "pendingApproval":
    case "passwordUnset":
    case "passwordChanged":
      return accountRoute("signIn");
  }
}

/** True when the URL already shows the phase. The sign-in form also shows
 * on a workspace route: a signed-out visitor keeps the tab they asked for,
 * and lands on it once signed in. */
export function accountRouteShows(
  state: AccountAccessState,
  route: AppRoute | null,
): boolean {
  if (state.phase === "signIn" && route?.area === "workspace") {
    return true;
  }

  return isSameRoute(route, accountRouteOf(state));
}

export interface AccountRouteSyncDeps {
  readonly routes: RouteHistory;
  readonly intents: Pick<AccountAccessIntents, AccountNavigation>;
  /** False on a page with no server: only the sign-in form is reachable. */
  readonly registrationAvailable: boolean;
}

export interface AccountRouteSync {
  /** Every state the machine emits, the first one included: the first
   * call opens the mode the URL names, later ones keep the URL in step. */
  observe(state: AccountAccessState): void;
  /** One of the login screen's links: a new history entry, then the intent. */
  navigate(navigation: AccountNavigation): void;
  dispose(): void;
}

export function createAccountRouteSync({
  routes,
  intents,
  registrationAvailable,
}: AccountRouteSyncDeps): AccountRouteSync {
  let opened = false;
  const unsubscribe = routes.subscribe(openRequestedMode);

  /** The mode a URL asks for: an account route's own (sign in only, on a
   * page without registration), or the sign-in form for a workspace route
   * or none. A route the page cannot honour is rewritten first. */
  function openRequestedMode(route: AppRoute | null): void {
    if (route?.area === "workspace") {
      intents.returnToSignIn();
      return;
    }

    const mode =
      route !== null && registrationAvailable ? route.mode : "signIn";
    const target = accountRoute(mode);

    if (!isSameRoute(route, target)) {
      routes.replace(target);
    }

    intents[MODE_NAVIGATIONS[mode]]();
  }

  return {
    observe: (state) => {
      if (!opened) {
        opened = true;
        openRequestedMode(routes.current());
        return;
      }

      if (!accountRouteShows(state, routes.current())) {
        routes.replace(accountRouteOf(state));
      }
    },
    navigate: (navigation) => {
      const target = accountRoute(NAVIGATION_MODES[navigation]);

      if (!isSameRoute(routes.current(), target)) {
        routes.push(target);
      }

      intents[navigation]();
    },
    dispose: unsubscribe,
  };
}
```

- [ ] **Step 5: Run the account test to verify it passes**

Run: `pnpm --filter @rtc/core-logic test accountRouteSync`
Expected: PASS.

- [ ] **Step 6: Write the failing workspace test `workspaceRouteSync.test.ts`**

A harness holds `activeTab`, a `switchTab` spy that sets it and calls `observe` re-entrantly (to pin Review Focus 2). Cases:

1. Mount on `""` with `fx` → `["replace #/fx"]`.
2. Mount on `#/credit` with `fx` → `switchTab("credit")`, no writes (the re-entrant observe finds the URL matching).
3. Mount on `#/sign-in` (just signed in) with `equities` → `["replace #/equities"]`.
4. Tab change `fx` → `credit` after mount → `["push #/credit"]` (tab click and Jarvis are the same call).
5. Traverse to `#/fx` while on `credit` → `switchTab("fx")`, no writes (Review Focus 4).
6. Traverse to `#/create-account` while on `credit` → `["replace #/credit"]`, no `switchTab`.
7. Traverse to `""` → `replace` with the current tab.
8. A second mount with the same deps (StrictMode, Review Focus 3): create, observe(`fx`) on `#/credit`, dispose, create again, observe(`fx`) → `switchTab("credit")` twice is allowed, writes stay empty.
9. `dispose()` → a later traverse calls nothing.

- [ ] **Step 7: Write `packages/core-logic/src/routes/workspaceRouteSync.ts`**

```ts
import type { AppRoute, RouteHistory, WorkspaceTab } from "@rtc/core-api";

import { isSameRoute, workspaceRoute } from "#/routes/appRoutes";

export interface WorkspaceRouteSyncDeps {
  readonly routes: RouteHistory;
  readonly switchTab: (tab: WorkspaceTab) => void;
}

export interface WorkspaceRouteSync {
  /** Every active tab, the first one included: the first call lets the
   * URL's tab win, later ones push each new tab as a history entry. */
  observe(tab: WorkspaceTab): void;
  dispose(): void;
}

export function createWorkspaceRouteSync({
  routes,
  switchTab,
}: WorkspaceRouteSyncDeps): WorkspaceRouteSync {
  let shown: WorkspaceTab | null = null;
  const unsubscribe = routes.subscribe(followTraversal);

  /** Back/Forward: a tab route switches to it; anything else (a login
   * route, none) is rewritten to the tab on screen. */
  function followTraversal(route: AppRoute | null): void {
    if (route?.area === "workspace") {
      if (route.tab !== shown) {
        switchTab(route.tab);
      }

      return;
    }

    if (shown !== null) {
      routes.replace(workspaceRoute(shown));
    }
  }

  return {
    observe: (tab) => {
      const route = routes.current();
      const mounting = shown === null;
      shown = tab;

      if (mounting) {
        if (route?.area !== "workspace") {
          routes.replace(workspaceRoute(tab));
        } else if (route.tab !== tab) {
          switchTab(route.tab);
        }

        return;
      }

      if (!isSameRoute(route, workspaceRoute(tab))) {
        routes.push(workspaceRoute(tab));
      }
    },
    dispose: unsubscribe,
  };
}
```

- [ ] **Step 8: Run both tests, then prove them with mutants**

Run: `pnpm --filter @rtc/core-logic test RouteSync`
Expected: PASS.

Write `.superpowers/sdd/<this plan's workspace>/task-2-mutants.json` (git-ignored) with at least these mutants, each `"test": "pnpm --filter @rtc/core-logic test RouteSync"`, and run `node scripts/mutation-check.mts <that file>`; every row must be KILLED:

| name | file | find | replace |
|---|---|---|---|
| links replace instead of push | accountRouteSync.ts | `routes.push(target);` | `routes.replace(target);` |
| results push instead of replace | accountRouteSync.ts | `routes.replace(accountRouteOf(state));` | `routes.push(accountRouteOf(state));` |
| sign-in ignores workspace routes | accountRouteSync.ts | `state.phase === "signIn" && route?.area === "workspace"` | `false` |
| registration flag ignored | accountRouteSync.ts | `route !== null && registrationAvailable` | `route !== null` |
| reset code shows enter-code | accountRouteSync.ts | `state.flow === "signup" ? "enterCode" : "requestReset"` | `"enterCode"` |
| traversal skips the intent | accountRouteSync.ts | `intents[MODE_NAVIGATIONS[mode]]();` | `void MODE_NAVIGATIONS;` |
| tab change replaces | workspaceRouteSync.ts | `routes.push(workspaceRoute(tab));` | `routes.replace(workspaceRoute(tab));` |
| URL tab ignored on mount | workspaceRouteSync.ts | `switchTab(route.tab);\n        }\n\n        return;` | `}\n\n        return;` |
| login route not rewritten | workspaceRouteSync.ts | `if (shown !== null) {` | `if (false) {` |

If a `find` is not unique, widen it until it is; a SURVIVED row means a missing case — add it.

- [ ] **Step 9: Export, typecheck, commit**

Add `export * from "#/routes/accountRouteSync";` and `export * from "#/routes/workspaceRouteSync";` to `packages/core-logic/src/index.ts`.

Run: `pnpm --filter @rtc/core-logic typecheck && pnpm --filter @rtc/core-logic test`

```bash
git add packages/core-logic/src/routes packages/core-logic/src/index.ts
git commit -m "feat(routes): account and workspace route-sync controllers"
```

---

### Task 3: Field-feedback helpers

**Files:**
- Create: `packages/core-logic/src/presenters/accountFieldFeedback.ts`
- Create: `packages/core-logic/src/presenters/__tests__/accountFieldFeedback.test.ts`
- Modify: `packages/core-logic/src/index.ts`

**Interfaces:**
- Consumes: `InputCheck` and the three `check*Input` functions (already exported from `accountAccessFold.ts`).
- Produces: `AccountField` (`"email" | "display-name" | "code"`), `describeFieldError(check, revealed): string | null`, `findFirstFailingField(checks): AccountField | null`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";

import {
  describeFieldError,
  findFirstFailingField,
} from "#/presenters/accountFieldFeedback";
import {
  checkCodeInput,
  checkDisplayNameInput,
  checkEmailInput,
} from "#/presenters/accountAccessFold";
import { CODE_INPUT_ERROR, EMAIL_INPUT_ERROR } from "#/presenters/accountAccessCopy";

describe("field feedback", () => {
  it("shows nothing before the field is revealed", () => {
    expect(describeFieldError(checkEmailInput("nope"), false)).toBeNull();
  });

  it("shows the check's error once revealed", () => {
    expect(describeFieldError(checkEmailInput("nope"), true)).toBe(EMAIL_INPUT_ERROR);
  });

  it("shows nothing for a value that passes", () => {
    expect(describeFieldError(checkEmailInput("a@b.co"), true)).toBeNull();
  });

  it("names the first failing field in form order", () => {
    expect(
      findFirstFailingField([
        ["email", checkEmailInput("a@b.co")],
        ["display-name", checkDisplayNameInput("")],
        ["code", checkCodeInput("12")],
      ]),
    ).toBe("display-name");
  });

  it("names none when every field passes", () => {
    expect(
      findFirstFailingField([["code", checkCodeInput("12345678")]]),
    ).toBeNull();
    expect(describeFieldError(checkCodeInput("1"), true)).toBe(CODE_INPUT_ERROR);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/core-logic test accountFieldFeedback`, FAIL (module not found).

- [ ] **Step 3: Write `accountFieldFeedback.ts`**

```ts
import type { InputCheck } from "#/presenters/accountAccessFold";

/** A login-form field checked as the user types; the value is its
 * `data-field` attribute. */
export type AccountField = "email" | "display-name" | "code";

/** A field's error as the form shows it: nothing until the field is
 * revealed (left once, or a submit was tried), then its check's error for
 * as long as the value fails. */
export function describeFieldError(
  check: InputCheck,
  revealed: boolean,
): string | null {
  return revealed && !check.ok ? check.error : null;
}

/** The first field, in the order given (form order), whose check fails. */
export function findFirstFailingField(
  checks: readonly (readonly [AccountField, InputCheck])[],
): AccountField | null {
  const failing = checks.find(([, check]) => {
    return !check.ok;
  });

  return failing === undefined ? null : failing[0];
}
```

- [ ] **Step 4: Run to verify it passes, export, commit**

Add `export * from "#/presenters/accountFieldFeedback";` to the index (alphabetical among the presenters).

```bash
git add packages/core-logic/src/presenters/accountFieldFeedback.ts packages/core-logic/src/presenters/__tests__/accountFieldFeedback.test.ts packages/core-logic/src/index.ts
git commit -m "feat(core-logic): field-feedback helpers for live login validation"
```

---

### Task 4: The browser adapter and the page seam

**Files:**
- Create: `packages/web-boot/src/adapters/HashRouteHistory.ts`
- Create: `packages/web-boot/src/adapters/__tests__/HashRouteHistory.test.ts` (match the folder's existing test placement; if adapters keep tests beside the file, do that)
- Modify: `packages/web-boot/src/index.ts` (export `createHashRouteHistory`)
- Modify: `packages/web-boot/src/startWebClient.ts` (`WebClientPage.routes`, created once with `createHashRouteHistory(window)`)
- Modify: `packages/web-boot/src/startWebClient.test.ts` (the page carries `routes`)

**Interfaces:**
- Produces: `createHashRouteHistory(win: Window): RouteHistory`; `WebClientPage.routes: RouteHistory`.

- [ ] **Step 1: Write the failing jsdom test** with cases:
  1. `push` writes `#/credit` and adds an entry: `history.length` grows by one; `location.pathname` and `location.search` unchanged (start from `history.replaceState(null, "", "/?core=rxjs")`).
  2. `replace` writes the hash and leaves `history.length` unchanged.
  3. `current()` reads `location.hash`.
  4. A subscriber hears `window.dispatchEvent(new PopStateEvent("popstate"))` after `history.replaceState(null, "", "/#/equities")` with the equities route; it does NOT hear its own `push`/`replace` (assert zero calls after both).
  5. The unsubscribe function stops delivery.
  6. `history.state` after a push is `null` (nothing is stored there).

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @rtc/web-boot test HashRouteHistory`.

- [ ] **Step 3: Write `HashRouteHistory.ts`**

```ts
import type { AppRoute, RouteHistory } from "@rtc/core-api";
import { formatAppRoute, parseAppRoute } from "@rtc/core-logic";

/** The page's history as hash routes. A push or replace writes only the
 * hash (the path and the query stay as they are) and stores nothing in
 * `history.state`. `popstate` covers Back, Forward and a hash edited in the
 * address bar; `pushState`/`replaceState` never fire it, so a listener
 * hears traversal only. */
export function createHashRouteHistory(win: Window): RouteHistory {
  return {
    current: () => {
      return parseAppRoute(win.location.hash);
    },
    push: (route) => {
      win.history.pushState(null, "", formatAppRoute(route));
    },
    replace: (route) => {
      win.history.replaceState(null, "", formatAppRoute(route));
    },
    subscribe: (listener: (route: AppRoute | null) => void) => {
      function announceTraversal(): void {
        listener(parseAppRoute(win.location.hash));
      }

      win.addEventListener("popstate", announceTraversal);

      return () => {
        win.removeEventListener("popstate", announceTraversal);
      };
    },
  };
}
```

**Dependency (decided):** `@rtc/web-boot` does not list `@rtc/core-logic` today, and dependency-cruiser's `web-boot-stays-inner` allows only `web-boot|boot-splash|client-adapters|client-core-(rxjs|async|effect)|core-api|devtools-core|domain`. Add `@rtc/core-logic` (an inner, pure package that `client-adapters`, already allowed, depends on): to web-boot's `package.json` dependencies (`workspace:*`), its tsconfig references and `tsconfig.depcruise.json` paths if the other `@rtc/*` deps are listed there, the rule's `pathNot` alternation, and the rule's `comment`, which names the allowed packages. Then `pnpm check:deps` and `pnpm check:versions`.

- [ ] **Step 4: Add `routes` to the page**

In `startWebClient.ts`, add to `WebClientPage`:

```ts
  /** The page's history as hash routes: the login screen and the
   * workspace tabs mirror themselves into it. */
  readonly routes: RouteHistory;
```

and in the `createView({ … })` call, `routes: createHashRouteHistory(window),`. Extend the existing `startWebClient.test.ts` case that inspects the page to assert `page.routes.current()` reads the test's hash.

- [ ] **Step 5: Run web-boot's tests and coverage gate, commit**

Run: `pnpm --filter @rtc/web-boot test && pnpm --filter @rtc/web-boot test:coverage`

```bash
git add packages/web-boot
git commit -m "feat(web-boot): hash-route history adapter, handed to the view as page.routes"
```

---

### Task 5: The view-model seam, end to end

**Files:**
- Modify: `packages/react-bindings/src/createViewModel.ts` and `packages/solid-bindings/src/createViewModel.ts` — `ViewModelShell.routes?: RouteHistory`; new member `useRouteHistory: () => RouteHistory | null` (`shell?.routes ?? null`), placed beside `useRegistrationAvailable` in the interface and the object.
- Modify: both clients' `src/AppRoot.tsx` (new prop `routes: RouteHistory`, passed into the shell) and `src/main.tsx` (`routes={page.routes}` / the Solid equivalent).
- Modify: `packages/client-react/tests/ui/visual/react/buildFakeViewModel.ts` and `packages/client-solid/tests/ui/visual/solid/buildFakeViewModel.ts` — `useRouteHistory: () => null` (the visual tier has no routing).
- Modify: `packages/client-react-native/tests/visual/fake/shell.ts` (`useRouteHistory: () => null`), `fake/sliceTypes.ts` (add `"useRouteHistory"` to the shell slice union beside `"useRegistrationAvailable"`), `tests/visual/buildFakeViewModel.test.tsx` (`VIEW_MODEL_MEMBER_COUNT` 81 → 82).
- Modify: each client's tree-mount tests (`src/app/__tests__/reactTreeMount.test.tsx`, `solidTreeMount.test.tsx`) and any other `AppRoot` caller the typecheck reports — pass a `routes` (an in-memory fake is fine; `createHashRouteHistory(window)` under jsdom too).
- Modify: `packages/react-bindings/src/createViewModel.accountAccess.test.tsx` and the Solid twin — one case each: `useRouteHistory()` returns the shell's `routes`, and null without one.

- [ ] **Step 1:** Add the bindings member and its test (RED → GREEN): `pnpm --filter @rtc/react-bindings test createViewModel.accountAccess` and the Solid twin.
- [ ] **Step 2:** Thread `page.routes` through both clients' `main.tsx` → `AppRoot` → shell. Fix every typecheck error the new required prop produces.
- [ ] **Step 3:** Update the three fake view models and the RN count.
- [ ] **Step 4:** Run `pnpm typecheck`, then `pnpm --filter @rtc/react-bindings test`, `pnpm --filter @rtc/solid-bindings test`, `pnpm --filter @rtc/client-react-native test`, both web clients' unit tests.
- [ ] **Step 5:** Commit: `feat(view-model): useRouteHistory, from the page through AppRoot`.

No hook uses it yet; the contract harness default (Task 6) is null, so nothing changes on screen.

---

### Task 6: Contract harness — a fake history in the world

**Files:**
- Modify: `packages/ui-contract/src/shared/harness/world.ts` — `World.routes: FakeRouteHistory | null`, seeded by a new option; the fake records writes and offers `traverse(hash)`.
- Create: `packages/ui-contract/src/shared/harness/createFakeRouteHistory.ts` — same shape as Task 2's test helper (`writes`, `traverse`), built on `parseAppRoute` / `formatAppRoute` from `@rtc/core-logic`.
- Modify: `packages/ui-contract/src/shared/mount.ts` — option `routeHash?: string`: when given, the world gets `createFakeRouteHistory(routeHash)`; when omitted, `routes` is null (every existing spec stays unrouted).
- Modify: `packages/client-react/tests/ui/contract/react/viewModelFromWorld.ts` and `packages/client-solid/tests/ui/contract/solid/viewModelFromWorld.ts` — `useRouteHistory: () => world.routes`.
- Modify: `packages/ui-contract/src/shared/pages/shell/auth/LoginScreenPage.ts` and the page returned for `AppShell` (`JarvisDriverPage`, or a small shared mixin) — `routeWrites(): readonly string[]`, `traverse(hash: string): Promise<void>` (calls the world's `traverse` inside the framework's act/flush, the way existing page methods wrap user events), `routeHash(): string | null` (`formatAppRoute` of `current()`, or null).

- [ ] **Step 1:** Implement, following the existing `registrationAvailable` option's path through `mount.ts` → `world.ts` exactly (same naming, same doc comments).
- [ ] **Step 2:** Build ui-contract (`pnpm --filter @rtc/ui-contract build`; the tiers read its dist) and run both clients' contract tiers: `pnpm --filter @rtc/client-react test:ui:contract`, `pnpm --filter @rtc/client-solid test:ui:contract`. Expected: all green, unchanged.
- [ ] **Step 3:** Commit: `test(ui-contract): a fake route history the specs can seed and traverse`.

---

### Task 7: Routing in both clients

**Files:**
- Create: `packages/client-react/src/ui/shell/routes/useAccountRoutes.ts`, `useWorkspaceRoutes.ts`
- Create: `packages/client-solid/src/ui/shell/routes/useAccountRoutes.ts`, `useWorkspaceRoutes.ts`
- Modify: both clients' `src/ui/shell/auth/LoginScreen.tsx` (the four navigation callbacks go through the hook's `navigate`) and `src/ui/App.tsx` (call the workspace hook)
- Create: `packages/ui-contract/src/specs/shell/auth/LoginScreen.routes.contract.spec.ts`
- Create: `packages/ui-contract/src/specs/shell/chrome/WorkspaceRoutes.contract.spec.ts`

**Interfaces:**
- Consumes: `createAccountRouteSync`, `createWorkspaceRouteSync` (Task 2); `useRouteHistory` (Task 5); the harness's `routeHash` option and page methods (Task 6).

- [ ] **Step 1: Write the contract specs (RED for both clients).**

`LoginScreen.routes.contract.spec.ts` (mount `LoginScreen` with `auth: { status: "unauthenticated" }`, `registrationAvailable: true`, and a `routeHash`):
1. On `""`: `routeWrites()` is `["replace #/sign-in"]`.
2. On `#/create-account`: the create-account form shows (`phase()` is `register`), no writes.
3. On `#/create-account` with `registrationAvailable: false`: sign-in shows, `["replace #/sign-in"]`.
4. On `#/credit`: sign-in shows, no writes.
5. On `#/sign-in`, the Create account link: `routeWrites()` is `["push #/create-account"]` and `navigations()` ends with `startRegistration`.
6. Back to sign in from the form: `push #/sign-in`.
7. `traverse("#/sign-in")` from the create-account form: sign-in shows, `navigations()` ends with `returnToSignIn`, no new write.
8. `traverse("#/forgot-password")`: the reset form shows.
9. A result: drive the world's account state to a sign-up `code` step with an address (the existing specs show how to seed/advance `accountAccess`) → `routeWrites()` ends with `replace #/enter-code`.
10. Without `routeHash` (routes null): the links still navigate (`navigations()`), nothing throws.

`WorkspaceRoutes.contract.spec.ts` (mount `AppShell`, the same component the HeaderChrome/JarvisDriver specs mount):
1. On `""`: `["replace #/fx"]`.
2. On `#/credit`: the credit tab is active (the page's active-tab reader), no writes.
3. Clicking the Equities tab: `push #/equities`.
4. A Jarvis `switchTab` drive command (as `JarvisDriver.contract.spec.ts` drives one): `push` of that tab.
5. `traverse("#/fx")` after clicking Credit: FX active, no new write.
6. `traverse("#/create-account")` while on Credit: `replace #/credit`.

- [ ] **Step 2: Run to verify RED** — both clients' `test:ui:contract`, after `pnpm --filter @rtc/ui-contract build`.

- [ ] **Step 3: React hooks**

`useAccountRoutes.ts`:

```ts
import { useEffect, useEffectEvent, useRef } from "react";

import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
} from "@rtc/core-api";
import { type AccountRouteSync, createAccountRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/react-bindings";

type AccountRoutesSource = Pick<AccountAccessIntents, AccountNavigation> & {
  readonly state: AccountAccessState;
};

/** Keeps the page's hash route in step with the login screen (spec §6) and
 * returns the links' navigation: a new history entry, then the intent. A
 * host with no route history gets the bare intents. */
export function useAccountRoutes(
  account: AccountRoutesSource,
  registrationAvailable: boolean,
): (navigation: AccountNavigation) => void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();
  const syncRef = useRef<AccountRouteSync | null>(null);
  const { state, returnToSignIn, startRegistration, startReset, startCodeEntry } =
    account;

  const observeCurrentState = useEffectEvent((sync: AccountRouteSync): void => {
    sync.observe(state);
  });

  useEffect(() => {
    if (routes === null) {
      return undefined;
    }

    const sync = createAccountRouteSync({
      routes,
      intents: { returnToSignIn, startRegistration, startReset, startCodeEntry },
      registrationAvailable,
    });
    syncRef.current = sync;
    observeCurrentState(sync);

    return () => {
      sync.dispose();
      syncRef.current = null;
    };
  }, [routes, registrationAvailable, returnToSignIn, startRegistration, startReset, startCodeEntry]);

  useEffect(() => {
    syncRef.current?.observe(state);
  }, [state]);

  return (navigation: AccountNavigation): void => {
    if (syncRef.current === null) {
      account[navigation]();
      return;
    }

    syncRef.current.navigate(navigation);
  };
}
```

`useWorkspaceRoutes.ts` follows the same shape with `createWorkspaceRouteSync({ routes, switchTab })`, an effect event observing `activeTab` on creation, and an `[activeTab]` effect; it returns nothing. The intents from `useMachine` are stable per machine, so listing them as effect deps does not recreate the sync on each render; if `react-hooks` lint or the React Compiler objects to a construct, follow its message rather than suppressing it.

Wire: in `LoginScreen.tsx`, `const navigate = useAccountRoutes(account, registrationAvailable);` and pass `() => { navigate("startRegistration"); }` (and the other three) where `account.startRegistration` etc. were passed — including `AccountNotice`'s `onSignIn` and every form's `onBack` / `onHaveCode`. Name each wrapper by effect if it needs a name (`openCreateAccount`, `openForgotPassword`, `openCodeEntry`, `openSignIn`). In `App.tsx`, `useWorkspaceRoutes(activeTab, switchTab);`.

- [ ] **Step 4: Solid hooks**

```ts
import { createEffect, onCleanup } from "solid-js";

import type {
  AccountAccessIntents,
  AccountAccessState,
  AccountNavigation,
} from "@rtc/core-api";
import { createAccountRouteSync } from "@rtc/core-logic";
import { useViewModel } from "@rtc/solid-bindings";

type AccountRoutesSource = Pick<AccountAccessIntents, AccountNavigation> & {
  readonly state: () => AccountAccessState;
};

/** Keeps the page's hash route in step with the login screen (spec §6) and
 * returns the links' navigation. Runs once per mount, like every Solid
 * component body. */
export function useAccountRoutes(
  account: AccountRoutesSource,
  registrationAvailable: boolean,
): (navigation: AccountNavigation) => void {
  const { useRouteHistory } = useViewModel();
  const routes = useRouteHistory();

  if (routes === null) {
    return (navigation) => {
      account[navigation]();
    };
  }

  const sync = createAccountRouteSync({ routes, intents: account, registrationAvailable });

  createEffect(() => {
    sync.observe(account.state());
  });
  onCleanup(() => {
    sync.dispose();
  });

  return (navigation) => {
    sync.navigate(navigation);
  };
}
```

`useWorkspaceRoutes(activeTab: () => WorkspaceTab, switchTab)` is the same shape. Wire both exactly as in React.

- [ ] **Step 5: Run GREEN** — both contract tiers; both clients' unit tests; `pnpm --filter @rtc/client-react test:ui:contract:coverage` and the Solid one (≥95%).
- [ ] **Step 6: Mutants** — at least: drop the `navigate` wrapper in one form's back link (pass the bare intent) in React and in Solid; replace `sync.observe(state)` in the `[state]` effect with nothing. Each must be killed by the routes spec. Record the table in the ledger.
- [ ] **Step 7: Commit** — `feat(clients): browser Back/Forward through login modes and workspace tabs`.

---

### Task 8: Live field validation in both clients

**Files:**
- Create: `packages/client-react/src/ui/shell/auth/FieldError.tsx` and `packages/client-solid/src/ui/shell/auth/FieldError.tsx`
- Modify: both clients' `CreateAccountForm.tsx`, `ResetRequestForm.tsx`, `EnterCodeForm.tsx`, `LoginScreen.module.css` (a `.fieldError` rule)
- Create: `packages/ui-contract/src/specs/shell/auth/LoginScreen.fieldValidation.contract.spec.ts`
- Modify: `LoginScreenPage.ts` (`fieldError(field): string | null`, `blur(testId)`, `focusedTestId(): string | null`), and existing specs in `LoginScreen.accountAccess.contract.spec.ts` that submit an invalid address/name/code and expect `login-error` (find them: `git grep -n "INPUT_ERROR" packages/ui-contract/src/specs`)
- Modify: `tests/browser/scenarios/login.ts` and `tests/fullstack/browser/*.spec.ts` where a malformed-input case expects the form-level error (the B2b browser smoke has two) — they now expect the field error

**Interfaces:**
- Consumes: `describeFieldError`, `findFirstFailingField`, `AccountField` (Task 3); `checkEmailInput`, `checkDisplayNameInput`, `checkCodeInput`.

- [ ] **Step 1: Write the contract spec (RED).** Cases, per form where the field exists:
  1. Typing an invalid address shows no field error while the field has focus.
  2. Leaving the field (blur) shows `EMAIL_INPUT_ERROR` under it, `data-field="email"`, and the input has `aria-invalid="true"` and `aria-describedby` naming the error's id.
  3. Fixing the value after the error showed removes it as the user types (no second blur).
  4. Submit with an invalid display name (valid address): `register` is NOT called (`page.registrations()` stays empty), the display-name error shows, focus is on `login-display-name`, and no `login-error` shows.
  5. Submit with every field valid: `register` is called once with the typed values (as today).
  6. Code step with an address held: only the code field is checked (submit with a bad code → `CODE_INPUT_ERROR`, focus on `login-code`); with no address held, an empty address is the first failure.
  7. Reset request: blur and submit behave the same for its one field.
  8. A server refusal still shows at form level (`login-error`) — reuse an existing refusal setup.

- [ ] **Step 2: Implement, React.** `FieldError`:

```tsx
import type { ReactElement } from "react";

import type { AccountField } from "@rtc/core-logic";

import styles from "./LoginScreen.module.css";

/** One field's live error, under the field; renders nothing when null. */
export function FieldError({ field, error }: FieldErrorProps): ReactElement | null {
  if (error === null) {
    return null;
  }

  return (
    <div
      id={fieldErrorId(field)}
      data-testid="login-field-error"
      data-field={field}
      className={styles.fieldError}
    >
      {error}
    </div>
  );
}

export function fieldErrorId(field: AccountField): string {
  return `login-field-error-${field}`;
}

interface FieldErrorProps {
  readonly field: AccountField;
  readonly error: string | null;
}
```

In `CreateAccountForm`: keep a `revealed` state (`ReadonlySet<AccountField>`), refs for the email and display-name inputs, and compute each check from the current value every render (`checkEmailInput(email)`, `checkDisplayNameInput(displayName)`). `onBlur` adds the field to `revealed`. Each input gets `aria-invalid={error !== null}` and `aria-describedby={error === null ? undefined : fieldErrorId(field)}`; `<FieldError>` sits right after the input's `<label>`. On submit: reveal both fields; `findFirstFailingField([["email", emailCheck], ["display-name", nameCheck]])`; if a field fails, focus its input and return; otherwise `onRegister({ email, displayName, password })` as today. Same pattern for `ResetRequestForm` (email) and `EnterCodeForm` (email only when `asksEmail`, then code).

`.fieldError` in `LoginScreen.module.css`: the `.error` colour token, a smaller size and a small top margin; read `docs/performance.md` rules (no animation needed).

- [ ] **Step 3: Implement, Solid** — the same, with signals and `ref` variables; `FieldError` uses `<Show when={props.error}>`.
- [ ] **Step 4: Migrate the specs and e2e scenarios** that expected `login-error` for a local refusal.
- [ ] **Step 5: GREEN** — both contract tiers + coverage gates; `pnpm --filter @rtc/client-react test`, Solid likewise; `pnpm lint:css`.
- [ ] **Step 6: Mutants** — at least: reveal on focus instead of blur; submit without the failing-field gate; `describeFieldError` ignoring `revealed`. All killed.
- [ ] **Step 7: Commit** — `feat(clients): live address, display-name and code checks on the login forms`.

---

### Task 9: Visual scenario

**Files:**
- Modify: `packages/ui-contract/src/visual/scenarios.ts` — `"login/create-account-field-errors"` with the same component and fixture as `"login/create-account"`.
- Modify: `packages/ui-contract/src/visual/scenarioActions.ts`:

```ts
  "login/create-account-field-errors": {
    fullPage: true,
    steps: [
      { type: "login-email", text: "not-an-address" },
      { click: "login-display-name" },
      { type: "login-display-name", text: "x" },
      { click: "login-new-password" },
    ],
    waitForText: "Enter a valid email address",
  },
```

- Golden PNGs: the local set only in this task (`react-local/<platform>`), via the playwright tier's update for this one scenario (`npx playwright test -c <cfg> --update-snapshots -g create-account-field-errors` in `packages/client-react`); then assert react and solid against it. The x86 `react/` set is generated by the controller with `update-visual-goldens.yml` at the end (it needs a push).

- [ ] **Step 1:** Add the scenario, build ui-contract, generate the local golden, assert both clients.
- [ ] **Step 2:** Look at the PNG yourself: two field errors under their fields, nothing overlapping, the checklist below the password.
- [ ] **Step 3:** Commit: `test(visual): the create-account form with live field errors`.

---

### Task 10: End-to-end

**Files:**
- Create: `tests/browser/playwright/navigation.spec.ts` (runs for both clients through the existing config; uses `_openWorkspace.ts` and the Workspace page object; tabs are `tab-${tab}`)
- Modify: `tests/fullstack/browser/accounts.spec.ts` (+ `tests/browser/scenarios/login.ts` helpers as needed)

- [ ] **Step 1: Workspace journey** (`navigation.spec.ts`): open the app signed in; expect the URL hash `#/fx`; click Credit → `#/credit` and the Credit workspace visible; `page.goBack()` → FX visible, `#/fx`; `page.goForward()` → Credit; `page.reload()` (re-using the stored session as the other specs do) → Credit still active.
- [ ] **Step 2: Login journey** (`accounts.spec.ts`, real server, React): from sign in, click Create account → `#/create-account`; `page.goBack()` → the sign-in title and `#/sign-in`; `page.goForward()` → the create-account form; Forgot password → `page.goBack()` → sign in. Also one malformed-input case asserting `login-field-error`.
- [ ] **Step 3: Run** — `pnpm test:e2e` (both clients) and the browser smoke (`node tests/fullstack/browser-smoke.ts`, or its package script). Never pipe a Playwright run through `tail`/`grep` when judging it.
- [ ] **Step 4: Commit** — `test(e2e): Back and Forward through workspace tabs and login modes`.

---

### Task 11: Docs and STATUS

**Files:**
- Modify: `docs/authentication.md` §7.9 — the hash routes (table from spec §3), the push/replace rules in two sentences, the page-without-registration rule, and the live field checks.
- Modify: `docs/architecture/17-web-client-up-close.md` — where it lists what `startWebClient` hands the view (`demoAccounts`, `registrationAvailable`), add `routes`, one line on `@rtc/core-logic`'s route-sync controllers.
- Modify: `docs/STATUS.md` — delete the "Login screen: browser history and live input validation (user request, 2026-10-16)" entry; add under `## ⚪ Optional / next step`:

  `- **Real paths instead of hash routes (optional, user request 2026-10-16)** — the login modes and workspace tabs route through \`#/…\` today ([spec](superpowers/specs/2026-10-16-browser-history-and-live-validation-design.md)). Moving to \`/create-account\`, \`/credit\` needs an SPA rewrite on both Vercel projects (every unknown path → \`index.html\`) with \`/devtools/\` excluded, and a client-side redirect from \`#/…\` to the path so links already shared keep working. The grammar and the route-sync controllers in \`@rtc/core-logic\` stay; only \`@rtc/web-boot\`'s adapter changes.`

  Bump `**Last updated:**` to the day of the edit.
- Modify: `CLAUDE.md` only if a count it states changes (it does not list view-model members; check `git grep -n "81" CLAUDE.md` finds nothing relevant).

- [ ] **Step 1:** Write the docs; `pnpm check:doc-links`.
- [ ] **Step 2:** Commit: `docs: hash routes and live field checks; STATUS — real paths as a next step`.

---

## After the tasks (controller)

1. Full local gauntlet (`/rtc:gauntlet full`) on the final tree, then eslint + `biome ci` once more after the last edit.
2. Browser eyeball of both clients on `dev:react:fs` / `dev:solid:fs`: Back/Forward through every login mode and the tabs, reload on a tab, a core swap keeps the tab, inline errors.
3. Closing batch: push, PR, dispatch `update-visual-goldens.yml` on the branch for the x86 `react/` golden, show the user the new golden, CI green, merge on the user's go-ahead for the golden.
