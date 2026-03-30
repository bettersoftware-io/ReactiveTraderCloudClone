import { useCallback } from "react";
import {
  type CurrencyPair,
  type Price,
  Direction,
  ExecutionStatus,
  TradeStatus,
  deriveDealtCurrency,
} from "@rtc/domain";
import { useServices } from "../../services/service-provider";
import type { UseTileStateResult } from "./use-tile-state";

export function useExecuteTrade(
  pair: CurrencyPair,
  tileState: UseTileStateResult,
) {
  const { execution } = useServices();

  const execute = useCallback(
    async (direction: Direction, price: Price, notional: number) => {
      const spotRate =
        direction === Direction.Buy ? price.ask : price.bid;
      const dealtCurrency = deriveDealtCurrency(pair.symbol, direction);

      tileState.start();

      try {
        const trade = await execution.executeTrade({
          currencyPair: pair.symbol,
          spotRate,
          direction,
          notional,
          dealtCurrency,
        });

        const executionStatus =
          trade.status === TradeStatus.Rejected
            ? ExecutionStatus.Rejected
            : ExecutionStatus.Done;

        tileState.finish(executionStatus, trade);
      } catch {
        tileState.finish(ExecutionStatus.Timeout);
      }
    },
    [execution, pair.symbol, tileState],
  );

  return execute;
}
