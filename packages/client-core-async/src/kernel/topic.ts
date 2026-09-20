import { relayTopic } from "#/kernel/relayTopic";
import { reportAsync } from "#/kernel/reportAsync";
import { spawn } from "#/kernel/spawn";

export interface TopicOptions {
  /** Hand the most recent value to late subscribers (shareReplay bufferSize 1). */
  replay?: boolean;
  /** Keep the producer running across zero subscribers until this signal
   * aborts — the RxJS core's `warmReplay` (`shareReplay({ refCount: false
   * })`) for an app-lifetime singleton. The abort ends the run and forgets
   * the replayed value; subscribers attached at that moment hear nothing
   * more (silence after `dispose()` is the shared behaviour, §22), and a
   * later subscriber starts a fresh run. Failure still resets, as ever. */
  retainUntil?: AbortSignal;
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
 * macrotask (`reportAsync`), as rxjs's `SafeSubscriber` does — on the
 * replayed value handed to a late subscriber exactly as on a live one.
 * That isolation covers a CONSUMER's `next` and nothing else: an OPERATOR
 * built on a Topic (`mapTopic`) turns its own projection error into a
 * stream failure instead, as rxjs's `map` does. `publish()`
 * from outside reaches subscribers only while a producer run is live; on a
 * cold or reset topic it is dropped, never latched.
 *
 * `retainUntil` (`TopicOptions`) relaxes the refCount half alone: the
 * producer then survives zero subscribers and is ended by that signal
 * instead — `shareReplay({ refCount: false })`, the RxJS core's
 * `warmReplay`. Everything above still holds; only the moment the run ends
 * moves. */
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

  function retained(): boolean {
    return options.retainUntil !== undefined && !options.retainUntil.aborted;
  }

  options.retainUntil?.addEventListener(
    "abort",
    () => {
      if (run !== null) {
        endRun(run);
      }
    },
    { once: true },
  );

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
        // Isolated exactly as `deliver` isolates a live value: a thrower
        // here would otherwise escape `subscribe()` itself — the caller
        // never receives its unsubscribe closure, while the subscriber is
        // already in the set, pinning the producer for good.
        try {
          next(last.value);
        } catch (error) {
          reportAsync(error);
        }
      }

      if (run === null) {
        startRun();
      }

      return () => {
        subscribers.delete(subscriber);

        if (subscribers.size === 0 && run !== null && !retained()) {
          endRun(run);
        }
      };
    },
  };
}

/** A topic derived from another by a pure projection — `map` over a hot
 * source, keeping the replay-1 + refCount shape: the first subscriber here
 * subscribes the source (starting ITS producer if this is the source's first
 * subscriber too), the last unsubscribe releases it. A throwing projection
 * fails this topic, as rxjs's `map` does (`relayTopic`'s rule). */
export function mapTopic<T, U>(
  source: Topic<T>,
  project: (value: T) => U,
): Topic<U> {
  return createTopic<U>(
    (signal, publish) => {
      return relayTopic(source, signal, (value) => {
        publish(project(value));
      });
    },
    { replay: true },
  );
}
