import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "../../../harness/component";

export type ViewMode = "chart" | "price";

export interface ViewToggleProps {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export class ViewTogglePage extends MountedComponent<ViewToggleProps> {
  private readonly user: UserEvent = userEvent.setup();

  private button(): HTMLButtonElement {
    return within(this.root).getByTestId("view-toggle") as HTMLButtonElement;
  }

  /** The toggle's visible label text. */
  label(): string {
    return this.button().textContent?.trim() ?? "";
  }

  /** The toggle's title (tooltip) attribute. */
  title(): string {
    return this.button().title;
  }

  async toggle(): Promise<void> {
    await this.user.click(this.button());
  }
}
