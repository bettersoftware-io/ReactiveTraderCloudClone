/** Signed percentage formatter — `+1.23%` / `-1.23%`. Shared by
 * `MoversRow`'s pct pill and `InstrumentCard`'s price-line change, which
 * both format the same `changePct` value the same way and must not drift
 * into two independent implementations. */
export function formatChangePct(pct: number): string {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}
