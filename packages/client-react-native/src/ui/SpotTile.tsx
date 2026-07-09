import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import type { CurrencyPair } from "@rtc/domain";
import { PriceMovementType } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { splitPrice } from "#/ui/formatPrice";
import { TradeTicket } from "#/ui/TradeTicket";
import { depthStyle } from "#/ui/theme/depthStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

const ARROW: Record<PriceMovementType, string> = {
  [PriceMovementType.UP]: "▲",
  [PriceMovementType.DOWN]: "▼",
  [PriceMovementType.NONE]: "▬",
};

/** Height (px) of the tile head strip a `headGradient` covers — content top
 * padding + the symbol row, down to the divider. */
const HEAD_HEIGHT = 45;

interface TileSurfaceProps {
  tile: readonly [string, string];
  head: readonly [string, string] | null;
}

/** The 3d tile surface, drawn with the already-bundled react-native-svg — a
 * faithful RN port of the web design's `--tile` gradient (lighter top → darker
 * bottom) across the whole face so the tile reads as a lit, raised card. Skins
 * whose `--panel-head` reads as a subtle tonal band (Terminal 3D) also overlay
 * it on the head strip; skins where it would clash (Holo 3D) pass `head: null`.
 * Clipped to the card's rounded corners by its wrapper (`styles.sheen`) and
 * non-interactive. Flat skins pass no gradient and never render this. */
function TileSurface({ tile, head }: TileSurfaceProps): JSX.Element {
  return (
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id="tileFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={tile[0]} stopOpacity={1} />
          <Stop offset="1" stopColor={tile[1]} stopOpacity={1} />
        </LinearGradient>
        {head ? (
          <LinearGradient id="tileHead" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={head[0]} stopOpacity={1} />
            <Stop offset="1" stopColor={head[1]} stopOpacity={1} />
          </LinearGradient>
        ) : null}
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#tileFill)" />
      {head ? (
        <Rect
          x="0"
          y="0"
          width="100%"
          height={HEAD_HEIGHT}
          fill="url(#tileHead)"
        />
      ) : null}
    </Svg>
  );
}

export function SpotTile({ pair }: SpotTileProps): JSX.Element {
  const { usePrice } = useViewModel();
  const price = usePrice(pair);
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [ticketVisible, setTicketVisible] = useState(false);

  const label = `${pair.base} / ${pair.terms}`;
  const surface = theme.depth.tileGradient ? (
    <View testID="tile-sheen" style={styles.sheen} pointerEvents="none">
      <TileSurface
        tile={theme.depth.tileGradient}
        head={theme.depth.headGradient}
      />
    </View>
  ) : null;

  let body: JSX.Element;

  if (price === null) {
    body = (
      <View style={styles.card}>
        {surface}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.symbol}>{label}</Text>
          </View>
          <Text style={styles.loading}>Loading…</Text>
        </View>
      </View>
    );
  } else {
    const ask = splitPrice(price.ask, pair.ratePrecision, pair.pipsPosition);
    body = (
      <View style={styles.card}>
        {surface}
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.symbol}>{label}</Text>
            <Text style={arrowStyle(styles, price.movementType)}>
              {ARROW[price.movementType]}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.priceRow}>
            <Text style={styles.big}>{ask.prefix}</Text>
            <Text style={pipsStyle(styles, price.movementType)}>
              {ask.pips}
            </Text>
            <Text style={styles.big}>{ask.fractional}</Text>
          </View>
          <View style={styles.footerRow}>
            <View style={styles.sideGroup}>
              <Text style={styles.sideLabel}>BID</Text>
              <Text style={styles.side}>
                {price.bid.toFixed(pair.ratePrecision)}
              </Text>
            </View>
            <Text style={styles.spread}>{price.spread}</Text>
            <View style={styles.sideGroup}>
              <Text style={styles.sideLabel}>ASK</Text>
              <Text style={styles.side}>
                {price.ask.toFixed(pair.ratePrecision)}
              </Text>
            </View>
          </View>
          <Text style={styles.hidden} testID="spot-tile-movement">
            {price.movementType}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Pressable
        testID="spot-tile"
        style={({ pressed }: PressableStateCallbackType): ViewStyle => {
          return pressed ? styles.pressed : styles.rest;
        }}
        onPress={() => {
          setTicketVisible(true);
        }}
      >
        {body}
      </Pressable>
      {ticketVisible ? (
        <TradeTicket
          pair={pair}
          onClose={() => {
            setTicketVisible(false);
          }}
        />
      ) : null}
    </>
  );
}

