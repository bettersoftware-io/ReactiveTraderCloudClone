/**
 * A theme colour at `alpha` (0–1) of its own opacity.
 *
 * The design expresses its tints as `color-mix(in oklab, <c> N%, transparent)`;
 * RN has no `color-mix`, so the alpha is baked into the colour string. Call
 * sites used to do that by appending a two-digit byte to the token
 * (`${accent}1F`), which is only valid while the token is a six-digit hex — and
 * three of this app's token sets already store some colours as `rgba(…)`,
 * where the suffix silently produces a string RN ignores.
 *
 * So the format follows the input: a hex colour comes back as `#rrggbbaa`
 * (byte for byte what the suffix produced), an `rgb()`/`rgba()` colour as
 * `rgba(…)`. An input that already carries alpha has it multiplied, not
 * replaced. Anything else throws: a tint that quietly fails to paint is the
 * defect this exists to remove.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = HEX.exec(color);

  if (hex) {
    const digits = expandShortHex(hex[1] ?? "");
    const ownAlpha =
      digits.length === 8 ? Number.parseInt(digits.slice(6), 16) / 255 : 1;
    return `#${digits.slice(0, 6)}${alphaByte(ownAlpha * alpha)}`;
  }

  const rgb = RGB.exec(color);

  if (rgb) {
    const ownAlpha = rgb[4] === undefined ? 1 : Number.parseFloat(rgb[4]);
    return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${roundAlpha(ownAlpha * alpha)})`;
  }

  throw new Error(`withAlpha: unsupported colour "${color}"`);
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB =
  /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

function expandShortHex(digits: string): string {
  if (digits.length !== 3) {
    return digits;
  }

  return digits
    .split("")
    .map((channel) => {
      return channel + channel;
    })
    .join("");
}

function alphaByte(alpha: number): string {
  return Math.round(clampUnit(alpha) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
}

/** Trims float noise (`0.5 * 0.12` is `0.06`, not `0.06000000000000001`). */
function roundAlpha(alpha: number): number {
  return Math.round(clampUnit(alpha) * 1000) / 1000;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}
