import { reportAsync } from "#/kernel/reportAsync";
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
 * Failure RESETS the topic, as that operator does (`share({ resetOnError:
 * true })`): every subscriber is handed the error and dropped, the producer
 * is aborted, the replayed value is forgotten, and the NEXT subscriber starts
 * a fresh producer — never the old error. A late publish or failure from a
 * producer run that has already ended reaches nobody. A subscriber that
 * throws does not stop delivery to the others: its error is rethrown on a
 * macrotask (`reportAsync`), as rxjs's `SafeSubscriber` does. `publish()`
 * from outside reaches subscribers only while a producer run is live; on a
 * cold or reset topic it is dropped, never latched. */
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

interface Subscriber<T> {
  next: (value: T) => void;
  error: (error: unknown) => void;
}

/** One producer run: the controller that ends it. A run's `publish`/`fail`
 * are bound to it, so a run that has been superseded cannot reach the
 * subscribers of a later one. */
interface ProducerRun {
  readonly controller: AbortController;
}

export function createTopic<T>(
  producer: (signal: AbortSignal, publish: (value: T) => void) => Promise<void>,
  options: TopicOptions = {},
): Topic<T> {
  const subscribers = new Set<Subscriber<T>>();
  let run: ProducerRun | null = null;
  let last: Replayed<T> | null = null;

  function deliver(value: T): void {
    if (options.replay === true) {
      last = { value };
    }

    for (const s of [...subscribers]) {
      try {
        s.next(value);
      } catch (error) {
        reportAsync(error);
      }
    }
  }

  function endRun(current: ProducerRun): void {
    if (run === current) {
      run = null;
    }

    current.controller.abort();
    last = null;
  }

  function failFrom(current: ProducerRun, error: unknown): void {
    if (run !== current) {
      return;
    }

    endRun(current);
    const failing = [...subscribers];
    subscribers.clear();

    for (const s of failing) {
      try {
        s.error(error);
      } catch (thrown) {
        reportAsync(thrown);
      }
    }
  }

  function startRun(): void {
    const current: ProducerRun = { controller: new AbortController() };
    run = current;
    void spawn(
      () => {
        return producer(current.controller.signal, (value) => {
          if (run === current) {
            deliver(value);
          }
        });
      },
      (error) => {
        failFrom(current, error);
      },
    );
  }

  return {
    publish: (value: T) => {
      if (run !== null) {
        deliver(value);
      }
    },
    fail: (error: unknown) => {
      if (run !== null) {
        failFrom(run, error);
      }
    },
    subscribe: (
      next: (value: T) => void,
      error: (error: unknown) => void = () => {},
    ) => {
      const subscriber: Subscriber<T> = { next, error };
      subscribers.add(subscriber);

      if (last !== null) {
        next(last.value);
      }

      if (run === null) {
        startRun();
      }

      return () => {
        subscribers.delete(subscriber);

        if (subscribers.size === 0 && run !== null) {
          endRun(run);
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
