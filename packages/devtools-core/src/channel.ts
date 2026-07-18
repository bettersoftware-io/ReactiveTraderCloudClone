import type { Observable } from "rxjs";
import { Subject } from "rxjs";

/** Symmetric message duplex. The hub's DevtoolsTransport is structurally
 * Duplex<AppToInspector, InspectorToApp>; the inspector uses the flip. */
export interface Duplex<TSend, TRecv> {
  send(msg: TSend): void;
  inbound$: Observable<TRecv>;
  dispose(): void;
}

export { BroadcastChannelDuplex } from "./BroadcastChannelDuplex";

export function createInMemoryDuplexPair<TA, TB>(): [
  Duplex<TA, TB>,
  Duplex<TB, TA>,
] {
  const aToB = new Subject<TA>();
  const bToA = new Subject<TB>();
  let closed = false;
  const a: Duplex<TA, TB> = {
    send: (msg: TA): void => {
      if (!closed) {
        aToB.next(msg);
      }
    },
    inbound$: bToA.asObservable(),
    dispose: (): void => {
      closed = true;
    },
  };

  const b: Duplex<TB, TA> = {
    send: (msg: TB): void => {
      if (!closed) {
        bToA.next(msg);
      }
    },
    inbound$: aToB.asObservable(),
    dispose: (): void => {
      closed = true;
    },
  };
  return [a, b];
}
