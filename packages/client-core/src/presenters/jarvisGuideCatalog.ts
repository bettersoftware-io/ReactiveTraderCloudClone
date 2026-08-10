export interface JarvisGuideItem {
  /** The literal text sent as a user turn when the row/chip is clicked. */
  readonly command: string;
  /** Only a live (LLM) brain can act on it; scripted answers with its
   * honest mandate fallback. Rendered as a "live brain" badge; excluded
   * from the chip sampler. */
  readonly liveOnly?: boolean;
}

export interface JarvisGuideSection {
  readonly title: string;
  readonly items: readonly JarvisGuideItem[];
}

/** One catalog feeds the chips, the ⓘ guide and the demo script — the
 * conformance test walks every non-liveOnly command through
 * `matchJarvisIntent`, so a line the scripted brain cannot parse fails CI. */
export const JARVIS_GUIDE_CATALOG: readonly JarvisGuideSection[] = [
  {
    title: "DESK INTELLIGENCE",
    items: [
      { command: "What's moving?" },
      { command: "Where is EURUSD?" },
      { command: "How am I doing?" },
      { command: "Brief me on the desk" },
      { command: "What's the spread on GBPUSD?" },
    ],
  },
  {
    title: "GENERATIVE UI",
    items: [
      { command: "Show me GBP volatility" },
      { command: "Show me a price chart" },
      { command: "Make it a heatmap" },
      { command: "Make it a table" },
    ],
  },
  {
    title: "DESK CONTROL",
    items: [
      { command: "Set up my morning workspace" },
      { command: "Maximise the Live Rates panel", liveOnly: true },
      { command: "Switch to the neon theme", liveOnly: true },
      { command: "Turn on power saver", liveOnly: true },
    ],
  },
  {
    title: "EXECUTION",
    items: [{ command: "Buy 5M EURUSD" }, { command: "Sell 2M GBPUSD" }],
  },
];

/** Four chips, one per section, rotating with `seed` (the overlay's
 * openCount) — deterministic so specs pin exact sets. liveOnly rows are
 * skipped: a chip is a one-click promise and must work on every brain. */
export function sampleGuideChips(
  catalog: readonly JarvisGuideSection[],
  seed: number,
): readonly string[] {
  return catalog.map((section, sectionIndex) => {
    const pool = section.items.filter((item) => {
      return item.liveOnly !== true;
    });

    const index =
      (((seed + sectionIndex) % pool.length) + pool.length) % pool.length;
    return pool[index].command;
  });
}
