import type { JSX } from "react";
import { useEffect, useRef } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { TileExecutionState } from "@rtc/client-core";
import { type CurrencyPair, Direction, ExecutionStatus } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import type { RnTheme } from "#/ui/theme/tokens";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";

/** The bottom-sheet trade ticket. Mounted only while open (SpotTile gates it),
 * so the execution/notional subscriptions live for exactly the open window.
 * Built on RN's built-in `Modal` — no bottom-sheet dependency — with a dimmed
 * backdrop that dismisses on press.
 *
 * Auto-close is machine-driven, not timer-driven: `TileExecutionMachine`
 * appends its own auto-dismiss timer to terminal states (finished/timeout) and
 * returns to `ready`. We record that a terminal state was seen, then close when
 * the machine dismisses back to `ready` — no UI-side timer, no magic number. */
export function TradeTicket({ pair, onClose }: TradeTicketProps): JSX.Element {
  const { usePrice, useNotional, useTileExecution } = useViewModel();
  const price = usePrice(pair);
  const notional = useNotional(pair.defaultNotional);
  const execution = useTileExecution(pair);
  const styles = useThemedStyles(makeStyles);

  const status = execution.state.status;
  const isBusy = status === "started" || status === "tooLong";
  const hasError = notional.state.error !== null;
  const canExecute = price !== null && !isBusy && !hasError;

  const settled = useRef(false);
  useEffect(() => {
    if (status === "finished" || status === "timeout") {
      settled.current = true;
    } else if (status === "ready" && settled.current) {
      onClose();
    }
  }, [status, onClose]);

  function onSide(direction: Direction): void {
    if (price === null) {
      return;
    }

    execution.execute(direction, price, notional.state.numericValue);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        testID="ticket-backdrop"
      />
      <View style={styles.sheet} testID="trade-ticket">
        <Text style={styles.pair}>{pair.symbol}</Text>
        <Text style={styles.price}>
          {price === null ? "—" : `${price.bid} / ${price.ask}`}
        </Text>
        <TextInput
          testID="notional-input"
          keyboardType="numeric"
          value={notional.state.displayValue}
          onChangeText={notional.change}
          style={styles.input}
        />
        {hasError ? (
          <Text style={styles.error} testID="notional-error">
            {notional.state.error}
          </Text>
        ) : null}
        <View style={styles.buttons}>
          <Pressable
            testID="sell-btn"
            disabled={!canExecute}
            onPress={() => {
              return onSide(Direction.Sell);
            }}
            style={canExecute ? styles.sell : styles.disabled}
          >
            <Text style={styles.label}>Sell</Text>
          </Pressable>
          <Pressable
            testID="buy-btn"
            disabled={!canExecute}
            onPress={() => {
              return onSide(Direction.Buy);
            }}
            style={canExecute ? styles.buy : styles.disabled}
          >
            <Text style={styles.label}>Buy</Text>
          </Pressable>
        </View>
        <Text testID="exec-status">{statusLabel(execution.state)}</Text>
      </View>
    </Modal>
  );
}

interface TradeTicketProps {
  pair: CurrencyPair;
  onClose: () => void;
}

/** Human-readable line for each execution state (mirrors the web tile's
 * overlay semantics). */
function statusLabel(state: TileExecutionState): string {
  switch (state.status) {
    case "ready":
      return "";
    case "started":
      return "Executing…";
    case "tooLong":
      return "Still working…";
    case "timeout":
      return "Timed out";
    case "finished":
      return state.executionStatus === ExecutionStatus.Done
        ? `Done — ${state.trade?.tradeName ?? "trade booked"}`
        : state.executionStatus;
  }
}

interface TradeTicketStyles {
  backdrop: ViewStyle;
  sheet: ViewStyle;
  pair: TextStyle;
  price: TextStyle;
  input: TextStyle;
  error: TextStyle;
  buttons: ViewStyle;
  sell: ViewStyle;
  buy: ViewStyle;
  disabled: ViewStyle;
  label: TextStyle;
}

function makeStyles(t: RnTheme): TradeTicketStyles {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: t.bgOverlay },
    sheet: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      padding: 20,
      backgroundColor: t.panel,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      gap: 12,
    },
    pair: {
      fontSize: 18,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    price: { fontSize: 16, color: t.textPrimary, fontFamily: t.fontMono },
    input: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 6,
      padding: 10,
      color: t.textPrimary,
      fontFamily: t.fontMono,
    },
    error: { color: t.accentNegative },
    buttons: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    sell: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.accentNegative,
    },
    buy: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.accentPositive,
    },
    disabled: {
      flex: 1,
      alignItems: "center",
      padding: 14,
      borderRadius: 6,
      backgroundColor: t.bgSecondary,
      opacity: 0.5,
    },
    label: { color: t.textOnAccent, fontFamily: t.fontDisplay },
  });
}
