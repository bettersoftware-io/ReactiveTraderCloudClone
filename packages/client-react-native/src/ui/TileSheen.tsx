import type { JSX } from "react";
import { useId } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { TILE_RADIUS } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The 3d-skin tile gradient as a standalone layer — for `SurfaceCard` and
 * for cards that cannot be one (pressable tiles like `SpotTile`/`MoversRow`).
 * Mount unconditionally as the card's first child: it renders `null` on flat
 * skins (`tileGradient: null`), and on 3d skins draws the full-card gradient
 * clipped to the rounded corners. The host stays the shadow owner (spread
 * `depthStyle` there) and must not clip overflow. Pass `style` only to
 * override the default 12px clip radius to the host's own. */
export function TileSheen({
  head = false,
  style,
}: TileSheenProps): JSX.Element | null {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tile = theme.depth.tileGradient;

  if (tile === null) {
    return null;
  }

  return (
    <View
      style={[styles.sheen, style]}
      testID="surface-sheen"
      pointerEvents="none"
    >
      <TileSurface tile={tile} head={head ? theme.depth.headGradient : null} />
    </View>
  );
}

export interface TileSheenProps {
  /** Overlay the skin's head-strip gradient too — hero cards with a header
   * band (SurfaceCard's tile variant); dense hand-rolled tiles leave it off. */
  readonly head?: boolean;
  /** Clip-radius override (e.g. `{ borderRadius: 10 }` for a 10px host). */
  readonly style?: ViewStyle;
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

interface TileSheenStyles {
  sheen: ViewStyle;
}

function makeStyles(_t: RnTheme): TileSheenStyles {
  return StyleSheet.create({
    // Full-card gradient layer, clipped to the rounded corners. This layer
    // owns the overflow clip, not the shadowed host card.
    sheen: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: TILE_RADIUS,
      overflow: "hidden",
    },
  });
}
