import * as Haptics from "expo-haptics";
import type { JSX } from "react";
import { useEffect, useId, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Svg, { Defs, Ellipse, RadialGradient, Stop } from "react-native-svg";

import { useViewModel } from "@rtc/react-bindings";

import { HoldToUnlockRing } from "#/ui/shell/lock/HoldToUnlockRing";
import { LockEmblem } from "#/ui/shell/lock/LockEmblem";
import { useHoldToUnlock } from "#/ui/shell/lock/useHoldToUnlock";
import { FONT_ORBITRON_WORDMARK } from "#/ui/theme/fontFamilies";
import { labelStyle } from "#/ui/theme/labelStyle";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Full-screen session-lock overlay. Renders nothing unless the session is
 * locked; while locked it covers the whole shell — an absolute-fill <View>
 * (NOT an RN Modal: Modal-via-press segfaults under x86 jest) — and shows the
 * operator identity plus a password-gated hold-to-unlock ring that
 * re-authenticates (unlock) against the real credentials seam. The password
 * field still gates authentication — the ring only replaces the tap-trigger
 * (the old AUTHENTICATE button) with a hold-gesture trigger; a plain tap on
 * the ring keeps submitting instantly (accessibility + automation fallback).
 * Dumb component: all state arrives through the reused `useAuth` seam; the
 * typed password lives in local component state only and is never logged.
 * Wrapped in `KeyboardAvoidingView` + a
 * `ScrollView` with `keyboardShouldPersistTaps="handled"` so the soft
 * keyboard never strands the ring on a real device. Fires an
 * `expo-haptics` success notification exactly once when `state.locked`
 * newly transitions true→false — the `ExecutionCeremony` once-guard idiom,
 * a ref updated unconditionally every effect run so it re-arms for a later
 * lock/unlock cycle.
 *
 * The ring is both a `GestureDetector` (LongPress) and a `Pressable` (tap
 * fallback) on one hit target. A completed hold and the Pressable's own tap
 * could in principle both fire `unlock(password)` for one real-device
 * interaction — a duplicate call, but with the SAME real password, so not a
 * security bypass and harmless to authentication. We deliberately do NOT add
 * an app-level submit guard here: every guard scheme that distinguishes a
 * one-interaction double-fire from a genuine retry depends on RN
 * Pressable ↔ gesture-handler touch arbitration, which can't be verified off
 * a device — a prior guard keyed on `state.error` silently stranded the
 * ordinary relock-after-success retry (`null` error → `null` error → never
 * re-armed).
 *
 * On-device status (Phase 6a residual sweep): the ring's REAL on-device
 * blocker was never the double-fire — it was a worklet "remote function"
 * crash in `HoldToUnlockRing`'s `useAnimatedProps` (it called `motion-core`'s
 * `ringDashOffset`, which lacked the `"worklet"` directive), so the ring
 * redboxed the moment this screen mounted on hardware. That is now fixed
 * (motion-core `countdownRing.ts`) and the ring renders + fills correctly on
 * the simulator (see the `lock/hold` visual golden — which until 2026-08-01
 * did NOT show that: its fixture mounted the ring uncentred over an unpainted
 * root, so the dynamic island covered all but a sliver of the arc and the
 * golden asserted almost nothing. The citation was right about the fix and
 * wrong about the evidence). The harmless double-fire
 * remains a theoretical edge case; we keep the a11y-preserving dual mechanism
 * (the `Pressable` carries the VoiceOver "activate" action a raw
 * `Gesture.Tap` would lose). `Gesture.Race(LongPress, Tap)` stays a documented
 * future option only if a real, non-harmless double-fire is ever observed —
 * not worth the a11y regression pre-emptively. */
