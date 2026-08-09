// packages/client-react-native/src/ui/equities/trade/OrderCeremony.tsx
import * as Haptics from "expo-haptics";
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import { StyleSheet, Text, type TextStyle, type ViewStyle } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import type { OrderTicketState } from "@rtc/client-core";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** Maps the equity order ticket's `OrderTicketState.phase` (six-way union, the
 * ticket machine's own lifecycle — no UI-side timers) to a ceremonial flourish
 * layered above the ticket's own static phase text: `editing` renders nothing
 * (the ceremony is terminal/in-flight only); `submitting` shows a busy pill;
 * `working`/`partiallyFilled` show the same pill re-labelled (still in
 * flight, just with a live order to report progress from); `filled`/
 * `rejected` show a toast, firing an `expo-haptics` notification once on
 * entry. Adapted from Phase 4a's `ExecutionCeremony` (`TileExecutionState`,
 * a different union) rather than imported — the two rate/equity tickets
 * don't share a state shape. Unlike `ExecutionCeremony`, no once-guard ref is
 * needed here: each phase renders a genuinely different child (or null), so a
 * phase transition IS a mount/unmount, and the haptic fires from that child's
 * own mount effect. Both the motion (toast/pill entrance, the toast's exit)
 * and the haptic gate on `useShellMotionEnabled`; every phase's text renders
 * unconditionally so reduced-motion/Freeze users still see the outcome. */
export function OrderCeremony({
  state,
}: OrderCeremonyProps): JSX.Element | null {
  switch (state.phase) {
    case "editing":
      return null;
    case "submitting":
      return <BusyPill testID="eq-order-busy" label="SUBMITTING…" />;
    case "working":
      return (
        <BusyPill
          testID="eq-order-working"
          label={`WORKING — ${state.order.filledQty}/${state.order.qty}`}
        />
      );
    case "partiallyFilled":
      return (
        <BusyPill
          testID="eq-order-working"
          label={`PARTIAL — ${state.order.filledQty}/${state.order.qty}`}
        />
      );
    case "filled":
      return (
        <Toast
          testID="eq-order-toast-filled"
          text="FILLED"
          detail={`${state.order.qty} @ ${state.order.avgPrice?.toFixed(2) ?? "—"}`}
          positive
        />
      );
    case "rejected":
      return (
        <Toast
          testID="eq-order-toast-rejected"
          text="REJECTED"
          detail={state.reason}
          positive={false}
        />
      );
    default:
      return assertNever(state);
  }
}

export interface OrderCeremonyProps {
  readonly state: OrderTicketState;
}

// Exhaustiveness backstop: if `OrderTicketState` ever grows a seventh phase,
// the switch's `default` branch stops narrowing to `never` and this call
// fails to typecheck — a compiler-checked reminder rather than a silently
// unhandled phase.
function assertNever(value: never): never {
  throw new Error(`Unhandled order ticket phase: ${JSON.stringify(value)}`);
}

// Private: the in-flight pill (submitting/working/partiallyFilled).
interface BusyPillProps {
  readonly testID: string;
  readonly label: string;
}

function BusyPill({ testID, label }: BusyPillProps): JSX.Element {
  const enabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStyles);

  return (
    <Animated.View
      testID={testID}
      entering={enabled ? FadeIn.duration(ENTER_MS) : undefined}
      style={styles.busy}
    >
      <Text style={styles.busyLabel}>{label}</Text>
    </Animated.View>
  );
}

// Private: the terminal toast (filled/rejected). Fires the haptic once on
// mount — this component only mounts when the ceremony's switch newly
// renders it, i.e. exactly on entry into the terminal phase.
interface ToastProps {
  readonly testID: string;
  readonly text: string;
  readonly detail: string;
  readonly positive: boolean;
}

function Toast({ testID, text, detail, positive }: ToastProps): JSX.Element {
  const enabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStyles);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!enabled || firedRef.current) {
      return;
    }

    firedRef.current = true;
    void Haptics.notificationAsync(
      positive
        ? Haptics.NotificationFeedbackType.Success
        : Haptics.NotificationFeedbackType.Error,
    );
    // `firedRef` guards the actual call to exactly once per mount — a fresh
    // Toast instance is exactly what a new phase entry mounts (OrderCeremony
    // has no other case that renders one), so "once per mount" is "once per
    // entry". Listing `enabled`/`positive` (rather than an empty array) keeps
    // this exhaustive-deps-clean; the guard is what makes it idempotent, not
    // the dependency list.
  }, [enabled, positive]);

  return (
    <Animated.View
      testID={testID}
      entering={enabled ? FadeIn.duration(ENTER_MS) : undefined}
      exiting={enabled ? FadeOut.duration(TOAST_DWELL_MS) : undefined}
      style={[
        styles.toast,
        positive ? styles.toastPositive : styles.toastNegative,
      ]}
    >
      <Text
        style={[
          styles.toastText,
          positive ? styles.toastTextPositive : styles.toastTextNegative,
        ]}
      >
        {text}
      </Text>
      <Text style={styles.toastDetail}>{detail}</Text>
    </Animated.View>
  );
}

const ENTER_MS = 220;

/** The fill/reject toast's dwell before it leaves, encoded as the EXIT
 * animation's own duration — exactly as Credit's `ACCEPT_LINGER_MS` is (see
 * `RfqTilesPanel.tsx`). No JS timer schedules the toast's departure: the
 * `Toast` element simply stays mounted for as long as `OrderTicketState`
 * stays in `filled`/`rejected` (i.e. until the ticket next moves — a reset or
 * another submit swaps it for a different phase's element), and when React
 * finally unmounts it, Reanimated stretches that unmount over this many ms so
 * the toast is visibly leaving the whole time rather than vanishing
 * instantly. `src/ui` stays free of timers either way. */
const TOAST_DWELL_MS = 1250;

interface OrderCeremonyStyles {
  busy: ViewStyle;
  busyLabel: TextStyle;
  toast: ViewStyle;
  toastPositive: ViewStyle;
  toastNegative: ViewStyle;
  toastText: TextStyle;
  toastTextPositive: TextStyle;
  toastTextNegative: TextStyle;
  toastDetail: TextStyle;
}

function makeStyles(t: RnTheme): OrderCeremonyStyles {
  return StyleSheet.create({
    busy: {
      alignSelf: "flex-start",
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.borderSubtle,
      backgroundColor: t.bgSecondary,
    },
    busyLabel: {
      fontSize: 11,
      letterSpacing: 1,
      color: t.accentPrimary,
      fontFamily: t.fontMono,
    },
    toast: {
      gap: 2,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      borderWidth: 1,
      backgroundColor: t.panel,
    },
    toastPositive: { borderColor: t.accentPositive },
    toastNegative: { borderColor: t.accentNegative },
    toastText: {
      fontSize: 13,
      fontWeight: "700",
      letterSpacing: 2,
      fontFamily: t.fontMono,
    },
    toastTextPositive: { color: t.accentPositive },
    toastTextNegative: { color: t.accentNegative },
    toastDetail: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
