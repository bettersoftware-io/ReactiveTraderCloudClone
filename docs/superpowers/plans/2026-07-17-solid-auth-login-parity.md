# SolidJS Auth-Login Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@rtc/client-solid` the same sign-in gate as `@rtc/client-react` — port `AuthGate` + `LoginScreen`, replace the walking-skeleton auto-login with the real gate, and turn on the shared `shell/auth` contract specs — so the two web clients reach auth parity.

**Architecture:** A pure-view port following the established SolidJS-port recipe (`docs/superpowers/plans/2026-07-12-solidjs-port.md`, Appendix A). Zero changes to `domain`/`client-core`/`solid-bindings`/`client-react` — the `useAuth` seam, `HudLogo`, `BootGate`, the shared contract specs + page objects, and the `viewModelFromWorld` auth adapter (`authLoginArgs` command log) **already exist**. The only new artifacts are two Solid components, one byte-copied CSS file, two contract-registry entries, and the removal of two "not-yet-ported" exclusions.

**Tech Stack:** SolidJS, `@rtc/solid-bindings`, CSS Modules, vitest + `@solidjs/testing-library`, the `@rtc/ui-contract` shared contract specs.

## Global Constraints

- Follow `.claude/skills/shipping-repo-changes` — worktree first, PR + CI green (`gh run list`, never `gh pr checks`), merge commit, cleanup. **One PR** for this whole increment; full gauntlet before it.
- `#/*` alias imports (Biome bans ≥2-up relatives). Biome zero findings, no suppressions; mandatory braces; **no inline `style={{…}}`** (CSS Modules only).
- **Copy `*.module.css` byte-identical (`cp`, never retype).** The CSS parity gate (`packages/client-solid/tests/parity/cssParity.test.ts`) enforces byte-equality and, with `PARITY_COMPLETE === true`, requires every React `*.module.css` to have a Solid twin unless listed in `REACT_ONLY_MODULE_CSS`.
- **Solid `useAuth().state` is an `Accessor`, not a plain object** (unlike React). Every read is `state().status` / `state().error` — call the accessor at each JSX use-site; never store `state()` at component top level.
- Every `data-testid` / `data-*` / aria attribute and user-visible string copied **exactly** from the React source. Literal glyphs (`▸`), never `\uXXXX` escapes.
- eslint-plugin-solid: **no props destructuring** — use `props.children` etc.
- Before the PR: run the ≥95% UI-contract coverage check for **both** clients (`test:ui:contract:coverage`) locally — it's a CI gate but cheap to check first; the newly-enabled auth specs must keep Solid's coverage green.

## Source of truth (React originals to port)

- `packages/client-react/src/ui/shell/auth/AuthGate.tsx`
- `packages/client-react/src/ui/shell/auth/LoginScreen.tsx`
- `packages/client-react/src/ui/shell/auth/LoginScreen.module.css`
- Porting template (closest Solid precedent): `packages/client-solid/src/ui/shell/lock/LockScreen.tsx` (same overlay/panel/form idiom — `createSignal`, `class=`, `onInput`+`event.currentTarget.value`, `<Show>`, `onSubmit`+`preventDefault`, literal `▸`).

## File Structure

```
packages/client-solid/
  src/ui/shell/auth/
    AuthGate.tsx            — NEW: gate (Show authenticated ? children : LoginScreen)
    LoginScreen.tsx         — NEW: dumb sign-in form over the useAuth seam
    LoginScreen.module.css  — NEW: byte-identical copy of the client-react file
  src/AppRoot.tsx           — MODIFY: drop onMount auto-login; wrap <BootGate><AuthGate>…
  src/app/buildBrowserPorts.ts — MODIFY: AuthSimulator accepts all four roster users
  src/ui/App.test.tsx       — MODIFY: sign in before asserting the shell chrome
  tests/ui/contract/solid/registry.tsx — MODIFY: add AuthGate + LoginScreen entries
  tests/ui/contract/vitest.config.ts    — MODIFY: empty notYetPortedSpecs
  tests/parity/cssParity.test.ts        — MODIFY: drop the REACT_ONLY_MODULE_CSS entry
```