interface SpotTileProps {
  pair: CurrencyPair;
}

/** Narrow style for the movement-coloured text — `color` stays a plain
 * `string` so it can be read directly in tests via `.props.style.color`. */
interface MovementTextStyle {
  color: string;
  fontFamily: string | undefined;
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
}

function pipsStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.pipsUp;
  if (movement === PriceMovementType.DOWN) return styles.pipsDown;
  return styles.pipsNone;
}

function arrowStyle(
  styles: ReturnType<typeof makeStyles>,
  movement: PriceMovementType,
): MovementTextStyle {
  if (movement === PriceMovementType.UP) return styles.arrowUp;
  if (movement === PriceMovementType.DOWN) return styles.arrowDown;
  return styles.arrowNone;
}

interface SpotTileStyles {
  rest: ViewStyle;
  pressed: ViewStyle;
  card: ViewStyle;
  sheen: ViewStyle;
  content: ViewStyle;
  headerRow: ViewStyle;
  symbol: TextStyle;
  divider: ViewStyle;
  priceRow: ViewStyle;
  big: TextStyle;
  footerRow: ViewStyle;
  sideGroup: ViewStyle;
  sideLabel: TextStyle;
  side: TextStyle;
  spread: TextStyle;
  loading: TextStyle;
  hidden: TextStyle;
  pipsUp: MovementTextStyle;
  pipsDown: MovementTextStyle;
  pipsNone: MovementTextStyle;
  arrowUp: MovementTextStyle;
  arrowDown: MovementTextStyle;
  arrowNone: MovementTextStyle;
}

function makeStyles(t: RnTheme): SpotTileStyles {
  const pipsBase = { fontSize: 22, fontFamily: t.fontMono } as const;
  const arrowBase = { fontSize: 13, fontFamily: t.fontDisplay } as const;
  // Pressed lift: on skins with a glow, swap the shadow colour to the glow and
  // raise it; flat skins (no glow) fall back to a subtle opacity dim.
  const pressed: ViewStyle = t.depth.glow
    ? {
        ...depthStyle(t.depth),
        shadowColor: t.depth.glow,
        shadowOpacity: 0.9,
        shadowRadius: 18,
      }
    : { opacity: 0.9 };
  return StyleSheet.create({
    rest: {},
    pressed,
    // Matches the web `.tile`: 5px radius, 1px border-primary, --tile gradient
    // (drawn by TileSurface), --tile-shadow (drop via depthStyle + the inset
    // top highlight below).
    card: {
      flex: 1,
      marginVertical: 6,
      borderRadius: 5,
      backgroundColor: t.bgTile,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      // Soft elevation for 3d skins; {} for flat.
      ...depthStyle(t.depth),
      // 1px inset top highlight (the web --tile-shadow inset layer); 3d only.
      borderTopColor: t.depth.topHighlight ?? t.borderPrimary,
    },
    // Full-card layer that carries the --tile gradient, clipped to the card's
    // rounded corners. Sits behind `content`; the card keeps its shadow (this
    // layer owns the overflow clip, not the shadowed card).
    sheen: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 5,
      overflow: "hidden",
    },
    content: { paddingHorizontal: 14, paddingTop: 13, paddingBottom: 11 },
    headerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    symbol: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      letterSpacing: 0.5,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.borderSubtle,
      marginVertical: 10,
    },
    priceRow: { flexDirection: "row", alignItems: "flex-end" },
    big: { fontSize: 18, color: t.textSecondary, fontFamily: t.fontMono },
    footerRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 10,
    },
    sideGroup: { flexDirection: "row", alignItems: "center" },
    sideLabel: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
      marginRight: 4,
    },
    side: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    spread: {
      fontSize: 11,
      color: t.textMuted,
      fontFamily: t.fontMono,
      backgroundColor: t.chip,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      overflow: "hidden",
    },
    loading: { fontSize: 12, color: t.textMuted, marginTop: 10 },
    hidden: { display: "none" },
    pipsUp: { ...pipsBase, color: t.accentPositive },
    pipsDown: { ...pipsBase, color: t.accentNegative },
    pipsNone: { ...pipsBase, color: t.textPrimary },
    arrowUp: { ...arrowBase, color: t.accentPositive },
    arrowDown: { ...arrowBase, color: t.accentNegative },
    arrowNone: { ...arrowBase, color: t.textMuted },
  });
}
