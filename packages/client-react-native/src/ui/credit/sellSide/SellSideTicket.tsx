// packages/client-react-native/src/ui/credit/sellSide/SellSideTicket.tsx
import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import {
  Direction,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { PriceStepper } from "#/ui/credit/sellSide/PriceStepper";
import { SurfaceCard } from "#/ui/SurfaceCard";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** One incoming RFQ as the sell-side desk sees it: the client's ask, a
 * countdown bar, a price stepper and a submit (prototype dc.html:292-303).
 *
 * **The countdown here is a 2 px bar, not the buy-side's ring.** That is the
 * prototype's own distinction (dc.html:297 vs :229) and it carries meaning —
 * the bar spans the card because on this screen the window is the card's whole
 * subject, whereas on a buy-side tile the ring is one dealer detail among
 * several. Substituting `RfqCountdownRing` here would be a fidelity regression
 * dressed up as reuse. */
export function SellSideTicket({
  rfq,
  quote,
  instrument,
  pinnedRemainingMs,
}: SellSideTicketProps): JSX.Element {
  const { useRfqCountdown, useTicketSubmission } = useViewModel();
  const totalMs = rfq.expirySecs * 1000;
  const liveRemainingMs = useRfqCountdown(rfq.creationTimestamp, totalMs);
  const remainingMs = pinnedRemainingMs ?? liveRemainingMs;
  const { submitPrice, pass } = useTicketSubmission();
  const styles = useThemedStyles(makeStyles);

  const [price, setPrice] = useState(instrument?.refPrice ?? DEFAULT_PRICE);

  const open =
    rfq.state === RfqState.Open && quote.state.type === "pendingWithoutPrice";
  const fraction = totalMs > 0 ? clamp01(remainingMs / totalMs) : 0;
  const urgent = remainingMs < URGENT_MS;
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));

  function submitOwnQuote(): void {
    if (price > 0) {
      submitPrice(quote.id, price);
    }
  }

  function declineRfq(): void {
    pass(quote.id);
  }

  return (
    <SurfaceCard
      variant="tile"
      style={styles.card}
      testID={`sell-side-ticket-${rfq.id}`}
    >
      <View style={styles.headRow}>
        <Text style={styles.incoming}>◈ INCOMING RFQ</Text>
        <Text style={urgent ? styles.secondsUrgent : styles.seconds}>
          {seconds}S
        </Text>
      </View>

      <View style={styles.track}>
        <View
          testID={`sell-side-timer-${rfq.id}`}
          style={[
            urgent ? styles.barUrgent : styles.bar,
            { width: `${fraction * 100}%` },
          ]}
        />
      </View>

      <Text style={styles.instrumentName}>
        {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
      </Text>
      <Text style={styles.clientLine}>
        {clientSideLabel(rfq.direction)} ·{" "}
        {rfq.quantity.toLocaleString("en-US")}
      </Text>

      {open ? (
        <>
          <View style={styles.stepperRow}>
            <PriceStepper value={price} onChange={setPrice} />
          </View>
          <Pressable
            testID={`sell-side-submit-${rfq.id}`}
            style={styles.submitBtn}
            onPress={submitOwnQuote}
          >
            <Text style={styles.submitLabel}>
              SUBMIT {sideLabel(rfq.direction)}
            </Text>
          </Pressable>
          <Pressable
            testID={`sell-side-pass-${rfq.id}`}
            style={styles.passBtn}
            onPress={declineRfq}
          >
            <Text style={styles.passLabel}>PASS</Text>
          </Pressable>
        </>
      ) : (
        <Text testID={`sell-side-settled-${rfq.id}`} style={styles.settled}>
          {settledLabel(rfq, quote)}
        </Text>
      )}
    </SurfaceCard>
  );
}

export interface SellSideTicketProps {
  readonly rfq: Rfq;
  readonly quote: Quote;
  readonly instrument: Instrument | undefined;
  /** Visual-harness only — see `RfqCardProps.pinnedRemainingMs`. */
  readonly pinnedRemainingMs?: number;
}

