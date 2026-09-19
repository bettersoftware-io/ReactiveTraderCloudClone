import { spawn } from "#/kernel/spawn";
import { untilAborted } from "#/kernel/untilAborted";

export interface TopicOptions {
  /** Hand the most recent value to late subscribers (shareReplay bufferSize 1). */
  replay?: boolean;
}

/** A hot multicast channel with refCount semantics: the producer starts on
 * the first subscriber and is aborted on the last unsubscribe. This is
 * `shareReplay({ bufferSize: 1, refCount: true })` written once, explicitly,
 * instead of implied by an operator.
 *
 * Failure is TERMINAL, as it is for the operator this stands in for. After
 * `fail`, the topic is dead: a later `subscribe` is handed the latched error
 * synchronously and starts no producer, a later `publish` reaches nobody, and
 * a later `fail` is ignored. A consumer that resubscribes after an error must
 * get the error, never a fresh stream. */
export interface Topic<T> {
  subscribe(
    next: (value: T) => void,
    error?: (error: unknown) => void,
  ): () => void;
  publish(value: T): void;
  fail(error: unknown): void;
}

/** The replayed cell, boxed so `null` means "nothing published yet" rather
 * than colliding with a published value of `null`. */
interface Replayed<T> {
  value: T;
}

/** The terminal error, boxed for the same reason — `null` means "still
 * alive", which an error value of `null` would otherwise be confused with. */
interface Failed {
  error: unknown;
}

interface Subscriber<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
}

export function createTopic<T>(
  producer: (signal: AbortSignal, publish: (value: T) => void) => Promise<void>,
  options: TopicOptions = {},
): Topic<T> {
  const subscribers = new Set<Subscriber<T>>();
  let controller: AbortController | null = null;
  let last: Replayed<T> | null = null;
  let failed: Failed | null = null;

  function publish(value: T): void {
    if (failed !== null) {
      return;
    }

    if (options.replay === true) {
      last = { value };
    }

    for (const s of [...subscribers]) {
      s.next(value);
    }
  }

  function fail(error: unknown): void {
    if (failed !== null) {
      return;
    }

    failed = { error };

    for (const s of [...subscribers]) {
      s.error(error);
    }

    subscribers.clear();
    controller?.abort();
    controller = null;
    last = null;
  }

  return {
    publish,
    fail,
    subscribe: (
      next: (value: T) => void,
      error: (error: unknown) => void = () => {},
    ) => {
      if (failed !== null) {
        error(failed.error);
        return () => {};
      }

      const subscriber: Subscriber<T> = { next, error };
      subscribers.add(subscriber);

      if (last !== null) {
        next(last.value);
      }

      if (controller === null) {
        // Held in a local so the producer's signal is read without a non-null
        // assertion on the mutable `controller` (Biome's noNonNullAssertion).
        const started = new AbortController();
        controller = started;
        void spawn(() => {
          return producer(started.signal, publish);
        }, fail);
      }

      return () => {
        subscribers.delete(subscriber);

        if (subscribers.size === 0) {
          controller?.abort();
          controller = null;
          last = null;
        }
      };
    },
  };
}

/** A topic derived from another by a pure projection — `map` over a hot
 * source, keeping the replay-1 + refCount shape: the first subscriber here
 * subscribes the source (starting ITS producer if this is the source's first
 * subscriber too), the last unsubscribe releases it. A source failure is the
 * producer's rejection, so it fails this topic the way `spawn` fails any
 * other. */
export function mapTopic<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    async (signal, publish) => {
      // No initializer, so this is an assignment target rather than a
      // function-expression binding (rtc's `func-style` forbids `let x = ()
      // => {}`) — assigned synchronously below, before anything can read it.
      let stop: (() => void) | undefined;
      const sourceFailed = new Promise<never>((_, reject) => {
        stop = source.subscribe((value) => {
          publish(project(value));
        }, reject);
      });

      // Released SYNCHRONOUSLY on abort, matching the refCount contract's own
      // synchronous release (createTopic's unsubscribe aborts its controller
      // immediately, no microtask gap). Waiting on the `finally` below alone
      // would still release it — just a few microtask ticks late, since it
      // has to round-trip through `Promise.race` — which is late enough to
      // fail a caller that checks release state right after unsubscribing.
      signal.addEventListener(
        "abort",
        () => {
          stop?.();
        },
        { once: true },
      );

      try {
        await Promise.race([sourceFailed, untilAborted(signal)]);
      } finally {
        stop?.();
      }
    },
    { replay: true },
  );
}
