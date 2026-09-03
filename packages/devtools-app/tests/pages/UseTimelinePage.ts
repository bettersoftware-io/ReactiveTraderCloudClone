import { act, renderHook } from "@testing-library/react";

import type { InspectorState, LiveHistory, LogRow } from "@rtc/devtools-core";

import type { Scope } from "#/nav/scope";
import type { TimelineModel } from "#/timeline/useTimeline";
import { useTimeline } from "#/timeline/useTimeline";

interface MountArgs {
  log: readonly LogRow[];
  history: LiveHistory;
  scope: Scope;
  present: InspectorState;
}

interface HookProps {
  rows: readonly LogRow[];
  scope: Scope;
}

export interface TimelineHookHandle {
  readonly state: TimelineModel;
  rerenderWithRows(rows: readonly LogRow[]): void;
  rerenderWithScope(scope: Scope): void;
  pin(row: LogRow): void;
  resume(): void;
  clear(): void;
  unclear(): void;
  selectPrev(): void;
  selectNext(): void;
  setTailAttached(attached: boolean): void;
}

/** The framework surface for `useTimeline.test.tsx`. Mounts always drive the
 * hook through an object-props harness (rows + scope), so `rerenderWithRows`
 * and `rerenderWithScope` can change one input while holding the other (and
 * `history`/`present`, both closed over) fixed — identical to what each
 * original test's own bespoke `renderHook` call did. */
export function mountTimeline(args: MountArgs): TimelineHookHandle {
  let props: HookProps = { rows: args.log, scope: args.scope };
  const { history, present } = args;

  const { result, rerender } = renderHook(
    (p: HookProps) => {
      return useTimeline(p.rows, history, p.scope, present);
    },
    { initialProps: props },
  );

  function actOn(effect: () => void): void {
    act(effect);
  }

  return {
    get state(): TimelineModel {
      return result.current;
    },
    rerenderWithRows(rows: readonly LogRow[]): void {
      props = { ...props, rows };
      rerender(props);
    },
    rerenderWithScope(scope: Scope): void {
      props = { ...props, scope };
      rerender(props);
    },
    pin(row: LogRow): void {
      actOn(() => {
        result.current.pin(row);
      });
    },
    resume(): void {
      actOn(() => {
        result.current.resume();
      });
    },
    clear(): void {
      actOn(() => {
        result.current.clear();
      });
    },
    unclear(): void {
      actOn(() => {
        result.current.unclear();
      });
    },
    selectPrev(): void {
      actOn(() => {
        result.current.selectPrev();
      });
    },
    selectNext(): void {
      actOn(() => {
        result.current.selectNext();
      });
    },
    setTailAttached(attached: boolean): void {
      actOn(() => {
        result.current.setTailAttached(attached);
      });
    },
  };
}
