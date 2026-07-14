import type { DevtoolsHub } from "../DevtoolsHub";

/** Structural subset of client-core's IWsAdapter that the tap needs. */
export interface WsAdapterLike {
  on(type: string, handler: (payload: unknown) => void): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
}

/** Wire tap: wraps send/on/rpc to report wire:out / wire:in. All other members
 * of the adapter delegate untouched (prototype methods via explicit binding).
 * Returns an object satisfying the SAME interface as the input. */
export function instrumentWsAdapter<T extends WsAdapterLike>(
  adapter: T,
  hub: DevtoolsHub,
): T {
  return new Proxy(adapter, {
    get(t: T, p: string | symbol): unknown {
      if (p === "send") {
        return (type: string, payload?: unknown) => {
          try {
            hub.wireOut(type, payload);
          } catch {
            // never block the real send
          }

          t.send(type, payload);
        };
      }

      if (p === "on") {
        return (type: string, handler: (payload: unknown) => void) => {
          return t.on(type, (payload) => {
            try {
              hub.wireIn(type, payload);
            } catch {
              // never block the real handler
            }

            handler(payload);
          });
        };
      }

      if (p === "rpc") {
        return (type: string, payload?: unknown) => {
          try {
            hub.wireOut(type, payload);
          } catch {
            // never block the rpc
          }

          return t.rpc(type, payload).then((result) => {
            try {
              hub.wireIn(`${type}:reply`, result);
            } catch {
              // observation only
            }

            return result;
          });
        };
      }

      const value = Reflect.get(t, p, t);
      return typeof value === "function"
        ? (value as CallableFunction).bind(t)
        : value;
    },
  }) as T;
}
