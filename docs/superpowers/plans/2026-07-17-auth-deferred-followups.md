# Auth Deferred Follow-ups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the three bounded follow-ups deferred from the Phase 1 auth workstream (PR #210) and the RN login follow-up (PR #226): thread the server's real session expiry to the client, persist the RN session across cold starts, and give RN an explicit sign-out control.

**Architecture:** These build directly on the shipped auth seam — `AuthPort`/`AuthOutcome` (domain), `AuthPresenter` + `SessionStore` (client-core), and the RN composition root. No new architecture; each task mirrors an existing pattern already in the repo (`LocalStorageSessionStore`, `AsyncStoragePreferencesAdapter`, the web `AccountMenu` logout row, `LockButton`).

**Tech Stack:** TypeScript, RxJS, React 19 / react-bindings, Expo/React Native, `@react-native-async-storage/async-storage`, Vitest, `@testing-library/react-native` (jest).

## Global Constraints

- **Credentials never logged, never committed.** No task may log a token, password, or session contents. (Unchanged from Phase 1.)
- **Dependency rule holds:** `@rtc/domain` runtime deps = `rxjs` only. Do not add a dependency to any package for these tasks.
- **Lint:** repo enforces Biome **and** two ESLint configs **and** stylelint. Block-bodied arrows only (`useBlockStatements` / `arrow-body-style`) — mirror the existing `now` default in `AuthPresenter` (`= () => { return Date.now(); }`), never `= () => Date.now()`. Run `pnpm lint:eslint` (not just `biome check`) per task.
- **No `x!` non-null assertions, no inline object return types, no class members in test files** (repo custom rules).
- **Both frameworks stay green.** The `exp` change touches a domain type consumed by react-bindings AND solid-bindings fakes — `pnpm typecheck` across all packages is the gate, not one client.

---

### Task 1: Thread server `exp` through `AuthOutcome`

The server already computes and returns `exp` in `LoginResponseDto` (`loginHandler.ts` → `exp: deps.now() + deps.auth.ttlMs`), but `HttpAuthAdapter` drops it and `AuthPresenter` invents its own `now() + SESSION_TTL_MS` (a hardcoded 8h). If an operator sets a different server `AUTH_TTL_MS`, the client's stored-session expiry silently diverges from the token's real expiry. This task carries the server's expiry end-to-end so the client clock tracks the token.

**Files:**
- Create: `packages/domain/src/auth/authTtl.ts`
- Modify: `packages/domain/src/auth/` export via `packages/domain/src/index.ts` (add `DEFAULT_AUTH_TTL_MS`)
- Modify: `packages/domain/src/ports/authPort.ts` (add `exp` to the `ok` variant)
- Modify: `packages/domain/src/simulators/AuthSimulator.ts` (compute `exp`)
- Modify: `packages/client-core/src/adapters/HttpAuthAdapter.ts` (thread `dto.exp`)
- Modify: `packages/client-core/src/presenters/AuthPresenter.ts` (use `outcome.exp`; remove `SESSION_TTL_MS`)
- Test: `packages/client-core/src/presenters/__tests__/AuthPresenter.test.ts` (existing — adapt)
- Test: `packages/domain/src/simulators/AuthSimulator.test.ts` (existing if present — adapt/add an `exp` assertion)
- Test fixups (TS-flagged): `packages/react-bindings/src/__tests__/authHooks.test.tsx`, `packages/solid-bindings/src/createViewModel.streams.test.tsx`

**Interfaces:**
- Produces: `AuthOutcome` `ok` variant now `{ readonly ok: true; readonly token: string; readonly user: SessionUser; readonly exp: number }`. `exp` is an absolute epoch-ms timestamp (same basis as `StoredSession.exp` and the server DTO).
- Produces: `export const DEFAULT_AUTH_TTL_MS = 8 * 60 * 60 * 1000` from `@rtc/domain`.
- Consumes: `LoginResponseDto.exp` (already present in `@rtc/shared`).

- [ ] **Step 1: Write the failing test — AuthSimulator emits `exp`**

In `packages/domain/src/simulators/AuthSimulator.test.ts` (create if absent), add:

