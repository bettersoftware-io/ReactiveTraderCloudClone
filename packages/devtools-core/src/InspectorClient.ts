import type { Subscription } from "rxjs";

import type { Duplex } from "./channel";
import type { InspectorStore } from "./InspectorStore";
import type { AppToInspector, InspectorToApp } from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";

const PING_INTERVAL_MS = 2000;

/** Panel-side handshake driver. Sends hello on `start()`, then every 2s
 * re-announces with hello while disconnected (so connecting is order-
 * independent and survives an app reload) or pings once connected (the hub's
 * heartbeat). Pipes every inbound `AppToInspector` message into the store.
 * `dispose()` sends bye and stops the timer. */
export class InspectorClient {
  private readonly channel: Duplex<InspectorToApp, AppToInspector>;

  private readonly store: InspectorStore;

  private inboundSub: Subscription | null = null;

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    channel: Duplex<InspectorToApp, AppToInspector>,
    store: InspectorStore,
  ) {
    this.channel = channel;
    this.store = store;
  }

  start(): void {
    // Subscribe before sending hello: over a synchronous transport (e.g. the
    // in-memory pair used in tests) the hub answers hello with welcome+snapshot
    // synchronously, and a plain Subject drops next() calls with no
    // subscriber yet — subscribing first guarantees that reply isn't lost.
    this.inboundSub = this.channel.inbound$.subscribe((msg) => {
      this.store.apply(msg);
    });
    this.channel.send({ kind: "hello", v: PROTOCOL_VERSION });
    this.pingTimer = setInterval(() => {
      // Until the app answers (store.connected flips on `welcome`), keep
      // re-announcing so connecting is order-independent: the panel can be
      // opened before the app is ready, and it auto-reconnects after an app
      // reload (which sends `bye` via pagehide, flipping us back to hello).
      // Once connected, `ping` is the heartbeat the hub's 10s timeout watches.
      if (this.store.getSnapshot().connected) {
        this.channel.send({ kind: "ping" });
      } else {
        this.channel.send({ kind: "hello", v: PROTOCOL_VERSION });
      }
    }, PING_INTERVAL_MS);
  }

  dispose(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    this.channel.send({ kind: "bye" });
    this.inboundSub?.unsubscribe();
    this.inboundSub = null;
  }
}
