/**
 * The Analytics screen's number formats, ported from the MOBILE prototype's
 * own `_analyticsVals` script (`docs/design/mobile/v1/dev-handoff/prototype/
 * source/Reactive Trader Mobile.dc.html`, headline at L975, `fmtK` at L950,
 * bubble amounts at L964).
 *
 * WHY THESE ARE NOT THE SHARED `@rtc/domain` HELPERS. `formatPnlHeadline` /
 * `formatPnlK` render the WEB design's figures — `+$9.7k`, `+12k` — and the
 * web presenter (`client-core/src/presenters/composePanelStream.ts`) plus both
 * web clients read them. The mobile design asks for different figures from the
 * same numbers: a fully grouped headline (`+$29,672`), a two-decimal `M` /
 * one-decimal `K` compact form, and an unsigned variant for the bubbles.
 * Changing the domain helpers would silently restyle the web clients, so the
 * mobile rules live here, beside the only screen that renders them.
 *
 * NO `toLocaleString`. Hermes ships without full ICU, so a `'en-US'` locale
 * request can degrade to a grouping-free string on device while passing on the
 * Node-based test runners — a difference no test here could see. The grouping
 * is therefore done arithmetically.
 */

/** The headline P&L: a grouped whole-dollar figure with an explicit sign, e.g.
 * `+$29,672`. The negative sign is the design's U+2212 MINUS SIGN, which is
 * the same width as the `+` in a proportional face and so does not shift the
 * digits when the book flips. */
export function formatSignedDollars(value: number): string {
  const sign = value >= 0 ? "+" : MINUS_SIGN;

  return `${sign}$${groupThousands(Math.abs(Math.round(value)))}`;
}

/** The bubble amount: the compact form with its sign stripped from positives
 * and narrowed to an ASCII hyphen on negatives (dc.html L964). The bubble's
 * colour already carries the direction, so a `+` there would be redundant. */
export function formatUnsignedCompact(value: number): string {
  return formatSignedCompact(value).replace("+", "").replace(MINUS_SIGN, "-");
}

/** The compact form behind the delta chip and the pair-bar labels: two
 * decimals from a million up (`+24.80M`), one decimal from a thousand
 * (`+4.2K`), and whole units below that (`+840`). Always signed. */
export function formatSignedCompact(value: number): string {
  const magnitude = Math.abs(value);
  const sign = value >= 0 ? "+" : MINUS_SIGN;

  if (magnitude >= ONE_MILLION) {
    return `${sign}${(magnitude / ONE_MILLION).toFixed(2)}M`;
  }

  if (magnitude >= ONE_THOUSAND) {
    return `${sign}${(magnitude / ONE_THOUSAND).toFixed(1)}K`;
  }

  return `${sign}${magnitude.toFixed(0)}`;
}

/** `29672` -> `"29,672"`, by walking the digits from the right. */
function groupThousands(whole: number): string {
  const digits = String(whole);
  let grouped = "";

  for (let index = 0; index < digits.length; index += 1) {
    const remaining = digits.length - index;

    grouped += digits[index];

    if (remaining > 1 && remaining % GROUP_SIZE === 1) {
      grouped += ",";
    }
  }

  return grouped;
}

/** U+2212, the design's minus (dc.html L951) — not the ASCII hyphen. */
const MINUS_SIGN = "−";

const ONE_MILLION = 1_000_000;
const ONE_THOUSAND = 1000;
const GROUP_SIZE = 3;
