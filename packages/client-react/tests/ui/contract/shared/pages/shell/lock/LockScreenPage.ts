import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for LockScreen. Hook-driven (reads `useSession`): renders nothing
 * when the session is unlocked, and the full identity overlay when locked.
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

  /** Click AUTHENTICATE → re-authenticate (unlock). */
  async authenticate(): Promise<void> {
    await this.user.click(within(this.root).getByTestId("lock-authenticate"));
  }

  /** Number of times AUTHENTICATE (unlock) was invoked through the seam. */
  unlockCount(): number {
    return this.commandLog().sessionUnlock;
  }
}
