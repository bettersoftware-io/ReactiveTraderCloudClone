import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import type { Duplex } from "./channel";

/** BroadcastChannel adapter — same-origin only (why the panel is served from
 * the app's origin: /devtools route in prod, Vite middleware in dev). */
export class BroadcastChannelDuplex<TSend, TRecv>
  implements Duplex<TSend, TRecv>
{
  private readonly channel: BroadcastChannel;

  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  constructor(channelName: string) {
    this.channel = new BroadcastChannel(channelName);

    this.channel.onmessage = (ev: MessageEvent): void => {
      this.inboundSubject.next(ev.data as TRecv);
    };
  }

  send(msg: TSend): void {
    this.channel.postMessage(msg);
  }

  dispose(): void {
    this.channel.close();
    this.inboundSubject.complete();
  }
}
