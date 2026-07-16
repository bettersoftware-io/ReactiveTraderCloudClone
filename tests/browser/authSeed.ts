/**
 * Shared authenticated-session seed for the browser e2e suites.
 *
 * `AuthGate` (packages/client-react/src/ui/shell/auth/AuthGate.tsx) renders
 * `LoginScreen` instead of the app until `useAuth().state.status ===
 * "authenticated"`. `AuthPresenter` resumes an authenticated session on
 * construction whenever `sessionStore.read()` returns a `StoredSession` with
 * `exp > now()` — in simulator mode (no `VITE_SERVER_URL`) the token itself is
 * never validated, only `exp`, so seeding `localStorage[E2E_SESSION_KEY]` with
 * this value before the app's scripts run is enough to boot straight past the
 * login screen without driving the real form.
 *
 * The identity matches the `demo` entry in
 * packages/domain/src/auth/roster.ts exactly, so a suite that also drives the
 * real login form (simulator `VITE_DEV_AUTH`, or the fullstack `/login`
 * round-trip) lands on the same, real roster profile either way.
 */
export const E2E_SESSION_KEY = "rtc-session";

const E2E_STORED_SESSION = {
  token: "e2e-sim-token",
  username: "demo",
  user: {
    name: "Demo Operator",
    initials: "DO",
    role: "Read-Only Guest",
    id: "TRD-0000",
    email: "demo@reactivetrader.io",
    desk: "Demo · Cloud",
    clearance: "LEVEL 1 · VIEW",
  },
  // Year 2100 — far enough out that AuthPresenter.resume() never treats it as
  // expired during a test run.
  exp: 4102444800000,
} as const;

export const E2E_SESSION_JSON: string = JSON.stringify(E2E_STORED_SESSION);

/** Args for the `addInitScript` callback that seeds `localStorage` — kept as a
 * named type because the callback is serialized and run in the browser, so
 * its argument can't close over anything from the Node-side scope. */
export interface SessionSeedArgs {
  readonly key: string;
  readonly value: string;
}

/** The `addInitScript` callback body itself, shared by every Playwright seed
 * point (playwright-cucumber's world, the raw playwright `_context` fixture,
 * and the fullstack browser smoke) so the seeding logic lives in one place. */
export function seedSessionLocalStorage(args: SessionSeedArgs): void {
  window.localStorage.setItem(args.key, args.value);
}
