import type { JSX } from "react";
import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { Instrument } from "@rtc/domain";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

interface InstrumentSearchProps {
  instruments: readonly Instrument[];
  selected: Instrument | null;
  onSelect: (instrument: Instrument | null) => void;
}

export function InstrumentSearch({
  instruments,
  selected,
  onSelect,
}: InstrumentSearchProps): JSX.Element {
  const [query, setQuery] = useState("");
  const styles = useThemedStyles(makeStyles);

  const q = query.toLowerCase();
  const results = query.trim()
    ? instruments.filter((i) => {
        return (
          i.name.toLowerCase().includes(q) ||
          i.ticker.toLowerCase().includes(q) ||
          i.cusip.toLowerCase().includes(q)
        );
      })
    : [];

  function handleSelect(instrument: Instrument): void {
    onSelect(instrument);
    setQuery(instrument.name);
  }

  if (selected) {
    return (
      <View style={styles.wrapper}>
        <Text style={styles.label}>Instrument</Text>
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{selected.name}</Text>
          <Text style={styles.selectedMeta}>
            CUSIP: {selected.cusip} | Coupon: {selected.interestRate}%
          </Text>
          <Pressable
            testID="instrument-change"
            style={styles.changeBtn}
            onPress={() => {
              onSelect(null);
              setQuery("");
            }}
          >
            <Text style={styles.changeText}>Change</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Instrument</Text>
      <TextInput
        testID="instrument-search-input"
        value={query}
        onChangeText={setQuery}
        placeholder="Search by ticker, name, or CUSIP..."
        placeholderTextColor={styles.placeholder.color}
        style={styles.searchInput}
      />
      {results.length > 0 ? (
        <View style={styles.dropdown}>
          {results.map((inst) => {
            return (
              <Pressable
                key={inst.id}
                testID={`instrument-result-${inst.id}`}
                style={styles.resultItem}
                onPress={() => {
                  handleSelect(inst);
                }}
              >
                <Text style={styles.resultName}>{inst.name}</Text>
                <Text style={styles.resultCusip}>CUSIP: {inst.cusip}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

interface InstrumentSearchStyles {
  wrapper: ViewStyle;
  label: TextStyle;
  searchInput: TextStyle;
  placeholder: TextStyle;
  dropdown: ViewStyle;
  resultItem: ViewStyle;
  resultName: TextStyle;
  resultCusip: TextStyle;
  selectedInfo: ViewStyle;
  selectedName: TextStyle;
  selectedMeta: TextStyle;
  changeBtn: ViewStyle;
  changeText: TextStyle;
}

function makeStyles(t: RnTheme): InstrumentSearchStyles {
  return StyleSheet.create({
    wrapper: { gap: 6 },
    label: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textSecondary,
      fontFamily: t.fontDisplay,
    },
    searchInput: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    placeholder: { color: t.textMuted },
    dropdown: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
      borderRadius: 6,
      backgroundColor: t.panel,
    },
    resultItem: {
      padding: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.borderSubtle,
    },
    resultName: {
      fontSize: 13,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    resultCusip: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    selectedInfo: {
      gap: 4,
      padding: 10,
      borderRadius: 6,
      backgroundColor: t.panel,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    selectedName: {
      fontSize: 14,
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    selectedMeta: { fontSize: 11, color: t.textMuted, fontFamily: t.fontMono },
    changeBtn: { alignSelf: "flex-start", paddingVertical: 4 },
    changeText: {
      fontSize: 12,
      color: t.accentPrimary,
      fontFamily: t.fontDisplay,
    },
  });
}
