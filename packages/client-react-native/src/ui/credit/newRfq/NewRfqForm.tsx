import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { Direction, RFQ_DEFAULT_EXPIRY_SECS } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { InstrumentChipGrid } from "#/ui/credit/newRfq/InstrumentChipGrid";
import { QuantityChips } from "#/ui/credit/newRfq/QuantityChips";
import { AcceptGradient } from "#/ui/credit/rfqTiles/AcceptGradient";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

export function NewRfqForm({
  onCreated,
  initialSelection,
}: NewRfqFormProps): JSX.Element {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const styles = useThemedStyles(makeStyles);

  const [instrumentId, setInstrumentId] = useState<number | null>(
    initialSelection?.instrumentId ?? null,
  );

  const [direction, setDirection] = useState<Direction>(
    initialSelection?.direction ?? Direction.Buy,
  );

  const [quantity, setQuantity] = useState<number | null>(
    initialSelection?.quantity ?? null,
  );

  const submitting = submission.state.status === "submitting";
  const instrument =
    instruments.find((i) => {
      return i.id === instrumentId;
    }) ?? null;

  // The prototype broadcasts to the whole dealer panel — there is no picker
  // (Phase 5 design §5a). The seam still requires a non-empty `dealerIds`, so
  // "every dealer" is sent explicitly rather than left to a server default.
  const allDealerIds = dealers.map((d) => {
    return d.id;
  });

  const canSubmit =
    instrument !== null &&
    quantity !== null &&
    allDealerIds.length > 0 &&
    !submitting;

  function submitRfq(): void {
    if (!canSubmit || instrument === null || quantity === null) {
      return;
    }

    submit(
      {
        instrumentId: instrument.id,
        dealerIds: allDealerIds,
        quantity,
        direction,
      },
      onCreated,
    );
  }

  if (submission.state.status === "confirmed") {
    return (
      <View style={styles.confirmedCard} testID="rfq-confirmed">
        <Text style={styles.confirmedTitle}>RFQ Created</Text>
        <Text style={styles.confirmedDetail}>
          {instrument?.name} | {direction} | RFQ ID: {submission.state.rfqId}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.form}
      contentContainerStyle={styles.content}
      testID="new-rfq-form"
    >
      <Text style={styles.formTitle}>New RFQ</Text>

      <InstrumentChipGrid
        instruments={instruments}
        selectedId={instrumentId}
        onSelect={setInstrumentId}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>DIRECTION</Text>
        <View style={styles.directionRow}>
          {DIRECTIONS.map((dir) => {
            const active = direction === dir;
            // The design tints each side in ITS OWN colour, not one shared
            // brand fill (dc.html:2194-2197) — BUY green, SELL red — so the
            // active treatment is picked per direction, matching the equity
            // ticket's side toggle.
            const buy = dir === Direction.Buy;
            const activeBtn = buy
              ? styles.directionBtnBuy
              : styles.directionBtnSell;

            const activeLabel = buy
              ? styles.directionLabelBuy
              : styles.directionLabelSell;

            return (
              <Pressable
                key={dir}
                testID={`rfq-direction-${dir}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={active ? activeBtn : styles.directionBtn}
                onPress={() => {
                  setDirection(dir);
                }}
              >
                <Text style={active ? activeLabel : styles.directionLabel}>
                  {/* The design prints `BUY` / `SELL`; `Direction` is Title
                      Case on the wire, so the label is cased here rather
                      than the enum being changed under the seam. */}
                  {dir.toUpperCase()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <QuantityChips selected={quantity} onSelect={setQuantity} />

      <View style={styles.broadcast}>
        {/* Two views, not one: the glow is an iOS layer shadow and the
            gradient needs `overflow: hidden` to be clipped to the 11px
            radius — but `overflow: hidden` sets `masksToBounds`, which
            clips the shadow away too. So the OUTER view casts the glow (it
            carries an opaque `accentPrimary` fill purely so iOS has
            something to cast from; the button covers it completely) and the
            INNER Pressable does the clipping. */}
        <View style={canSubmit ? styles.submitGlow : styles.submitShell}>
          <Pressable
            testID="rfq-submit"
            disabled={!canSubmit}
            style={canSubmit ? styles.submitBtn : styles.submitBtnDisabled}
            onPress={submitRfq}
          >
            {canSubmit ? <AcceptGradient /> : null}
            <Text style={styles.submitLabel}>
              {submitting ? "BROADCASTING…" : "⟟ BROADCAST RFQ"}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.broadcastNote}>
          STREAMS TO {allDealerIds.length} DEALERS · {RFQ_DEFAULT_EXPIRY_SECS}S
          WINDOW
        </Text>
      </View>
    </ScrollView>
  );
}

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
  /** Seeds the three `useState`s the operator would otherwise tap in. Used
   * only as their INITIAL values — the form stays uncontrolled, so a later
   * change here is ignored and every tap still wins. Exists for the visual
   * harness, which has no way to drive taps before a screenshot: the golden
   * has to mount already showing a chosen instrument, side and clip size.
   * Same seam shape `BlottersView`'s retired `initialTab` used. */
  initialSelection?: NewRfqSelection;
}

/** A pre-chosen New-RFQ ticket. Every field optional and independent: seeding
 * only the direction is as valid as seeding all three, and an omitted field
 * falls back to the form's own default (no instrument, `Buy`, no quantity). */
export interface NewRfqSelection {
  /** An `Instrument["id"]` from `useInstruments()`; anything else simply
   * matches no chip and leaves the grid unselected. */
  readonly instrumentId?: number;
  readonly direction?: Direction;
  /** A UI-SCALE value from `RFQ_QUANTITY_CHIPS`, not a notional — see
   * `rfqQuantities.ts`. `5_000` is the "5M" chip. */
  readonly quantity?: number;
}

const DIRECTIONS: readonly Direction[] = [Direction.Buy, Direction.Sell];

interface NewRfqFormStyles {
  form: ViewStyle;
  broadcast: ViewStyle;
  broadcastNote: TextStyle;
  content: ViewStyle;
  formTitle: TextStyle;
  field: ViewStyle;
  fieldLabel: TextStyle;
  directionRow: ViewStyle;
  directionBtn: ViewStyle;
  directionBtnBuy: ViewStyle;
  directionBtnSell: ViewStyle;
  directionLabel: TextStyle;
  directionLabelBuy: TextStyle;
  directionLabelSell: TextStyle;
  submitShell: ViewStyle;
  submitGlow: ViewStyle;
  submitBtn: ViewStyle;
  submitBtnDisabled: ViewStyle;
  submitLabel: TextStyle;
  confirmedCard: ViewStyle;
  confirmedTitle: TextStyle;
  confirmedDetail: TextStyle;
}

/** The prototype tints an active side toggle at 12% of its own colour
 * (`color-mix(in oklab, <c> 12%, transparent)`, dc.html:2195/2197); every
 * skin's `accentPositive`/`accentNegative` is six-digit hex, so the alpha
 * byte is appended directly. Same helper the equity ticket's side toggle
 * uses (`equities/trade/OrderTicket.tsx`) — deliberately duplicated rather
 * than shared, since a repo-wide `withAlpha` does not exist yet and
 * `PnlChart`'s local one parses channels for a different purpose. */
function tint12(hexColor: string): string {
  return `${hexColor}1F`;
}

function makeStyles(t: RnTheme): NewRfqFormStyles {
  // dc.html:271-272 — `padding:11px 0; border-radius:9px; border:1px solid`,
  // on a TRANSPARENT ground. Until the mobile-v1 fidelity pass this was a
  // 6px-radius `panel` slab with a hairline border, which read as a filled
  // segmented control rather than the design's two outlines.
  const directionBtn: ViewStyle = {
    flex: 1,
    alignItems: "center",
    paddingVertical: 11,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: t.borderSubtle,
    backgroundColor: "transparent",
  };

  // dc.html:271 — `font-size:10px; font-weight:700; letter-spacing:2px` in
  // the mono face. This was `fontDisplay` at 14px, a size AND a family away
  // from the INSTRUMENT/QUANTITY chips it sits between.
  const directionLabel: TextStyle = {
    fontSize: 10,
    letterSpacing: 2,
    ...weightedFont(t, "mono", "700"),
  };

  // dc.html:284 — `box-shadow: var(--glow)`, itself `0 0 16px glowC`
  // (dc.html:2416). A CSS blur of 16 is an iOS `shadowRadius` of ~8, and
  // `glowC` carries its own alpha so opacity stays 1 — the same reading
  // `AppearanceScreen` and `BuySellPads` already make. `glowC` is NULL on
  // classic and both terminal faces, which get no glow at all rather than a
  // black drop shadow.
  const glow: ViewStyle =
    t.glowC === null
      ? {}
      : {
          shadowColor: t.glowC,
          shadowOpacity: 1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
          elevation: 8,
        };

  const submitBtn: ViewStyle = {
    alignItems: "center",
    paddingVertical: 14,
    borderRadius: 11,
    // Clips `AcceptGradient`'s absolutely-filled Svg to the radius — the
    // same move `QuoteCard`'s best-quote ACCEPT makes.
    overflow: "hidden",
    // Fallback ground beneath the gradient, and the disabled arm's base.
    backgroundColor: t.accentPrimary,
  };

  return StyleSheet.create({
    form: { flex: 1 },
    broadcast: { gap: 10 },
    broadcastNote: {
      fontSize: 8.5,
      letterSpacing: 1,
      textAlign: "center",
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    content: { padding: 16, gap: 16 },
    formTitle: {
      fontSize: 16,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    field: { gap: 6 },
    // dc.html:269 styles DIRECTION identically to INSTRUMENT and QUANTITY.
    // Those two labels live inside the chip components and already match; this
    // one was left on the old display-font style when its text was
    // uppercased, so on device it read a size and a family apart from its
    // siblings.
    fieldLabel: {
      fontSize: 8.5,
      letterSpacing: 2,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
    directionRow: { flexDirection: "row", gap: SPACING.sm },
    directionBtn,
    directionBtnBuy: {
      ...directionBtn,
      borderColor: t.accentPositive,
      backgroundColor: tint12(t.accentPositive),
    },
    directionBtnSell: {
      ...directionBtn,
      borderColor: t.accentNegative,
      backgroundColor: tint12(t.accentNegative),
    },
    directionLabel: { ...directionLabel, color: t.textMuted },
    directionLabelBuy: { ...directionLabel, color: t.accentPositive },
    directionLabelSell: { ...directionLabel, color: t.accentNegative },
    // The disabled arm's shell casts nothing — a greyed-out button that
    // still glowed would advertise an action that is not available.
    submitShell: { borderRadius: 11 },
    submitGlow: {
      borderRadius: 11,
      backgroundColor: t.accentPrimary,
      ...glow,
    },
    submitBtn,
    submitBtnDisabled: {
      ...submitBtn,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    submitLabel: {
      fontSize: 11,
      letterSpacing: 3,
      color: t.textOnAccent,
      ...weightedFont(t, "mono", "700"),
    },
    confirmedCard: {
      margin: 16,
      padding: SPACING.xl,
      // Aligned to the card language's 5px radius; kept as a local style
      // (not SurfaceCard) because the accentPositive border is a deliberate
      // success-state signal SurfaceCard's chrome doesn't express.
      borderRadius: 5,
      gap: SPACING.sm,
      backgroundColor: t.panel,
      borderWidth: 1,
      borderColor: t.accentPositive,
    },
    confirmedTitle: {
      fontSize: 16,
      color: t.accentPositive,
      ...weightedFont(t, "display", "600"),
    },
    confirmedDetail: {
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
