import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for LiveEventLog. Queries event rows by the [data-sev] chip
 * within the admin-event-log container (uppercase INFO/WARN/ERROR — the
 * component maps the lowercase domain Severity for display).
 */
export class LiveEventLogPage extends MountedComponent<Record<string, never>> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-event-log");
  }

  /** True when the "NO EVENTS" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO EVENTS/i) !== null;
  }

  /** The "{n} events" count text in the head, or null before any row renders. */
  countText(): string | null {
    return (
      within(this.container()).queryByText(/^\d+ events$/i)?.textContent ?? null
    );
  }

  /** All event row elements ([data-sev] chips' row ancestor). */
  rows(): Element[] {
    return Array.from(
      this.container().querySelectorAll<HTMLElement>("[data-sev]"),
    ).map((chip) => {
      return chip.parentElement as Element;
    });
  }

  /** Total number of rendered event rows. */
  rowCount(): number {
    return this.rows().length;
  }

  /**
   * The uppercase data-sev value of the row at the given index (0 =
   * first/newest). Returns null when no row exists at that position.
   */
  rowSeverity(index: number): string | null {
    return (
      this.rows()
        [index]?.querySelector("[data-sev]")
        ?.getAttribute("data-sev") ?? null
    );
  }

  /** The uppercase data-sev value of the first (newest) row. */
  firstRowSeverity(): string | null {
    return this.rowSeverity(0);
  }

  /** The text content of the first row's message span. */
  firstRowMessage(): string | null {
    const row = this.rows()[0];
    if (!row) return null;
    const spans = row.querySelectorAll("span");
    // spans[0] = time, spans[1] = severity chip, spans[2] = service, spans[3] = message
    return spans[3]?.textContent?.trim() ?? null;
  }
}
