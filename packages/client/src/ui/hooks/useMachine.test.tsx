import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { state } from "@rx-state/core";
import { BehaviorSubject } from "rxjs";
import { useMachine } from "./useMachine";
import type { Machine } from "../../app/presenters/machine";

/** Build a minimal test machine from a BehaviorSubject.
 * We subscribe immediately so the StateObservable stays warm
 * for the duration of the test. */
function makeTestMachine<S>(subject: BehaviorSubject<S>) {
  const state$ = state(subject, subject.getValue());
  // Keep the StateObservable warm (ref-count > 0) so useStateObservable can
  // read the synchronous default without entering Suspense.
  const sub = state$.subscribe();

  const intent = vi.fn();
  const dispose = vi.fn(() => sub.unsubscribe());

  const machine: Machine<S, { intent: () => void }> = {
    state$,
    intents: { intent },
    dispose,
  };
  return { machine, intent, dispose, subject };
}

describe("useMachine", () => {
  it("calls the factory exactly once across re-renders", () => {
    const factory = vi.fn(() => makeTestMachine(new BehaviorSubject(0)).machine);
    const { rerender } = renderHook(() => useMachine(factory));
    rerender();
    rerender();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("returns the current state$ value and re-renders when it emits", () => {
    const subject = new BehaviorSubject(42);
    const { machine } = makeTestMachine(subject);
    const factory = vi.fn(() => machine);

    const { result } = renderHook(() => useMachine(factory));
    expect(result.current.state).toBe(42);

    act(() => subject.next(99));
    expect(result.current.state).toBe(99);
  });

  it("passes intent methods through and keeps stable references across re-renders", () => {
    const subject = new BehaviorSubject(0);
    const { machine } = makeTestMachine(subject);
    const factory = vi.fn(() => machine);

    const { result, rerender } = renderHook(() => useMachine(factory));
    const intentRef = result.current.intent;

    rerender();
    expect(result.current.intent).toBe(intentRef);
  });

  it("calls dispose() exactly once on unmount and NOT on re-render", () => {
    const subject = new BehaviorSubject(0);
    const { machine, dispose } = makeTestMachine(subject);
    const factory = vi.fn(() => machine);

    const { rerender, unmount } = renderHook(() => useMachine(factory));
    rerender();
    rerender();
    expect(dispose).not.toHaveBeenCalled();

    unmount();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("calls the factory exactly once even inside React.StrictMode (StrictMode-safe lazy ref)", () => {
    const factory = vi.fn(() => makeTestMachine(new BehaviorSubject(0)).machine);
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <React.StrictMode>{children}</React.StrictMode>
    );
    renderHook(() => useMachine(factory), { wrapper });
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
