import { within } from "@testing-library/dom";

import { MountedComponent } from "../../../harness/component";

export interface StaleIndicatorProps {
  stale: boolean;
  /** A text label rendered as the wrapped children, used to assert pass-through. */
  childLabel: string;
}

export class StaleIndicatorPage extends MountedComponent<StaleIndicatorProps> {
  /** The relatively-positioned wrapper div the component renders. */
  private wrapper(): HTMLElement {
    const el = this.root.firstElementChild;
    if (!(el instanceof HTMLElement)) {
      throw new Error("StaleIndicator wrapper not found");
    }
    return el;
  }

  /** True when the stale overlay attribute is set on the wrapper. */
  isStale(): boolean {
    return this.wrapper().dataset.stale === "true";
  }

  /** True when the "Reconnecting..." overlay caption is visible. */
  hasOverlay(): boolean {
    return within(this.root).queryByText(/reconnecting/i) !== null;
  }

  /** True when the wrapped children are still rendered. */
  showsChild(label: string): boolean {
    return within(this.root).queryByText(label) !== null;
  }
}
