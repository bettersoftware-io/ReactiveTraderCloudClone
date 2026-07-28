import {
  aggregatePositionsByCurrency,
  type CurrencyPairPosition,
  netExposureByCurrency,
} from "@rtc/domain";

import {
  bubblesHeight,
  computeBubbleLayout,
} from "#/ui/analytics/bubbleLayout";

/**
 * Everything the exposure bubbles draw, as plain numbers and strings.
 *
 * WHY THIS MODULE EXISTS. Skia elements are not React Native views: they take
 * no `testID`, so a test cannot query an individual bubble the way it could
 * when these were `react-native-svg` `<Circle>`s. Rather than lose the
 * coverage, every *decision* — which currencies get a bubble, how big, which
 * accent, which label sizes, whether the amount fits — is made here and
 * asserted directly. `ExposureBubbles` is then a renderer with no arithmetic
 * of its own. Same split `buildChart` uses for the P&L chart, for the same
 * reason.
 */
export interface BubbleDrawEntry {
  readonly currency: string;
  /** Resting centre in canvas coordinates. Bubbles are drawn as a translated
   * group, so every child below is positioned relative to this point. */
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly sign: "pos" | "neg";
  readonly currencyFontSize: number;
  /** Text baselines, relative to the bubble's centre. Skia's `<Text>` anchors
   * at the baseline, not the box, so these cannot be derived from a height. */
  readonly currencyBaseline: number;
  /** `null` when the bubble is too small to hold a second line — see
   * `AMOUNT_MIN_DIAMETER`. */
  readonly amount: string | null;
  readonly amountBaseline: number;
}

export interface BubbleDrawModel {
  readonly entries: readonly BubbleDrawEntry[];
  /** Canvas height the laid-out cluster needs. */
  readonly height: number;
}

/**
 * Lays the book out and resolves every per-bubble draw decision.
 *
 * `viewportWidth` is the **measured** width, not a fixed design-space width.
 * `computeBubbleLayout` already takes a viewport and packs to it, so passing
 * the real width lets the cluster reflow at its true size. The previous
 * `react-native-svg` version packed into a fixed 320-unit space and stretched
 * it with a `viewBox`; Skia has no viewBox, and packing at the real width is
 * both simpler and a better use of the space than scaling would be.
 */
export function buildBubbleDrawModel(
  positions: readonly CurrencyPairPosition[],
  viewportWidth: number,
): BubbleDrawModel {
  const placed = computeBubbleLayout(aggregatePositionsByCurrency(positions), {
    width: viewportWidth,
  });

  const millions = new Map(
    netExposureByCurrency(positions).map((exposure) => {
      return [exposure.currency, exposure.amountMillions];
    }),
  );

  const entries = placed.map((bubble): BubbleDrawEntry => {
    const amountMillions = millions.get(bubble.currency);
    const showsAmount =
      bubble.radius * 2 >= AMOUNT_MIN_DIAMETER && amountMillions !== undefined;

    return {
      currency: bubble.currency,
      x: bubble.x,
      y: bubble.y,
      radius: bubble.radius,
      sign: bubble.sign,
      currencyFontSize: currencyFontSize(bubble.radius),
      currencyBaseline: showsAmount
        ? STACKED_CURRENCY_BASELINE
        : currencyFontSize(bubble.radius) * SINGLE_LINE_BASELINE_RATIO,
      amount: showsAmount ? formatMillions(amountMillions) : null,
      amountBaseline: STACKED_AMOUNT_BASELINE,
    };
  });

  return { entries, height: bubblesHeight(placed) };
}

/**
 * The prototype's label-size rule (dc.html L1299): bubbles wider than 62px
 * get the larger label. Ported verbatim, and the same rule the shipped web
 * client applies in `PositionsPanel.tsx`.
 */
export function currencyFontSize(radius: number): number {
  return radius * 2 > LARGE_LABEL_DIAMETER
    ? CURRENCY_FONT_SIZE_LARGE
    : CURRENCY_FONT_SIZE_SMALL;
}

/**
 * Signed millions with one decimal and an `M` suffix — the same format the
 * web client's bubbles use, so the two clients read identically.
 *
 * Note `-0` formats as `0.0M` with no sign, because `toFixed` drops the sign
 * of negative zero. A tiny short position therefore reads `0.0M` while still
 * being coloured as a negative. That is the web's behaviour too; matching it
 * is deliberate.
 */
export function formatMillions(amountMillions: number): string {
  return `${amountMillions > 0 ? "+" : ""}${amountMillions.toFixed(1)}M`;
}

/** Left edge that centres a run of text of `textWidth` on `centerX`. Skia
 * `<Text>` has no `textAnchor` — unlike the `<SvgText>` this replaced, which
 * centred itself — so the caller must measure and offset. */
export function centerTextX(centerX: number, textWidth: number): number {
  return centerX - textWidth / 2;
}

const CURRENCY_FONT_SIZE_SMALL = 12;
const CURRENCY_FONT_SIZE_LARGE = 15;
export const AMOUNT_FONT_SIZE = 9;

/** Diameter above which the currency label steps up a size (dc.html L1299). */
const LARGE_LABEL_DIAMETER = 62;

/**
 * Smallest bubble that gets an amount label. `aggregatePositionsByCurrency`
 * scales radius down to 15 — a 30px bubble, far too narrow for `-55.0M` at
 * 9px. 40px is the prototype's own floor (its diameter is `40 + sqrt(|M|) *
 * 11`, so it never draws an amount in anything smaller either).
 */
const AMOUNT_MIN_DIAMETER = 40;

/**
 * A lone currency label sits slightly below the geometric centre so it reads
 * optically centred: text hangs from its baseline, so shifting down by about
 * half the cap height balances it.
 */
const SINGLE_LINE_BASELINE_RATIO = 0.35;

/** Stacked pair (prototype `.inner`, line-height 1.1): currency just above
 * the centre line, amount below it. */
const STACKED_CURRENCY_BASELINE = -1;
const STACKED_AMOUNT_BASELINE: number = AMOUNT_FONT_SIZE + 1;
