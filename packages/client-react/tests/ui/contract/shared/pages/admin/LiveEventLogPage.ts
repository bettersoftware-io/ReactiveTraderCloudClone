import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for LiveEventLog. Queries event rows by the <li data-severity>
 * elements within the admin-event-log container. Note: the component does NOT
 * use data-testid="event-row" on each <li> (reported as a gap) — the
 * data-severity attribute is used instead, which is present and unique.
 */
export class LiveEventLogPage extends MountedComponent<Record<string, never>> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-event-log");
  }

  /** True when the "NO EVENTS" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO EVENTS/i) !== null;
  }

  /** All event row elements (<li data-severity> within the log container). */
  rows(): Element[] {
    return Array.from(
      this.container().querySelectorAll<HTMLLIElement>("li[data-severity]"),
    );
  }

  /** Total number of rendered event rows. */
  rowCount(): number {
    return this.rows().length;
  }

  /**
   * The data-severity value of the row at the given index (0 = first/newest).
   * Returns null when no row exists at that position.
   */
  rowSeverity(index: number): string | null {
    return this.rows()[index]?.getAttribute("data-severity") ?? null;
  }

  /** The data-severity value of the first (newest) row. */
  firstRowSeverity(): string | null {
    return this.rowSeverity(0);
  }

  /** The text content of the first row's message span. */
  firstRowMessage(): string | null {
    const row = this.rows()[0];
    if (!row) return null;
    const spans = row.querySelectorAll("span");
    // spans[0] = time, spans[1] = service, spans[2] = message
    return spans[2]?.textContent?.trim() ?? null;
  }
}
