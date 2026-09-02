import type { JSX, ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

import { TileSheen } from "#/ui/TileSheen";
import { depthStyle } from "#/ui/theme/depthStyle";
import { TILE_RADIUS } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The shared raised-surface card: the mobile-v1 tile chrome (12px radius —
 * the web `.tile` is 5px — 1px border-primary, tonal `bgTile`, `--tile-shadow`
 * drop via depthStyle + the inset top highlight) extracted from SpotTile. Content padding/layout is
 * supplied by the caller via `style` and children; this owns chrome only. The
 * card deliberately does NOT clip overflow (that would clip the iOS shadow);
 * only the sheen sublayer clips. */
export function SurfaceCard({
  variant = "panel",
  style,
  testID,
  children,
}: SurfaceCardProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.card, style]} testID={testID}>
      {variant === "tile" ? <TileSheen head /> : null}
      {children}
    </View>
  );
}

export interface SurfaceCardProps {
  /** "tile" adds the SVG gradient sheen (hero cards, low cardinality). "panel"
   * (default) is flat-tonal + border + top-highlight (dense/repeating). */
  readonly variant?: "tile" | "panel";
  readonly style?: ViewStyle;
  readonly testID?: string;
  readonly children: ReactNode;
}

interface SurfaceCardStyles {
  card: ViewStyle;
}

function makeStyles(t: RnTheme): SurfaceCardStyles {
  return StyleSheet.create({
    // The mobile-v1 tile (dc.html:363, 382, 165-191, 222, 292): 12px radius,
    // 1px border-primary, tonal bgTile, --tile-shadow drop (depthStyle, {} on
    // flat) + inset top highlight (3d). No `overflow: hidden` here — that
    // would clip the drop shadow.
    card: {
      borderRadius: TILE_RADIUS,
      backgroundColor: t.bgTile,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      ...depthStyle(t.depth),
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
  });
}
