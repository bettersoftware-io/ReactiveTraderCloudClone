import {
  JetBrainsMono_400Regular,
  JetBrainsMono_700Bold,
} from "@expo-google-fonts/jetbrains-mono";
import { Canvas, useFont } from "@shopify/react-native-skia";
import type { JSX } from "react";
import { useState } from "react";
import type { LayoutChangeEvent } from "react-native";

import type { CurrencyPairPosition } from "@rtc/domain";

import {
  AMOUNT_FONT_SIZE,
  buildBubbleDrawModel,
  currencyFontSize,
} from "#/ui/analytics/bubbleDrawModel";
import { ExposureBubble } from "#/ui/analytics/ExposureBubble";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/**
 * Net exposure per currency, as a cluster of breathing bubbles.
 *
 * WIDTH IS MEASURED, NOT ASSUMED. `computeBubbleLayout` takes a viewport and
 * packs to it. The previous `react-native-svg` version passed a fixed 320 and
 * let a `viewBox` stretch the result; Skia has no viewBox, and packing at the
 * measured width is both simpler and a better fit — the cluster reflows to the
 * real card instead of being scaled into it. `INITIAL_WIDTH` is a plausible
 * card width rather than 0, so the first frame packs sensibly instead of
 * stacking every bubble into a single column.
 *
 * NO PER-BUBBLE `testID`. Skia elements are not React Native views and take
 * none — the `<Circle>`s this replaced could, which is why the old test
 * queried `exposure-bubble-EUR`. Every decision those assertions covered
 * (which currencies appear, their size, sign and labels) now lives in
 * `buildBubbleDrawModel` and is asserted there directly.
 *
 * WHY SKIA TEXT NEEDS A REAL TYPEFACE. `Skia.Font()` with no typeface draws
 * zero glyphs on iOS — silently, with no throw and nothing jest can see. The
 * faces are therefore loaded as assets via `useFont`, in React-land, the same
 * way `bootSceneFonts.ts` does it. Both labels are plain ASCII currency codes
 * and digits, well inside the bundled cmap.
 *
 * The type ramp is JetBrains Mono, not the active skin's `fontDisplay`: a Skia
 * typeface is a bundled asset, so it cannot follow a per-skin token the way an
 * RN `<Text>` fontFamily does without a skin-to-asset map. The boot scenes
 * already make exactly this substitution.
 */
export function ExposureBubbles({
  positions,
}: ExposureBubblesProps): JSX.Element {
  const theme = useTheme();
  const motionEnabled = useShellMotionEnabled();
  const [width, setWidth] = useState(INITIAL_WIDTH);

  // Fixed sizes, so the hook count is constant across renders. A bubble picks
  // its currency face by size (`currencyFontSize`), which is one of two.
  const currencySmall = useFont(JetBrainsMono_700Bold, SMALL_LABEL_SIZE);
  const currencyLarge = useFont(JetBrainsMono_700Bold, LARGE_LABEL_SIZE);
  const amountFont = useFont(JetBrainsMono_400Regular, AMOUNT_FONT_SIZE);

  const { entries, height } = buildBubbleDrawModel(positions, width);

  return (
    <Canvas
      testID="exposure-bubbles"
      style={{ width: "100%", height }}
      onLayout={(event: LayoutChangeEvent): void => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      {entries.map((entry) => {
        const accent =
          entry.sign === "pos" ? theme.accentPositive : theme.accentNegative;

        return (
          <ExposureBubble
            key={entry.currency}
            entry={entry}
            color={accent}
            amountColor={theme.textMuted}
            currencyFont={
              entry.currencyFontSize === SMALL_LABEL_SIZE
                ? currencySmall
                : currencyLarge
            }
            amountFont={amountFont}
            motionEnabled={motionEnabled}
          />
        );
      })}
    </Canvas>
  );
}

/** Width assumed for the first frame, before `onLayout` reports the real one.
 * The old fixed design-space width, which is a reasonable card. */
const INITIAL_WIDTH = 320;

/**
 * The two currency-label sizes, read back from the rule that picks between
 * them rather than restated — a radius of 0 is below the large-label
 * threshold and `LARGE_RADIUS_PROBE` is above it, so these stay correct if the
 * rule's numbers ever move.
 */
const LARGE_RADIUS_PROBE = 1000;
const SMALL_LABEL_SIZE = currencyFontSize(0);
const LARGE_LABEL_SIZE = currencyFontSize(LARGE_RADIUS_PROBE);

interface ExposureBubblesProps {
  positions: readonly CurrencyPairPosition[];
}
