import { state } from "@rx-state/core";
import { act, render, renderHook } from "@testing-library/react";
import React from "react";
import { BehaviorSubject, Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { Machine } from "#/app/presenters/machine";

import { useMachine } from "./useMachine";

/** Build a minimal test machine from a BehaviorSubject.
 * We subscribe immediately so the StateObservable stays warm
 * for the duration of the test. */
function makeTestMachine<S>(subject: BehaviorSubject<S>) {
  const state$ = state(subject, subject.getValue());
  // Keep the StateObservable warm (ref-count > 0) so useStateObservable can
  // read the synchronous default without entering Suspense.
  const sub = state$.subscribe();

  const intent = vi.fn();
  const dispose = vi.fn(() => {
    return sub.unsubscribe();
  });

  const machine: Machine<S, { intent: () => void }> = {
    state$,
    intents: { intent },
    dispose,
  };
  return { machine, intent, dispose, subject };
}

describe("useMachine", () => {
  it("calls the factory exactly once across re-renders", () => {
    const factory = vi.fn(() => {
      return makeTestMachine(new BehaviorSubject(0)).machine;
    });
    const { rerender } = renderHook(() => {
      return useMachine(factory);
    });
    rerender();
    rerender();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns the current state$ value and re-renders when it emits", () => {
    const subject = new BehaviorSubject(42);
    const { machine } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { result } = renderHook(() => {
      return useMachine(factory);
    });
    expect(result.current.state).toBe(42);

    act(() => {
      return subject.next(99);
    });
    expect(result.current.state).toBe(99);
  });

  it("passes intent methods through and keeps stable references across re-renders", () => {
    const subject = new BehaviorSubject(0);
    const { machine } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { result, rerender } = renderHook(() => {
      return useMachine(factory);
    });
    const intentRef = result.current.intent;

    rerender();
    expect(result.current.intent).toBe(intentRef);
  });

  it("calls dispose() exactly once on unmount and NOT on re-render", async () => {
    const subject = new BehaviorSubject(0);
    const { machine, dispose } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { rerender, unmount } = renderHook(() => {
      return useMachine(factory);
    });
    rerender();
    rerender();
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    // Disposal is deferred to a microtask (StrictMode-safe); flush it.
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("calls the factory exactly once even inside React.StrictMode (StrictMode-safe lazy ref)", () => {
    const factory = vi.fn(() => {
      return makeTestMachine(new BehaviorSubject(0)).machine;
    });

    function wrapper({ children }: { children: React.ReactNode }) {
      return <React.StrictMode>{children}</React.StrictMode>;
    }

    renderHook(
      () => {
        return useMachine(factory);
      },
      { wrapper },
    );
    expect(factory).toHaveBeenCalledTimes(1);
  });

  /** Build a machine that faithfully mirrors TileExecutionMachine's lifecycle:
   * a Subject feeds a derived state$, an intent PUSHES into that Subject, a WARM
   * subscription keeps state$ alive, and dispose() COMPLETES the Subject and
   * unsubscribes the warm sub. After dispose, the intent is a no-op (it pushes
   * into a completed Subject) and state$ can never emit again — exactly the
   * conditions that froze tiles in the real app under StrictMode. */
  function makeLifecycleMachine() {
    const source$ = new Subject<number>();
    const state$ = state(source$, 0);
    const warm = state$.subscribe();

    let count = 0;
    const dispose = vi.fn(() => {
      source$.complete();
      warm.unsubscribe();
    });

    const machine: Machine<number, { bump: () => void }> = {
      state$,
      intents: {
        bump: () => {
          return source$.next(++count);
        },
      },
      dispose,
    };
    return { machine, dispose };
  }

  /** A real component that consumes useMachine, mirroring how Tile.tsx uses it:
   * it renders the current state and exposes the intent via a button. Rendered
   * inside <React.StrictMode>, React 19 double-invokes the mount effect
   * (setup -> cleanup -> setup) — UNLIKE renderHook, which suppresses it
   * (verified: a render() probe shows setup:2 cleanup:1, a renderHook probe
   * setup:1 cleanup:0). This is the only faithful unit-level reproduction of the
   * production StrictMode lifecycle that froze the tiles. */
  function Probe({
    machine,
  }: {
    machine: Machine<number, { bump: () => void }>;
  }) {
    const { state, bump } = useMachine(() => {
      return machine;
    });
    return (
      <button
        type="button"
        data-testid="probe"
        onClick={() => {
          return bump();
        }}
      >
        {state}
      </button>
    );
  }

  it("keeps the machine LIVE across a StrictMode mount cycle: an intent fired after the cycle updates state (regression)", async () => {
    const { machine, dispose } = makeLifecycleMachine();

    const { getByTestId, unmount } = render(
      <React.StrictMode>
        <Probe machine={machine} />
      </React.StrictMode>,
    );
    const button = getByTestId("probe");

    // StrictMode's setup -> cleanup -> setup mount cycle has run. The cleanup's
    // deferred disposal must have been cancelled by the immediate re-setup: the
    // machine must still be live.
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispose).not.toHaveBeenCalled();
    expect(button.textContent).toBe("0");

    // The keystone assertion: after the StrictMode cycle, an intent must still
    // drive state$. With the buggy eager-dispose the source Subject is completed
    // and this stays frozen at "0".
    await act(async () => {
      button.click();
    });
    expect(button.textContent).toBe("1");

    // A real unmount disposes exactly once (no leak).
    unmount();
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("disposes exactly once on a real unmount even after a StrictMode cycle (no leak)", async () => {
    const { machine, dispose } = makeLifecycleMachine();

    const { unmount } = render(
      <React.StrictMode>
        <Probe machine={machine} />
      </React.StrictMode>,
    );

    // StrictMode's mid-mount cleanup must not have disposed (re-setup cancels it).
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    // Deferred disposal runs on a microtask; flush it.
    await act(async () => {
      await Promise.resolve();
    });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
