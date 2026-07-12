import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

type KpiKey = "tput" | "lat" | "err" | "sess";

/** Page object for KpiRow — the 4-up KPI strip (throughput/latency/error/sessions). */
export class KpiRowPage extends MountedComponent<Record<string, never>> {
  private card(key: KpiKey): Element | null {
    return within(this.root).queryByTestId(`admin-kpi-${key}`);
  }

  /** True when the KPI row wrapper is present. */
  isPresent(): boolean {
    return within(this.root).queryByTestId("admin-kpi-row") !== null;
  }

  /** True when all 4 KPI cards (tput/lat/err/sess) are present. */
  hasAllCards(): boolean {
    return (["tput", "lat", "err", "sess"] as const).every((key) => {
      return this.card(key) !== null;
    });
  }

  /** The formatted display value for the given KPI card. */
  value(key: KpiKey): string | null {
    return (
      this.card(key)?.querySelector("[data-kpi]")?.textContent?.trim() ?? null
    );
  }

  /** The unit text for the given KPI card. */
  unit(key: KpiKey): string | null {
    return (
      this.card(key)?.querySelector("[class*='unit']")?.textContent?.trim() ??
      null
    );
  }

  /** The delta text for the given KPI card. */
  delta(key: KpiKey): string | null {
    return (
      this.card(key)?.querySelector("[data-delta-up]")?.textContent?.trim() ??
      null
    );
  }

  /** True when the given KPI card's value is flagged data-warn="true". */
  isWarn(key: KpiKey): boolean {
    return (
      this.card(key)?.querySelector("[data-kpi]")?.getAttribute("data-warn") ===
      "true"
    );
  }

  /** The sparkline path `d` attribute for the given KPI card. */
  sparkPath(key: KpiKey): string | null {
    return this.card(key)?.querySelector("svg path")?.getAttribute("d") ?? null;
  }
}
