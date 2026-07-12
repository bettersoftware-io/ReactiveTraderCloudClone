import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/** Page object for SessionsPanel. */
export class SessionsPanelPage extends MountedComponent<Record<string, never>> {
  /** True when the "NO ACTIVE SESSIONS" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO ACTIVE SESSIONS/i) !== null;
  }

  /** Number shown in the session count badge. */
  countBadge(): number {
    const el = this.root.querySelector(
      "[data-testid='admin-sessions'] [class*='count']",
    );
    return Number(el?.textContent?.trim() ?? "0");
  }

  /** All session row <li> elements. */
  rows(): Element[] {
    return Array.from(
      this.root.querySelectorAll("[data-testid='admin-sessions'] li"),
    );
  }

  /** Number of session rows rendered. */
  rowCount(): number {
    return this.rows().length;
  }

  /** True when the sessions panel element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-sessions") !== null;
  }
}
