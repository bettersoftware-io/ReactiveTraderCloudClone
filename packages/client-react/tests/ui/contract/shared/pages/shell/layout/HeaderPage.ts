import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "../../../harness/component";

/** The three workspace tabs the header switches between. */
export type WorkspaceTab = "fx" | "credit" | "admin";

export interface HeaderProps {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
}

export class HeaderPage extends MountedComponent<HeaderProps> {
  private readonly user: UserEvent = userEvent.setup();

  /** The application title shown in the header. */
  title(): string {
    return (
      within(this.root)
        .getByText(/reactive trader/i)
        .textContent?.trim() ?? ""
    );
  }

  /** The visible label for each tab button, in order. */
  tabLabels(): string[] {
    return (["fx", "credit", "admin"] as const).map(
      (tab) =>
        within(this.root).getByTestId(`tab-${tab}`).textContent?.trim() ?? "",
    );
  }

  /** True when the given tab is the active (highlighted) one. */
  isActive(tab: WorkspaceTab): boolean {
    const button = within(this.root).getByTestId(`tab-${tab}`);
    return button.dataset.active === "true";
  }

  /** Click one of the workspace tabs (fires onTabChange). */
  async clickTab(tab: WorkspaceTab): Promise<void> {
    await this.user.click(within(this.root).getByTestId(`tab-${tab}`));
  }
}
