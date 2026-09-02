import type { JSX } from "react";
import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeInDown,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";

import { type Dealer, type Instrument, type Rfq, RfqState } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { RfqCard } from "#/ui/credit/rfqTiles/RfqCard";
import { RfqFilterTabs } from "#/ui/credit/rfqTiles/RfqFilterTabs";
import { filterRfqs } from "#/ui/credit/rfqTiles/rfqTileFilter";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function RfqTilesPanel(): JSX.Element {
  const {
    useRfqs,
    useInstruments,
    useDealers,
    useAcceptQuote,
    useCreditRfqFilterPreference,
  } = useViewModel();
  const rfqs = useRfqs();
  const instruments = useInstruments();
  const dealers = useDealers();
  const acceptQuote = useAcceptQuote();
  const { filter } = useCreditRfqFilterPreference();
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  const motionEnabled = useShellMotionEnabled();
  const styles = useThemedStyles(makeStyles);

  const instrumentMap = new Map<number, Instrument>();

  for (const i of instruments) {
    instrumentMap.set(i.id, i);
  }

  const visible = filterRfqs(rfqs, filter, dismissed);

  function removeRfq(rfqId: number): void {
    setDismissed((prev) => {
      return new Set(prev).add(rfqId);
    });
  }

  function acceptRfqQuote(quoteId: number): void {
    void acceptQuote(quoteId);
  }

  return (
    <View style={styles.panel} testID="credit-tiles-panel">
      <RfqFilterTabs />
      {visible.length === 0 ? (
        <Text style={styles.empty} testID="credit-tiles-empty">
          No RFQs to display
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.grid}>
          {visible.map((rfq) => {
            return (
              <Animated.View
                key={rfq.id}
                layout={
                  motionEnabled ? LinearTransition.duration(320) : undefined
                }
                entering={
                  motionEnabled ? FadeInDown.duration(TILE_IN_MS) : undefined
                }
                exiting={
                  motionEnabled
                    ? FadeOut.duration(exitMsFor(rfq.state))
                    : undefined
                }
              >
                <RfqTileRow
                  rfq={rfq}
                  instrumentMap={instrumentMap}
                  dealers={dealers}
                  onAccept={acceptRfqQuote}
                  onDismiss={removeRfq}
                />
              </Animated.View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** `kfTileIn 0.35s ease backwards` (dc.html:222) — the cascade a newly
 * broadcast RFQ arrives on. */
const TILE_IN_MS = 350;

/** How long a card that has just traded stays legible on its way out.
 *
 * **This duration IS the accept linger — it is not a tuning knob and it must
 * not be replaced by a UI-side timer.** The prototype notes the same intent at
 * dc.html:2127 ("freshly-accepted cards linger in LIVE so the ACCEPTED stamp
 * reads before they leave"); expressing it as the exit animation's own length
 * means the card is visibly leaving the whole time, with no scheduling of any
 * kind, and `src/ui` stays free of timers. Anything else exits promptly. */
const ACCEPT_LINGER_MS = 1250;
const PLAIN_EXIT_MS = 220;

function exitMsFor(state: RfqState): number {
  return state === RfqState.Closed ? ACCEPT_LINGER_MS : PLAIN_EXIT_MS;
}

interface RfqTileRowProps {
  rfq: Rfq;
  instrumentMap: Map<number, Instrument>;
  dealers: readonly Dealer[];
  onAccept: (quoteId: number) => void;
  onDismiss: (rfqId: number) => void;
}

function RfqTileRow({
  rfq,
  instrumentMap,
  dealers,
  onAccept,
  onDismiss,
}: RfqTileRowProps): JSX.Element {
  const { useQuotesForRfq } = useViewModel();
  const quotes = useQuotesForRfq(rfq.id);
  return (
    <RfqCard
      rfq={rfq}
      quotes={quotes}
      instrument={instrumentMap.get(rfq.instrumentId)}
      dealers={dealers}
      onAccept={onAccept}
      onDismiss={onDismiss}
    />
  );
}

interface RfqTilesPanelStyles {
  panel: ViewStyle;
  grid: ViewStyle;
  empty: TextStyle;
}

function makeStyles(t: RnTheme): RfqTilesPanelStyles {
  return StyleSheet.create({
    panel: { flex: 1 },
    // dc.html:220 — the card list's own `padding:8px 12px 8px`; with the
    // chip row's 1px tail and the cards' 4px margins this lands the design's
    // ~13pt chips→first-card gap (it sat at ~9pt on `paddingVertical: 4`).
    grid: { paddingVertical: 8 },
    empty: { padding: 16, color: t.textMuted, fontFamily: t.fontDisplay },
  });
}
