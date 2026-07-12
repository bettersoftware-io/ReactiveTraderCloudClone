/**
 * Whether the boot splash should play for this page load.
 *
 * Real users get the splash on every load (it is skippable via its SKIP
 * control). It is suppressed in two cases so automated runs interact with the
 * live app immediately rather than waiting out a full-screen boot overlay:
 *   1. Under browser automation (`navigator.webdriver`) — every Playwright and
 *      Cypress e2e load, with no per-test navigation changes required.
 *   2. When the URL carries `?nosplash` — an explicit manual override for
 *      humans (and a belt-and-suspenders e2e escape hatch).
 *
 * The decision lives here in the composition layer (outside src/ui's dumb-UI
 * constraints) because it reads `navigator` and `window.location`.
 */
export function shouldPlayBootSplash(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  if (typeof navigator !== "undefined" && navigator.webdriver) {
    return false;
  }

  return !new URLSearchParams(window.location.search).has("nosplash");
}