---

## Task 1: Port `AuthGate` + `LoginScreen` and turn on the shared contract specs

**Files:**
- Create: `packages/client-solid/src/ui/shell/auth/LoginScreen.module.css`
- Create: `packages/client-solid/src/ui/shell/auth/AuthGate.tsx`
- Create: `packages/client-solid/src/ui/shell/auth/LoginScreen.tsx`
- Modify: `packages/client-solid/tests/ui/contract/solid/registry.tsx`
- Modify: `packages/client-solid/tests/ui/contract/vitest.config.ts`
- Modify: `packages/client-solid/tests/parity/cssParity.test.ts`

**Interfaces:**
- Consumes: `useViewModel().useAuth()` → `{ state: Accessor<AuthViewState>, login(username, password) }` (`@rtc/solid-bindings`); `HudLogo` from `../logo/HudLogo`. `AuthViewState = { status: "unauthenticated" | "authenticating" | "authenticated"; user; locked; error }`.
- Produces: `AuthGate` (ParentProps → JSX) and `LoginScreen` (no props → JSX) emitting exactly the testids the shared page objects query: `login-screen`, `login-title`, `login-username`, `login-password`, `login-error`, `login-submit`, plus the `auth-gate-child` sentinel supplied by the registry.

- [ ] **Step 1: Turn on the specs first (the failing test).** In `tests/ui/contract/vitest.config.ts`, change the exclusion (currently `const notYetPortedSpecs = [`${specsDir}/shell/auth/**/*.contract.spec.ts`];`) to an empty array and update the neighboring comment (lines ~21-28) to note auth is now ported.

```ts
// shell/auth (LoginScreen, AuthGate) is now ported to @rtc/client-solid.
const notYetPortedSpecs: string[] = [];
```

- [ ] **Step 2: Run the auth specs to verify they FAIL.**

