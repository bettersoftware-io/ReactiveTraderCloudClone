import { useCallback } from "react";

import type { CurrencyPair, Direction, Price } from "@rtc/domain";

import { useHooks } from "#/ui/hooks/useHooks";
import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { TileChart } from "./TileChart";
import { TileConfirmation } from "./TileConfirmation";
import { TileExecution } from "./TileExecution";
import { TileHeader } from "./TileHeader";
import { TileNotional } from "./TileNotional";
import { SpreadDisplay, TilePrice } from "./TilePrice";
import { TileRfq } from "./TileRfq";

import styles from "./Tile.module.css";

interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

export function Tile({ pair, showChart }: TileProps) {
  const {
    usePrice,
    useStaleFlag,
    usePriceHistory,
    useNotional,
    useTileExecution,
    useRfqTile,
  } = useHooks();
  const price = usePrice(pair);
  const stale = useStaleFlag(pair);
  const history = usePriceHistory(pair.symbol);
  const notional = useNotional(pair.defaultNotional);
  const tileExecution = useTileExecution(pair);
  const rfqState = useRfqTile(pair);

  const isLoading = !price;
  const isBusy = tileExecution.state.status !== "ready";
  const hasError = !!notional.state.error;
  const isRfqActive = rfqState.state.status !== "init";
  const notionalDisabled = isLoading || isBusy || isRfqActive;

  const handleExecute = useCallback(
    (direction: Direction, priceVal?: Price, notionalVal?: number) => {
      const p = priceVal ?? price;
      const n = notionalVal ?? notional.state.numericValue;
      if (!p || hasError) return;
      tileExecution.execute(direction, p, n);
    },
    [price, hasError, tileExecution, notional.state.numericValue],
  );

  return (
    <StaleIndicator stale={stale}>
      <div
        data-testid={`tile-${pair.symbol}`}
        data-loading={isLoading ? "true" : "false"}
        className={styles.tile}
      >
        <TileHeader base={pair.base} terms={pair.terms} />

        {showChart ? <TileChart history={history} /> : null}

        {price ? (
          <>
            <TilePrice
              price={price}
              ratePrecision={pair.ratePrecision}
              pipsPosition={pair.pipsPosition}
            />
            <SpreadDisplay spread={price.spread} />
          </>
        ) : (
          <div className={styles.loadingPlaceholder}>Loading...</div>
        )}

        {notional.state.isRfq ? (
          !isBusy && (
            <TileRfq
              pair={pair}
              rfqState={rfqState}
              onRequestQuote={rfqState.requestQuote}
              onExecute={handleExecute}
              notional={notional.state.numericValue}
            />
          )
        ) : (
          <TileExecution
            onExecute={(dir) => {
              return handleExecute(dir);
            }}
            disabled={isLoading || isBusy || hasError}
          />
        )}

        <TileNotional
          notional={notional}
          baseCurrency={pair.base}
          disabled={notionalDisabled}
        />

        <TileConfirmation
          state={tileExecution.state}
          onDismiss={tileExecution.dismiss}
        />
      </div>
    </StaleIndicator>
  );
}
