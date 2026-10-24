import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/**
 * Page object for OpsHead — the ops-dashboard panel's head slot. Wraps
 * the base class's injectIncident()/clearIncident() drivers (same World the
 * real IncidentMachine seam pushes through) so specs can flip the status
 * pill exactly the way IncidentControls' own coupling spec drives
 * ConnectionOverlay, without clicking any buttons (OpsHead has none).
 */
export class OpsHeadPage extends MountedComponent<Record<string, never>> {
  /** The "◈ Observability" head-tab text. */
  titleText(): string | null {
    return (
      within(this.root).queryByTestId("ops-head-title")?.textContent ?? null
    );
  }

  /** True when the head-tab is flagged data-active="true" (always, single view). */
  isTitleActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("ops-head-title")
        ?.getAttribute("data-active") === "true"
    );
  }

  /** The status pill's full text ("● ALL SYSTEMS NOMINAL" / "● INCIDENT ACTIVE"). */
  pillText(): string | null {
    return (
      within(this.root).queryByTestId("ops-status-pill")?.textContent ?? null
    );
  }

  /** True when the pill is flagged data-incident="true" (an incident is active). */
  isIncidentActive(): boolean {
    return (
      within(this.root)
        .queryByTestId("ops-status-pill")
        ?.getAttribute("data-incident") === "true"
    );
  }
}
