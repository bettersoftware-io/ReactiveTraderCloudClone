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

import { Direction, type Instrument } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { DealerSelection } from "#/ui/credit/newRfq/DealerSelection";
import { InstrumentSearch } from "#/ui/credit/newRfq/InstrumentSearch";
import { QuantityInput } from "#/ui/credit/newRfq/QuantityInput";
import { SPACING } from "#/ui/theme/spacing";
import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface NewRfqFormProps {
  onCreated: (rfqId: number) => void;
}

const DIRECTIONS: readonly Direction[] = [Direction.Buy, Direction.Sell];

export function NewRfqForm({ onCreated }: NewRfqFormProps): JSX.Element {
  const { useInstruments, useDealers, useRfqSubmission } = useViewModel();
  const instruments = useInstruments();
  const dealers = useDealers();
  const submission = useRfqSubmission();
  const { submit } = submission;
  const styles = useThemedStyles(makeStyles);

  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [direction, setDirection] = useState<Direction>(Direction.Buy);
  const [quantity, setQuantity] = useState("");
  const [dealerOverride, setDealerOverride] = useState<Set<number> | null>(
    null,
  );

  const submitting = submission.state.status === "submitting";

  const allDealerIds = new Set(
    dealers.map((d) => {
      return d.id;
    }),
  );
  const selectedDealerIds =
    dealerOverride && dealerOverride.size > 0 ? dealerOverride : allDealerIds;

  const quantityNum = parseFloat(quantity);
  const canSubmit =
    instrument !== null &&
    !Number.isNaN(quantityNum) &&
    quantityNum > 0 &&
    selectedDealerIds.size > 0 &&
    !submitting;

  function handleSubmit(): void {
    if (!canSubmit || !instrument) {
      return;
    }

    submit(
      {
        instrumentId: instrument.id,
        dealerIds: [...selectedDealerIds],
        quantity: quantityNum,
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

      <InstrumentSearch
        instruments={instruments}
        selected={instrument}
        onSelect={setInstrument}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Direction</Text>
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

      <QuantityInput value={quantity} onChange={setQuantity} />

      <DealerSelection
        dealers={dealers}
        selectedIds={selectedDealerIds}
        onChange={setDealerOverride}
      />

      <Pressable
        testID="rfq-submit"
        disabled={!canSubmit}
        style={canSubmit ? styles.submitBtn : styles.submitBtnDisabled}
        onPress={handleSubmit}
      >
        <Text style={styles.submitLabel}>
          {submitting ? "Submitting..." : "Submit RFQ"}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

interface NewRfqFormStyles {
  form: ViewStyle;
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
    form: { flex: 1, backgroundColor: t.bgPrimary },
    content: { padding: 16, gap: 16 },
    formTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    field: { gap: 6 },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
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
      paddingVertical: SPACING.lg,
      borderRadius: 6,
      backgroundColor: t.accentPrimary,
    },
    submitBtnDisabled: {
      alignItems: "center",
      paddingVertical: SPACING.lg,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    submitLabel: {
      fontSize: 14,
      color: t.textOnAccent,
      fontFamily: t.fontDisplay,
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
