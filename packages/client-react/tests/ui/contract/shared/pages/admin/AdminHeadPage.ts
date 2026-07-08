import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for AdminHead — the admin-dashboard panel's head slot. Wraps
 * the base class's injectIncident()/clearIncident() drivers (same World the
 * real IncidentMachine seam pushes through) so specs can flip the status
 * pill exactly the way IncidentControls' own coupling spec drives
 * ConnectionOverlay, without clicking any buttons (AdminHead has none).
 */
export class AdminHeadPage extends MountedComponent<Record<string, never>> {
  /** The "◈ Observability" title text. */
  titleText(): string | null {
    return (
      within(this.root).queryByText("◈ Observability")?.textContent ?? null
    );
  }

  /** The status pill's full text ("● ALL SYSTEMS NOMINAL" / "● INCIDENT ACTIVE"). */
  pillText(): string | null {
    return (
      within(this.root).queryByTestId("admin-status-pill")?.textContent ?? null
    );
  }

  /** True when the pill is flagged data-incident="true" (an incident is active). */
  isIncidentActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("admin-status-pill")
        ?.getAttribute("data-incident") === "true"
    );
  }
}
