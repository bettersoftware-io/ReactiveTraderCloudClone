import type { JSX } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import type { CurrencyPair } from "@rtc/domain";

import { fxColumnCount } from "#/ui/fxColumns";
import { SpotTile } from "#/ui/rates/SpotTile";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { SPACING } from "#/ui/theme/spacing";

/** The animated FX spot-tile grid: a responsive `flexWrap` layout (1 column on
 * phones, 2 on tablet/landscape, via `fxColumnCount`) where each cell glides
 * to its new slot on filter changes. The FLIP itself is native Reanimated
 * `Layout` — not `@rtc/motion-core`'s `flipDeltas` — computed from the
 * `layout`/`entering`/`exiting` props on each cell's `Animated.View`; all
 * three are stripped to `undefined` when `useShellMotionEnabled()` is false,
 * yielding a static reflow (no glide, no fade). */
export function SpotTileGrid({
  pairs,
  onOpenTicket,
}: SpotTileGridProps): JSX.Element {
  const { width } = useWindowDimensions();
  const columns = fxColumnCount(width);
  const motionEnabled = useShellMotionEnabled();
  const cellWidth: ViewStyle = { width: `${100 / columns}%` };

  return (
    <View style={styles.grid}>
      {pairs.map((pair) => {
        return (
          <Animated.View
            key={pair.symbol}
            style={cellWidth}
            layout={motionEnabled ? LinearTransition.duration(320) : undefined}
            entering={
              motionEnabled ? FadeIn.duration(300).delay(60) : undefined
            }
            exiting={motionEnabled ? FadeOut.duration(220) : undefined}
          >
            <View style={styles.cell}>
              <SpotTile pair={pair} onOpenTicket={onOpenTicket} />
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}

interface SpotTileGridProps {
  pairs: readonly CurrencyPair[];
  onOpenTicket: (pair: CurrencyPair) => void;
}

interface SpotTileGridStyles {
  grid: ViewStyle;
  cell: ViewStyle;
}

const styles: SpotTileGridStyles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md - SPACING.xs,
    paddingVertical: SPACING.sm,
  },
  cell: { padding: SPACING.xs },
});
