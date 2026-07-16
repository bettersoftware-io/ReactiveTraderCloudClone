import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for LockScreen. Hook-driven (reads `useAuth`): renders nothing
 * unless the session is locked with a known user, and while locked shows the
 * full identity overlay plus a password-gated AUTHENTICATE control that
 * re-authenticates (unlock) against the real credentials seam.
 */
export class LockScreenPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  /** True when the lock overlay is visible (false → component returned null). */
  hasRoot(): boolean {
    return within(this.root).queryByTestId("lock-screen") !== null;
  }

  /** The overlay title text (e.g. "SESSION LOCKED"); empty when not locked. */
  title(): string {
    return (
      within(this.root).queryByTestId("lock-title")?.textContent?.trim() ?? ""
    );
  }

  /** The locked operator's display name; empty when not locked. */
  userName(): string {
    return (
      within(this.root).queryByTestId("lock-user-name")?.textContent?.trim() ??
      ""
    );
  }

  /** True when the AUTHENTICATE control is present. */
  hasAuthenticate(): boolean {
    return within(this.root).queryByTestId("lock-authenticate") !== null;
  }

  /** Type into the password field. */
  async typePassword(value: string): Promise<void> {
    await this.user.type(within(this.root).getByTestId("lock-password"), value);
  }

  /** Click AUTHENTICATE → re-authenticate (unlock) with the typed password. */
  async authenticate(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("lock-authenticate"));
  }

  /** The rendered error text; "" when no error is present. */
  error(): string {
    return (
      within(this.root).queryByTestId("lock-error")?.textContent?.trim() ?? ""
    );
  }

  /** Number of times AUTHENTICATE (unlock) was invoked through the seam. */
  unlockCount(): number {
    return this.commandLog().authUnlock;
  }

  /** Each password `unlock()` was invoked with, through the seam, in order. */
  unlockArgs(): readonly string[] {
    return this.commandLog().authUnlockArgs;
  }
}
