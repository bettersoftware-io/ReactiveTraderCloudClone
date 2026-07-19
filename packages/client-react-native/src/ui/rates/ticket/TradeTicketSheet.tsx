// packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.tsx
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { ComponentRef, JSX } from "react";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import type { CurrencyPair, Direction } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { BuySellPads } from "#/ui/rates/ticket/BuySellPads";
import { ExecutionCeremony } from "#/ui/rates/ticket/ExecutionCeremony";
import { NotionalControl } from "#/ui/rates/ticket/NotionalControl";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";

/** The trade ticket, presented as a `@gorhom/bottom-sheet` modal — the real
 * wiring behind the old RN-`Modal` prototype (`../../TradeTicket.tsx`,
 * replaced by the caller in a later task). Mounted only while a pair is
 * selected (the caller gates it), so the price/notional/execution
 * subscriptions live for exactly the open window; presents itself on mount
 * via the imperative ref rather than a `visible` prop, matching gorhom's API.
 *
 * Auto-close is machine-driven, not timer-driven: `TileExecutionMachine`
 * appends its own auto-dismiss timer to terminal states (finished/timeout)
 * and returns to `ready`. We record that a terminal state was seen, then
 * dismiss the sheet when the machine returns to `ready` — no UI-side timer,
 * no magic number (ported from the old `TradeTicket`'s effect). Dismissing
 * fires the sheet's `onDismiss`, which calls `onClose`. */
export function TradeTicketSheet({
  pair,
  onClose,
}: TradeTicketSheetProps): JSX.Element {
  const { usePrice, useNotional, useTileExecution } = useViewModel();
  const price = usePrice(pair);
  const notional = useNotional(pair.defaultNotional);
  const execution = useTileExecution(pair);
  const theme = useTheme();
  const styles = makeStyles(theme);

  const sheetRef = useRef<ComponentRef<typeof BottomSheetModal>>(null);
  const lastDirRef = useRef<Direction | null>(null);
  const wasTerminalRef = useRef(false);

  useEffect(() => {
    sheetRef.current?.present();
  }, []);

  const status = execution.state.status;
  useEffect(() => {
    if (status === "finished" || status === "timeout") {
      wasTerminalRef.current = true;
    } else if (status === "ready" && wasTerminalRef.current) {
      sheetRef.current?.dismiss();
    }
  }, [status]);

  function handleExecute(direction: Direction): void {
    if (price !== null) {
      lastDirRef.current = direction;
      execution.execute(direction, price, notional.state.numericValue);
    }
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      onDismiss={onClose}
      backdropComponent={TicketBackdrop}
      backgroundStyle={styles.background}
      handleIndicatorStyle={styles.handleIndicator}
    >
      <BottomSheetView style={styles.body}>
        <View style={styles.header}>
          <Text style={styles.pair}>
            {pair.base}/{pair.terms}
          </Text>
          <Text style={styles.subtitle}>SPOT · T+2</Text>
        </View>
        <NotionalControl notional={notional} base={pair.base} />
        {price === null ? null : (
          <BuySellPads pair={pair} price={price} onExecute={handleExecute} />
        )}
        <ExecutionCeremony
          state={execution.state}
          direction={lastDirRef.current}
        />
      </BottomSheetView>
    </BottomSheetModal>
  );
}

export interface TradeTicketSheetProps {
  pair: CurrencyPair;
  onClose: () => void;
}

// Private: the dimmed backdrop, dismissing the sheet on press. Not exported —
// rtc/component-newspaper permits private subcomponents below the lede.
function TicketBackdrop(props: BottomSheetBackdropProps): JSX.Element {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      pressBehavior="close"
    />
  );
}

interface TradeTicketSheetStyles {
  background: ViewStyle;
  handleIndicator: ViewStyle;
  body: ViewStyle;
  header: ViewStyle;
  pair: TextStyle;
  subtitle: TextStyle;
}

function makeStyles(t: RnTheme): TradeTicketSheetStyles {
  return StyleSheet.create({
    background: { backgroundColor: t.panel },
    handleIndicator: { backgroundColor: t.border },
    body: { padding: 20, paddingBottom: 32, gap: 18 },
    header: { gap: 4 },
    pair: {
      fontSize: 18,
      fontWeight: "600",
      color: t.textPrimary,
      fontFamily: t.fontDisplay,
    },
    subtitle: {
      fontSize: 11,
      letterSpacing: 1,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
  });
}
