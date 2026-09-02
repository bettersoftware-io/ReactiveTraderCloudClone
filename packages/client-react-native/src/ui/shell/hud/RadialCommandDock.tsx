// packages/client-react-native/src/ui/shell/hud/RadialCommandDock.tsx
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import type { JSX } from "react";
import { useContext, useEffect, useId, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { DockOpenContext } from "./DockOpenContext";
import { DOCK_FAB_SIZE } from "./dockMetrics";
import { MODULE_ROUTES } from "./moduleRoutes";
import { radialDockLayout } from "./radialDockLayout";
import { useActiveModule } from "./useActiveModule";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** Router-backed radial command dock (prototype .dc.html:465-484). A hex FAB
 * toggles a dimmed, blurred scrim over which 5 module satellites fan out on the
 * `radialDockLayout` arc, each spring-staggered when motion is enabled and
 * instant under Freeze/reduced-motion. Selecting a satellite drives
 * `expo-router` (deep-link-compatible) and collapses the dock.
 *
 * `open` starts collapsed unless a `DockOpenContext` pin says otherwise (the
 * visual harness only — see that file); the pin seeds the INITIAL state, so
 * the FAB and the scrim keep toggling it either way. */
export function RadialCommandDock(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const pinnedOpen = useContext(DockOpenContext);
  const [open, setOpen] = useState(pinnedOpen ?? false);
  const router = useRouter();
  const sats = radialDockLayout(MODULE_ROUTES.length);
  const active = useActiveModule();

  return (
    <View pointerEvents="box-none" style={styles.root}>
      {/* Painted BEFORE the overlay: with the dock open the design's scrim
          covers the FAB too — `reference-shots/shell/dock-open.png` shows it
          dimmed under the blur, and closing is the scrim's job. */}
      <Pressable
        testID="hud-dock-fab"
        accessibilityLabel="Command dock"
        onPress={() => {
          setOpen((v) => {
            return !v;
          });
        }}
        style={styles.fab}
      >
        <FabHex glyph={open ? "✕" : active.glyph} />
      </Pressable>
      {open ? (
        <>
          <Pressable
            testID="hud-dock-scrim"
            accessibilityLabel="Close command dock"
            onPress={() => {
              setOpen(false);
            }}
            style={StyleSheet.absoluteFill}
          >
            <BlurView intensity={18} style={StyleSheet.absoluteFill} />
            <View pointerEvents="none" style={styles.scrimTint} />
          </Pressable>
          {MODULE_ROUTES.map((mod, i) => {
            return (
              <Satellite
                key={mod.key}
                module={mod}
                layout={sats[i]}
                active={mod.key === active.key}
                onSelect={() => {
                  router.navigate(mod.path);
                  setOpen(false);
                }}
              />
            );
          })}
        </>
      ) : null}
    </View>
  );
}

/** Re-exported under the local name the layout maths reads with. Declared in
 * `dockMetrics` because `StatusStrip` must reserve exactly this width — see
 * that file for why the FAB stays put and the strip yields instead. */
const FAB: number = DOCK_FAB_SIZE;
const HEX_POINTS = "29,0 54,14.5 54,43.5 29,58 4,43.5 4,14.5";

/** Perceptual settle time of one satellite's fly-out — the design's `kfSatIn`
 * duration (0.42s, dc.html:476). */
const SAT_IN_MS = 420;

/** Underdamped enough to keep `kfSatIn`'s slight overshoot
 * (`cubic-bezier(0.34,1.45,0.45,1)` peaks ~8% past rest) without the wobble. */
const SAT_IN_DAMPING_RATIO = 0.7;

interface FabHexProps {
  readonly glyph: string;
}

/** The hex FAB face — an accent→accent2 gradient hexagon (SVG) with a
 * centred glyph: the active module's glyph when closed, `✕` when open
 * (prototype .dc.html `dockGlyph = dockOpen ? '✕' : cur.g`). */
function FabHex({ glyph }: FabHexProps): JSX.Element {
  const t = useTheme();
  // Per-instance gradient id (useId — static literals trip Biome's
  // useUniqueElementIds). Colons stripped so `url(#…)` parses cleanly.
  const gradientId = useId().replace(/:/g, "");

  return (
    <View style={fabHexStyles.wrap}>
      <Svg width={FAB} height={FAB} viewBox="0 0 58 58">
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.accentPrimary} />
            <Stop offset="1" stopColor={t.accent2} />
          </LinearGradient>
        </Defs>
        <Polygon points={HEX_POINTS} fill={`url(#${gradientId})`} />
      </Svg>
      <Text style={[fabHexStyles.glyph, { color: t.textOnAccent }]}>
        {glyph}
      </Text>
    </View>
  );
}

