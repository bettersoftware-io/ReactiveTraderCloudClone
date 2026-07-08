import { within } from "@testing-library/dom";

import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

/**
 * Page object for ServiceHealth. Rows carry data-status (not data-testid per
 * row) — identified by the text content of their .name-class child, mirroring
 * the ServiceTopologyGraphPage convention for the same underlying data
 * (useTopology() nodes).
 */
export class ServiceHealthPage extends MountedComponent<Record<string, never>> {
  private container(): HTMLElement {
    return within(this.root).getByTestId("admin-service-health");
  }

  /** True when the "NO TOPOLOGY DATA" placeholder is shown. */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO TOPOLOGY DATA/i) !== null;
  }

  /** All rendered service rows (one per topology node). */
  private rows(): HTMLElement[] {
    return Array.from(
      this.container().querySelectorAll<HTMLElement>("[data-status]"),
    );
  }

  /** Total number of rendered service rows. */
  rowCount(): number {
    return this.rows().length;
  }

  /** Return the row element for the named service, or null if absent. */
  private rowForService(name: string): HTMLElement | null {
    for (const row of this.rows()) {
      const spans = row.querySelectorAll("span");

      if (spans[1]?.textContent?.trim().toLowerCase() === name.toLowerCase()) {
        return row;
      }
    }

    return null;
  }

  /** True when a row for the named service is present. */
  hasService(name: string): boolean {
    return this.rowForService(name) !== null;
  }

  /** The data-status attribute of the named service's row, or null. */
  statusFor(name: string): string | null {
    return this.rowForService(name)?.getAttribute("data-status") ?? null;
  }

  // Row markup, in document order (querySelectorAll("span") walks nested
  // spans too): [0] dot, [1] name, [2] track, [3] fill (nested in track),
  // [4] latency, [5] uptime.

  /** The rendered latency text (e.g. "37ms") for the named service. */
  latencyFor(name: string): string | null {
    const row = this.rowForService(name);
    const spans = row?.querySelectorAll("span");
    return spans?.[4]?.textContent?.trim() ?? null;
  }

  /** The rendered uptime text (e.g. "99.94%" or "—") for the named service. */
  uptimeFor(name: string): string | null {
    const row = this.rowForService(name);
    const spans = row?.querySelectorAll("span");
    return spans?.[5]?.textContent?.trim() ?? null;
  }

  /** The --bar-pct custom property (e.g. "50%") set on the health fill. */
  barPctFor(name: string): string | null {
    const row = this.rowForService(name);
    const fill = row?.querySelector<HTMLElement>("span > span");
    return fill?.style.getPropertyValue("--bar-pct") || null;
  }

  /** The --health custom property (e.g. "86") driving the fill's colour ramp. */
  healthFor(name: string): string | null {
    const row = this.rowForService(name);
    const fill = row?.querySelector<HTMLElement>("span > span");
    return fill?.style.getPropertyValue("--health") || null;
  }
}
