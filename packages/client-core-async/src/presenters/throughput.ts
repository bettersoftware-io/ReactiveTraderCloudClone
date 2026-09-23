import {
  THROUGHPUT_SET_ERROR,
  throughputSetMessage,
} from "@rtc/client-core";
import type {
  ThroughputMessage,
  ThroughputPresenter,
  ThroughputView,
} from "@rtc/core-api";
import {
  type AdminPort,
  DEFAULT_THROUGHPUT,
  THROUGHPUT_DEBOUNCE_MS,
  THROUGHPUT_MESSAGE_DISMISS_MS,
} from "@rtc/domain";

import { once } from "#/bridge/in";
import { storeToStateStream } from "#/bridge/out";
import { AbortError } from "#/kernel/AbortError";
import { reportAsync } from "#/kernel/reportAsync";
import { createRunSlot, type Run } from "#/kernel/runSlot";
import { sleep } from "#/kernel/sleep";
import { spawn } from "#/kernel/spawn";
import { createStore } from "#/kernel/store";

const INITIAL: ThroughputView = {
  value: DEFAULT_THROUGHPUT,
  loading: true,
  message: null,
};

/** The admin throughput control. The load is subscribed on the first
 * subscriber (the RxJS core loads lazily too), once per app and lands `{ value, loading: false }`, or
 * the default on failure. `setValue` echoes the value at once, then persists
 * it after `THROUGHPUT_DEBOUNCE_MS` of quiet: a keystroke restarts only the
 * debounce TIMER, never an in-flight write. When the timer fires, the write
 * slot supersedes the previous write AND its banner dismiss — the RxJS
 * `debounceTime` → `switchMap`, so supersede happens at the debounce, not
 * the keystroke. Each write shows a banner that clears after
 * `THROUGHPUT_MESSAGE_DISMISS_MS`. */
export function createThroughputPresenter(
  admin: AdminPort,
  lifetime: AbortSignal,
): ThroughputPresenter {
  const store = createStore<ThroughputView>(INITIAL);
  const writes = createRunSlot(store);
  let debounce: AbortController | null = null;
  let loadStarted = false;
  // The port METHOD is called once, here, as the RxJS core does; only the
  // subscription to its result waits for the first subscriber.
  const load$ = admin.getThroughput();

  async function load(): Promise<void> {
    try {
      const value = await once(load$, lifetime);
      store.set((view) => {
        return { ...view, value, loading: false };
      });
    } catch (error) {
      if (error instanceof AbortError) {
        return;
      }

      store.set((view) => {
        return { ...view, value: DEFAULT_THROUGHPUT, loading: false };
      });
    }
  }

  function startLoadOnce(): void {
    if (loadStarted || lifetime.aborted) {
      return;
    }

    loadStarted = true;
    void spawn(load, reportAsync);
  }

  async function persist(run: Run<ThroughputView>, value: number): Promise<void> {
    let message: ThroughputMessage;

    try {
      await once(admin.setThroughput(value), run.signal);
      message = { text: throughputSetMessage(value), isError: false };
    } catch (error) {
      if (error instanceof AbortError) {
        throw error;
      }

      message = { text: THROUGHPUT_SET_ERROR, isError: true };
    }

    run.set((view) => {
      return { ...view, message };
    });
    await sleep(THROUGHPUT_MESSAGE_DISMISS_MS, run.signal);
    run.set((view) => {
      return { ...view, message: null };
    });
  }

  async function persistAfterQuiet(
    timer: AbortSignal,
    value: number,
  ): Promise<void> {
    await sleep(THROUGHPUT_DEBOUNCE_MS, timer);
    writes.start((run) => {
      return persist(run, value);
    });
  }

  function setValue(value: number): void {
    if (lifetime.aborted) {
      return;
    }

    store.set((view) => {
      return { ...view, value };
    });
    debounce?.abort();
    const timer = new AbortController();
    debounce = timer;
    void spawn(() => {
      return persistAfterQuiet(timer.signal, value);
    }, reportAsync);
  }

  lifetime.addEventListener(
    "abort",
    () => {
      debounce?.abort();
      writes.dispose();
    },
    { once: true },
  );

  return {
    state$: storeToStateStream(store, startLoadOnce),
    setValue,
  };
}
