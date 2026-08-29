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

import { Direction } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { InstrumentChipGrid } from "#/ui/credit/newRfq/InstrumentChipGrid";
import { QuantityChips } from "#/ui/credit/newRfq/QuantityChips";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

export function NewRfqForm({ onCreated }: NewRfqFormProps): JSX.Element {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const styles = useThemedStyles(makeStyles);

  const [instrumentId, setInstrumentId] = useState<number | null>(null);
  const [direction, setDirection] = useState<Direction>(Direction.Buy);
  const [quantity, setQuantity] = useState<number | null>(null);

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
            return (
              <Pressable
                key={dir}
                testID={`rfq-direction-${dir}`}
                style={active ? styles.directionBtnActive : styles.directionBtn}
                onPress={() => {
                  setDirection(dir);
                }}
              >
                <Text
                  style={
                    active ? styles.directionLabelActive : styles.directionLabel
                  }
                >
                  {dir}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <QuantityChips selected={quantity} onSelect={setQuantity} />

      <View style={styles.broadcast}>
        <Pressable
          testID="rfq-submit"
          disabled={!canSubmit}
          style={canSubmit ? styles.submitBtn : styles.submitBtnDisabled}
          onPress={submitRfq}
        >
          <Text style={styles.submitLabel}>
            {submitting ? "BROADCASTING…" : "⟟ BROADCAST RFQ"}
          </Text>
        </Pressable>
        <Text style={styles.broadcastNote}>
          STREAMS TO {allDealerIds.length} DEALERS · {RFQ_WINDOW_SECS}S WINDOW
        </Text>
      </View>
    </ScrollView>
  );
}

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

const DIRECTIONS: readonly Direction[] = [Direction.Buy, Direction.Sell];

/** The quote window the desk broadcasts on, shown in the footer note
 * (dc.html:285). The server owns the real expiry; this is the copy that tells
 * the operator what they are committing to. */
const RFQ_WINDOW_SECS = 45;

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
  directionBtnActive: ViewStyle;
  directionLabel: TextStyle;
  directionLabelActive: TextStyle;
  submitBtn: ViewStyle;
  submitBtnDisabled: ViewStyle;
  submitLabel: TextStyle;
  confirmedCard: ViewStyle;
  confirmedTitle: TextStyle;
  confirmedDetail: TextStyle;
}

function makeStyles(t: RnTheme): NewRfqFormStyles {
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
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
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
    directionBtn: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    directionBtnActive: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
      borderRadius: 6,
      backgroundColor: t.bgBrandPrimary,
      borderWidth: 1,
      borderColor: t.borderStrong,
    },
    directionLabel: {
      fontSize: 14,
      color: t.textMuted,
      fontFamily: t.fontDisplay,
    },
    directionLabelActive: {
      fontSize: 14,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
    },
    submitBtn: {
      alignItems: "center",
      paddingVertical: 14,
      borderRadius: 11,
      backgroundColor: t.accentPrimary,
    },
    submitBtnDisabled: {
      alignItems: "center",
      paddingVertical: 14,
      borderRadius: 11,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    submitLabel: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 3,
      color: t.textOnAccent,
      fontFamily: t.fontMono,
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
      fontWeight: "600",
      color: t.accentPositive,
      fontFamily: t.fontDisplay,
    },
    confirmedDetail: {
      fontSize: 13,
      color: t.textSecondary,
      fontFamily: t.fontMono,
    },
  });
}
