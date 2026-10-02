/** A card subtitle's notional readout — the design abbreviates (dc.html:2166,
 * `(q.qty / 1000000).toFixed(1) + 'M USD'`), where the app printed a raw
 * `2,000,000`.
 *
 * The sub-million branches are OURS, not the prototype's: it only ever seeds
 * whole millions, so `toFixed(1)` alone would render every smaller RFQ the
 * domain can produce as `0.0M USD` — an abbreviation that has abbreviated the
 * number away. Same rounding as the design above a million. */
export function formatNotional(quantity: number): string {
  if (quantity >= 1_000_000) {
    return `${(quantity / 1_000_000).toFixed(1)}M USD`;
  }

  if (quantity >= 1_000) {
    return `${Math.round(quantity / 1_000)}K USD`;
  }

  return `${quantity} USD`;
}
