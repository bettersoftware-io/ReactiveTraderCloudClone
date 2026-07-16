/**
 * The real LoginScreen form, driven end to end through AuthGate. Unlike every
 * other page object (constructed against the shared, pre-authenticated
 * context every other spec seeds — see tests/browser/authSeed.ts), `open()`
 * must land on a genuinely UNAUTHENTICATED session so AuthGate actually
 * renders this form instead of the app.
 *
 * Playwright-only (like {@link InspectorPO}): Cypress specs never need it,
 * this suite's ONE coverage test for the real login form is Playwright.
 */
export interface LoginScreenPO {
  /** Open a fresh, unauthenticated view of the app (no seeded session) and
   *  navigate to "/". Must be called before any other method. */
  open(): Promise<void>;
  /** Wait until the login form root is visible. */
  waitVisible(timeoutMs: number): Promise<void>;
  /** Wait until the sign-in title reads exactly `expected`. */
  waitTitle(expected: string, timeoutMs: number): Promise<void>;
  /** Type into the username field. */
  typeUsername(value: string): Promise<void>;
  /** Type into the password field. */
  typePassword(value: string): Promise<void>;
  /** Click AUTHENTICATE → submit the form. */
  submit(): Promise<void>;
  /** Wait until the rendered error text reads exactly `expected`. */
  waitErrorText(expected: string, timeoutMs: number): Promise<void>;
  /** Wait until the login screen is no longer in the DOM (AuthGate let the
   *  app through). */
  waitGone(timeoutMs: number): Promise<void>;
  /** Wait until the app shell (header chrome) is visible. */
  waitAppShell(timeoutMs: number): Promise<void>;
}
