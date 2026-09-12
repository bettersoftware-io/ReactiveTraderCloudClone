import { spawn } from "#/kernel/spawn";

export interface TopicOptions {
  /** Hand the most recent value to late subscribers (shareReplay bufferSize 1). */
  replay?: boolean;
}

/** A hot multicast channel with refCount semantics: the producer starts on
 * the first subscriber and is aborted on the last unsubscribe. This is
 * `shareReplay({ bufferSize: 1, refCount: true })` written once, explicitly,
 * instead of implied by an operator. */
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

export function createTopic<T>(
  producer: (signal: AbortSignal, publish: (value: T) => void) => Promise<void>,
  options: TopicOptions = {},
): Topic<T> {
  const subscribers = new Set<Subscriber<T>>();
  let controller: AbortController | null = null;
  let last: Replayed<T> | null = null;

  function publish(value: T): void {
    if (options.replay === true) {
      last = { value };
    }

    for (const s of [...subscribers]) {
      s.next(value);
    }
  }

  function fail(error: unknown): void {
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
