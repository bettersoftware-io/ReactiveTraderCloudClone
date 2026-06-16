import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { TileExecutionState as TileState } from "../../../../../../../../src/app/presenters/TileExecutionMachine";
import { MountedComponent } from "../../../../harness/component";

export interface TileConfirmationProps {
  state: TileState;
  onDismiss: () => void;
}

export class TileConfirmationPage extends MountedComponent<TileConfirmationProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q() {
    return within(this.root);
  }

  overlay(): HTMLElement | null {
    return this.q().queryByTestId("trade-confirmation");
  }

  isVisible(): boolean {
    return this.overlay() !== null;
  }

  text(): string {
    return this.overlay()?.textContent?.trim() ?? "";
  }

  backgroundColor(): string {
    return this.overlay()?.style.backgroundColor ?? "";
  }

  cursor(): string {
    return this.overlay()?.style.cursor ?? "";
  }

  async clickOverlay(): Promise<void> {
    const el = this.overlay();
    if (!el) throw new Error("No confirmation overlay to click");
    await this.user.click(el);
  }
}
