import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { LoginWaitVariant } from "@rtc/domain";

import { waitVariantWithin } from "./AuthWaitPage";

/**
 * Page object for LoginScreen. Hook-driven (reads `useAuth`): a username/
 * password form that calls `login(username, password)` on submit.
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
