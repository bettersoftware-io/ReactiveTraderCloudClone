import { fireEvent, within } from "@testing-library/dom";

import type { IncidentKind } from "#/app/presenters/IncidentMachine";
import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for IncidentControls. Clicks the inject buttons and the Clear
 * button, reads data-active state. Note: IncidentControls uses
 * data-testid="incident-{kind}" on each button and data-testid="incident-clear"
 * on the clear button — both present in the component.
 */
export class IncidentControlsPage extends MountedComponent<
  Record<string, never>
> {
  /** Click the inject button for the given incident kind. */
  inject(kind: IncidentKind): void {
    const btn = within(this.root).getByTestId(`incident-${kind}`);
    fireEvent.click(btn);
  }

  /** Click the Clear button to reset all active incidents. */
  clear(): void {
    const btn = within(this.root).getByTestId("incident-clear");
    fireEvent.click(btn);
  }

  /** True when the given kind's button carries data-active="true". */
  isActive(kind: IncidentKind): boolean {
    const btn = within(this.root).queryByTestId(`incident-${kind}`);
    return btn?.getAttribute("data-active") === "true";
  }

  /** True when no incidents are active (clear button data-active="false"). */
  isIdle(): boolean {
    const btn = within(this.root).queryByTestId("incident-clear");
    return btn?.getAttribute("data-active") === "false";
  }
}
