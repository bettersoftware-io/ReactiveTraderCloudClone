import type { ReactElement } from "react";

import {
  type CurrencyPair,
  type Direction,
  type Price,
  PriceMovementType,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

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

export function Tile({ pair, showChart }: TileProps): ReactElement {
  const {
    usePrice,
    useStaleFlag,
    usePriceHistory,
    useNotional,
    useTileExecution,
    useRfqTile,
    useAnimationIntents,
  } = useViewModel();
  const price = usePrice(pair);
  const stale = useStaleFlag(pair);
  const history = usePriceHistory(pair.symbol);
  const notional = useNotional(pair.defaultNotional);
  const tileExecution = useTileExecution(pair);
  const rfqState = useRfqTile(pair);
  const animIntent = useAnimationIntents(`tile:${pair.symbol}`);

  const isLoading = !price;
  const isBusy = tileExecution.state.status !== "ready";
  const hasError = !!notional.state.error;
  // "Mid-flow" RFQ state (a quote has been requested/received/rejected) —
  // distinct from notional.state.isRfq, which just says the CURRENT notional
  // value requires the RFQ path (before the flow has even been initiated).
  const isRfqFlowActive = rfqState.state.status !== "init";
  const notionalDisabled = isLoading || isBusy || isRfqFlowActive;
  // The price boxes execute at the live market price, so they must be
  // disabled whenever the notional requires an RFQ quote instead.
  const priceBoxDisabled =
    isLoading || isBusy || hasError || stale || notional.state.isRfq;

  const tickAnim =
    animIntent?.kind === "tickUp" || animIntent?.kind === "tickDown"
      ? animIntent.kind
      : undefined;

  const confirmAnim =
    animIntent?.kind === "fill" || animIntent?.kind === "reject"
      ? animIntent.kind
      : undefined;

  function handleExecute(
    direction: Direction,
    priceVal?: Price,
    notionalVal?: number,
  ): void {
    const p = priceVal ?? price;
    const n = notionalVal ?? notional.state.numericValue;
    if (!p || hasError || stale) return;
    tileExecution.execute(direction, p, n);
  }

  return (
    <StaleIndicator stale={stale}>
      <div
        data-testid={`tile-${pair.symbol}`}
        data-loading={isLoading ? "true" : "false"}
        data-busy={isBusy ? "true" : "false"}
        className={styles.tile}
      >
        <TileHeader
          base={pair.base}
          terms={pair.terms}
          symbol={pair.symbol}
          movement={price?.movementType ?? PriceMovementType.NONE}
          movementPips={computeMovementPips(history, pair.pipsPosition)}
        />

        <TileNotional
          notional={notional}
          baseCurrency={pair.base}
          disabled={notionalDisabled}
        />

        {price ? (
          <TilePrice
            price={price}
            ratePrecision={pair.ratePrecision}
            pipsPosition={pair.pipsPosition}
            anim={tickAnim}
            spread={price.spread}
            onExecute={(dir: Direction): void => {
              handleExecute(dir);
            }}
            disabled={priceBoxDisabled}
          />
        ) : (
          <div className={styles.loadingPlaceholder}>Loading...</div>
        )}

        {showChart ? <TileChart history={history} /> : null}

        <TileFooter
          spotDate={formatSpotDate(new Date(), SPOT_VALUE_DAYS)}
          notional={notional.state.displayValue}
          baseCurrency={pair.base}
        />

        {notional.state.isRfq && !isBusy && (
          <TileRfq
            pair={pair}
            rfqState={rfqState}
            onRequestQuote={rfqState.requestQuote}
            onExecute={handleExecute}
            notional={notional.state.numericValue}
          />
        )}

        <TileConfirmation
          state={tileExecution.state}
          onDismiss={tileExecution.dismiss}
          anim={confirmAnim}
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
