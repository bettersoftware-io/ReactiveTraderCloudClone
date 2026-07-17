# RN Login Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `@rtc/client-react-native` a real login screen (like the web client) so a user signs in as any roster user, replacing the Task-18 baked auto-login.

**Architecture:** Port the web client's `LoginScreen` / `AuthGate` / genuine `LockScreen` (Phase-1 Tasks 14–16) into React Native primitives. The auth machinery is unchanged — `useAuth()` (react-bindings), `AuthPresenter` (client-core), roster validation, `HttpAuthAdapter` (deployed → real server) / `AuthSimulator` (local sim) — only the RN UI is new. Auto-login is removed; the demo credential baking (`nativeAuthConfig`) is replaced by a simulator-only dev-credentials map so all four roster users are usable in offline sim mode.

**Tech Stack:** React Native (Expo SDK 57), Expo Router, react-native-svg, `@rtc/react-bindings` `useAuth`, jest + @testing-library/react-native.

## Global Constraints

- Imports use the `#/` subpath alias (never `@/` or ≥2-up relative). RN uses `testID` (not `data-testid`).
- Braces on all control statements; explicit return types on functions/components; block-body arrows; no inline object types in casts; NO eslint-disable. Never log credentials/passwords.
- Dumb UI: components read state only through `useAuth()`; no rxjs/store/fetch in `src/ui`.
- RN styling: themed `StyleSheet` via `useThemedStyles(makeStyles)` + `RnTheme` tokens, mirroring `LockScreen.tsx`.
- Every gate must stay green: `pnpm --filter @rtc/client-react-native typecheck` + `test` (vitest AND jest suites), eslint, biome. Full repo gauntlet before PR.
- Worktree: all work in `worktree-rn-login-screen`; subagents use `git -C "$WT"` + absolute `$WT/…` paths (their Bash pins to the primary checkout).

---

## Task 1: RN `LoginScreen` + `AuthGate`, wire into layout, remove auto-login

**Files:**
- Create: `packages/client-react-native/src/ui/shell/auth/LoginScreen.tsx`, `.../auth/AuthGate.tsx`
- Modify: `packages/client-react-native/app/_layout.tsx` (wrap the app in `<AuthGate>`), `packages/client-react-native/src/app/AppRoot.tsx` (remove the auto-login effect)
- Test: `LoginScreen.test.tsx`, `AuthGate.test.tsx`, update `AppRoot.test.tsx`

**Produces:** `LoginScreen` (reads `useAuth`; testIDs `login-screen`, `login-title`, `login-username`, `login-password`, `login-error`, `login-submit`; controlled `useState`; `login(username,password)` on submit; disabled while `status==="authenticating"`; password `secureTextEntry`). `AuthGate` (`status!=="authenticated"` → `<LoginScreen/>`, else `children`).

- [ ] Write failing tests (mount `LoginScreen` via a fake ViewModel: typing username+password then pressing submit calls `login` with them; a seeded `state.error` renders `login-error`; submit disabled when `status==="authenticating"`. `AuthGate`: unauthenticated → `login-screen` present, children absent; authenticated → children present. `AppRoot`: no auto-login fires on mount — the auth state stays `unauthenticated`). Mirror the RN fake-ViewModel test setup in `LoginScreen.test.tsx`'s siblings (`LockScreen.test.tsx`, `AppRoot.test.tsx`).
- [ ] Run → RED. Implement `LoginScreen` (RN primitives: `View`/`TextInput`/`Pressable`/`Text` + `react-native-svg` hex emblem, themed styles mirroring `LockScreen.tsx`; title `REACTIVE TRADER OS · SIGN IN`) + `AuthGate`. Wrap `<Chrome/>` in `_layout.tsx` with `<AuthGate>` (inside `AppRoot`+`ThemeProvider`; `LockScreen` stays where it is). Remove the `useEffect` auto-login from `AppRoot.tsx` (and the `nativeAuthConfig` login import there).
- [ ] Run → GREEN. `typecheck` + `test` (vitest + jest) + eslint + biome on changed files.
- [ ] Commit `feat(rn): LoginScreen + AuthGate; remove baked auto-login`.

## Task 2: Genuine RN `LockScreen` (typed-password re-auth)

**Files:**
- Modify: `packages/client-react-native/src/ui/shell/lock/LockScreen.tsx`
- Test: update `LockScreen.test.tsx`

**Produces:** `LockScreen` gains a controlled password `TextInput` (`testID="lock-password"`, `secureTextEntry`) and an error `Text` (`testID="lock-error"` bound to `state.error`); `lock-authenticate` calls `unlock(password)` with the typed value (drop the `DEMO_PASSWORD` import). Null-guard `state.locked && state.user` retained.

- [ ] Update/failing test: typing a password + pressing AUTHENTICATE calls `unlock` with that exact password; a seeded `state.error` renders in `lock-error`. Run → RED.
- [ ] Implement (add the field + error + typed unlock; remove `DEMO_PASSWORD` usage). Run → GREEN. typecheck + test + eslint/biome.
- [ ] Commit `feat(rn): genuine lock re-auth (typed password)`.

## Task 3: Simulator dev-credentials (all four roster users offline)

**Files:**
- Modify: `packages/client-react-native/src/app/nativeAuthConfig.ts` (single demo cred → a `DEV_CREDENTIALS: Record<string,string>` map), `packages/client-react-native/src/app/buildNativePorts.ts` (simulator branch seeds `new AuthSimulator(DEV_CREDENTIALS)`), `packages/client-react-native/app.config.ts` (expose the dev-auth env), `packages/client-react-native/.env.example`, `packages/client-react-native/README.md`
- Test: `nativeAuthConfig` test (or buildNativePorts sim-seed test)

**Produces:** `DEV_CREDENTIALS` read from `EXPO_PUBLIC_DEV_AUTH` (JSON `username→password`, mirroring web's `VITE_DEV_AUTH`), falling back to all four roster usernames (`astark`/`nromanoff`/`tchalla`/`demo`) at a default local dev password so offline **simulator** mode can log in as any of them. Simulator-only (never deployed — the live branch uses `HttpAuthAdapter` against the real server's `AUTH_USERS`, no baked creds). No `nativeAuthConfig` consumer should reference a single `DEMO_PASSWORD` after Tasks 1–2.

- [ ] Failing test: `DEV_CREDENTIALS` parses `EXPO_PUBLIC_DEV_AUTH` JSON and falls back to the four roster users; `buildNativePorts({simulator:true})` produces ports whose `auth` accepts each of the four fallback creds. Run → RED.
- [ ] Implement the map + wiring; update `.env.example` (`EXPO_PUBLIC_DEV_AUTH={"astark":"demo",…}`, placeholder only) + README (how to sign in locally in sim mode; live mode uses real `AUTH_USERS`). Run → GREEN. typecheck + test + eslint/biome + `check:doc-links`.
- [ ] Commit `feat(rn): simulator dev-credentials for all roster users`.

## Self-Review notes
- Live (default) mode needs NO credential baking — the user types any `AUTH_USERS` cred against the real server; Task 3 only serves offline sim mode.
- `SessionStore` stays `InMemory` (no persistence) — each launch shows the login screen; AsyncStorage persistence is a future follow-up.
- Removing auto-login means `EXPO_PUBLIC_DEMO_USER`/`PASS` (single demo cred) is superseded by `EXPO_PUBLIC_DEV_AUTH`; migrate the docs and drop the dead single-cred path.
