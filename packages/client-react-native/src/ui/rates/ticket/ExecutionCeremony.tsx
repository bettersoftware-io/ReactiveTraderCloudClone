// packages/client-react-native/src/ui/rates/ticket/ExecutionCeremony.tsx
import * as Haptics from "expo-haptics";
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  Pressable,
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
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";

import type { TileExecutionState } from "@rtc/client-core";
import { type Direction, ExecutionStatus } from "@rtc/domain";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { useTheme } from "#/ui/theme/useTheme";

/** Maps the real `TileExecutionState` (the tile's execution machine — no
 * `setTimeout` here, it's all driven by the machine's own started →
 * tooLong → finished|timeout transitions) to the trade-ticket's execution
 * overlays: `ready` renders nothing; `started`/`tooLong` show a busy overlay
 * (spinner ring + scan bar + "EXECUTING {DIRECTION}"); `finished`/`timeout`
 * stamp the result (FILLED/REJECTED/TIMED OUT). Both overlays render as a
 * `Pressable` with a `theme.panel` scrim over the whole tile — opaque-ish
 * (matches the prototype's clean busy state) and, since a `Pressable` is a
 * touch responder with a no-op `onPress`, it also blocks taps from reaching
 * the Notional/Buy-Sell pads underneath while execution is in flight. Fires
 * an `expo-haptics` notification exactly once when a terminal state is newly
 * entered — guarded by a ref tracking the previously-seen terminality, so
 * re-renders that keep the same terminal status don't re-fire. All motion
 * (spinner spin, scan-bar loop, stamp spring) is gated by
 * `useShellMotionEnabled`; every overlay's text renders unconditionally so
 * reduced-motion/Freeze users still see the outcome, just without the
 * animation. */
export function ExecutionCeremony({
  state,
  direction,
}: ExecutionCeremonyProps): JSX.Element | null {
  const wasTerminalRef = useRef(isTerminal(state));

  useEffect(() => {
    const nowTerminal = isTerminal(state);

    if (nowTerminal && !wasTerminalRef.current) {
      const type =
        state.status === "finished" &&
        state.executionStatus === ExecutionStatus.Done
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error;
      void Haptics.notificationAsync(type);
    }

    wasTerminalRef.current = nowTerminal;
  }, [state]);

  switch (state.status) {
    case "ready":
      return null;
    case "started":
    case "tooLong":
      return <BusyOverlay direction={direction} />;
    case "finished":
      return (
        <Stamp
          text={
            state.executionStatus === ExecutionStatus.Done
              ? "FILLED"
              : "REJECTED"
          }
          detail={state.trade?.tradeName ?? state.executionStatus}
          positive={state.executionStatus === ExecutionStatus.Done}
        />
      );
    case "timeout":
      return (
        <Stamp
          text="TIMED OUT"
          detail="No confirmation received"
          positive={false}
        />
      );
  }
}

export interface ExecutionCeremonyProps {
  readonly state: TileExecutionState;
  readonly direction: Direction | null;
}

function isTerminal(state: TileExecutionState): boolean {
  return state.status === "finished" || state.status === "timeout";
}

// Private: the busy overlay (spinner + scan bar + "EXECUTING …"), shown while
// `started`/`tooLong`. Not exported — rtc/component-newspaper permits private
// subcomponents below the lede.
interface BusyOverlayProps {
  readonly direction: Direction | null;
}

function BusyOverlay({ direction }: BusyOverlayProps): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const spin = useSharedValue(0);
  const scan = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(spin);
      cancelAnimation(scan);
      spin.value = 0;
      scan.value = 0;
      return;
    }

    spin.value = withRepeat(
      withTiming(360, { duration: SPIN_MS, easing: Easing.linear }),
      -1,
    );
    scan.value = withRepeat(
      withTiming(1, { duration: SCAN_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );

    return () => {
      cancelAnimation(spin);
      cancelAnimation(scan);
    };
  }, [enabled, spin, scan]);

  const spinStyle = useAnimatedStyle(() => {
    return { transform: [{ rotate: `${spin.value}deg` }] };
  });

  const scanStyle = useAnimatedStyle(() => {
    return { transform: [{ translateX: (scan.value - 0.5) * SCAN_TRACK_W }] };
  });

  return (
    <Pressable
      testID="exec-ceremony-busy"
      style={[styles.overlay, { backgroundColor: t.panel }]}
      onPress={NOOP}
    >
      <Animated.View
        style={[
          styles.spinner,
          { borderColor: t.borderSubtle, borderTopColor: t.accentPrimary },
          spinStyle,
        ]}
      />
      <Text
        style={[
          styles.executing,
          { color: t.accentPrimary, fontFamily: t.fontMono },
        ]}
      >
        {direction === null
          ? "EXECUTING"
          : `EXECUTING ${direction.toUpperCase()}`}
      </Text>
      <View style={[styles.scanTrack, { backgroundColor: t.borderSubtle }]}>
        <Animated.View
          style={[
            styles.scanBar,
            { backgroundColor: t.accentPrimary },
            scanStyle,
          ]}
        />
      </View>
    </Pressable>
  );
}

// Private: the terminal stamp (FILLED / REJECTED / TIMED OUT) + detail line,
// shown for `finished`/`timeout`.
interface StampProps {
  readonly text: string;
  readonly detail: string;
  readonly positive: boolean;
}

function Stamp({ text, detail, positive }: StampProps): JSX.Element {
  const t = useTheme();
  const enabled = useShellMotionEnabled();
  const progress = useSharedValue(enabled ? 0 : 1);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }

    progress.value = withSpring(1, { damping: 11, stiffness: 160 });

    return () => {
      cancelAnimation(progress);
    };
  }, [enabled, progress]);

  const stampStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value,
      transform: [
        { scale: 0.4 + 0.6 * progress.value },
        { rotate: `${(1 - progress.value) * -8}deg` },
      ],
    };
  });

  const color = positive ? t.accentPositive : t.accentNegative;

  return (
    <Pressable
      testID="exec-ceremony-stamp"
      style={[styles.overlay, { backgroundColor: t.panel }]}
      onPress={NOOP}
    >
      <Animated.Text
        style={[
          styles.stamp,
          { color, borderColor: color, fontFamily: t.fontMono },
          stampStyle,
        ]}
      >
        {text}
      </Animated.Text>
      <Text
        style={[
          styles.detail,
          { color: t.textSecondary, fontFamily: t.fontMono },
        ]}
      >
        {detail}
      </Text>
    </Pressable>
  );
}

const SPIN_MS = 800;
const SCAN_MS = 1100;
const SCAN_TRACK_W = 190;

// No-op handler: the overlay is a `Pressable` purely so it intercepts touches
// (blocking pass-through taps to the Notional/Buy-Sell pads beneath it while
// execution is in flight) — it has nothing to do on press.
function NOOP(): void {}

interface ExecutionCeremonyStyles {
  overlay: ViewStyle;
  spinner: ViewStyle;
  executing: TextStyle;
  scanTrack: ViewStyle;
  scanBar: ViewStyle;
  stamp: TextStyle;
  detail: TextStyle;
}

const styles: ExecutionCeremonyStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    gap: 13,
  },
  spinner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
  },
  executing: {
    fontSize: 11,
    letterSpacing: 2.5,
    fontWeight: "600",
  },
  scanTrack: {
    width: SCAN_TRACK_W,
    height: 2,
    borderRadius: 1,
    overflow: "hidden",
  },
  scanBar: {
    width: "30%",
    height: "100%",
    borderRadius: 1,
  },
  stamp: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: 5,
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 7,
  },
  detail: {
    fontSize: 12,
  },
});
