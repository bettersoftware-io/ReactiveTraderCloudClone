/**
 * The real LoginScreen form, driven end to end through AuthGate. Unlike every
 * other page object (constructed against the shared, pre-authenticated
 * context every other spec seeds — see tests/browser/authSeed.ts), `open()`
 * must land on a genuinely UNAUTHENTICATED session so AuthGate actually
 * renders this form instead of the app.
 *
 * Playwright-only (like {@link InspectorPO}): this suite's ONE coverage test
 * for the real login form is Playwright.
 */
/** A login-form field checked as the user types: its inline error's
 *  `data-field`. Mirrors `@rtc/core-logic`'s `AccountField`, which this
 *  package does not depend on. */
export type AccountField = "email" | "display-name" | "code";

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
  /** Wait until the inline error under `field` (its `data-field`) reads
   *  exactly `expected`. */
  waitFieldError(
    field: AccountField,
    expected: string,
    timeoutMs: number,
  ): Promise<void>;
  /** True when the form-level error line is on screen. */
  hasLoginError(): Promise<boolean>;
  /** Wait until the login screen is no longer in the DOM (AuthGate let the
   *  app through). */
  waitGone(timeoutMs: number): Promise<void>;
  /** Wait until the app shell (header chrome) is visible. */
  waitAppShell(timeoutMs: number): Promise<void>;
  /** Wait until the document root's `data-core-impl` reads exactly
   *  `expected` — the application core the app actually booted on (set by
   *  `startWebClient` once `bootApp.ts`'s `bootCore` resolves). `check:core-bundle`
   *  proves the OTHER cores are absent from a build; this proves the
   *  selected one is present and running. */
  waitCoreImpl(expected: string, timeoutMs: number): Promise<void>;
  /** True when the sign-in form offers the create-account link. */
  hasCreateAccountLink(): Promise<boolean>;
  /** Click the create-account link. */
  openCreateAccount(): Promise<void>;
  /** Click the forgot-password link. */
  openForgotPassword(): Promise<void>;
  /** Type into the email field. */
  typeEmail(value: string): Promise<void>;
  /** Type into the display-name field. */
  typeDisplayName(value: string): Promise<void>;
  /** Type into the new-password field of the reset code step. */
  typeNewPassword(value: string): Promise<void>;
  /** Type into the 8-digit code field. */
  typeCode(value: string): Promise<void>;
  /** Wait until the screen's `data-phase` reads exactly `expected`. */
  waitPhase(expected: string, timeoutMs: number): Promise<void>;
  /** Wait until the code step reads "Code sent to <email>". */
  waitCodeSentTo(email: string, timeoutMs: number): Promise<void>;
  /** Wait until the notice text contains `containsText`. */
  waitNotice(containsText: string, timeoutMs: number): Promise<void>;
  /** Click the notice's action button. */
  takeNoticeAction(): Promise<void>;
  /** Click Back (to sign in). */
  goBack(): Promise<void>;
  /** The browser's own Back button (history), not the form's Back link. */
  browserBack(): Promise<void>;
  /** The browser's own Forward button. */
  browserForward(): Promise<void>;
  /** Wait until the page URL's path reads exactly `expected` (e.g. `/sign-in`). */
  waitUrlPath(expected: string, timeoutMs: number): Promise<void>;
  /** How many requests this page has made whose URL path ends with `path`. */
  countRequestsTo(path: string): number;
}
