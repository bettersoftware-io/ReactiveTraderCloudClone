import type { Accessor, JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import {
  type CurrencyPair,
  type Direction,
  ExecutionStatus,
  type Price,
  PriceMovementType,
} from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { computeMovementPips } from "../movementPips";
import { formatSpotDate } from "./formatSpotDate";
import { TileChart } from "./TileChart";
import { TileConfirmation } from "./TileConfirmation";
import { TileFooter } from "./TileFooter";
import { TileHeader } from "./TileHeader";
import { TileNotional } from "./TileNotional";
import { TilePrice } from "./TilePrice";
import { TileRfq } from "./TileRfq";

import styles from "./Tile.module.css";

export function Tile(props: TileProps): JSX.Element {
  const {
    usePrice,
    useStaleFlag,
    usePriceHistory,
    useNotional,
    useTileExecution,
    useRfqTile,
    useAnimationIntents,
  } = useViewModel();
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const price = usePrice(props.pair);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const stale = useStaleFlag(props.pair);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const history = usePriceHistory(props.pair.symbol);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const notional = useNotional(props.pair.defaultNotional);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const tileExecution = useTileExecution(props.pair);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const rfqState = useRfqTile(props.pair);
  // eslint-disable-next-line solid/reactivity -- setup-scope read is intentional: this component remounts when the value changes
  const animIntent = useAnimationIntents(`tile:${props.pair.symbol}`);

  // Every derived flag below reads one or more machine-state accessors — each
  // wrapped in createMemo (not a plain top-level const) so it stays reactive
  // across ticks instead of freezing at the first read (Solid components run
  // their setup body once; a plain `const x = accessor()` here would be the
  // "top-level frozen read" bug).
  const isLoading = createMemo((): boolean => {
    return !price();
  });

  const isBusy = createMemo((): boolean => {
    return tileExecution.state().status !== "ready";
  });

  const hasError = createMemo((): boolean => {
    return !!notional.state().error;
  });

  // "Mid-flow" RFQ state (a quote has been requested/received/rejected) —
  // distinct from notional.state().isRfq, which just says the CURRENT
  // notional value requires the RFQ path (before the flow has even started).
  const isRfqFlowActive = createMemo((): boolean => {
    return rfqState.state().status !== "init";
  });

  const notionalDisabled = createMemo((): boolean => {
    return isLoading() || isBusy() || isRfqFlowActive();
  });

  // The price boxes execute at the live market price, so they must be
  // disabled whenever the notional requires an RFQ quote instead.
  const priceBoxDisabled = createMemo((): boolean => {
    return (
      isLoading() || isBusy() || hasError() || stale() || notional.state().isRfq
    );
  });

  // RFQ init-state affordance: the compact ⚡ RFQ chip in the header's pair
  // row (an existing row, so the tile's height never changes). The other RFQ
  // lifecycle states still render through TileRfq below.
  const showRfqChip = createMemo((): boolean => {
    return notional.state().isRfq && !isBusy() && !isRfqFlowActive();
  });

  // PROTO RateTile data-booked: true exactly while the success confirmation
  // (TileConfirmation's Done card) is showing, so the tile ROOT carries the
  // bookPulse glow — the overlay's own glow is clipped by the tile's
  // overflow:hidden, but the root's box-shadow is not. Flips back to false
  // when the confirmation dismisses, so the animation restarts on the next
  // successful trade (the attribute cycles).
  const isBooked = createMemo((): boolean => {
    const state = tileExecution.state();
    return (
      state.status === "finished" &&
      state.executionStatus === ExecutionStatus.Done &&
      !!state.trade
    );
  });

  const tickAnim = createMemo((): "tickUp" | "tickDown" | undefined => {
    const intent = animIntent();
    return intent?.kind === "tickUp" || intent?.kind === "tickDown"
      ? intent.kind
      : undefined;
  });

  const confirmAnim = createMemo((): "fill" | "reject" | undefined => {
    const intent = animIntent();
    return intent?.kind === "fill" || intent?.kind === "reject"
      ? intent.kind
      : undefined;
  });

  const movementPips = createMemo((): number | null => {
    return computeMovementPips(history(), props.pair.pipsPosition);
  });

  function handleExecute(
    direction: Direction,
    priceVal?: Price,
    notionalVal?: number,
  ): void {
    const p = priceVal ?? price();
    const n = notionalVal ?? notional.state().numericValue;

    if (!p || hasError() || stale()) {
      return;
    }

    tileExecution.execute(direction, p, n);
  }

  return (
    <StaleIndicator stale={stale()}>
      <div
        data-testid={`tile-${props.pair.symbol}`}
        data-loading={isLoading() ? "true" : "false"}
        data-busy={isBusy() ? "true" : "false"}
        data-booked={isBooked() ? "true" : "false"}
        class={styles.tile}
      >
        <TileHeader
          base={props.pair.base}
          terms={props.pair.terms}
          symbol={props.pair.symbol}
          movement={price()?.movementType ?? PriceMovementType.NONE}
          movementPips={movementPips()}
          onInitiateRfq={showRfqChip() ? rfqState.requestQuote : undefined}
        />

        <TileNotional
          notional={notional}
          baseCurrency={props.pair.base}
          disabled={notionalDisabled()}
        />

        <Show
          when={price()}
          fallback={<div class={styles.loadingPlaceholder}>Loading...</div>}
        >
          {(currentPrice: Accessor<Price>) => {
            return (
              <TilePrice
                price={currentPrice()}
                ratePrecision={props.pair.ratePrecision}
                pipsPosition={props.pair.pipsPosition}
                anim={tickAnim()}
                spread={currentPrice().spread}
                onExecute={(dir: Direction): void => {
                  handleExecute(dir);
                }}
                disabled={priceBoxDisabled()}
              />
            );
          }}
        </Show>

        <Show when={props.showChart}>
          <TileChart history={history()} />
        </Show>

        <TileFooter
          spotDate={formatSpotDate(new Date(), SPOT_VALUE_DAYS)}
          notional={notional.state().displayValue}
          baseCurrency={props.pair.base}
        />

        <Show when={notional.state().isRfq && !isBusy()}>
          <TileRfq
            pair={props.pair}
            rfqState={rfqState}
            onExecute={handleExecute}
            notional={notional.state().numericValue}
          />
        </Show>

        <TileConfirmation
          state={tileExecution.state}
          onDismiss={tileExecution.dismiss}
          anim={confirmAnim()}
        />
      </div>
    </StaleIndicator>
  );
}

interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

const SPOT_VALUE_DAYS = 2;