export function LockScreen(): JSX.Element | null {
  const { useAuth } = useViewModel();
  const { state, unlock } = useAuth();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [password, setPassword] = useState("");
  const glowId = useId().replace(/:/g, "");
  const wasLockedRef = useRef(state.locked);

  function submit(): void {
    unlock(password);
  }

  const { gesture, progress } = useHoldToUnlock({ onComplete: submit });

  useEffect(() => {
    if (wasLockedRef.current && !state.locked) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    wasLockedRef.current = state.locked;
  }, [state.locked]);

  if (!state.locked || !state.user) {
    return null;
  }

  const { user } = state;

  return (
    <KeyboardAvoidingView
      testID="lock-screen"
      style={styles.overlay}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient
            id={glowId}
            gradientUnits="userSpaceOnUse"
            cx={GLOW_CX}
            cy={GLOW_CY}
            rx={GLOW_RX}
            ry={GLOW_RY}
          >
            <Stop
              offset="0"
              stopColor={theme.accentPrimary}
              stopOpacity={GLOW_OPACITY}
            />
            <Stop offset="1" stopColor={theme.accentPrimary} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={GLOW_CX}
          cy={GLOW_CY}
          rx={GLOW_RX}
          ry={GLOW_RY}
          fill={`url(#${glowId})`}
        />
      </Svg>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <LockEmblem />

        <Text testID="lock-title" style={styles.title}>
          SESSION LOCKED
        </Text>
        <Text testID="lock-desk" style={styles.desk}>
          {`${user.id} · ${user.desk}`.toUpperCase()}
        </Text>

        <TextInput
          testID="lock-password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="PASSWORD"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
        />

        {state.error !== null ? (
          <Text testID="lock-error" style={styles.error}>
            {state.error}
          </Text>
        ) : null}

        <HoldToUnlockRing
          gesture={gesture}
          progress={progress}
          onPress={submit}
          label={state.unlocking ? "AUTHENTICATING…" : "HOLD TO UNLOCK"}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface LockScreenStyles {
  overlay: ViewStyle;
  scroll: ViewStyle;
  scrollContent: ViewStyle;
  title: TextStyle;
  desk: TextStyle;
  input: TextStyle;
  placeholder: TextStyle;
  error: TextStyle;
}

/** The prototype's lock ring sits 40px under the desk line; the password
 * field this client keeps takes that gap, with the ring `RING_GAP` below. */
const RING_GAP = 22;

/** The prototype's backdrop, `radial-gradient(500px 320px at 50% 30%,
 * acc 9%, transparent)`, in percent of the screen: on its 390×844 frame
 * that ellipse is ~64% wide and ~19% tall. `userSpaceOnUse` with the SAME
 * numbers as the ellipse it fills is deliberate — react-native-svg resolves
 * an objectBoundingBox `rx`/`ry` against the viewport, so the gradient
 * would outsize the ellipse and leave a hard edge. */
const GLOW_CX = 50;
const GLOW_CY = 30;
const GLOW_RX = 64;
const GLOW_RY = 19;
const GLOW_OPACITY = 0.09;

function makeStyles(t: RnTheme): LockScreenStyles {
  return StyleSheet.create({
    overlay: {
      ...StyleSheet.absoluteFill,
      // zIndex 200 orders LockScreen within Chrome; BootGate's 100 lives in a
      // different parent (sibling of Chrome) and paints above the whole Chrome
      // subtree regardless. The two overlays never coexist — the session starts
      // unlocked, so LockScreen is null throughout cold-start boot.
      zIndex: 200,
      elevation: 200,
      backgroundColor: t.bgPrimary,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    // `alignSelf: "stretch"` + centred text on both tracked lines: a
    // self-sized iOS <Text> with `letterSpacing` measures without the last
    // glyph's trailing advance and clips it ("SESSION LOCKE").
    title: {
      marginTop: 18,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.textPrimary,
      fontFamily: FONT_ORBITRON_WORDMARK,
      fontSize: 13,
      letterSpacing: 4,
    },
    desk: {
      marginTop: 8,
      marginBottom: RING_GAP,
      alignSelf: "stretch",
      textAlign: "center",
      color: t.textMuted,
      ...labelStyle(t, 9.5, 1.6),
    },
    input: {
      width: 220,
      marginBottom: RING_GAP,
      borderWidth: 1,
      borderColor: t.borderPrimary,
      borderRadius: 9,
      paddingVertical: 9,
      paddingHorizontal: 12,
      textAlign: "center",
      color: t.textPrimary,
      ...labelStyle(t, 11, 1.5),
    },
    placeholder: { color: t.textMuted },
    error: {
      marginTop: -RING_GAP + 8,
      marginBottom: RING_GAP,
      color: t.accentNegative,
      ...labelStyle(t, 10, 1),
    },
  });
}
