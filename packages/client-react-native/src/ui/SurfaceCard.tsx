import type { JSX, ReactNode } from "react";
import { useId } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The shared raised-surface card: the web `.tile` chrome (5px radius, 1px
 * border-primary, tonal `bgTile`, `--tile-shadow` drop via depthStyle + the
 * inset top highlight) extracted from SpotTile. Content padding/layout is
 * supplied by the caller via `style` and children; this owns chrome only. The
 * card deliberately does NOT clip overflow (that would clip the iOS shadow);
 * only the sheen sublayer clips. */
export function SurfaceCard({
  variant = "panel",
  style,
  testID,
  children,
}: SurfaceCardProps): JSX.Element {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tile = theme.depth.tileGradient;
  return (
    <View style={[styles.card, style]} testID={testID}>
      {variant === "tile" && tile !== null ? (
        <View style={styles.sheen} testID="surface-sheen" pointerEvents="none">
          <TileSurface tile={tile} head={theme.depth.headGradient} />
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** Height (px) of the tile head strip a `headGradient` covers. */
const HEAD_HEIGHT = 45;

interface TileSurfaceProps {
  tile: readonly [string, string];
  head: readonly [string, string] | null;
}

/** The 3d surface, drawn with the already-bundled react-native-svg — a
 * faithful RN port of the web `--tile` gradient (lighter top → darker
 * bottom) so the card reads as a lit, raised surface. Skins whose
 * `--panel-head` reads as a subtle tonal band (Terminal 3D) also overlay
 * it on the head strip; skins where it would clash (Holo 3D) pass
 * `head: null`. Clipped to the card's rounded corners by its wrapper and
 * non-interactive. */
function TileSurface({ tile, head }: TileSurfaceProps): JSX.Element {
  // Per-instance gradient ids (useId — static literals trip Biome's
  // useUniqueElementIds). Colons stripped so `url(#…)` parses cleanly.
  const gid = useId().replace(/:/g, "");
  const tileId = `${gid}-tile`;
  const headId = `${gid}-head`;
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id={tileId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tile[0]} stopOpacity={1} />
          <Stop offset="1" stopColor={tile[1]} stopOpacity={1} />
        </LinearGradient>
        {head ? (
          <LinearGradient id={headId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={head[0]} stopOpacity={1} />
            <Stop offset="1" stopColor={head[1]} stopOpacity={1} />
          </LinearGradient>
        ) : null}
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${tileId})`} />
      {head ? (
        <Rect
          x="0"
          y="0"
          width="100%"
          height={HEAD_HEIGHT}
          fill={`url(#${headId})`}
        />
      ) : null}
    </Svg>
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
  sheen: ViewStyle;
}

function makeStyles(t: RnTheme): SurfaceCardStyles {
  return StyleSheet.create({
    // Matches web `.tile`: 5px radius, 1px border-primary, tonal bgTile,
    // --tile-shadow drop (depthStyle, {} on flat) + inset top highlight (3d).
    // No `overflow: hidden` here — that would clip the drop shadow.
    card: {
      borderRadius: 5,
      backgroundColor: t.bgTile,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      ...depthStyle(t.depth),
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    // Full-card gradient layer, clipped to the rounded corners. This layer owns
    // the overflow clip, not the shadowed card.
    sheen: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 5,
      overflow: "hidden",
    },
  });
}
