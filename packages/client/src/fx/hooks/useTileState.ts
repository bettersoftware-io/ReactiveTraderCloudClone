import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Trade,
  ExecutionStatus,
  TOO_LONG_THRESHOLD_MS,
  EXECUTION_TIMEOUT_MS,
  CONFIRMATION_DISMISS_MS,
} from "@rtc/domain";

export type TileState =
  | { status: "ready" }
  | { status: "started" }
  | { status: "tooLong" }
  | { status: "finished"; executionStatus: ExecutionStatus; trade?: Trade }
  | { status: "timeout" };

const READY: TileState = { status: "ready" };

export interface UseTileStateResult {
  state: TileState;
  start: () => void;
  finish: (executionStatus: ExecutionStatus, trade?: Trade) => void;
  dismiss: () => void;
}

export function useTileState(): UseTileStateResult {
  const [state, setState] = useState<TileState>(READY);
  const tooLongTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (tooLongTimer.current) clearTimeout(tooLongTimer.current);
    if (timeoutTimer.current) clearTimeout(timeoutTimer.current);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    tooLongTimer.current = null;
    timeoutTimer.current = null;
    dismissTimer.current = null;
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setState(READY);
  }, [clearTimers]);

  const finish = useCallback(
    (executionStatus: ExecutionStatus, trade?: Trade) => {
      clearTimers();
      setState({ status: "finished", executionStatus, trade });
      dismissTimer.current = setTimeout(() => {
        setState(READY);
      }, CONFIRMATION_DISMISS_MS);
    },
    [clearTimers],
  );

  const start = useCallback(() => {
    clearTimers();
    setState({ status: "started" });

    tooLongTimer.current = setTimeout(() => {
      setState((prev) => {
        if (prev.status === "started") return { status: "tooLong" };
        return prev;
      });
    }, TOO_LONG_THRESHOLD_MS);

    timeoutTimer.current = setTimeout(() => {
      setState((prev) => {
        if (prev.status === "started" || prev.status === "tooLong") {
          return { status: "timeout" };
        }
        return prev;
      });
      dismissTimer.current = setTimeout(() => {
        setState(READY);
      }, CONFIRMATION_DISMISS_MS);
    }, EXECUTION_TIMEOUT_MS);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  return { state, start, finish, dismiss };
}
