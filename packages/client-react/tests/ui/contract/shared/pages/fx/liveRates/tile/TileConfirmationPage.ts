import {
  type BoundFunctions,
  type queries,
  within,
} from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";

import type { TileExecutionState as TileState } from "@rtc/client-core";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

export interface TileConfirmationProps {
  state: TileState;
  onDismiss: () => void;
}

export class TileConfirmationPage extends MountedComponent<TileConfirmationProps> {
  private readonly user: UserEvent = userEvent.setup();

  private q(): BoundFunctions<typeof queries> {
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
    // The overlay exposes a semantic data-status; map it back to the colour
    // token the component used to render (and that the contract spec asserts).
    switch (this.overlay()?.dataset.status) {
      case "done":
        return "var(--accent-positive)";
      case "rejected":
        return "var(--accent-negative)";
      case "tooLong":
      case "timeout":
      case "timedOut":
      case "creditExceeded":
        return "var(--accent-aware)";
      case "started":
        return "transparent";
      case undefined:
        return "";
      default:
        return "var(--bg-overlay)";
    }
  }

  cursor(): string {
    const status = this.overlay()?.dataset.status;
    if (status === undefined) return "";
    return status === "started" ? "default" : "pointer";
  }

  async clickOverlay(): Promise<void> {
    const el = this.overlay();
    if (!el) throw new Error("No confirmation overlay to click");
    await this.user.click(el);
  }
}
