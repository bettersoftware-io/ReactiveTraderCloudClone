import { type JSX, useEffect } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The `handshake` login-wait treatment: a monospace telemetry readout shown
 * while a sign-in or unlock request is in flight — the RN port of the web
 * clients' `HandshakeConsole`.
 *
 * Stateless and timer-free, like its web sibling: it mounts when the request
 * is dispatched and unmounts when the outcome lands, so lines 1 and 3 are true
 * the moment they render and claim nothing about the server we cannot observe.
 * Only `opacity` moves — line 2 fades in once (the web `seal`), the caret
 * blinks (`blink 1s steps(2)`).
 *
 * With motion gated off (reduced motion / power-saver Freeze) every line rests
 * fully legible and the caret holds visible: the wait is longest on exactly
 * the devices that turn motion off, so the resting frame must still inform. */
export function HandshakeConsole(): JSX.Element {
  const styles = useThemedStyles(makeStyles);
  const enabled = useShellMotionEnabled();
  const sealed = useSharedValue(enabled ? 0 : 1);
  const caret = useSharedValue(1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(sealed);
      cancelAnimation(caret);
      sealed.value = 1;
      caret.value = 1;
      return;
    }

    sealed.value = withDelay(
      SEAL_DELAY_MS,
      withTiming(1, { duration: SEAL_MS, easing: Easing.out(Easing.quad) }),
    );
    caret.value = withRepeat(
      withSequence(
        withDelay(CARET_HALF_MS, withTiming(0, { duration: 0 })),
        withDelay(CARET_HALF_MS, withTiming(1, { duration: 0 })),
      ),
      -1,
    );

    return () => {
      cancelAnimation(sealed);
      cancelAnimation(caret);
    };
  }, [enabled, sealed, caret]);

  const sealedStyle = useAnimatedStyle(() => {
    return { opacity: sealed.value };
  });

  const caretStyle = useAnimatedStyle(() => {
    return { opacity: caret.value };
  });

  return (
    <View
      testID="auth-wait-handshake"
      accessible
      accessibilityLiveRegion="polite"
      accessibilityLabel="Secure channel open. Credentials sealed. Awaiting auth grant."
      style={styles.console}
    >
      <Text style={styles.done}>▸ SECURE CHANNEL OPEN</Text>
      <Animated.Text
        testID="auth-wait-handshake-sealed"
        style={[styles.done, sealedStyle]}
      >
        ▸ CREDENTIALS SEALED
      </Animated.Text>
      <View style={styles.activeRow}>
        <Text style={styles.active}>▸ AWAITING AUTH GRANT</Text>
        <Animated.Text
          testID="auth-wait-handshake-caret"
          style={[styles.caret, caretStyle]}
        >
          ▌
        </Animated.Text>
      </View>
    </View>
  );
}

/** The web `seal 0.5s ease-out 0.35s backwards`. */
const SEAL_DELAY_MS = 350;
const SEAL_MS = 500;
/** The web `blink 1s steps(2, start) infinite`: on for half, off for half. */
const CARET_HALF_MS = 500;

interface HandshakeConsoleStyles {
  console: ViewStyle;
  done: TextStyle;
  activeRow: ViewStyle;
  active: TextStyle;
  caret: TextStyle;
}

function makeStyles(t: RnTheme): HandshakeConsoleStyles {
  // HandshakeConsole.module.css — mono 10px, line-height 1.85, tracking
  // 0.09em, in a `--panel-head` box with a 1px `--border-primary` rule.
  const line: TextStyle = {
    ...labelStyle(t, 10, 0.9),
    lineHeight: 18.5,
  };

  return StyleSheet.create({
    // 220 wide: the same column as the credential inputs above it.
    console: {
      width: 220,
      marginTop: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: t.panelHead,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 4,
    },
    done: { ...line, color: t.accentPositive },
    activeRow: { flexDirection: "row", alignItems: "center" },
    active: { ...line, color: t.accentPrimary },
    caret: { ...line, color: t.accentPrimary, marginLeft: 2 },
  });
}
