import { CHART_PALETTE_TOKENS, type ChartPalette } from "@rtc/motion-core";

/** Reads the chart's canvas palette off the live CSS custom-property
 * cascade at `el` — the one DOM-touching half of the palette port (the
 * token map itself lives in motion-core). Called per draw: ~16 reads on
 * one element at event rate, negligible next to the raster itself, and it
 * makes theme switches self-correcting without a theme subscription. */
export function readChartPalette(el: HTMLElement): ChartPalette {
  const cs = getComputedStyle(el);
  const out = {} as Record<keyof ChartPalette, string>;

  for (const key of Object.keys(
    CHART_PALETTE_TOKENS,
  ) as (keyof ChartPalette)[]) {
    out[key] = cs.getPropertyValue(CHART_PALETTE_TOKENS[key]).trim();
  }

  return out;
}
