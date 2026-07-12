import { state } from "@rx-state/core";
import { renderHook } from "@solidjs/testing-library";
import { BehaviorSubject } from "rxjs";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import type { Machine } from "@rtc/client-core";

import { useMachine } from "#/useMachine";

describe("useMachine", () => {
  it("returns the current state$ value and updates when it emits", () => {
    const subject = new BehaviorSubject(42);
    const { machine } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { result } = renderHook(() => {
      return useMachine(factory);
    });
    expect(result.state()).toBe(42);

    subject.next(99);
    expect(result.state()).toBe(99);
  });

  it("passes intent methods through", () => {
    const subject = new BehaviorSubject(0);
    const { machine, intent } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { result } = renderHook(() => {
      return useMachine(factory);
    });
    result.intent();
    expect(intent).toHaveBeenCalledTimes(1);
  });

  it("calls the factory exactly once", () => {
    const factory = vi.fn(() => {
      return makeTestMachine(new BehaviorSubject(0)).machine;
    });

    renderHook(() => {
      return useMachine(factory);
    });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("does NOT dispose while still mounted", () => {
    const subject = new BehaviorSubject(0);
    const { machine, dispose } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    renderHook(() => {
      return useMachine(factory);
    });
    expect(dispose).not.toHaveBeenCalled();
  });

  it("calls dispose() exactly once on unmount", () => {
    const subject = new BehaviorSubject(0);
    const { machine, dispose } = makeTestMachine(subject);
    const factory = vi.fn(() => {
      return machine;
    });

    const { cleanup } = renderHook(() => {
      return useMachine(factory);
    });
    expect(dispose).not.toHaveBeenCalled();

    cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);

    cleanup();
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

interface TestMachineIntents {
  intent: () => void;
}

interface TestMachine<S> {
  machine: Machine<S, TestMachineIntents>;
  intent: Mock<() => void>;
  dispose: Mock<() => void>;
  subject: BehaviorSubject<S>;
}

/** Build a minimal test machine from a BehaviorSubject.
 * We subscribe immediately so the StateObservable stays warm
 * for the duration of the test. */
function makeTestMachine<S>(subject: BehaviorSubject<S>): TestMachine<S> {
  const state$ = state(subject, subject.getValue());
  // Keep the StateObservable warm (ref-count > 0) so toSignal can
  // read the synchronous default without entering Suspense.
  const sub = state$.subscribe();

  const intent = vi.fn();
  const dispose = vi.fn(() => {
    sub.unsubscribe();
  });

  const machine: Machine<S, TestMachineIntents> = {
    state$,
    intents: { intent },
    dispose,
  };
  return { machine, intent, dispose, subject };
}
