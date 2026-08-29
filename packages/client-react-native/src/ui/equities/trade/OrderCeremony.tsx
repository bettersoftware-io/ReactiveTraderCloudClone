// packages/client-react-native/src/ui/equities/trade/OrderCeremony.tsx
import * as Haptics from "expo-haptics";
import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import type { OrderTicketState } from "@rtc/client-core";

import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

/** Maps the equity order ticket's `OrderTicketState.phase` (six-way union, the
 * ticket machine's own lifecycle — no UI-side timers) to a ceremonial flourish
 * that OWNS the ticket's phase-status text (the ticket itself renders none of
 * it — see `OrderTicket.tsx`, avoiding the same fact printing twice in one
 * card): `editing` renders nothing at all (terminal/in-flight only);
 * `submitting` shows a busy pill; `working`/`partiallyFilled` show the same
 * pill re-labelled (still in flight, just with a live order to report
 * progress from); `filled`/`rejected` show a toast, firing an `expo-haptics`
 * notification once on entry. Adapted from Phase 4a's `ExecutionCeremony`
 * (`TileExecutionState`, a different union) rather than imported — the two
 * rate/equity tickets don't share a state shape.
 *
 * Renders inside a fixed-height slot (`styles.slot`) for `submitting`/
 * `working`/`partiallyFilled`/`filled`/`rejected` — NOT `position: absolute`.
 * The pill and toast variants differ in natural height (a one-line pill vs a
 * two-line toast), and this used to sit directly in the ticket's normal flow:
 * a `working → filled` transition shifted the `ResetButton` below it by
 * ~20px, right as a user who just watched their order fill was reaching to
 * tap "NEW ORDER". A fixed-height slot makes every sibling below it
 * position-invariant across those five phases by construction, with no
 * per-transition reasoning required. `position: absolute` (matching
 * `ExecutionCeremony`'s `StyleSheet.absoluteFill` scrim) was the other option
 * considered and rejected: `ExecutionCeremony` deliberately overlaps and
 * blocks taps to the pads it covers while execution is in flight, but here
 * the `ResetButton` must stay both visible AND tappable throughout
 * working/partiallyFilled/filled/rejected — an overlay would have to either
 * dodge the button's exact geometry or swallow taps on "NEW ORDER"/"RESET"/
 * "RETRY", trading a moving target for a worse dead one. A same-height,
 * non-overlapping sibling needs no tap-blocking decision at all: nothing is
 * ever stacked, so nothing is ever swallowed.
 *
 * `editing` is deliberately exempt from the slot, not just from content: it
 * renders no wrapper at all, contributing zero height. `editing` has no
 * `ResetButton` (or any continuous sibling) below `OrderCeremony` to protect
 * — entering/leaving `editing` already swaps the ticket's entire child tree
 * for the order form, so there is no shared sibling for a reserved slot to
 * keep still. Reserving one there anyway (an earlier version of this fix
 * did) bought nothing and cost a constant ~62px blank strip (52px slot +
 * `Ticket`'s `gap: 10`) on the ticket's default resting state — the screen
 * a user sees before every single order, worse than the intermittent ~20px
 * shift it replaced.
 *
 * Both the motion (toast/pill entrance, the toast's exit) and the haptic gate
 * on `useShellMotionEnabled`; every phase's text renders unconditionally so
 * reduced-motion/Freeze users still see the outcome. */
export function OrderCeremony({
  state,
}: OrderCeremonyProps): JSX.Element | null {
  const styles = useThemedStyles(makeStyles);

  if (state.phase === "editing") {
    return null;
  }

  return (
    <View testID="eq-order-ceremony-slot" style={styles.slot}>
      <CeremonyContent state={state} />
    </View>
  );
}

export interface OrderCeremonyProps {
  readonly state: OrderTicketState;
}

// Private: the phase → content mapping, kept in an exhaustive switch a
// `never` fallthrough can compiler-check (rather than an if-chain that would
// silently render nothing on an unhandled phase): if `OrderTicketState` ever
// grows a seventh phase, the switch's `default` branch stops narrowing to
// `never` and the `assertNever` call fails to typecheck. A component (not a
// `renderX` helper function) so it composes normally in React DevTools.
function CeremonyContent({ state }: OrderCeremonyProps): JSX.Element | null {
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

/** Height of the slot `OrderCeremony` renders for the five non-`editing`
 * phases — sized to the tallest variant (`Toast`'s two text lines plus its
 * padding) so nothing clips, and held constant for the shorter `BusyPill`
 * too. `editing` renders no slot at all (see the top-level doc comment), so
 * this height never applies there. The slot, not the ceremony's own content
 * height, is what the `ResetButton` beneath it in `OrderTicket.tsx` is
 * actually laid out against. */
const CEREMONY_SLOT_HEIGHT = 52;

interface OrderCeremonyStyles {
  slot: ViewStyle;
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
    slot: {
      height: CEREMONY_SLOT_HEIGHT,
      justifyContent: "center",
    },
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
      alignSelf: "flex-start",
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
      letterSpacing: 2,
      ...weightedFont(t, "mono", "700"),
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