```ts
import { firstValueFrom } from "rxjs";
import { describe, expect, it } from "vitest";

import { AuthSimulator } from "./AuthSimulator.js";

describe("AuthSimulator exp", () => {
  it("stamps exp = now() + ttlMs on a successful login", async () => {
    function now(): number {
      return 1_000;
    }

    const sim = new AuthSimulator({ astark: "pw" }, 5_000, now);
    const outcome = await firstValueFrom(sim.login("astark", "pw"));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.exp).toBe(6_000);
    }
  });
});
```

- [ ] **Step 2: Run it — expect failure (exp missing / wrong ctor arity)**

Run: `pnpm --filter @rtc/domain test -- AuthSimulator`
Expected: FAIL (type error: `AuthSimulator` takes 1 arg / `exp` not on outcome).

- [ ] **Step 3: Add the domain TTL constant**

Create `packages/domain/src/auth/authTtl.ts`:

```ts
/**
 * Default session lifetime for simulator-mode auth, where there is no server
 * `AUTH_TTL_MS` to source a real expiry from. Mirrors the server's 8h default
 * so simulator and real-WS sessions age identically. Real-WS sessions ignore
 * this and use the server-provided `exp` (see `HttpAuthAdapter`).
 */
export const DEFAULT_AUTH_TTL_MS = 8 * 60 * 60 * 1000;
```

Add to `packages/domain/src/index.ts` (next to the other `// Auth` exports near the top):

```ts
export { DEFAULT_AUTH_TTL_MS } from "./auth/authTtl.js";
```

- [ ] **Step 4: Add `exp` to the `AuthOutcome` ok variant**

In `packages/domain/src/ports/authPort.ts`:

```ts
export type AuthOutcome =
  | {
      readonly ok: true;
      readonly token: string;
      readonly user: SessionUser;
      readonly exp: number;
    }
  | { readonly ok: false; readonly reason: "invalid" | "unavailable" };
```

- [ ] **Step 5: Compute `exp` in `AuthSimulator`**

In `packages/domain/src/simulators/AuthSimulator.ts` — add `ttlMs`/`now` ctor params (block-bodied default) and stamp `exp`:

```ts
import { type Observable, of } from "rxjs";

import { DEFAULT_AUTH_TTL_MS } from "../auth/authTtl.js";
import { findRosterUser } from "../auth/roster.js";
import type { AuthOutcome, AuthPort } from "../ports/authPort.js";

export interface DevCredentials {
  readonly [username: string]: string;
}

export class AuthSimulator implements AuthPort {
  constructor(
    private readonly devCredentials: DevCredentials,
    private readonly ttlMs: number = DEFAULT_AUTH_TTL_MS,
    private readonly now: () => number = (): number => {
      return Date.now();
    },
  ) {}

  login(username: string, password: string): Observable<AuthOutcome> {
    const entry = findRosterUser(username);
    const expected = this.devCredentials[username];

    if (!entry || expected === undefined || password !== expected) {
      return of({ ok: false, reason: "invalid" });
    }

    const token = `sim.${username}.${entry.user.id}`;
    return of({
      ok: true,
      token,
      user: entry.user,
      exp: this.now() + this.ttlMs,
    });
  }
}
```

Keep the existing class doc comment above the class.

- [ ] **Step 6: Run — AuthSimulator test passes**

Run: `pnpm --filter @rtc/domain test -- AuthSimulator`
Expected: PASS.

- [ ] **Step 7: Thread `dto.exp` in `HttpAuthAdapter`**

In `packages/client-core/src/adapters/HttpAuthAdapter.ts`, the 200 branch:

```ts
if (response.status === 200) {
  const dto: LoginResponseDto = await response.json();
  return { ok: true, token: dto.token, user: dto.user, exp: dto.exp };
}
```

- [ ] **Step 8: Use `outcome.exp` in `AuthPresenter`; remove `SESSION_TTL_MS`**

In `packages/client-core/src/presenters/AuthPresenter.ts`:
1. Delete the `export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;` line and its doc comment.
2. Change `writeSession` to take `exp` and persist it verbatim:

```ts
private writeSession(
  username: string,
  token: string,
  user: SessionUser,
  exp: number,
): void {
  const session: StoredSession = { token, user, username, exp };
  this.store.write(session);
}
```

3. Update both call sites to pass `outcome.exp`:
   - in `handleLoginOutcome`: `this.writeSession(username, outcome.token, outcome.user, outcome.exp);`
   - in `handleUnlockOutcome`: `this.writeSession(username, outcome.token, outcome.user, outcome.exp);`

