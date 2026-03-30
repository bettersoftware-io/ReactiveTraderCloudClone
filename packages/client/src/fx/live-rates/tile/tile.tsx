import { useCallback } from "react";
import { type CurrencyPair, type Direction } from "@rtc/domain";
import { usePriceStream } from "../../hooks/use-price-stream";
import { usePriceHistory } from "../../hooks/use-price-history";
import { useNotional } from "../../hooks/use-notional";
import { useTileState } from "../../hooks/use-tile-state";
import { useExecuteTrade } from "../../hooks/use-execute-trade";
import { TileHeader } from "./tile-header";
import { TilePrice, SpreadDisplay } from "./tile-price";
import { TileChart } from "./tile-chart";
import { TileNotional } from "./tile-notional";
import { TileExecution } from "./tile-execution";
import { TileConfirmation } from "./tile-confirmation";

interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

export function Tile({ pair, showChart }: TileProps) {
  const price = usePriceStream(pair);
  const history = usePriceHistory(pair.symbol);
  const notional = useNotional(pair.defaultNotional);
  const tileState = useTileState();
  const executeTrade = useExecuteTrade(pair, tileState);

  const isLoading = !price;
  const isBusy = tileState.state.status !== "ready";
  const hasError = !!notional.error;

  const handleExecute = useCallback(
    (direction: Direction) => {
      if (!price || hasError) return;
      executeTrade(direction, price, notional.numericValue);
    },
    [price, hasError, executeTrade, notional.numericValue],
  );

  return (
    <div
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

      {!notional.isRfq && (
        <TileExecution
          onExecute={handleExecute}
          disabled={isLoading || isBusy || hasError}
        />
      )}

      {notional.isRfq && !isBusy && (
        <button
          disabled
          style={{
            padding: "8px 0",
            fontSize: 13,
            fontWeight: 600,
            border: "1px solid var(--border-primary)",
            borderRadius: 4,
            backgroundColor: "transparent",
            color: "var(--accent-primary)",
            cursor: "not-allowed",
            opacity: 0.7,
          }}
        >
          Initiate RFQ
        </button>
      )}

      <TileNotional
        notional={notional}
        baseCurrency={pair.base}
        disabled={isLoading || isBusy}
      />

      <TileConfirmation state={tileState.state} onDismiss={tileState.dismiss} />
    </div>
  );
}
