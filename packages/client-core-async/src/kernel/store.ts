/** A synchronous, replay-current cell. Every async-core machine is a Store
 * plus async intent functions: `subscribe` hands the current value to the
 * listener before returning, which is the warmth guarantee the bindings
 * rely on (`toSignal` throws without it). */
export interface Store<S> {
  get(): S;
  set(next: S | ((previous: S) => S)): void;
  subscribe(listener: (value: S) => void): () => void;
}

export function createStore<S>(initial: S): Store<S> {
  let current = initial;
  const listeners = new Set<(value: S) => void>();

  return {
    get: () => {
      return current;
    },
    set: (next: S | ((previous: S) => S)) => {
      const value =
        typeof next === "function"
          ? (next as (previous: S) => S)(current)
          : next;

      if (Object.is(value, current)) {
        return;
      }

      current = value;

      for (const listener of [...listeners]) {
        listener(value);
      }
    },
    subscribe: (listener: (value: S) => void) => {
      listeners.add(listener);
      listener(current);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