Leave the `now` constructor param and `resume()` untouched (still compares `entry.exp > this.now()`).

- [ ] **Step 9: Adapt `AuthPresenter.test.ts`**

The fake port returns whatever `AuthOutcome` is passed, so every `ok: true` literal needs `exp`, and the two stored-session assertions must expect the outcome's `exp` (not `now() + SESSION_TTL_MS`):
1. Remove `SESSION_TTL_MS` from the import (`../AuthPresenter`).
2. For each `fakeAuthPort({ ok: true, token: ..., user: USER })`, add `exp: <some fixed value>` — pick a value distinct from `now()` so the assertion proves the presenter persists the *outcome's* exp, e.g. `exp: 9_000_000`.
3. In the "login success ... writes the session" test, change the expectation to `exp: 9_000_000` (the outcome's exp) and use the matching outcome. Same for the unlock-writes-session test (line ~225): outcome `exp` and expectation must match; drop `currentNow + SESSION_TTL_MS`.

- [ ] **Step 10: Fix the binding-test fakes**

- `packages/react-bindings/src/__tests__/authHooks.test.tsx` (~line 83): `return of({ ok: true, token: "t", user: DEMO_USER, exp: 9_000_000 });`
- `packages/solid-bindings/src/createViewModel.streams.test.tsx`: if it constructs an `ok: true` `AuthOutcome`, add `exp: 9_000_000`. If it only imports `type AuthPort` and never builds an ok outcome, no change.

- [ ] **Step 11: Full typecheck + covering tests**

Run: `pnpm typecheck`
Expected: PASS across all packages (catches any remaining `ok: true` literal missing `exp`).
Run: `pnpm --filter @rtc/domain --filter @rtc/client-core --filter @rtc/react-bindings --filter @rtc/solid-bindings test`
Expected: PASS.
Run: `pnpm lint:eslint`
Expected: clean.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(auth): thread server session exp through AuthOutcome to the client"
```

---

### Task 2: Persist the RN session across cold starts (AsyncStorage)

RN uses `InMemorySessionStore`, so every cold app launch drops the session and forces a re-login — unlike web, which resumes from `localStorage`. `SessionStore.read()` is synchronous but AsyncStorage is async, so this mirrors `AsyncStoragePreferencesAdapter`: an in-memory mirror serves the synchronous port, writes fire-and-forget through to AsyncStorage, and a one-shot async `hydrate()` seeds the mirror at boot *before* `AuthPresenter` is constructed (gated in `_layout.tsx` like the existing fonts gate).

**Files:**
- Create: `packages/client-react-native/src/app/adapters/AsyncStorageSessionStore.ts`
- Test: `packages/client-react-native/src/app/adapters/AsyncStorageSessionStore.test.ts`
- Modify: `packages/client-react-native/src/app/buildNativePorts.ts` (accept optional `sessionStore`)
- Modify: `packages/client-react-native/src/app/AppRoot.tsx` (accept + forward `sessionStore`)
- Modify: `packages/client-react-native/app/_layout.tsx` (hydrate + gate mount)
- Test: `packages/client-react-native/src/app/buildNativePorts.test.ts` (existing — verify still green; extend if it asserts the store type)

**Interfaces:**
- Produces: `class AsyncStorageSessionStore implements SessionStore` with `read()/write()/clear()` (sync) plus `static hydrate(): Promise<AsyncStorageSessionStore>`.
- Produces: `SESSION_STORAGE_KEY = "rtc-session"` (match the web key name for parity).
- Consumes: `buildNativePorts(opts: { simulator?: boolean; sessionStore?: SessionStore })`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/app/adapters/AsyncStorageSessionStore.test.ts`. Mock AsyncStorage with an in-memory jest mock:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StoredSession } from "@rtc/client-core";
import type { SessionUser } from "@rtc/domain";

import {
  AsyncStorageSessionStore,
  SESSION_STORAGE_KEY,
} from "./AsyncStorageSessionStore";

