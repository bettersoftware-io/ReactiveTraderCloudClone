import { type DefaultedStateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map } from "rxjs/operators";

import { isRfqRequired, parseNotional } from "@rtc/domain";

import type { Machine } from "./machine";

function formatWithCommas(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 0,
    useGrouping: true,
  });
}

/** Data-only view emitted by the notional machine. */
export interface NotionalView {
  displayValue: string;
  numericValue: number;
  error: string | null;
  isRfq: boolean;
  isDefault: boolean;
}

export interface NotionalIntents {
  change: (input: string) => void;
  reset: () => void;
}

type NotionalEvent = { type: "change"; input: string } | { type: "reset" };

function makeInitialView(defaultNotional: number): NotionalView {
  return {
    displayValue: formatWithCommas(defaultNotional),
    numericValue: defaultNotional,
    error: null,
    isRfq: isRfqRequired(defaultNotional),
    isDefault: true,
  };
}

export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const change$ = new Subject<string>();
  const reset$ = new Subject<void>();

  const initial = makeInitialView(defaultNotional);

  const events$ = merge(
    change$.pipe(
      map((input): NotionalEvent => {
        return { type: "change", input };
      }),
    ),
    reset$.pipe(
      map((): NotionalEvent => {
        return { type: "reset" };
      }),
    ),
  );

  const stream$ = events$.pipe(
    map((event): NotionalView => {
      if (event.type === "reset") {
        return initial;
      }

      const result = parseNotional(event.input);

      if (result.value === null) {
        return {
          displayValue: event.input,
          numericValue: 0,
          error: result.error,
          isRfq: false,
          isDefault: false,
        };
      }

      return {
        displayValue: formatWithCommas(result.value),
        numericValue: result.value,
        error: result.error,
        isRfq: isRfqRequired(result.value),
        isDefault: result.value === defaultNotional,
      };
    }),
  );

  const state$: DefaultedStateObservable<NotionalView> = state(
    stream$,
    initial,
  );

  // Keep state$ warm so it carries its default before useMachine first renders.
  const warm = state$.subscribe();

  return {
    state$,
    intents: {
      change: (input: string) => {
        return change$.next(input);
      },
      reset: () => {
        return reset$.next();
      },
    },
    dispose: () => {
      change$.complete();
      reset$.complete();
      warm.unsubscribe();
    },
  };
}
