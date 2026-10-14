import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";
import type { AccountNavigation } from "@ui-contract/harness/world";

import type { CodeInput, RegistrationInput } from "@rtc/core-api";
import type { LoginWaitVariant } from "@rtc/domain";

import { waitVariantWithin } from "./AuthWaitPage";

/** One row of the live password checklist. */
export interface PasswordChecklistRow {
  readonly label: string;
  readonly met: boolean;
}

/**
 * Page object for LoginScreen. Hook-driven (reads `useAuth`,
 * `useAccountAccess`, `useRegistrationAvailable`, `useDemoAccounts`): the
 * username/password form that calls `login(username, password)` on submit,
 * and — one form per account-access phase — create account, enter code,
 * request a reset, and the notices. One `login-submit`, `login-error` and
 * `login-title` serve every phase.
 */
export class LoginScreenPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True when the login form root is present. */
  hasRoot(): boolean {
    return within(this.root).queryByTestId("login-screen") !== null;
  }

  /** The sign-in title text (e.g. "REACTIVE TRADER OS · SIGN IN"). */
  title(): string {
    return (
      within(this.root).queryByTestId("login-title")?.textContent?.trim() ?? ""
    );
  }

  /** Type into the username field. */
  async typeUsername(value: string): Promise<void> {
    await this.user.type(
      within(this.root).getByTestId("login-username"),
      value,
    );
  }

  /** Type into the password field. */
  async typePassword(value: string): Promise<void> {
    await this.user.type(
      within(this.root).getByTestId("login-password"),
      value,
    );
  }

  /** Click AUTHENTICATE → submit the form. */
  async submit(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("login-submit"));
  }

  /** The rendered error text; "" when no error is present. */
  error(): string {
    return (
      within(this.root).queryByTestId("login-error")?.textContent?.trim() ?? ""
    );
  }

  /** The error line's ARIA role; "" when the line or its role is absent. */
  errorRole(): string {
    return this.byTestId("login-error")?.getAttribute("role") ?? "";
  }

  /** True when the AUTHENTICATE control is disabled. */
  isSubmitDisabled(): boolean {
    return within(this.root)
      .getByTestId("login-submit")
      .hasAttribute("disabled");
  }

  /** Each [username, password] pair `login()` was invoked with, through the seam. */
  loginArgs(): Array<[string, string]> {
    return this.commandLog().authLoginArgs;
  }

  /** The username field's current value. */
  usernameValue(): string {
    return this.inputValue("login-username");
  }

  /** The password field's current value. */
  passwordValue(): string {
    return this.inputValue("login-password");
  }

  /** The `data-testid` of the control holding keyboard focus; "" when the
   * focused element carries none (or nothing is focused). */
  focusedControl(): string {
    return (
      this.root.ownerDocument.activeElement?.getAttribute("data-testid") ?? ""
    );
  }

  /** True when the demo-accounts hint is on screen. */
  hasDemoAccounts(): boolean {
    return within(this.root).queryByTestId("login-demo-accounts") !== null;
  }

  /** Each demo-account row as "username — role", top to bottom; empty when
   * the hint is absent. */
  demoAccounts(): string[] {
    return this.demoAccountRows().map((row) => {
      const [username, role] = Array.from(row.querySelectorAll("span")).map(
        (cell) => {
          return cell.textContent?.trim() ?? "";
        },
      );

      return `${username} — ${role}`;
    });
  }

  /** Each demo-account row's accessible name, top to bottom. */
  demoAccountLabels(): string[] {
    return this.demoAccountRows().map((row) => {
      return row.getAttribute("aria-label") ?? "";
    });
  }

  /** The password the hint prints under the list; "" when it prints none. */
  demoPassword(): string {
    return (
      within(this.root)
        .queryByTestId("login-demo-password")
        ?.textContent?.trim() ?? ""
    );
  }

  /** Click the demo-account row for `username`. */
  async pickDemoAccount(username: string): Promise<void> {
    await this.user.click(this.demoAccountRow(username));
  }

  /** True when the demo-account row for `username` is disabled. */
  isDemoAccountDisabled(username: string): boolean {
    return this.demoAccountRow(username).hasAttribute("disabled");
  }

  /** True when either login-wait treatment is on screen. */
  hasWait(): boolean {
    return this.waitVariant() !== null;
  }

  /** Which wait treatment is rendered: "handshake", "reactor", or null. */
  waitVariant(): LoginWaitVariant | null {
    return waitVariantWithin(this.root);
  }

  /** The account-access phase the screen renders (`login-screen`'s
   * `data-phase`); "" when the attribute is absent. */
  phase(): string {
    return this.byTestId("login-screen")?.getAttribute("data-phase") ?? "";
  }

  /** True when the sign-in form offers "Create account". */
  hasCreateAccountLink(): boolean {
    return this.byTestId("login-create-account") !== null;
  }

  /** Click "Create account". */
  async openCreateAccount(): Promise<void> {
    await this.clickTestId("login-create-account");
  }

  /** True when the sign-in form offers "Forgot password?". */
  hasForgotPasswordLink(): boolean {
    return this.byTestId("login-forgot-password") !== null;
  }

  /** Click "Forgot password?". */
  async openForgotPassword(): Promise<void> {
    await this.clickTestId("login-forgot-password");
  }

  /** True when the sign-in form offers to enter a confirmation code (after
   * an `unconfirmed` sign-in failure). */
  hasEnterCodeOffer(): boolean {
    return this.byTestId("login-enter-code") !== null;
  }

  /** Open the code step: "I already have a code" on the create-account
   * form, or the sign-in form's offer after an `unconfirmed` failure. */
  async openCodeEntry(): Promise<void> {
    const offer =
      this.byTestId("login-have-code") ?? this.byTestId("login-enter-code");

    if (offer === null) {
      throw new Error(
        'no code-entry offer: neither "login-have-code" nor "login-enter-code" is on screen',
      );
    }

    await this.user.click(offer);
  }

  /** Click "Back to sign in". */
  async goBack(): Promise<void> {
    await this.clickTestId("login-back");
  }

  /** Type into the email field. */
  async typeEmail(value: string): Promise<void> {
    await this.typeInto("login-email", value);
  }

  /** Type into the display-name field. */
  async typeDisplayName(value: string): Promise<void> {
    await this.typeInto("login-display-name", value);
  }

  /** Type into the new-password field (create account, or the code step
   * when the machine holds no password). */
  async typeNewPassword(value: string): Promise<void> {
    await this.typeInto("login-new-password", value);
  }

  /** Type into the confirmation-code field. */
  async typeCode(value: string): Promise<void> {
    await this.typeInto("login-code", value);
  }

  /** True when the email field is on screen. */
  hasEmailField(): boolean {
    return this.byTestId("login-email") !== null;
  }

  /** True when the new-password field is on screen. */
  hasNewPasswordField(): boolean {
    return this.byTestId("login-new-password") !== null;
  }

  /** The new-password field's label text; "" when the field is absent. */
  newPasswordLabel(): string {
    return this.labelOf("login-new-password");
  }

  /** The value of one attribute of the code field; null when the field or
   * the attribute is absent. */
  codeAttribute(name: string): string | null {
    return this.byTestId("login-code")?.getAttribute(name) ?? null;
  }

  /** Each password-checklist row, top to bottom; empty when the checklist
   * is absent. */
  checklist(): PasswordChecklistRow[] {
    return within(this.root)
      .queryAllByTestId("login-password-rule")
      .map((row) => {
        return {
          label: spokenText(row),
          met: row.getAttribute("data-met") === "true",
        };
      });
  }

  /** The "Code sent to …" line; "" when the code step shows the email
   * field instead. */
  codeSentTo(): string {
    return this.textOf("login-code-email");
  }

  /** True when the "a new code is on its way" hint is on screen. */
  hasResent(): boolean {
    return this.byTestId("login-resent") !== null;
  }

  /** Click "Resend code". */
  async resend(): Promise<void> {
    await this.clickTestId("login-resend");
  }

  /** True when the "Resend code" link is disabled. */
  isResendDisabled(): boolean {
    return within(this.root)
      .getByTestId("login-resend")
      .hasAttribute("disabled");
  }

  /** The notice text of a notice phase; "" when none is on screen. */
  notice(): string {
    return this.textOf("login-notice");
  }

  /** Click the notice's one action. */
  async takeNoticeAction(): Promise<void> {
    await this.clickTestId("login-notice-action");
  }

  /** The privacy-notice link's `href`; "" when the link is absent. */
  privacyHref(): string {
    return this.byTestId("login-privacy")?.getAttribute("href") ?? "";
  }

  /** The submit control's label. */
  submitLabel(): string {
    return this.textOf("login-submit");
  }

  /** Every `data-*` attribute on the mounted root and its descendants, as
   * `[name, value]` pairs — read from each element's attribute list, not by
   * name, so no spelling of a leaked secret is missed. */
  dataAttributes(): Array<[string, string]> {
    return [this.root, ...Array.from(this.root.querySelectorAll("*"))]
      .flatMap((element) => {
        return Array.from(element.attributes);
      })
      .filter((attribute) => {
        return attribute.name.startsWith("data-");
      })
      .map((attribute): [string, string] => {
        return [attribute.name, attribute.value];
      });
  }

  /** Each input `register()` was invoked with, through the seam. */
  registerArgs(): RegistrationInput[] {
    return this.commandLog().accountRegister;
  }

  /** Each input `submitCode()` was invoked with, through the seam. */
  codeArgs(): CodeInput[] {
    return this.commandLog().accountSubmitCode;
  }

  /** Each address `requestReset()` was invoked with, through the seam. */
  resetRequestArgs(): string[] {
    return this.commandLog().accountRequestReset;
  }

  /** Each argument `resendCode()` was invoked with, through the seam. */
  resendArgs(): Array<string | undefined> {
    return this.commandLog().accountResendCode;
  }

  /** Each navigation intent invoked, through the seam, in order. */
  navigations(): AccountNavigation[] {
    return this.commandLog().accountNavigations;
  }

  private byTestId(testId: string): HTMLElement | null {
    return within(this.root).queryByTestId(testId);
  }

  private textOf(testId: string): string {
    return this.byTestId(testId)?.textContent?.trim() ?? "";
  }

  private labelOf(testId: string): string {
    const field = within(this.root).queryByTestId<HTMLInputElement>(testId);

    return field?.labels?.[0]?.textContent?.trim() ?? "";
  }

  private async clickTestId(testId: string): Promise<void> {
    await this.user.click(within(this.root).getByTestId(testId));
  }

  private async typeInto(testId: string, value: string): Promise<void> {
    await this.user.type(within(this.root).getByTestId(testId), value);
  }

  private inputValue(testId: string): string {
    return within(this.root).getByTestId<HTMLInputElement>(testId).value;
  }

  private demoAccountRows(): HTMLElement[] {
    return within(this.root).queryAllByTestId("login-demo-account");
  }

  private demoAccountRow(username: string): HTMLElement {
    const row = this.demoAccountRows().find((candidate) => {
      return candidate.getAttribute("data-username") === username;
    });

    if (row === undefined) {
      throw new Error(`no demo-account row for "${username}"`);
    }

    return row;
  }
}

/** An element's text without its `aria-hidden` parts (a checklist row's
 * ✓ / · glyph), as assistive tech would read it. */
function spokenText(element: Element): string {
  return Array.from(element.childNodes)
    .map((node) => {
      if (node instanceof Element) {
        return node.getAttribute("aria-hidden") === "true"
          ? ""
          : spokenText(node);
      }

      return node.textContent ?? "";
    })
    .join("")
    .trim();
}
