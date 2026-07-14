import type { Subscription } from "rxjs";

import type { Duplex } from "./channel";
import type { InspectorStore } from "./InspectorStore";
import type { AppToInspector, InspectorToApp } from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";

const PING_INTERVAL_MS = 2000;

/** Panel-side handshake driver. Sends hello on `start()`, pings the app every
 * 2s (the hub's heartbeat), and pipes every inbound `AppToInspector` message
 * into the store. `dispose()` sends bye and stops pinging. */
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
      this.channel.send({ kind: "ping" });
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
