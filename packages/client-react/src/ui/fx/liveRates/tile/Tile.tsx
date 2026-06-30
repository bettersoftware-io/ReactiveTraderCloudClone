import type { ReactElement } from "react";

import type { CurrencyPair, Direction, Price } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { StaleIndicator } from "#/ui/shell/stale/StaleIndicator";

import { SpreadDisplay } from "./SpreadDisplay";
import { TileChart } from "./TileChart";
import { TileConfirmation } from "./TileConfirmation";
import { TileExecution } from "./TileExecution";
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
  const isRfqActive = rfqState.state.status !== "init";
  const notionalDisabled = isLoading || isBusy || isRfqActive;

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
              anim={tickAnim}
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
            onExecute={(dir: Direction): void => {
              handleExecute(dir);
            }}
            disabled={isLoading || isBusy || hasError || stale}
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
