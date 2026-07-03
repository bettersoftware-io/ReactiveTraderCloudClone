/**
 * Whether the boot splash should play for this app launch.
 *
 * Real users get the splash on every cold start (it is skippable via SKIP).
 * This seam is where a future e2e/Maestro run would suppress it — the web
 * analogue (client-react `bootSplashGate.ts`) reads `navigator.webdriver` and
 * `?nosplash`; RN has no such signals yet, so it always plays. Kept as a named
 * function so the suppression policy has a single home outside the dumb UI.
 *
 * Pure TS — no `react-native` import (runs under the vitest node island).
 */
export function shouldPlayBootSplash(): boolean {
  return true;
}
