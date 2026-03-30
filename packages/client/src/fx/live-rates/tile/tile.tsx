import type { CurrencyPair } from "@rtc/domain";
import { usePriceStream } from "../../hooks/use-price-stream";
import { usePriceHistory } from "../../hooks/use-price-history";
import { useNotional } from "../../hooks/use-notional";
import { TileHeader } from "./tile-header";
import { TilePrice, SpreadDisplay } from "./tile-price";
import { TileChart } from "./tile-chart";
import { TileNotional } from "./tile-notional";

interface TileProps {
  pair: CurrencyPair;
  showChart: boolean;
}

export function Tile({ pair, showChart }: TileProps) {
  const price = usePriceStream(pair);
  const history = usePriceHistory(pair.symbol);
  const notional = useNotional(pair.defaultNotional);

  const isLoading = !price;

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

      <TileNotional
        notional={notional}
        baseCurrency={pair.base}
        disabled={isLoading}
      />
    </div>
  );
}
