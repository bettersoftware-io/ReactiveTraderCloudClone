import { useCallback } from "react";
import {
  type CurrencyPair,
  type Price,
  Direction,
  ExecutionStatus,
  ExecuteTradeUseCase,
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
      const useCase = new ExecuteTradeUseCase(execution);

      tileState.start();

      try {
        const { status, trade } = await useCase.execute({ pair, direction, price, notional });
        tileState.finish(status, trade);
      } catch {
        tileState.finish(ExecutionStatus.Timeout);
      }
    },
    [execution, pair, tileState],
  );

  return execute;
}
