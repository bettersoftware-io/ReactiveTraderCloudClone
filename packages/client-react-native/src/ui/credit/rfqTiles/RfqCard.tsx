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
  Direction,
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
import { labelStyle } from "#/ui/theme/labelStyle";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

export function RfqCard({
  rfq,
  quotes,
  instrument,
  dealers,
  onAccept,
  onDismiss,
  pinnedRemainingMs,
}: RfqCardProps): JSX.Element {
  const totalMs = rfq.expirySecs * 1000;
  const { useRfqCountdown } = useViewModel();
  const liveRemainingMs = useRfqCountdown(rfq.creationTimestamp, totalMs);
  const remainingMs = pinnedRemainingMs ?? liveRemainingMs;
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

  function dismissRfq(): void {
    onDismiss(rfq.id);
  }

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
          <Text
            style={styles.instrumentMeta}
            numberOfLines={1}
            testID={`rfq-meta-${rfq.id}`}
          >
            <Text
              style={
                rfq.direction === Direction.Buy ? styles.dirBuy : styles.dirSell
              }
            >
              {rfq.direction.toUpperCase()}
            </Text>
            {` · ${formatNotional(rfq.quantity)} · #${rfq.id}`}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {live ? (
            <RfqCountdownRing remainingMs={remainingMs} totalMs={totalMs} />
          ) : (
            <SettledStatePill accepted={accepted} rfqId={rfq.id}>
              {accepted ? ACCEPTED_LABEL : stateLabel(rfq.state)}
            </SettledStatePill>
          )}
          {canDismiss ? (
            <Pressable
              testID={`rfq-dismiss-${rfq.id}`}
              style={styles.dismissBtn}
              onPress={dismissRfq}
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
  /** Visual-harness only: freezes the countdown at one instant so a golden can
   * reproduce itself. Omitted in production, where the live seam wins — the
   * same injected-clock shape `BootSceneProps.now` uses for `boot/topo`. */
  pinnedRemainingMs?: number;
}

/** The prototype's settled-state label: a check plus the word, not the word
 * alone (dc.html:2170 — `q.state === 'accepted' ? '✓ ACCEPTED' : 'EXPIRED'`). */
const ACCEPTED_LABEL = "✓ ACCEPTED";

/** Private: the header's settled-state pill — the ONE thing the prototype's
 * header slot holds once an RFQ stops being live (dc.html:238), opposite the
 * countdown ring it replaces.
 *
 * It used to be two elements: a static `Done` here AND a large boxed `ACCEPTED`
 * stamp below the quote rows. That stamp was modelled on the wrong prototype
 * element — dc.html:543, the *Rates* execution ceremony (26px, letter-spacing 5,
 * a 2px border), not this card. The design's RFQ pill is small and inline:
 * mono 8px, letter-spacing 1, a 1px 45%-transparent border, `3px 7px` padding,
 * radius 5. Merging them is a fidelity fix and a space one — vertical space is
 * the scarce resource on a phone, and a whole row was being spent to repeat
 * what the header already said.
 *
 * Only the *accepted* landing animates (dc.html:2173 gates `kfStamp` on
 * `state === 'accepted'`); an expired or cancelled RFQ simply is what it is and
 * gets no flourish. The landing reproduces `kfStamp` (dc.html:37) — an
 * overshoot from `scale(1.7) rotate(-7deg)` through `scale(0.96) rotate(1deg)`
 * at 55% — with a spring rather than a keyframe track, sharing
 * `ExecutionCeremony`'s `{ damping: 11, stiffness: 160 }` so both of the app's
 * confirmations land with the same weight. Text renders regardless of the
 * motion gate; only the landing is animated. */
function SettledStatePill({
  accepted,
  rfqId,
  children,
}: SettledStatePillProps): JSX.Element {
  const enabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStampStyles);
  const animate = enabled && accepted;
  const progress = useSharedValue(animate ? 0 : 1);

  useEffect(() => {
    if (!animate) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }

    progress.value = withSpring(1, { damping: 11, stiffness: 160 });

    return () => {
      cancelAnimation(progress);
    };
  }, [animate, progress]);

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
    <Animated.View style={stampStyle} pointerEvents="none">
      <Text
        style={[styles.stamp, accepted ? styles.stampAccepted : null]}
        testID={`rfq-badge-${rfqId}`}
      >
        {children}
      </Text>
    </Animated.View>
  );
}

interface SettledStatePillProps {
  /** Traded, as opposed to expired/cancelled — drives both the positive
   * colourway and whether the landing animates at all (dc.html:2171-2173). */
  readonly accepted: boolean;
  /** Kept on the same `rfq-badge-<id>` testID the static badge used, so the
   * settled state stays addressable by every existing spec and Maestro flow. */
  readonly rfqId: number;
  readonly children: string;
}

/** `kfStamp` reaches its settled reading at 55% (dc.html:37). */
const STAMP_LAND_AT = 0.55;

interface RfqStampStyles {
  stamp: TextStyle;
  stampAccepted: TextStyle;
}

function makeStampStyles(t: RnTheme): RfqStampStyles {
  return StyleSheet.create({
    // dc.html:238 — mono 8px, letter-spacing 1, a 1px border, `3px 7px`
    // padding, radius 5. Sized to sit in the header opposite the countdown
    // ring, NOT as a banner across the card.
    stamp: {
      ...labelStyle(t, 8, 1),
      color: t.textMuted,
      borderColor: t.borderSubtle,
      borderWidth: 1,
      borderRadius: 5,
      paddingHorizontal: 7,
      paddingVertical: 3,
    },
    // The traded colourway (dc.html:2171-2172): positive accent, and a border
    // of the same hue rather than the neutral rule an expired card keeps.
    stampAccepted: {
      color: t.accentPositive,
      borderColor: t.accentPositive,
    },
  });
}

/** The subtitle's notional readout — the design abbreviates (dc.html:2166,
 * `(q.qty / 1000000).toFixed(1) + 'M USD'`), where the app printed a raw
 * `2,000,000`.
 *
 * The sub-million branches are OURS, not the prototype's: it only ever seeds
 * whole millions, so `toFixed(1)` alone would render every smaller RFQ the
 * domain can produce as `0.0M USD` — an abbreviation that has abbreviated the
 * number away. Same rounding as the design above a million. */
function formatNotional(quantity: number): string {
  if (quantity >= 1_000_000) {
    return `${(quantity / 1_000_000).toFixed(1)}M USD`;
  }

  if (quantity >= 1_000) {
    return `${Math.round(quantity / 1_000)}K USD`;
  }

  return `${quantity} USD`;
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
  dirBuy: TextStyle;
  dirSell: TextStyle;
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
      // dc.html:220 — cards sit inside the list's 12px side inset, flush
      // with the filter chips above (which also indent 12).
      marginHorizontal: SPACING.md,
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
    // dc.html:232 — 12px/600 with letter-spacing 0.4, not the 14px the first
    // pass used: on a phone the card's own title is the thing that must not
    // crowd the countdown ring beside it.
    instrumentName: {
      fontSize: 12,
      letterSpacing: 0.4,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    // dc.html:233 — `BUY · 1.0M USD · #3045`: mono 8.5px, the separators and
    // the id in `--faint`, the side alone carrying colour.
    instrumentMeta: {
      fontSize: 8.5,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    dirBuy: { color: t.accentPositive, letterSpacing: 1 },
    dirSell: { color: t.accentNegative, letterSpacing: 1 },
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
