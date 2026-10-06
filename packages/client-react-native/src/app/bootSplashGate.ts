/**
 * Whether the boot splash should play for this app launch.
 *
 * Real users get the splash on every cold start (it is skippable via SKIP).
 * This seam is where a future e2e run that drives the real app would suppress
 * it — the web analogue (`@rtc/boot-splash`) reads `navigator.webdriver` and
 * `?nosplash`; RN has no such signals yet, so it always plays. Kept as a named
 * function so the suppression policy has a single home outside the dumb UI.
 * The visual tiers do not need it: a harness bundle never mounts the app at
 * all (`tests/visual/VisualHarnessHome.tsx`).
 *
 * Pure TS — no `react-native` import (runs under the vitest node island).
 */
export function shouldPlayBootSplash(): boolean {
  return true;
}
