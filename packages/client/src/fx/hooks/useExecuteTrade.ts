import { useCallback } from "react";
import { firstValueFrom } from "rxjs";
import {
  type CurrencyPair, type Price, Direction, ExecutionStatus,
} from "@rtc/domain";
import { useHooks } from "../../app/HooksProvider";
import type { UseTileStateResult } from "./useTileState";

export function useExecuteTrade(
  pair: CurrencyPair,
  tileState: UseTileStateResult,
) {
  const execute = useHooks().useExecuteTrade();

  return useCallback(
    async (direction: Direction, price: Price, notional: number) => {
      tileState.start();
      try {
        const { status, trade } = await firstValueFrom(
          execute({ pair, direction, price, notional }),
        );
        tileState.finish(status, trade);
      } catch {
        tileState.finish(ExecutionStatus.Timeout);
      }
    },
    [pair, execute, tileState],
  );
}
