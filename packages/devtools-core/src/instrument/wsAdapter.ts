import type { DevtoolsHub } from "../DevtoolsHub";

/** Structural subset of core-api's IWsAdapter that the tap needs. */
export interface WsAdapterLike {
  on(type: string, handler: (payload: unknown) => void): () => void;
  send(type: string, payload?: unknown): void;
  sendIfOpen(type: string, payload?: unknown): boolean;
  rpc(type: string, payload?: unknown): Promise<unknown>;
}

export interface InstrumentWsAdapterOptions {
  /** Maps an outbound frame's payload to what the hub may see. The real
   * frame still goes to the socket unchanged; only the report is replaced.
   * A secret-bearing frame type (a person's own model key) is redacted here.
   * When it throws, the frame is sent and NOTHING is reported: a failed
   * redaction must never fall back to the raw payload. */
  readonly redactOut?: (type: string, payload: unknown) => unknown;
}

/** Wire tap: wraps send/sendIfOpen/on/rpc to report wire:out / wire:in. All other members
 * of the adapter delegate untouched (prototype methods via explicit binding).
 * Returns an object satisfying the SAME interface as the input. */
export function instrumentWsAdapter<T extends WsAdapterLike>(
  adapter: T,
  hub: DevtoolsHub,
  options: InstrumentWsAdapterOptions = {},
): T {
  const redactOut = options.redactOut;

  function reportOut(type: string, payload: unknown): void {
    try {
      hub.wireOut(type, redactOut ? redactOut(type, payload) : payload);
    } catch {
      // observation only: never block the real send
    }
  }

  return new Proxy(adapter, {
    get(t: T, p: string | symbol): unknown {
      if (p === "send") {
        return (type: string, payload?: unknown) => {
          reportOut(type, payload);
          t.send(type, payload);
        };
      }

      if (p === "sendIfOpen") {
        return (type: string, payload?: unknown) => {
          reportOut(type, payload);
          return t.sendIfOpen(type, payload);
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
          reportOut(type, payload);

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
