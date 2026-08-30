// packages/client-react-native/src/ui/rates/ticket/TradeTicketSheet.tsx
import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BlurView } from "expo-blur";
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
import { sheetPresentation } from "#/ui/rates/ticket/sheetPresentation";
import { useShellMotionEnabled } from "#/ui/shell/hud/useShellMotionEnabled";
import type { RnTheme } from "#/ui/theme/tokens";
import { useTheme } from "#/ui/theme/useTheme";
import { useThemedStyles } from "#/ui/theme/useThemedStyles";
import { weightedFont } from "#/ui/theme/weightedFont";

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
 * fires the sheet's `onDismiss`, which calls `onClose`.
 *
 * **The presentation itself is motion-gated**, like every other animation in
 * the shell. `useShellMotionEnabled` is false under OS reduced-motion or
 * power-saver Freeze, and then the sheet must APPEAR rather than slide: it
 * mounts straight at its resting position and takes a zero-duration timing
 * config for every later transition, and the backdrop paints at its final
 * opacity with no fade. Which props say that is `sheetPresentation`'s
 * business (see it for why each half is load-bearing); this component only
 * asks it, with the live motion flag, and spreads the answer.
 *
 * That gate is a real accessibility behaviour, not a harness affordance — the
 * same gap Phase 0 closed in `AmbientBackground`: a Freeze user who has asked
 * for no motion was still getting the full spring slide-up plus a fading
 * scrim, which is the largest single movement this screen makes. Its side benefit is
 * that a `freeze`-seeded golden of the ticket is reproducible; without it the
 * capture can land part-way through the present. */
export function TradeTicketSheet({
  pair,
  onClose,
}: TradeTicketSheetProps): JSX.Element {
  const { usePrice, useNotional, useTileExecution } = useViewModel();
  const price = usePrice(pair);
  const notional = useNotional(pair.defaultNotional);
  const execution = useTileExecution(pair);
  const styles = useThemedStyles(makeStyles);
  const presentation = sheetPresentation(useShellMotionEnabled());

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

  function executeTrade(direction: Direction): void {
    if (price !== null) {
      lastDirRef.current = direction;
      execution.execute(direction, price, notional.state.numericValue);
    }
  }

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      {...presentation}
      onDismiss={onClose}
      backdropComponent={TicketBackdrop}
      backgroundComponent={TicketBackground}
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
          <BuySellPads pair={pair} price={price} onExecute={executeTrade} />
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

// Private: the sheet body's background — `t.panel` is a translucent token
// (its design contract is "translucent panel + blur"), and RN has no
// `backdrop-filter` to realize that over the sheet's `style`, so the spot
// tiles beneath bled straight through. Layers an `expo-blur` `BlurView`
// (matching the Phase-3 dock-scrim idiom in RadialCommandDock) under a
// `t.panel`-tinted overlay, clipped to the sheet's top corner radius. Not
// exported — rtc/component-newspaper permits private subcomponents below the
// lede.
function TicketBackground({ style }: BottomSheetBackgroundProps): JSX.Element {
  const t = useTheme();

  return (
    <View style={[style, backgroundStyles.clip]}>
      <BlurView intensity={16} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: t.panel }]}
      />
    </View>
  );
}

const backgroundStyles = StyleSheet.create({
  clip: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
});

interface TradeTicketSheetStyles {
  handleIndicator: ViewStyle;
  body: ViewStyle;
  header: ViewStyle;
  pair: TextStyle;
  subtitle: TextStyle;
}

function makeStyles(t: RnTheme): TradeTicketSheetStyles {
  return StyleSheet.create({
    handleIndicator: { backgroundColor: t.borderSubtle },
    body: { padding: 20, paddingBottom: 32, gap: 18 },
    header: { gap: 4 },
    pair: {
      fontSize: 18,
      color: t.textPrimary,
      ...weightedFont(t, "display", "600"),
    },
    subtitle: {
      fontSize: 11,
      letterSpacing: 1,
      color: t.textMuted,
      fontFamily: t.fontMono,
    },
  });
}
