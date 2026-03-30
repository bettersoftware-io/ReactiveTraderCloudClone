import { useCallback, useEffect, useRef, useState } from "react";

export type RfqStatus = "init" | "requested" | "received" | "rejected";

export interface RfqQuote {
  bid: number;
  ask: number;
  timeoutMs: number;
}

export interface RfqState {
  status: RfqStatus;
  quote: RfqQuote | null;
  remainingMs: number;
}

const REJECTED_DISPLAY_MS = 2_000;

export interface UseRfqStateResult {
  state: RfqState;
  initiate: () => void;
  cancel: () => void;
  receiveQuote: (quote: RfqQuote) => void;
  reject: () => void;
  accept: () => RfqQuote | null;
}

export function useRfqState(): UseRfqStateResult {
  const [state, setState] = useState<RfqState>({
    status: "init",
    quote: null,
    remainingMs: 0,
  });

  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rejectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const quoteRef = useRef<RfqQuote | null>(null);

  const clearTimers = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (rejectTimerRef.current) {
      clearTimeout(rejectTimerRef.current);
      rejectTimerRef.current = null;
    }
  }, []);

  const goToInit = useCallback(() => {
    clearTimers();
    quoteRef.current = null;
    setState({ status: "init", quote: null, remainingMs: 0 });
  }, [clearTimers]);

  const goToRejected = useCallback(() => {
    clearTimers();
    quoteRef.current = null;
    setState({ status: "rejected", quote: null, remainingMs: 0 });
    rejectTimerRef.current = setTimeout(goToInit, REJECTED_DISPLAY_MS);
  }, [clearTimers, goToInit]);

  const initiate = useCallback(() => {
    if (state.status !== "init") return;
    clearTimers();
    setState({ status: "requested", quote: null, remainingMs: 0 });
  }, [state.status, clearTimers]);

  const cancel = useCallback(() => {
    if (state.status !== "requested") return;
    goToInit();
  }, [state.status, goToInit]);

  const receiveQuote = useCallback(
    (quote: RfqQuote) => {
      clearTimers();
      quoteRef.current = quote;
      const startTime = Date.now();
      setState({ status: "received", quote, remainingMs: quote.timeoutMs });

      countdownRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, quote.timeoutMs - elapsed);
        if (remaining <= 0) {
          goToRejected();
        } else {
          setState((prev) => ({ ...prev, remainingMs: remaining }));
        }
      }, 100);
    },
    [clearTimers, goToRejected],
  );

  const reject = useCallback(() => {
    if (state.status !== "received") return;
    goToRejected();
  }, [state.status, goToRejected]);

  const accept = useCallback((): RfqQuote | null => {
    if (state.status !== "received") return null;
    const quote = quoteRef.current;
    goToInit();
    return quote;
  }, [state.status, goToInit]);

  useEffect(() => clearTimers, [clearTimers]);

  return { state, initiate, cancel, receiveQuote, reject, accept };
}
