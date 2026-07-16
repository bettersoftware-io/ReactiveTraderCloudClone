import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import type { Duplex } from "@rtc/devtools-core";

import type { ConnectFn, RuntimePort } from "#/ports";

/** A `Duplex` over a `chrome.runtime.Port`. The port can die at any time (MV3
 * service workers are killed after ~30s idle), so on disconnect — unless
 * disposed — it transparently reconnects a fresh port via the injected
 * `ConnectFn`. It buffers nothing: the `InspectorClient` re-sends `hello` while
 * disconnected (PR #189), so a reconnected port resynchronises on its own. */
export class ChromeRuntimeDuplex<TSend, TRecv> implements Duplex<TSend, TRecv> {
  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  private port: RuntimePort;

  private disposed = false;

  constructor(private readonly connect: ConnectFn) {
    this.port = this.open();
  }

  private open(): RuntimePort {
    const port = this.connect();

    port.onMessage.addListener((msg: unknown): void => {
      this.inboundSubject.next(msg as TRecv);
    });

    port.onDisconnect.addListener((): void => {
      if (!this.disposed) {
        this.port = this.open();
      }
    });

    return port;
  }

  send(msg: TSend): void {
    if (!this.disposed) {
      this.port.postMessage(msg);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.port.disconnect();
    this.inboundSubject.complete();
  }
}