vi.mock("@react-native-async-storage/async-storage", () => {
  let store: Record<string, string> = {};
  return {
    default: {
      getItem: vi.fn((k: string) => {
        return Promise.resolve(store[k] ?? null);
      }),
      setItem: vi.fn((k: string, v: string) => {
        store[k] = v;
        return Promise.resolve();
      }),
      removeItem: vi.fn((k: string) => {
        delete store[k];
        return Promise.resolve();
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

const USER: SessionUser = {
  name: "Anthony Stark",
  initials: "AS",
  role: "Senior FX Trader",
  id: "TRD-0042",
  email: "a.stark@reactivetrader.io",
  desk: "G10 Spot · London",
  clearance: "LEVEL 4 · FULL",
};

const SESSION: StoredSession = {
  token: "tok-1",
  user: USER,
  username: "astark",
  exp: 9_000_000,
};

describe("AsyncStorageSessionStore", () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
  });

  it("hydrate() resumes a persisted session into a synchronous read()", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION));
    const store = await AsyncStorageSessionStore.hydrate();
    expect(store.read()).toEqual(SESSION);
  });

  it("hydrate() returns an empty store when nothing is persisted", async () => {
    const store = await AsyncStorageSessionStore.hydrate();
    expect(store.read()).toBeNull();
  });

  it("write() updates read() synchronously and persists for the next hydrate", async () => {
    const store = await AsyncStorageSessionStore.hydrate();
    store.write(SESSION);
    expect(store.read()).toEqual(SESSION);
    const next = await AsyncStorageSessionStore.hydrate();
    expect(next.read()).toEqual(SESSION);
  });

  it("clear() empties read() and removes persisted state", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(SESSION));
    const store = await AsyncStorageSessionStore.hydrate();
    store.clear();
    expect(store.read()).toBeNull();
    const next = await AsyncStorageSessionStore.hydrate();
    expect(next.read()).toBeNull();
  });

  it("hydrate() tolerates corrupt persisted JSON (returns empty)", async () => {
    await AsyncStorage.setItem(SESSION_STORAGE_KEY, "{not json");
    const store = await AsyncStorageSessionStore.hydrate();
    expect(store.read()).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect failure (module missing)**

Run: `pnpm --filter @rtc/client-react-native test -- AsyncStorageSessionStore`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement the store**

Create `packages/client-react-native/src/app/adapters/AsyncStorageSessionStore.ts`. Reuse the web store's validation shape (`isStoredSession`/`isSessionUser`) — copy the guards from `LocalStorageSessionStore.ts` (they are framework-neutral). In-memory mirror + write-through + static async factory:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

import type { SessionStore, StoredSession } from "@rtc/client-core";
import type { SessionUser } from "@rtc/domain";

export const SESSION_STORAGE_KEY = "rtc-session";

interface ParsedStoredSession {
  readonly token: unknown;
  readonly user: unknown;
  readonly username: unknown;
  readonly exp: unknown;
}

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.name === "string" &&
    typeof user.initials === "string" &&
    typeof user.role === "string" &&
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.desk === "string" &&
    typeof user.clearance === "string"
  );
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const parsed = value as ParsedStoredSession;
  return (
    typeof parsed.token === "string" &&
    typeof parsed.username === "string" &&
    typeof parsed.exp === "number" &&
    isSessionUser(parsed.user)
  );
}