Run: `pnpm --filter @rtc/client-solid exec vitest run tests/ui/contract --project ... ` (use the package's contract test script — inspect `package.json` for the exact `test:ui:contract` invocation). Filter to `shell/auth`.
Expected: FAIL — `solidDriver.render` throws *"No Solid registry entry for the given token — this component isn't ported to @rtc/client-solid yet"* for both `AuthGate` and `LoginScreen` (they're not in `registry.tsx`).

- [ ] **Step 3: Copy the CSS byte-identical.**

Run: `cp packages/client-react/src/ui/shell/auth/LoginScreen.module.css packages/client-solid/src/ui/shell/auth/LoginScreen.module.css`
Do **not** retype it. (AuthGate has no CSS — React's AuthGate imports none.)

- [ ] **Step 4: Write `AuthGate.tsx`.**

```tsx
import type { JSX, ParentProps } from "solid-js";
import { Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { LoginScreen } from "./LoginScreen";

/**
 * Gates the app behind the auth lifecycle: while `useAuth().state().status`
 * is not "authenticated" (i.e. "unauthenticated" or "authenticating"),
 * renders the full-screen LoginScreen instead of children. Once
 * authenticated, children (the app) render. LockScreen is NOT rendered here —
 * it stays mounted inside App and self-hides unless locked, so an
 * authenticated-but-locked session still shows the app under its overlay.
 * Dumb component: all state arrives through the `useAuth` seam.
 */
export function AuthGate(props: ParentProps): JSX.Element {
  const { useAuth } = useViewModel();
  const { state } = useAuth();

  return (
    <Show when={state().status === "authenticated"} fallback={<LoginScreen />}>
      {props.children}
    </Show>
  );
}
```

- [ ] **Step 5: Write `LoginScreen.tsx`** (port of the React file; mirror `LockScreen.tsx`'s idioms).

```tsx
import type { JSX } from "solid-js";
import { createSignal, Show } from "solid-js";

import { useViewModel } from "@rtc/solid-bindings";

import { HudLogo } from "../logo/HudLogo";

import styles from "./LoginScreen.module.css";

/**
 * Full-screen sign-in form (prototype-styled to match LockScreen). Renders
 * unconditionally while mounted — AuthGate mounts it only for the
 * unauthenticated branch of the auth lifecycle. Dumb component: all state
 * arrives through the `useAuth` seam; the typed credentials live in local
 * signals only and are never logged.
 */
export function LoginScreen(): JSX.Element {
  const { useAuth } = useViewModel();
  const { state, login } = useAuth();

  const [username, setUsername] = createSignal("");
  const [password, setPassword] = createSignal("");

  return (
    <div data-testid="login-screen" class={styles.overlay}>
      <div class={styles.grid} aria-hidden="true" />
      <div class={styles.panel}>
        <div class={styles.badge} aria-hidden="true">
          <HudLogo />
        </div>

        <div data-testid="login-title" class={styles.title}>
          REACTIVE TRADER OS · SIGN IN
        </div>

        <form
          class={styles.form}
          onSubmit={(event: SubmitEvent) => {
            event.preventDefault();
            login(username(), password());
          }}
        >
          <label class={styles.field}>
            <span class={styles.label}>Username</span>
            <input
              data-testid="login-username"
              class={styles.input}
              type="text"
              autocomplete="username"
              value={username()}
              onInput={(event: InputChangeEvent) => {
                setUsername(event.currentTarget.value);
              }}
            />
          </label>

          <label class={styles.field}>
            <span class={styles.label}>Password</span>
            <input
              data-testid="login-password"
              class={styles.input}
              type="password"
              autocomplete="current-password"
              value={password()}
              onInput={(event: InputChangeEvent) => {
                setPassword(event.currentTarget.value);
              }}
            />
          </label>

          <Show when={state().error !== null}>
            <div data-testid="login-error" class={styles.error}>
              {state().error}
            </div>
          </Show>

          <button
            type="submit"
            data-testid="login-submit"
            class={styles.submit}
            disabled={state().status === "authenticating"}
          >
            AUTHENTICATE ▸
          </button>
        </form>
      </div>
    </div>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
```

> Idiom checks vs the React original: `class` not `className`; `autocomplete` not `autoComplete`; `onInput`+`event.currentTarget.value` not `onChange`+`event.target.value`; two `createSignal("")` not `useState`; error via `<Show>` not `? … : null`; `disabled={state().status === "authenticating"}` inline (reactive in-JSX). Every `data-testid` and the title/label/button strings are copied exactly.

- [ ] **Step 6: Register both components in the Solid swap-trio.** In `tests/ui/contract/solid/registry.tsx`, add the token imports from `@ui-contract/components` (`AuthGate`, `LoginScreen`) and the Solid component imports (`#/ui/shell/auth/AuthGate`, `#/ui/shell/auth/LoginScreen`), then add two `Map` entries **mirroring the existing `LockScreen` entry's exact shape** and the React registry's auth entries (`packages/client-react/tests/ui/contract/react/registry.tsx` — AuthGate wraps a `data-testid="auth-gate-child"` sentinel; LoginScreen takes no props):

```tsx
[AuthGate, () => (
  <AuthGateComponent>
    <div data-testid="auth-gate-child" />
  </AuthGateComponent>
)],
[LoginScreen, () => <LoginScreenComponent />],
```

(Use the same alias/import-naming convention the file already uses for `LockScreen` — e.g. `import { AuthGate as AuthGateComponent } from "#/ui/shell/auth/AuthGate";`.)

- [ ] **Step 7: Drop the stale CSS-parity allowance.** In `tests/parity/cssParity.test.ts`, remove `"shell/auth/LoginScreen.module.css"` from `REACT_ONLY_MODULE_CSS` so it becomes `new Set()`. (Its second guard asserts each entry has *no* Solid twin — now that the twin exists, leaving it would fail the gate.)

- [ ] **Step 8: Run the auth contract specs + the parity gate → GREEN.**

Run the contract suite filtered to `shell/auth` (7 tests: 3 `AuthGate` + 4 `LoginScreen`) and `pnpm --filter @rtc/client-solid exec vitest run tests/parity/cssParity.test.ts`.
Expected: all PASS. The `LoginScreen` spec's "calls login with typed creds" asserts `loginArgs()` last entry `["demo", "s3cret"]` — satisfied by the `onInput`/`onSubmit` wiring; "disables submit while authenticating" checks the `disabled` attribute; "renders seeded error" checks `login-error`.

- [ ] **Step 9: Commit.**

```bash
git add packages/client-solid/src/ui/shell/auth/ packages/client-solid/tests/ui/contract/solid/registry.tsx packages/client-solid/tests/ui/contract/vitest.config.ts packages/client-solid/tests/parity/cssParity.test.ts
git commit -m "feat(solid): port AuthGate + LoginScreen; enable shared shell/auth contract specs"
```

---

## Task 2: Wire `AuthGate` into `AppRoot`, remove the auto-login, expand dev credentials, fix the App smoke test

**Files:**
- Modify: `packages/client-solid/src/app/buildBrowserPorts.ts`
- Modify: `packages/client-solid/src/AppRoot.tsx`
- Modify: `packages/client-solid/src/ui/App.test.tsx`

**Interfaces:**
- Consumes: `AuthGate` (Task 1); the existing `BootGate` (`#/ui/shell/boot/BootGate`).
- Produces: an `AppRoot` that renders `LoginScreen` until the user signs in (parity with `client-react`'s `AppRoot`), and a simulator `AuthSimulator` that accepts every roster user at the committed demo password.

- [ ] **Step 1: Accept the full roster in simulator mode.** In `buildBrowserPorts.ts`, expand the `AuthSimulator` so a user can sign in as any of the four roster names (the real form now takes typed input, not just the auto-login's `demo`):

```ts
// Committed demo roster (see roster.ts / CLAUDE.md "Demo accounts"): all four
// operators share the demo password so the real LoginScreen accepts any of them.
const auth = new AuthSimulator({
  astark: "mcdc2026",
  nromanoff: "mcdc2026",
  tchalla: "mcdc2026",
  demo: "mcdc2026",
});
```

- [ ] **Step 2: Rewire `AppRoot` — drop the auto-login, add the gate.** Remove the `onMount(() => { presenters.auth.login("demo", "mcdc2026"); });` block (and its `onMount` import if now unused), import `AuthGate` from `#/ui/shell/auth/AuthGate`, wrap the children, and update the "Skeleton auto-login" doc comment to describe the real gate (mirror `client-react/src/AppRoot.tsx`):

```tsx
return (
  <ViewModelProvider viewModel={viewModel}>
    <ThemeProvider>
      <PowerSaverRoot />
      <BootGate>
        <AuthGate>{props.children}</AuthGate>
      </BootGate>
    </ThemeProvider>
  </ViewModelProvider>
);
```

- [ ] **Step 3: Run `App.test.tsx` to verify it now FAILS.**

Run: `pnpm --filter @rtc/client-solid exec vitest run src/ui/App.test.tsx`
Expected: FAIL — the tests mount `<AppRoot><App/></AppRoot>` and query shell testids (`connection-status`, `header`, `tab-fx`, …), but the gate now shows `LoginScreen` (no auto-login), so those testids are absent.

- [ ] **Step 4: Sign in inside the smoke test.** Add a `signIn` helper that types the committed demo credentials into the ported form and submits, and call it right after each `render(...)`, before the shell assertions. (`AuthSimulator.login` resolves synchronously via `of(...)`, so the shell appears within the same microtask hop the existing `waitFor` already absorbs.)

```tsx
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

async function signIn(): Promise<void> {
  fireEvent.input(screen.getByTestId("login-username"), {
    target: { value: "demo" },
  });
  fireEvent.input(screen.getByTestId("login-password"), {
    target: { value: "mcdc2026" },
  });
  fireEvent.click(screen.getByTestId("login-submit"));
  await waitFor(() => {
    expect(screen.queryByTestId("login-screen")).toBeNull();
  });
}
```

Call `await signIn();` after every `render(() => <AppRoot><App/></AppRoot>)` (make each `it` `async` where it isn't already). Optionally add one focused assertion that the login screen shows *before* sign-in, so the gate itself is covered here too.

- [ ] **Step 5: Run `App.test.tsx` → GREEN.**

Run: `pnpm --filter @rtc/client-solid exec vitest run src/ui/App.test.tsx`
Expected: all PASS (4 tests, now gated through the real sign-in flow).

- [ ] **Step 6: Manual smoke.** `pnpm dev:solid` → the app shows the sign-in screen; signing in as `demo` / `mcdc2026` (or any roster user) reveals the shell. Reboot via the account menu still replays boot over the gate.

- [ ] **Step 7: Commit.**

```bash
git add packages/client-solid/src/AppRoot.tsx packages/client-solid/src/app/buildBrowserPorts.ts packages/client-solid/src/ui/App.test.tsx
git commit -m "feat(solid): gate AppRoot behind AuthGate; drop walking-skeleton auto-login"
```

---

## Task 3: Full gauntlet, contract-coverage, STATUS, and PR

**Files:**
- Modify: `docs/STATUS.md` (note the SolidJS-port auth parity is closed)

- [ ] **Step 1: Full local gauntlet at repo root.**

```bash
pnpm biome ci .
pnpm eslint .
pnpm eslint . --config eslint.config.typed.mjs
pnpm --filter @rtc/client-solid typecheck
pnpm --filter @rtc/client-solid test
pnpm knip
pnpm check:doc-links
```

Expected: all clean. Fix any Solid lint idioms (no props destructuring; `class`; explicit types where `useExplicitType`/typed-eslint demand).

- [ ] **Step 2: UI-contract coverage (both clients).**

```bash
pnpm --filter @rtc/client-react test:ui:contract:coverage
pnpm --filter @rtc/client-solid test:ui:contract:coverage
```

Expected: ≥95% both; Solid's now includes the auth specs (coverage should rise, not fall).

- [ ] **Step 3: Update `docs/STATUS.md`.** Under the SolidJS-port entry, note that auth-login UI parity (AuthGate/LoginScreen + shell/auth contract specs) is complete; bump the `Last updated` line. (This gap was previously only implicit in a test exclusion, never a STATUS line — so this is an add-then-it's-done note, not a removal.)

- [ ] **Step 4: Commit, push, PR, CI loop, merge (per shipping-repo-changes).**

```bash
git add docs/STATUS.md
git commit -m "docs(status): SolidJS auth-login parity complete"
```

Then push the branch, open the PR, loop `gh run list --workflow CI` on the head SHA until green, and — with explicit user approval to advance `main` — merge with `--merge` and clean up the worktree.

---

## Self-Review (against the parity goal)

- **Coverage:** AuthGate + LoginScreen ported (Task 1); byte-identical CSS + parity gate (Task 1 Steps 3/7); shared contract specs enabled and green (Task 1); real gate wired into AppRoot with the auto-login removed (Task 2); full-roster sim credentials so the form is usable (Task 2 Step 1); the unique full-AppRoot smoke test adapted to sign in (Task 2 Steps 4-5); gauntlet + coverage + STATUS (Task 3). ✔
- **No placeholders:** every component/registry/config edit shows the exact code or names the exact template to mirror (`LockScreen` entry, React registry auth entries) with file paths.
- **Idiom consistency:** Solid accessor-call `state()` used at every read; `class`/`onInput`/`createSignal`/`Show` per the LockScreen precedent; testids/strings copied verbatim from the React source so the shared page objects match.
- **Decisions made (flag for reviewer):** (1) expanded sim credentials to all four roster users at `mcdc2026` — required for a real login form, consistent with `client-react`'s `.env.development` and the RN fallback; (2) the App smoke test now drives the login form rather than relying on auto-login — there is no React precedent (client-react has no full-AppRoot test), and this adds end-to-end gate coverage; (3) `LockScreen` was already ported and is unchanged — this plan only adds the *initial* sign-in gate that was missing.
```
