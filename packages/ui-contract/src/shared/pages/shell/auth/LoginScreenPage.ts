import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

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
}
