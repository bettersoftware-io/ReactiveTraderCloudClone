// packages/client-react-native/src/ui/shell/hud/RadialCommandDock.tsx
import { BlurView } from "expo-blur";
import { usePathname, useRouter } from "expo-router";
import type { JSX } from "react";
import { useEffect, useId, useState } from "react";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Polygon, Stop } from "react-native-svg";

import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

import { MODULE_ROUTES, resolveActiveModule } from "./moduleRoutes";
import { radialDockLayout } from "./radialDockLayout";
import { useShellMotionEnabled } from "./useShellMotionEnabled";

/** Router-backed radial command dock (prototype .dc.html:465-484). A hex FAB
 * toggles a blurred scrim over which 5 module satellites fan out on the
 * `radialDockLayout` arc, each spring-staggered when motion is enabled and
 * instant under Freeze/reduced-motion. Selecting a satellite drives
 * `expo-router` (deep-link-compatible) and collapses the dock. */
export function RadialCommandDock(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const sats = radialDockLayout(MODULE_ROUTES.length);
  const active = resolveActiveModule(pathname);

  return (
    <View pointerEvents="box-none" style={styles.root}>
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
          </Pressable>
          {MODULE_ROUTES.map((mod, i) => {
            return (
              <Satellite
                key={mod.key}
                module={mod}
                layout={sats[i]}
                active={mod.path === pathname}
                insetBottom={insets.bottom}
                onSelect={() => {
                  router.navigate(mod.path);
                  setOpen(false);
                }}
              />
            );
          })}
        </>
      ) : null}
      <Pressable
        testID="hud-dock-fab"
        accessibilityLabel="Command dock"
        onPress={() => {
          setOpen((v) => {
            return !v;
          });
        }}
        style={[styles.fab, { bottom: 26 + insets.bottom }]}
      >
        <FabHex glyph={open ? "✕" : active.glyph} />
      </Pressable>
    </View>
  );
}

const FAB = 58;
const HEX_POINTS = "29,0 54,14.5 54,43.5 29,58 4,43.5 4,14.5";

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
  readonly insetBottom: number;
  readonly onSelect: () => void;
}

/** One fan-out satellite. Springs from the FAB centre to its resting offset
 * (staggered) when motion is enabled; snaps into place instantly otherwise. */
function Satellite({
  module,
  layout,
  active,
  insetBottom,
  onSelect,
}: SatelliteProps): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const progress = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      progress.value = 1;
      return;
    }

    progress.value = withDelay(
      layout.delayMs,
      withSpring(1, { damping: 12, stiffness: 140 }),
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
      style={[styles.satelliteAnchor, { bottom: 78 + insetBottom }, animStyle]}
      pointerEvents="box-none"
    >
      <Pressable
        testID={`hud-dock-sat-${module.key}`}
        accessibilityLabel={module.label}
        onPress={onSelect}
        style={styles.satelliteHit}
      >
        <View
          style={[
            styles.satelliteIcon,
            active
              ? {
                  borderColor: t.accentPrimary,
                  backgroundColor: t.accentPrimary,
                }
              : null,
          ]}
        >
          <Text
            style={[
              styles.satelliteGlyph,
              active ? { color: t.textOnAccent } : null,
            ]}
          >
            {module.glyph}
          </Text>
        </View>
        <Text
          style={[
            styles.satelliteLabel,
            active ? { color: t.accentPrimary } : null,
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
  fab: ViewStyle;
  satelliteAnchor: ViewStyle;
  satelliteHit: ViewStyle;
  satelliteIcon: ViewStyle;
  satelliteGlyph: TextStyle;
  satelliteLabel: TextStyle;
}

function makeStyles(t: RnTheme): RadialDockStyles {
  return StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      alignItems: "center",
      justifyContent: "flex-end",
    },
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
      borderColor: t.border,
      backgroundColor: t.panel,
    },
    satelliteGlyph: { color: t.textSecondary, fontSize: 19 },
    satelliteLabel: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 8,
      letterSpacing: 1.4,
    },
  });
}