function parseSession(raw: string | null): StoredSession | null {
  if (raw === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * AsyncStorage-backed SessionStore for the RN client. `SessionStore` is
 * synchronous but AsyncStorage is async, so — like `AsyncStoragePreferencesAdapter`
 * — an in-memory mirror serves the synchronous port while writes go through to
 * AsyncStorage fire-and-forget. `hydrate()` reads the store once and returns a
 * seeded instance; the RN composition gates `AppRoot` on it so `AuthPresenter`
 * resumes from a live mirror. Tolerant of corrupt/missing storage (returns
 * null). Never logs the session contents (token/credentials).
 */
export class AsyncStorageSessionStore implements SessionStore {
  private session: StoredSession | null;

  private constructor(initial: StoredSession | null) {
    this.session = initial;
  }

  static async hydrate(): Promise<AsyncStorageSessionStore> {
    try {
      const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
      return new AsyncStorageSessionStore(parseSession(raw));
    } catch {
      return new AsyncStorageSessionStore(null);
    }
  }

  read(): StoredSession | null {
    return this.session;
  }

  write(session: StoredSession): void {
    this.session = session;
    void AsyncStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session),
    ).catch(() => {});
  }

  clear(): void {
    this.session = null;
    void AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => {});
  }
}
```

- [ ] **Step 4: Run — store tests pass**

Run: `pnpm --filter @rtc/client-react-native test -- AsyncStorageSessionStore`
Expected: PASS.

- [ ] **Step 5: Accept an injected `sessionStore` in `buildNativePorts`**

In `packages/client-react-native/src/app/buildNativePorts.ts`:
1. Extend the options: `interface BuildNativePortsOptions { simulator?: boolean; sessionStore?: SessionStore; }` (import `type SessionStore` from `@rtc/client-core`).
2. Replace `const sessionStore = new InMemorySessionStore();` with `const sessionStore = opts.sessionStore ?? new InMemorySessionStore();`.
3. Update the block comment that currently says the store is "an `InMemorySessionStore` (not AsyncStorage-backed) ... a future follow-up" — it now accepts an AsyncStorage-backed store from the composition root; keep the sync/async explanation but note persistence is wired via `AsyncStorageSessionStore.hydrate()` in `_layout.tsx`.

- [ ] **Step 6: Forward `sessionStore` through `AppRoot`**

In `packages/client-react-native/src/app/AppRoot.tsx`:
1. `AppRootProps` gains `sessionStore?: SessionStore` (import the type from `@rtc/client-core`).
2. Pass it into the build: `buildNativePorts({ simulator, sessionStore })`.

- [ ] **Step 7: Hydrate + gate the mount in `_layout.tsx`**

In `packages/client-react-native/app/_layout.tsx`, add a session-hydration gate parallel to the fonts gate. Create the store once and hydrate it before mounting `AppRoot`:

```tsx
const [sessionStore, setSessionStore] = useState<SessionStore | null>(null);

useEffect(() => {
  let alive = true;
  void AsyncStorageSessionStore.hydrate().then((store) => {
    if (alive) {
      setSessionStore(store);
    }
  });
  return (): void => {
    alive = false;
  };
}, []);
```

Extend the existing loading gate so the app waits for BOTH fonts and the session store:

```tsx
if (!fontsLoaded || sessionStore === null) {
  return (
    <GestureHandlerRootView style={styles.screen}>
      <SafeAreaView style={styles.screen} testID="fonts-loading" />
    </GestureHandlerRootView>
  );
}
```

Pass the store into `AppRoot`: `<AppRoot key={...} simulator={simulator} sessionStore={sessionStore}>`. Import `AsyncStorageSessionStore` and `type SessionStore`.

Note: `sessionStore` is created once and stable across the `key`-remount sim/live toggle, so the session survives a toggle; on `logout()` the presenter calls `store.clear()`, wiping AsyncStorage too.

- [ ] **Step 8: Verify existing composition tests still pass**

Run: `pnpm --filter @rtc/client-react-native test -- buildNativePorts`
Expected: PASS. If `buildNativePorts.test.ts` asserts the default store type, confirm the default branch (no `sessionStore` passed) still yields `InMemorySessionStore`.

- [ ] **Step 9: Typecheck + lint**

Run: `pnpm --filter @rtc/client-react-native typecheck` (or `pnpm typecheck`)
Run: `pnpm lint:eslint`
Expected: clean.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(rn): persist the session across cold starts via AsyncStorage"
```

---

### Task 3: RN explicit sign-out control

