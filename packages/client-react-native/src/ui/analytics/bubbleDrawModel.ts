import {
  aggregatePositionsByCurrency,
  type CurrencyPairPosition,
  type CurrencyPositionNode,
} from "@rtc/domain";

import {
  bubblesHeight,
  computeBubbleLayout,
} from "#/ui/analytics/bubbleLayout";
import { formatUnsignedCompact } from "#/ui/analytics/formatAnalytics";

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
  /** Half the mobile design's diameter ramp — see `scaleBubbleRadius`. NOT the
   * radius `@rtc/domain` hands back, which is the web prototype's curve. */
  readonly radius: number;
  readonly sign: "pos" | "neg";
  readonly currencyFontSize: number;
  /** Text baselines, relative to the bubble's centre. Skia's `<Text>` anchors
   * at the baseline, not the box, so these cannot be derived from a height. */
  readonly currencyBaseline: number;
  /** The net exposure in the mobile design's compact, unsigned form
   * (`24.80M`, `900.0K`). `null` when the bubble is too small to hold a second
   * line — see `AMOUNT_MIN_DIAMETER`. */
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
 *
 * THE RADIUS IS RESCALED BEFORE LAYOUT. `aggregatePositionsByCurrency` sizes
 * every node by the WEB prototype's curve; the mobile design has its own, much
 * flatter ramp, so each node's radius is replaced by `scaleBubbleRadius` here
 * and only then packed. Rescaling on the way in rather than inside
 * `computeBubbleLayout` keeps the packer reading a plain `radius`, and keeps
 * the web clients — which share the domain aggregation — untouched.
 *
 * The amount is formatted from the aggregation's RAW `tradedAmount`, not from
 * `netExposureByCurrency`, which pre-rounds to a tenth of a million. The
 * mobile design formats the raw figure (`fmtK(e.usd)`, dc.html L964), so a
 * sub-million net reads `900.0K` rather than collapsing to `0.9M` — and the
 * `undefined` branch that map lookup needed goes with it, since every placed
 * bubble carries its own amount by construction.
 */
export function buildBubbleDrawModel(
  positions: readonly CurrencyPairPosition[],
  viewportWidth: number,
): BubbleDrawModel {
  const nodes = aggregatePositionsByCurrency(positions);
  const maxAbsExposure = nodes.reduce((max: number, node): number => {
    return Math.max(max, Math.abs(node.tradedAmount));
  }, 0);

  const sized = nodes.map((node): CurrencyPositionNode => {
    return {
      ...node,
      radius: scaleBubbleRadius(Math.abs(node.tradedAmount), maxAbsExposure),
    };
  });

  const placed = computeBubbleLayout(sized, {
    width: viewportWidth,
  });

  const entries = placed.map((bubble): BubbleDrawEntry => {
    const showsAmount = bubble.radius * 2 >= AMOUNT_MIN_DIAMETER;

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
      amount: showsAmount ? formatUnsignedCompact(bubble.tradedAmount) : null,
      amountBaseline: STACKED_AMOUNT_BASELINE,
    };
  });

  return { entries, height: bubblesHeight(placed) };
}

/**
 * The mobile design's bubble size: a LINEAR ramp on the currency's share of
 * the book's largest absolute exposure, `30 + (|usd| / maxExp) * 44` px across
 * (dc.html L960-966) — a 30px floor, a 74px cap, halved here because
 * everything downstream draws from a centre and a radius.
 *
 * WHY NOT THE DOMAIN RADIUS. `aggregatePositionsByCurrency` scales
 * `[minValue, maxValue] -> [15, 60]`, i.e. a 120px cap AND a floor that moves
 * with the book. On a phone card that put the largest bubble across a third of
 * the screen and pushed the cluster below the fold. The domain figure is the
 * WEB prototype's rule and the web clients still use it; only this draw model
 * substitutes the mobile one.
 *
 * The ramp is anchored on the MAXIMUM alone, so the smallest bubble is a true
 * reading of its share rather than being stretched to a floor by the domain's
 * moving `minValue`. `maxAbsExposure` is 0 only for an empty book (zero nets
 * are filtered out upstream), and the guard keeps that case at the floor
 * instead of dividing by zero.
 *
 * The DIAMETER is rounded to a whole pixel before halving, exactly as the
 * design does (`Math.round(30 + share * 44)`, dc.html L966). Skia would draw
 * a fractional radius happily, but the design's reference shots render the
 * rounded ramp — an earlier revision kept the fraction as a "float precision"
 * nicety, which made every bubble a sub-pixel different from the design's.
 */
