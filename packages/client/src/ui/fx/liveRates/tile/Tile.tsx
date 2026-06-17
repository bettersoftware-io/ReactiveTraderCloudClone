import { useCallback } from "react";
import { type CurrencyPair, type Direction, type Price } from "@rtc/domain";
import { useHooks } from "../../../hooks/HooksProvider";
import { useNotional } from "./hooks/useNotional";
import { TileHeader } from "./TileHeader";
import { TilePrice, SpreadDisplay } from "./TilePrice";
import { TileChart } from "./TileChart";
import { TileNotional } from "./TileNotional";
import { TileExecution } from "./TileExecution";
import { TileConfirmation } from "./TileConfirmation";
import { TileRfq } from "./TileRfq";
import { StaleIndicator } from "../../../shell/stale/StaleIndicator";

interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

export function Tile({ pair, showChart }: TileProps) {
  const hooks = useHooks();
  const price = hooks.usePrice(pair);
  const stale = hooks.useStaleFlag(pair);
  const history = hooks.usePriceHistory(pair.symbol);
  const notional = useNotional(pair.defaultNotional);
  const tileExecution = hooks.useTileExecution(pair);
  const rfqState = hooks.useRfqTile(pair);

  const isLoading = !price;
  const isBusy = tileExecution.state.status !== "ready";
  const hasError = !!notional.error;
  const isRfqActive = rfqState.state.status !== "init";
  const notionalDisabled = isLoading || isBusy || isRfqActive;

  const handleExecute = useCallback(
    (direction: Direction, priceVal?: Price, notionalVal?: number) => {
      const p = priceVal ?? price;
      const n = notionalVal ?? notional.numericValue;
      if (!p || hasError) return;
      tileExecution.execute(direction, p, n);
    },
    [price, hasError, tileExecution, notional.numericValue],
  );

  return (
    <StaleIndicator stale={stale}>
    <div
      data-testid={`tile-${pair.symbol}`}
      style={{
        backgroundColor: "var(--bg-tile)",
        border: "1px solid var(--border-primary)",
        borderRadius: 6,
        padding: 12,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        opacity: isLoading ? 0.5 : 1,
        transition: "opacity 0.3s",
        minWidth: 280,
        position: "relative",
      }}
    >
      <TileHeader base={pair.base} terms={pair.terms} />

      {showChart && <TileChart history={history} />}

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
        <div
          style={{
            height: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}
        >
          Loading...
        </div>
      )}

      {notional.isRfq ? (
        !isBusy && (
          <TileRfq
            pair={pair}
            rfqState={rfqState}
            onRequestQuote={rfqState.requestQuote}
            onExecute={handleExecute}
            notional={notional.numericValue}
          />
        )
      ) : (
        <TileExecution
          onExecute={(dir) => handleExecute(dir)}
          disabled={isLoading || isBusy || hasError}
        />
      )}

      <TileNotional
        notional={notional}
        baseCurrency={pair.base}
        disabled={notionalDisabled}
      />

      <TileConfirmation state={tileExecution.state} onDismiss={tileExecution.dismiss} />
    </div>
    </StaleIndicator>
  );
}
