import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for ErrorRatePanel. */
export class ErrorRatePanelPage extends MountedComponent<
  Record<string, never>
> {
  /** The current level attribute on the panel ("ok" | "warn" | "error"). */
  level(): string | null {
    return (
      within(this.root)
        .queryByTestId("admin-error-rate")
        ?.getAttribute("data-level") ?? null
    );
  }

  /** The numeric display value text. */
  valueText(): string | null {
    const el = this.root.querySelector(
      "[data-testid='admin-error-rate'] [class*='value']",
    );
    return el?.textContent?.trim() ?? null;
  }

  /** True when the "NO DATA" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO DATA/i) !== null;
  }

  /** True when the panel element is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-error-rate") !== null;
  }
}
