import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/** Page object for the Order Ticket panel's static head slot. */
export class EqTicketHeadPage extends MountedComponent<Record<string, never>> {
  /** The head's title text. */
  title(): string {
    return within(this.root).getByText(/order ticket/i).textContent ?? "";
  }
}
