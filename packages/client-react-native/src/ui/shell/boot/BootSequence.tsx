import type { JSX } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  useWindowDimensions,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useViewModel } from "@rtc/react-bindings";

import { BootCanvas } from "#/ui/shell/boot/BootCanvas";
import { BootEmblem } from "#/ui/shell/boot/BootEmblem";
import {
  bootLogLine,
  bootSequenceLine,
  textTopForBaseline,
} from "#/ui/shell/boot/bootChrome";
import { hasBootScene } from "#/ui/shell/boot/bootScene";
import { useBootMotionEnabled } from "#/ui/shell/boot/useBootMotionEnabled";
import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Boot splash content: Skia canvas + emblem + the bottom chrome block
 * (wordmark, SEQ line, rail, log line) + the SKIP pill. All timing (progress,
 * done, variant) comes from the reused BootSequenceMachine via
 * `useBootSequence(onDone)`; this leaf only paints it and dispatches `skip`.
 * `onDone` is passed straight through to the machine (which invokes it when
 * the ramp completes or SKIP is pressed) — BootSequence never calls it
 * directly.
 *
 * `BootCanvas` mounts full-bleed BEHIND the chrome below (it renders first,
 * so later siblings stack on top) and is itself the motion/variant gate —
 * it returns `null` under reduced motion, Freeze power-saver, or for a
 * variant with no registered scene. `BootEmblem`, the static SVG stand-in, is
 * the mirror image: shown only when the canvas is NOT (`!motionEnabled ||
 * !hasBootScene(...)`), so the two never overlap on screen. It is also the one
 * chrome piece still laid out by the root's centring — everything else is
 * absolutely positioned against the prototype's fractions.
 *
 * LAYOUT IS THE PROTOTYPE'S, IN FRACTIONS OF SCREEN HEIGHT (dc.html
 * `_paintBootChrome`, lines 1618-1635): the wordmark's BASELINE at 85.5% of
 * the height, the SEQ line 15px under it, the rail's top at 89.5%, the log
 * line 17px under the rail's top. The prototype paints those onto the canvas
 * by baseline, so each text box here is placed through
 * `textTopForBaseline` rather than by stacking with margins — a column would
 * make every position depend on the one above it, and the two spacings the
 * design pins (rail-to-log, wordmark-to-SEQ) are baseline-to-baseline.
 *
 * All of it is static text: no per-frame React work, per `docs/performance.md`
 * — the block re-renders only when the machine's progress percentage ticks
 * (which moves the rail fill and, six times per boot, the log line).
 */
export function BootSequence({ onDone }: BootSequenceProps): JSX.Element {
  const { useBootSequence } = useViewModel();
  const { state, skip } = useBootSequence(onDone);
  const styles = useThemedStyles(makeStyles);
  const motionEnabled = useBootMotionEnabled();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const showEmblem = !motionEnabled || !hasBootScene(state.variant);
  const wordmarkBaseline = height * WORDMARK_BASELINE_FRACTION;
  const railTop = height * RAIL_TOP_FRACTION;
  const railWidth = Math.min(width * RAIL_WIDTH_FRACTION, RAIL_MAX_WIDTH);

  return (
    <View testID="boot-sequence" style={styles.root}>
      <BootCanvas variant={state.variant} />
      {showEmblem ? <BootEmblem /> : null}
      <Text
        testID="boot-wordmark"
        style={[
          styles.wordmark,
          {
            top: textTopForBaseline(
              wordmarkBaseline,
              WORDMARK_FONT_SIZE,
              WORDMARK_LINE_HEIGHT,
            ),
          },
        ]}
      >
        REACTIVE TRADER
      </Text>
      <Text
        testID="boot-variant"
        style={[
          styles.sequence,
          {
            top: textTopForBaseline(
              wordmarkBaseline + SEQUENCE_BASELINE_DROP,
              CHROME_FONT_SIZE,
              CHROME_LINE_HEIGHT,
            ),
          },
        ]}
      >
        {bootSequenceLine(state.variant)}
      </Text>
      <View style={[styles.railRow, { top: railTop }]}>
        <View
          testID="boot-progress"
          style={[styles.rail, { width: railWidth }]}
        >
          <View style={styles.railTrack} />
          <View style={[styles.railFill, { width: `${state.progress}%` }]} />
        </View>
      </View>
      <Text
        testID="boot-log"
        style={[
          styles.log,
          {
            top: textTopForBaseline(
              railTop + LOG_BASELINE_DROP,
              CHROME_FONT_SIZE,
              CHROME_LINE_HEIGHT,
            ),
          },
        ]}
      >
        {bootLogLine(state.progress)}
      </Text>
      <Pressable
        testID="boot-skip"
        style={[styles.skip, { bottom: SKIP_BOTTOM + insets.bottom }]}
        onPress={() => {
          skip();
        }}
      >
        <Text style={styles.skipLabel}>SKIP ▸</Text>
      </Pressable>
    </View>
  );
}

