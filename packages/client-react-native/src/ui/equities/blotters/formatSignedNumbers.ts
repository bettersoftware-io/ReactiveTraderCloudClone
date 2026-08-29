/**
 * The two number shapes the mobile-v1 blotter cards print, lifted from the
 * prototype's own `fmtK` and quantity mapping so the app and the design
 * agree glyph for glyph.
 *
 * Both carry an explicit sign on positives (`+400`, `+1.3K`) — a blotter row
 * reads direction before magnitude — and the negative sign is the typographic
 * minus U+2212, matching the prototype, not the ASCII hyphen.
 */

/** `+1.3K` / `−924` / `+1.20M`: sign, then the magnitude compacted at the
 * thousand (one decimal) and million (two decimals) marks; below a thousand
 * it is the rounded integer. */
export function formatSignedCompact(value: number): string {
  const magnitude = Math.abs(value);

  if (magnitude >= 1_000_000) {
    return `${signOf(value)}${(magnitude / 1_000_000).toFixed(2)}M`;
  }

  if (magnitude >= 1_000) {
    return `${signOf(value)}${(magnitude / 1_000).toFixed(1)}K`;
  }

  return `${signOf(value)}${magnitude.toFixed(0)}`;
}

/** `+1,200` / `−300`: sign plus the en-US grouped integer. */
export function formatSignedInteger(value: number): string {
  return `${signOf(value)}${Math.abs(value).toLocaleString("en-US")}`;
}

function signOf(value: number): string {
  return value < 0 ? "−" : "+";
}
