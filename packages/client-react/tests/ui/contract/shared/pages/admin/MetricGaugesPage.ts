import { MountedComponent } from "#tests/ui/contract/shared/harness/component";

type GaugeMetric = "throughput" | "latency" | "errorRate";

/**
 * Page object for MetricGauges. Queries gauge containers by the data-metric
 * attribute on each RadialGauge wrapper <div>. Note: the component does NOT
 * use data-testid="metric-<metric>" (reported as a gap) — data-metric is the
 * best available selector. The display value is read from the first <span>
 * child (the value span that follows the SVG element).
 */
export class MetricGaugesPage extends MountedComponent<Record<string, never>> {
  /** Return the gauge container element for the given metric, or null. */
  gaugeElement(metric: GaugeMetric): Element | null {
    return this.root.querySelector(`[data-metric="${metric}"]`);
  }

  /**
   * Return the display value text for the given metric (e.g. "250/s", "45ms",
   * "0.05"). Reads the first <span> within the gauge element — the RadialGauge
   * renders <svg>…</svg><span class="value">…</span><span class="label">…</span>,
   * so the first span is always the numeric display.
   */
  gaugeValue(metric: GaugeMetric): string | null {
    const gauge = this.gaugeElement(metric);
    if (!gauge) return null;
    const spans = gauge.querySelectorAll("span");
    return spans[0]?.textContent?.trim() ?? null;
  }

  /** True when the gauge element for the given metric exists. */
  hasGauge(metric: GaugeMetric): boolean {
    return this.gaugeElement(metric) !== null;
  }
}