The `useAuth().logout()` seam already exists (web surfaces it as `AccountMenu`'s SIGN OUT row). RN has no account menu, so add a toolbar `LogoutButton` next to `LockButton`, mirroring `LockButton`'s structure exactly. Immediate sign-out (no confirm), matching web.

**Files:**
- Create: `packages/client-react-native/src/ui/shell/auth/LogoutButton.tsx`
- Test: `packages/client-react-native/src/ui/shell/auth/LogoutButton.test.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx` (render `LogoutButton` in the toolbar)

**Interfaces:**
- Consumes: `useViewModel().useAuth().logout` (existing seam).
- Produces: `<LogoutButton />` with `testID="logout-button"`.

- [ ] **Step 1: Write the failing test**

Create `packages/client-react-native/src/ui/shell/auth/LogoutButton.test.tsx`, modelled on `LockButton.test.tsx`. It should render the button inside a fake ViewModel whose `useAuth` returns a spy `logout`, fire a press, and assert `logout` was called once. Follow the exact harness `LockButton.test.tsx` uses (same `renderWithTheme` + fake `useViewModel`). Assert:

```ts
fireEvent.press(getByTestId("logout-button"));
expect(logout).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run it — expect failure (module missing)**

Run: `pnpm --filter @rtc/client-react-native test -- LogoutButton`
Expected: FAIL (cannot find module).

- [ ] **Step 3: Implement `LogoutButton` (mirror `LockButton`)**

Create `packages/client-react-native/src/ui/shell/auth/LogoutButton.tsx`:

```tsx
import type { JSX } from "react";
import { Pressable, StyleSheet, Text, type TextStyle } from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Toolbar affordance that signs the operator out. RN has no header
 * AccountMenu, so the toolbar carries the sign-out control alongside `LockButton`;
 * it clears the session and returns to `LoginScreen` via the `useAuth().logout()`
 * seam (the web `AccountMenu` SIGN OUT row's RN analogue). Immediate — no
 * confirmation — matching web. */
export function LogoutButton(): JSX.Element {
  const { useAuth } = useViewModel();
  const { logout } = useAuth();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      testID="logout-button"
      onPress={() => {
        logout();
      }}
    >
      <Text style={styles.label}>Sign out</Text>
    </Pressable>
  );
}

interface LogoutButtonStyles {
  label: TextStyle;
}

function makeStyles(t: RnTheme): LogoutButtonStyles {
  return StyleSheet.create({
    label: { color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
```

(Use `t.textMuted` for the label so it reads as secondary to the accent-coloured `Lock` — sign-out is the less-frequent action.)

- [ ] **Step 4: Run — LogoutButton test passes**

Run: `pnpm --filter @rtc/client-react-native test -- LogoutButton`
Expected: PASS.

- [ ] **Step 5: Render it in the toolbar**

In `packages/client-react-native/app/_layout.tsx`, import `LogoutButton` and add it to the `toolbarRight` cluster in `Chrome`, immediately after `<LockButton />`:

```tsx
          <LockButton />
          <LogoutButton />
```

- [ ] **Step 6: Typecheck + lint + full RN suite**

Run: `pnpm --filter @rtc/client-react-native typecheck`
Run: `pnpm --filter @rtc/client-react-native test`
Run: `pnpm lint:eslint`
Expected: clean/PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(rn): add an explicit sign-out control to the toolbar"
```

---

### Task 4: Refresh stale STATUS.md entries

`docs/STATUS.md` still lists auth Phase 1 and Devtools RN inspection as "not built," but both merged (PRs #210/#226 and #227). Remove them from the backlog and note the remaining auth follow-up state (Phase 2 per-user isolation still unspec'd).

**Files:**
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Edit STATUS.md**

Under "🔴 Designed, not built":
1. Remove the **Login + server-side auth (Phase 1)** line — Phase 1 shipped (PR #210) plus the RN login follow-up (PR #226) and these three deferred follow-ups. If any auth item remains worth tracking, replace it with a single line under an appropriate heading: "**Auth Phase 2 — per-user server state isolation** — not yet spec'd (per-connection ctx keyed by authenticated user)."
2. Remove the **Devtools RN inspection** line — shipped (PR #227).

Bump the "Last updated" date to `2026-07-17`.

- [ ] **Step 2: Verify doc links still resolve**

Run: `pnpm check:doc-links`
Expected: PASS (no broken relative links/anchors introduced).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs(status): drop shipped auth Phase 1 + devtools RN inspection from the backlog"
```

---

## Self-Review

- **Spec coverage:** three deferred items → Tasks 1 (exp threading), 2 (RN persistence), 3 (RN logout); plus Task 4 housekeeping. ✅
- **Type consistency:** `AuthOutcome.exp` (Task 1) is `number` epoch-ms everywhere; `StoredSession.exp` already `number`; `AsyncStorageSessionStore` (Task 2) implements the unchanged `SessionStore`; `buildNativePorts`/`AppRoot` thread `SessionStore`. ✅
- **Placeholder scan:** all code steps carry full code; test-adaptation steps name exact files/lines and the exact literal change. ✅
- **Global constraints:** block-bodied arrows used in every arrow default; no new deps; no logging of session contents. ✅
