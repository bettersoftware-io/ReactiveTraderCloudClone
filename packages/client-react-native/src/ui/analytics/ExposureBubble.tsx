import { Circle, Group, type SkFont, Text } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useEffect } from "react";
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  type BubbleDrawEntry,
  centerTextX,
} from "#/ui/analytics/bubbleDrawModel";

/**
 * One exposure bubble: a tinted disc, a hairline ring, and its labels — breathing to a new size and position as the book drifts.
 *
 * WHY A SEPARATE COMPONENT. Each bubble owns three shared values and an
 * effect, and hooks cannot live inside the `.map()` in `ExposureBubbles`. One
 * component per bubble is the only shape that gives each its own tween — the
 * same reason `PairPnlBar` was split out of `PairPnlBars`.
 *
 * WHY POSITION TWEENS TOO, NOT JUST RADIUS. Radius is a scale of this
 * currency's share of the book, so when exposures drift every radius moves —
 * and shelf-packing re-packs around the new radii, so the centres move with
 * them. Animating `r` alone would glide each disc while its position snapped,
 * which reads as broken rather than alive. `x`, `y` and `r` are tweened
 * together on one duration so the whole cluster settles as a unit.
 *
 * ALL THREE ARE DRAW PARAMETERS, NOT LAYOUT. This is what makes the tween
 * legal under `docs/performance.md`: a Skia circle's centre and radius are
 * arguments to a paint call on the UI thread. The equivalent in React Native
 * views — animating `width`/`height`/`left` — would be a layout animation, the
 * exact trap `PairPnlBar` had to be rewritten to avoid.
 */
export function ExposureBubble({
  entry,
  color,
  amountColor,
  currencyFont,
  amountFont,
  motionEnabled,
}: ExposureBubbleProps): JSX.Element {
  // Seeded at the resting geometry so a bubble that mounts with motion off —
  // or before its first drift — draws its true size immediately rather than a
  // mid-tween frame or a collapsed dot.
  const x = useSharedValue(entry.x);
  const y = useSharedValue(entry.y);
  const radius = useSharedValue(entry.radius);

  useEffect(() => {
    function settle(target: number): number {
      return motionEnabled
        ? withTiming(target, {
            duration: BREATH_DURATION_MS,
            easing: BREATHING,
          })
        : target;
    }

    x.value = settle(entry.x);
    y.value = settle(entry.y);
    radius.value = settle(entry.radius);
  }, [entry.x, entry.y, entry.radius, motionEnabled, x, y, radius]);

  const transform = useDerivedValue(() => {
    return [{ translateX: x.value }, { translateY: y.value }];
  });

  return (
    <Group transform={transform}>
      <Circle cx={0} cy={0} r={radius} color={color} opacity={FILL_ALPHA} />
      <Circle
        cx={0}
        cy={0}
        r={radius}
        style="stroke"
        strokeWidth={RING_STROKE_WIDTH}
        color={color}
      />
      {currencyFont === null ? null : (
        <Text
          x={centerTextX(0, currencyFont.getTextWidth(entry.currency))}
          y={entry.currencyBaseline}
          text={entry.currency}
          font={currencyFont}
          color={color}
        />
      )}
      {amountFont === null || entry.amount === null ? null : (
        <Text
          x={centerTextX(0, amountFont.getTextWidth(entry.amount))}
          y={entry.amountBaseline}
          text={entry.amount}
          font={amountFont}
          color={amountColor}
        />
      )}
    </Group>
  );
}

/**
 * The breathing tween. Slower than the bars' 800 ms on purpose: the bars snap
 * to a new length, the cluster re-settles as a whole, and the design pins the
 * bubbles at 900 ms.
 */
const BREATH_DURATION_MS = 900;
const BREATHING = Easing.inOut(Easing.cubic);

/**
 * The MOBILE prototype's bubble: an 11% fill and a full-opacity hairline ring.
 * Two layers, not three — there is no glow (dc.html:194).
 *
 * T37: these constants used to be a faithful copy of
 * `packages/client-prototype/src/fx/Positions/ExposureBubbles.module.css` —
 * the **v2 WEB** design port. Fill `0.1`, ring `opacity: 0.5`, a
 * `radial-gradient` glow and labels at 12/15/9px all traced to it exactly, and
 * the comment here claimed they were "the prototype's three stacked layers"
 * while naming a stylesheet belonging to a different client. The result read
 * as heavy glowing discs where the mobile design draws crisp rings. Same
 * defect class as T35 (modelled on the wrong source), one level up: the wrong
 * *product*.
 *
 * Expressed as `opacity` on the element rather than an alpha baked into a
 * colour string, because a theme colour is not guaranteed to be a hex triple —
 * the holo skin stores several tokens as `rgba(...)` already, and the
 * hex-parsing `withAlpha` in `PnlChart` would silently mangle those.
 */
const FILL_ALPHA = 0.11;
const RING_STROKE_WIDTH = 1;

interface ExposureBubbleProps {
  readonly entry: BubbleDrawEntry;
  /** Accent for this bubble's sign — fill, ring and currency label all take
   * it, as in the prototype. */
  readonly color: string;
  readonly amountColor: string;
  /** `null` until the typeface asset resolves; the disc still draws. */
  readonly currencyFont: SkFont | null;
  readonly amountFont: SkFont | null;
  readonly motionEnabled: boolean;
}
