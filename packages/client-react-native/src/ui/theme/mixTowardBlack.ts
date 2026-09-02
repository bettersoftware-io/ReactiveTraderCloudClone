/** The design's darkened CTA stop: `color-mix(in oklab, c 72%, black)`
 * (dc.html:2371 — the equities BUY/SELL ramp's bottom colour), approximated
 * in sRGB by scaling each channel by `keep`. Accepts the 6-digit `#RRGGBB`
 * every accent token uses; the oklab/sRGB difference is a few candela on an
 * already-dark stop, invisible at button size. */
export function mixTowardBlack(hex: string, keep: number): string {
  const r = Math.round(Number.parseInt(hex.slice(1, 3), 16) * keep);
  const g = Math.round(Number.parseInt(hex.slice(3, 5), 16) * keep);
  const b = Math.round(Number.parseInt(hex.slice(5, 7), 16) * keep);

  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

function toHexByte(v: number): string {
  return v.toString(16).padStart(2, "0");
}