export function scaleBubbleRadius(
  absExposure: number,
  maxAbsExposure: number,
): number {
  const share = maxAbsExposure === 0 ? 0 : absExposure / maxAbsExposure;

  return Math.round(MIN_BUBBLE_DIAMETER + share * BUBBLE_DIAMETER_RANGE) / 2;
}

/**
 * The label-size rule the shipped web client applies in `PositionsPanel.tsx`:
 * bubbles wider than 62px get the larger label. (An earlier comment here cited
 * "dc.html L1299" as its source; that line is boot-canvas telemetry, and the
 * MOBILE prototype has no size step at all — see the note on
 * `CURRENCY_FONT_SIZE_SMALL` below.)
 */
export function currencyFontSize(radius: number): number {
  return radius * 2 > LARGE_LABEL_DIAMETER
    ? CURRENCY_FONT_SIZE_LARGE
    : CURRENCY_FONT_SIZE_SMALL;
}

/** Left edge that centres a run of text of `textWidth` on `centerX`. Skia
 * `<Text>` has no `textAnchor` — unlike the `<SvgText>` this replaced, which
 * centred itself — so the caller must measure and offset. */
export function centerTextX(centerX: number, textWidth: number): number {
  return centerX - textWidth / 2;
}

/**
 * T37: the MOBILE prototype renders the currency at 9px/600 and the amount at
 * 7.5px (dc.html:196-197). These were 12/15/9 — the sizes in
 * `packages/client-prototype/.../ExposureBubbles.module.css`, i.e. the v2 WEB
 * design port, carried over wholesale along with the glow and the half-opacity
 * ring. There is no step-up at a larger diameter in the mobile design, so the
 * two currency sizes collapse to one.
 */
const CURRENCY_FONT_SIZE_SMALL = 9;
const CURRENCY_FONT_SIZE_LARGE = 9;
export const AMOUNT_FONT_SIZE = 7.5;

/** Retained so the size-selection seam stays explicit even though the mobile
 * design uses one size either side of it. */
const LARGE_LABEL_DIAMETER = 62;

/**
 * The mobile design's diameter ramp, `30 + (|usd| / maxExp) * 44` px
 * (dc.html L960-966): a 30px floor at zero exposure, a 74px cap at the book's
 * largest. See `scaleBubbleRadius`.
 */
const MIN_BUBBLE_DIAMETER = 30;
const BUBBLE_DIAMETER_RANGE = 44;

/**
 * Smallest bubble that gets an amount label.
 *
 * T37: this was 40, justified as "the prototype's own floor (its diameter is
 * `40 + sqrt(|M|) * 11`)" — but that formula is the **web** prototype's
 * (`client-prototype/src/fx/Positions/positionsData.ts:25`). The mobile
 * design's template draws the amount on every bubble unconditionally
 * (dc.html:194-197); the suppression existed only because the labels were
 * carrying the web's oversized 9px amount, and at the mobile 7.5px a 30px
 * bubble fits.
 *
 * Now that `scaleBubbleRadius` applies the design's ramp, its floor IS this
 * threshold, so in practice every bubble is labelled and the branch never
 * takes its `null` arm. It stays as the seam that keeps a smaller floor
 * honest: drop `MIN_BUBBLE_DIAMETER` below this and the tiniest bubbles go
 * back to carrying their currency alone rather than overprinting two lines.
 */
const AMOUNT_MIN_DIAMETER = 30;

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
