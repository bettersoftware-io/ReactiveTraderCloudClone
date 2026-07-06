import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for AnalyticsHead — a static, always-active single tab (no
 * hooks, no props), so it only needs to expose the rendered title text and
 * the `data-active` underline attribute the engine's tab chrome keys off.
 */
export class AnalyticsHeadPage extends MountedComponent<Record<string, never>> {
  titleText(): string | null {
    return (
      within(this.root).queryByTestId("analytics-head-title")?.textContent ??
      null
    );
  }

  isActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("analytics-head-title")
        ?.getAttribute("data-active") === "true"
    );
  }
}