const fabHexStyles = StyleSheet.create({
  wrap: {
    width: FAB,
    height: FAB,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    position: "absolute",
    fontSize: 21,
    fontWeight: "600",
  },
});

interface SatelliteProps {
  readonly module: (typeof MODULE_ROUTES)[number];
  readonly layout: {
    readonly tx: number;
    readonly ty: number;
    readonly delayMs: number;
  };
  readonly active: boolean;
  readonly onSelect: () => void;
}

/** One fan-out satellite. Springs from the FAB centre to its resting offset
 * (staggered) when motion is enabled; snaps into place instantly otherwise. */
function Satellite({
  module,
  layout,
  active,
  onSelect,
}: SatelliteProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const enabled = useShellMotionEnabled();
  const progress = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      progress.value = 1;
      return;
    }

    // The design's fly-out settles fast: `kfSatIn 0.42s
    // cubic-bezier(0.34,1.45,0.45,1)` (dc.html:42,476) — a ~420 ms glide with
    // a slight overshoot, so with the 45 ms stagger the whole dock is
    // tappable ~600 ms after opening. The physical spring this used until
    // 2026-09-02 ({ damping: 12, stiffness: 140 }) wobbled for well over a
    // second, which read as lag before the user could pick a module.
    progress.value = withDelay(
      layout.delayMs,
      withSpring(1, { duration: SAT_IN_MS, dampingRatio: SAT_IN_DAMPING_RATIO }),
    );
  }, [enabled, layout.delayMs, progress]);

  const animStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: [
        { translateX: layout.tx * progress.value },
        { translateY: layout.ty * progress.value },
        { scale: 0.25 + 0.75 * progress.value },
      ],
    };
  });

  return (
    <Animated.View
      style={[styles.satelliteAnchor, animStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        testID={`hud-dock-sat-${module.key}`}
        accessibilityLabel={module.label}
        onPress={onSelect}
        style={styles.satelliteHit}
      >
        <View
          style={[styles.satelliteIcon, active ? styles.satelliteIconOn : null]}
        >
          <Text
            style={[
              styles.satelliteGlyph,
              active ? styles.satelliteGlyphOn : null,
            ]}
          >
            {module.glyph}
          </Text>
        </View>
        {/* One line, always. The design's label is a flex child that
            OVERFLOWS its 58px column rather than wrapping inside it
            (dc.html:479), which is why `ANALYTICS` reads straight across
            there and wrapped to `ANALYTIC`/`S` here until the label got a
            width of its own. */}
        <Text
          numberOfLines={1}
          style={[
            styles.satelliteLabel,
            active ? styles.satelliteLabelOn : null,
          ]}
        >
          {module.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

interface RadialDockStyles {
  root: ViewStyle;
  scrimTint: ViewStyle;
  fab: ViewStyle;
  satelliteAnchor: ViewStyle;
  satelliteHit: ViewStyle;
  satelliteIcon: ViewStyle;
  satelliteIconOn: ViewStyle;
  satelliteGlyph: TextStyle;
  satelliteGlyphOn: TextStyle;
  satelliteLabel: TextStyle;
  satelliteLabelOn: TextStyle;
}

function makeStyles(t: RnTheme): RadialDockStyles {
  // The design's satellite carries `box-shadow: 0 4px 14px rgba(0,0,0,0.35)`,
  // swapped for `0 0 18px glowC` while ACTIVE on the skins that have a glow
  // (dc.html:2438; `glowC` is null on classic and both terminal faces, where
  // the design keeps the plain drop shadow — so does this). A CSS blur radius
  // of 18 is an iOS `shadowRadius` of ~9, the same halving `AppearanceScreen`
  // documents; `glowC` carries its own alpha, so the opacity stays 1 rather
  // than multiplying it down, and the offset is pinned to zero so it reads as
  // a halo rather than a lift.
  const activeGlow: ViewStyle =
    t.glowC === null
      ? {}
      : {
          shadowColor: t.glowC,
          shadowOpacity: 1,
          shadowRadius: 9,
          shadowOffset: { width: 0, height: 0 },
          elevation: 6,
        };

  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "flex-end",
    },
    // The design's scrim is `background: var(--overlay)` painted OVER a
    // `backdrop-filter: blur(7px)` (dc.html:472) — two layers, and the app
    // shipped only the blur, which left the dimmed screen reading far lighter
    // than the prototype's. Same order as `TradeTicketSheet`'s
    // `TicketBackground`: blur first, tint on top. Measured against
    // `reference-shots/shell/dock-open.png` over the grid band, the tint alone
    // takes the mean from rgb(24, 53, 67) to rgb(5, 16, 23) against the
    // design's rgb(4, 15, 21) — which is why the blur stays at 18 rather than
    // going up: the gap was the missing tint, not the blur radius, and a
    // stronger blur would overshoot. Static: one layer, no per-frame work.
    scrimTint: { ...StyleSheet.absoluteFill, backgroundColor: t.bgOverlay },
    // `bottom: 26` / `78` are the design's own numbers measured from the TRUE
    // bottom (dc.html:465/476) — no safe-area inset added. The design's
    // `safeBot` band below the strip is `StatusStrip`'s own
    // `paddingBottom: insets.bottom` on the same head colour, so the hex
    // straddles the strip/safe-band boundary exactly as the mock frames it;
    // the home indicator drawing over the hex's lower edge is what the
    // reference shots show. Same literal-true-bottom precedent as
    // `BootSequence`'s SKIP pill.
    fab: {
      position: "absolute",
      bottom: 26,
      alignSelf: "center",
      width: FAB,
      height: FAB,
      alignItems: "center",
      justifyContent: "center",
    },
    satelliteAnchor: { position: "absolute", bottom: 78, alignSelf: "center" },
    satelliteHit: {
      width: 58,
      minHeight: 74,
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    satelliteIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      // `border` (dc.html:2438 `bc: active ? T.acc : T.border`), not the
      // subtle one — the ring read half a shade too faint against the
      // prototype.
      borderColor: t.borderPrimary,
      backgroundColor: t.panel,
      shadowColor: "#000",
      shadowOpacity: 0.35,
      shadowRadius: 7,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    satelliteIconOn: {
      borderColor: t.accentPrimary,
      backgroundColor: t.accentPrimary,
      ...activeGlow,
    },
    satelliteGlyph: { color: t.textSecondary, fontSize: 19 },
    satelliteGlyphOn: { color: t.textOnAccent },
    satelliteLabel: {
      color: t.textMuted,
      ...labelStyle(t, 8, 1.4),
      // Wider than the 58px satellite column and centred on it, so the longest
      // label (`ANALYTICS`, ~60pt at this size and tracking) stays on one line
      // — the design's label overflows its column rather than wrapping inside
      // it, and RN `Text` wraps unless given room. 80 clears the longest label
      // with margin, so `numberOfLines={1}` never has anything to ellipsize.
      width: 80,
      textAlign: "center",
    },
    satelliteLabelOn: { color: t.accentPrimary },
  });
}
