import type { JSX } from "react";
import { useEffect } from "react";
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
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import {
  type Dealer,
  type Instrument,
  type Quote,
  type Rfq,
  RfqState,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { findBestQuoteId } from "#/ui/credit/rfqTiles/bestQuote";
import { QuoteCard } from "#/ui/credit/rfqTiles/QuoteCard";
import { RfqCountdownRing } from "#/ui/credit/rfqTiles/RfqCountdownRing";
import { SurfaceCard } from "#/ui/SurfaceCard";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqCard({
  rfq,
  quotes,
  instrument,
  dealers,
  onAccept,
  onDismiss,
}: RfqCardProps): JSX.Element {
  const totalMs = rfq.expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const remainingMs = useRfqCountdown(rfq.creationTimestamp, totalMs);
  const styles = useThemedStyles(makeStyles);

  const dealerMap = new Map<number, Dealer>();

  for (const d of dealers) {
    dealerMap.set(d.id, d);
  }

  const live = rfq.state === RfqState.Open;
  const canDismiss = !live;
  // The domain has no `Accepted` state: a traded RFQ is `Closed`. Derived the
  // same way in the web client's `rfqCardVm`, so both stamp the same cards.
  const accepted = rfq.state === RfqState.Closed;
  // Only a live RFQ has a "best" quote to chase — a settled one's rows are
  // history and must not keep a winner tinted (matches `rfqCardVm`).
  const bestQuoteId = live ? findBestQuoteId(rfq, quotes) : null;

  return (
    <SurfaceCard
      variant="tile"
      style={styles.card}
      testID={`rfq-card-${rfq.id}`}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.instrumentName}>
            {instrument?.name ?? `Instrument #${rfq.instrumentId}`}
          </Text>
          <Text style={styles.instrumentMeta}>
            {rfq.direction} | Qty: {rfq.quantity.toLocaleString()}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {live ? (
            <RfqCountdownRing remainingMs={remainingMs} totalMs={totalMs} />
          ) : (
            <Text style={styles.badge} testID={`rfq-badge-${rfq.id}`}>
              {stateLabel(rfq.state)}
            </Text>
          )}
          {canDismiss ? (
            <Pressable
              testID={`rfq-dismiss-${rfq.id}`}
              style={styles.dismissBtn}
              onPress={() => {
                onDismiss(rfq.id);
              }}
            >
              <Text style={styles.dismissText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.quoteList}>
        {quotes.map((quote) => {
          return (
            <QuoteCard
              key={quote.id}
              quote={quote}
              dealer={dealerMap.get(quote.dealerId)}
              isBest={quote.id === bestQuoteId}
              onAccept={live ? onAccept : undefined}
            />
          );
        })}
      </View>

      {accepted ? <AcceptedStamp /> : null}
    </SurfaceCard>
  );
}

interface RfqCardProps {
  rfq: Rfq;
  quotes: readonly Quote[];
  instrument: Instrument | undefined;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void | Promise<void>;
  onDismiss: (rfqId: number) => void;
}

/** Private: the `ACCEPTED` stamp that lands on a card the moment its RFQ
 * trades. Reproduces the prototype's `kfStamp` (dc.html:37) — an overshoot from
 * `scale(1.7) rotate(-7deg)` through `scale(0.96) rotate(1deg)` at 55% — with a
 * spring rather than a keyframe track, sharing `ExecutionCeremony`'s
 * `{ damping: 11, stiffness: 160 }` so both of the app's confirmations land with
 * the same weight. Text renders regardless of the motion gate; only the landing
 * is animated. */
function AcceptedStamp(): JSX.Element {
  const enabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStampStyles);
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
      opacity: interpolate(progress.value, [0, STAMP_LAND_AT, 1], [0, 1, 1]),
      transform: [
        {
          scale: interpolate(
            progress.value,
            [0, STAMP_LAND_AT, 1],
            [1.7, 0.96, 1],
          ),
        },
        {
          rotate: `${interpolate(progress.value, [0, STAMP_LAND_AT, 1], [-7, 1, 0])}deg`,
        },
      ],
    };
  });

  return (
    <View style={styles.stampRow} pointerEvents="none">
      <Animated.View style={stampStyle}>
        <Text style={styles.stamp}>ACCEPTED</Text>
      </Animated.View>
    </View>
  );
}

/** `kfStamp` reaches its settled reading at 55% (dc.html:37). */
const STAMP_LAND_AT = 0.55;

interface RfqStampStyles {
  stampRow: ViewStyle;
  stamp: TextStyle;
}

function makeStampStyles(t: RnTheme): RfqStampStyles {
  return StyleSheet.create({
    stampRow: { alignItems: "center", paddingTop: 4 },
    stamp: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 2.5,
      color: t.accentPositive,
      borderColor: t.accentPositive,
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 9,
      paddingVertical: 3,
      fontFamily: t.fontMono,
    },
  });
}

function stateLabel(state: RfqState): string {
  switch (state) {
    case RfqState.Open:
      return "Live";
    case RfqState.Closed:
      return "Done";
    case RfqState.Expired:
      return "Expired";
    case RfqState.Cancelled:
      return "Cancelled";
  }
}

interface RfqCardStyles {
  card: ViewStyle;
  header: ViewStyle;
  headerLeft: ViewStyle;
  headerRight: ViewStyle;
  instrumentName: TextStyle;
  instrumentMeta: TextStyle;
  badge: TextStyle;
  dismissBtn: ViewStyle;
  dismissText: TextStyle;
  quoteList: ViewStyle;
}

function makeStyles(t: RnTheme): RfqCardStyles {
  return StyleSheet.create({
    card: {
      gap: SPACING.sm,
      padding: SPACING.md,
      marginHorizontal: SPACING.sm,
      marginVertical: SPACING.xs,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    headerLeft: { gap: 2, flexShrink: 1 },
    headerRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: SPACING.sm,
    },
    instrumentName: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    instrumentMeta: {
      fontSize: 12,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    badge: {
      fontSize: 11,
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    dismissBtn: { paddingHorizontal: 6, paddingVertical: 2 },
    dismissText: { fontSize: 14, color: t.textMuted },
    quoteList: { gap: 6 },
  });
}