interface BootSequenceProps {
  onDone: () => void;
}

/** Wordmark baseline, as a fraction of screen height (dc.html `H * 0.855`). */
const WORDMARK_BASELINE_FRACTION = 0.855;
/** Rail top edge (dc.html `H * 0.895`). */
const RAIL_TOP_FRACTION = 0.895;
/** SEQ line baseline, below the wordmark's (dc.html `H * 0.855 + 15`). */
const SEQUENCE_BASELINE_DROP = 15;
/** Log line baseline, below the RAIL'S TOP — not its bottom (dc.html
 * `H * 0.895 + 17`). */
const LOG_BASELINE_DROP = 17;

const WORDMARK_FONT_SIZE = 15;
const WORDMARK_LINE_HEIGHT = 20;
/** Both mono lines: dc.html's `400 8px 'JetBrains Mono'`. */
const CHROME_FONT_SIZE = 8;
const CHROME_LINE_HEIGHT = 11;

const RAIL_WIDTH_FRACTION = 0.6;
const RAIL_MAX_WIDTH = 230;
const RAIL_HEIGHT = 2;
/** dc.html paints the track at `globalAlpha` 0.25 and the log line at 0.75,
 * both in the SAME accent as the fill. `opacity` is RN's `globalAlpha`, and
 * unlike an `${hex}40` suffix it survives a theme token that is `rgba(…)`
 * rather than a 7-char hex — three of this app's token sets already are. */
const RAIL_TRACK_OPACITY = 0.25;
const LOG_OPACITY = 0.75;

/** dc.html:620's `bottom:26px`, plus the device's bottom inset — the
 * prototype runs in a browser frame with no home indicator to clear. */
const SKIP_BOTTOM = 26;
const SKIP_RIGHT = 16;

interface BootSequenceStyles {
  root: ViewStyle;
  wordmark: TextStyle;
  sequence: TextStyle;
  railRow: ViewStyle;
  rail: ViewStyle;
  railTrack: ViewStyle;
  railFill: ViewStyle;
  log: TextStyle;
  skip: ViewStyle;
  skipLabel: TextStyle;
}

function makeStyles(t: RnTheme): BootSequenceStyles {
  return StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bgPrimary,
    },
    wordmark: {
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
      color: t.textPrimary,
      // Orbitron's bundled 700 cut. NEVER paired with `fontWeight`: a bundled
      // family registered from one file has no sibling weights, so iOS would
      // synthesise a smeared faux-bold instead.
      fontFamily: FONT_ORBITRON_WORDMARK,
      fontSize: WORDMARK_FONT_SIZE,
      lineHeight: WORDMARK_LINE_HEIGHT,
    },
    sequence: {
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
      color: t.accentPrimary,
      fontFamily: t.fontMono,
      fontSize: CHROME_FONT_SIZE,
      lineHeight: CHROME_LINE_HEIGHT,
    },
    railRow: { position: "absolute", left: 0, right: 0, alignItems: "center" },
    rail: { height: RAIL_HEIGHT },
    railTrack: {
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: t.accentPrimary,
      opacity: RAIL_TRACK_OPACITY,
    },
    railFill: {
      position: "absolute",
      left: 0,
      top: 0,
      height: RAIL_HEIGHT,
      backgroundColor: t.accentPrimary,
    },
    log: {
      position: "absolute",
      left: 0,
      right: 0,
      textAlign: "center",
      color: t.accentPrimary,
      opacity: LOG_OPACITY,
      fontFamily: t.fontMono,
      fontSize: CHROME_FONT_SIZE,
      lineHeight: CHROME_LINE_HEIGHT,
    },
    skip: {
      position: "absolute",
      right: SKIP_RIGHT,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
    },
    skipLabel: {
      color: t.textSecondary,
      fontFamily: t.fontMono,
      fontSize: 9,
      letterSpacing: 2.5,
    },
  });
}