/** `rfq.direction` is the CLIENT's side, so the desk takes the other one: a
 * client Buy is met with an offer, a client Sell with a bid. The prototype
 * hardcodes "SUBMIT BID" because it only ever models the sell case. */
function sideLabel(direction: Direction): string {
  return direction === Direction.Buy ? "OFFER" : "BID";
}

/** dc.html:296 reads `CLIENT SELLS · …`. The prototype's third segment is a
 * counterparty name ("ADAPTIVE ASSET MGMT"); the domain carries no client
 * identity on an `Rfq`, so that segment is omitted rather than invented. */
function clientSideLabel(direction: Direction): string {
  return direction === Direction.Buy ? "CLIENT BUYS" : "CLIENT SELLS";
}

function settledLabel(rfq: Rfq, quote: Quote): string {
  switch (quote.state.type) {
    case "passed":
      return "PASSED";
    case "pendingWithPrice":
      return `QUOTED ${quote.state.price}`;
    case "accepted":
      return `WON AT ${quote.state.price}`;
    case "rejectedWithPrice":
      return `LOST AT ${quote.state.price}`;
    case "rejectedWithoutPrice":
      return "NOT QUOTED";
    case "pendingWithoutPrice":
      return rfq.state === RfqState.Cancelled ? "CANCELLED" : "EXPIRED";
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** With no reference price to seed from, start at par. */
const DEFAULT_PRICE = 100;
/** The bar flips to the negative accent for the last ten seconds, matching the
 * buy-side ring's threshold. */
const URGENT_MS = 10_000;

interface SellSideTicketStyles {
  card: ViewStyle;
  headRow: ViewStyle;
  incoming: TextStyle;
  seconds: TextStyle;
  secondsUrgent: TextStyle;
  track: ViewStyle;
  bar: ViewStyle;
  barUrgent: ViewStyle;
  instrumentName: TextStyle;
  clientLine: TextStyle;
  stepperRow: ViewStyle;
  submitBtn: ViewStyle;
  submitLabel: TextStyle;
  passBtn: ViewStyle;
  passLabel: TextStyle;
  settled: TextStyle;
}

function makeStyles(t: RnTheme): SellSideTicketStyles {
  // dc.html:292-303 — card `radius 12`, `padding 12px 13px`, `margin-bottom 10`;
  // the timer a 2px bar; submit `10.5px/700/ls 2.5`, `padding 13px 0`,
  // `radius 10`.
  const seconds: TextStyle = {
    fontSize: 9,
    color: t.accentPrimary,
    fontFamily: t.fontMono,
  };

  const bar: ViewStyle = {
    height: "100%",
    borderRadius: 1,
    backgroundColor: t.accentPrimary,
  };

  return StyleSheet.create({
    card: {
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 13,
      marginHorizontal: 12,
      marginBottom: 10,
    },
    headRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 2,
    },
    incoming: {
      fontSize: 8.5,
      letterSpacing: 2,
      color: t.accentAware,
      fontFamily: t.fontMono,
    },
    seconds,
    secondsUrgent: { ...seconds, color: t.accentNegative },
    track: {
      height: 2,
      borderRadius: 1,
      overflow: "hidden",
      marginTop: 6,
      marginBottom: 10,
      backgroundColor: t.borderSubtle,
    },
    bar,
    barUrgent: { ...bar, backgroundColor: t.accentNegative },
    instrumentName: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    clientLine: {
      fontSize: 9,
      marginTop: 2,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    stepperRow: { marginTop: 12 },
    submitBtn: {
      marginTop: 12,
      alignItems: "center",
      paddingVertical: 13,
      borderRadius: 10,
      backgroundColor: t.accentPrimary,
    },
    submitLabel: {
      fontSize: 10.5,
      fontWeight: "700",
      letterSpacing: 2.5,
      color: t.textOnAccent,
      fontFamily: t.fontMono,
    },
    passBtn: { marginTop: 8, alignItems: "center", paddingVertical: 8 },
    passLabel: {
      fontSize: 9,
      letterSpacing: 1.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    settled: {
      marginTop: 12,
      fontSize: 10.5,
      letterSpacing: 1.5,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
