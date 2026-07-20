import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useViewModel } from "@rtc/react-bindings";

import { BootCanvas } from "#/ui/shell/boot/BootCanvas";
import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import { hasBootScene } from "#/ui/shell/boot/bootScene";
import { useBootMotionEnabled } from "#/ui/shell/boot/useBootMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Boot splash content: Skia canvas + emblem + wordmark + progress ramp +
 * SKIP. All timing (progress, done, variant) comes from the reused
 * BootSequenceMachine via `useBootSequence(onDone)`; this leaf only paints it
 * and dispatches `skip`. `onDone` is passed straight through to the machine
 * (which invokes it when the ramp completes or SKIP is pressed) —
 * BootSequence never calls it directly.
 *
 * `BootCanvas` mounts full-bleed BEHIND the chrome below (it renders first,
 * so later siblings stack on top) and is itself the motion/variant gate —
 * it returns `null` under reduced motion, Freeze power-saver, or for a
 * variant with no registered scene. `BootEmblem`, the static SVG stand-in, is
 * the mirror image: shown only when the canvas is NOT (`!motionEnabled ||
 * !hasBootScene(...)`), so the two never overlap on screen. */
export function BootSequence({ onDone }: BootSequenceProps): JSX.Element {
  const { useBootSequence } = useViewModel();
  const { state, skip } = useBootSequence(onDone);
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useBootMotionEnabled();
  const showEmblem = !motionEnabled || !hasBootScene(state.variant);

  return (
    <View testID="boot-sequence" style={styles.root}>
      <BootCanvas variant={state.variant} />
      {showEmblem ? <BootEmblem /> : null}
      <Text testID="boot-wordmark" style={styles.wordmark}>
        REACTIVE TRADER
      </Text>
      <Text style={styles.subtitle}>
        TACTICAL TRADING OPERATING SYSTEM · v4.0
      </Text>
      <Text testID="boot-variant" style={styles.variant}>
        SEQUENCE · {state.variant.toUpperCase()}
      </Text>
      <View testID="boot-progress" style={styles.progressRow}>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${state.progress}%` }]} />
        </View>
        <Text testID="boot-pct" style={styles.pct}>
          {state.progress}%
        </Text>
      </View>
      <Pressable
        testID="boot-skip"
        onPress={() => {
          skip();
        }}
      >
        <Text style={styles.skip}>SKIP ▸</Text>
      </Pressable>
    </View>
  );
}

interface BootSequenceProps {
  onDone: () => void;
}

interface BootSequenceStyles {
  root: ViewStyle;
  wordmark: TextStyle;
  subtitle: TextStyle;
  variant: TextStyle;
  progressRow: ViewStyle;
  track: ViewStyle;
  fill: ViewStyle;
  pct: TextStyle;
  skip: TextStyle;
}

function makeStyles(t: RnTheme): BootSequenceStyles {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
      backgroundColor: t.bgPrimary,
    },
    wordmark: {
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 26,
      letterSpacing: 4,
    },
    subtitle: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 1,
    },
    variant: {
      color: t.accent2,
      fontFamily: t.fontMono,
      fontSize: 11,
      letterSpacing: 2,
    },
    progressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      width: 220,
    },
    track: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.borderSubtle,
      overflow: "hidden",
    },
    fill: { height: 4, borderRadius: 2, backgroundColor: t.accentPrimary },
    pct: {
      color: t.textMuted,
      fontFamily: t.fontMono,
      fontSize: 11,
      width: 40,
      textAlign: "right",
    },
    skip: {
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
      fontSize: 13,
      letterSpacing: 1,
      marginTop: 8,
    },
  });
}
