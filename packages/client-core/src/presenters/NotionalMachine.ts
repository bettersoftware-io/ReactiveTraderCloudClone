import { type DefaultedStateObservable, state } from "@rx-state/core";
import { merge, Subject } from "rxjs";
import { map } from "rxjs/operators";

import type { NotionalIntents, NotionalView } from "@rtc/core-api";
import type { Machine } from "@rtc/core-logic";
import {
  createInitialNotionalView,
  reduceNotionalInput,
} from "@rtc/core-logic";

/** Moved to `@rtc/core-api` (pluggable-core-slice-0 Task 3) — re-exported
 * here so every existing `import … from "@rtc/client-core"` keeps working
 * unchanged. */
export type { NotionalIntents, NotionalView };

type NotionalEvent = { type: "change"; input: string } | { type: "reset" };

export function createNotionalMachine(
  defaultNotional: number,
): Machine<NotionalView, NotionalIntents> {
  const change$ = new Subject<string>();
  const reset$ = new Subject<void>();

  const initial = createInitialNotionalView(defaultNotional);

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
      return event.type === "reset"
        ? initial
        : reduceNotionalInput(defaultNotional, event.input);
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
