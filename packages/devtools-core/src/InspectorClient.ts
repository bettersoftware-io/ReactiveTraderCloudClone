import type { Subscription } from "rxjs";

import type { Duplex } from "./channel";
import type { InspectorStore } from "./InspectorStore";
import type { AppToInspector, InspectorToApp } from "./protocol";
import { PROTOCOL_VERSION } from "./protocol";

const PING_INTERVAL_MS = 2000;

/** No inbound `AppToInspector` traffic at all (`welcome`, `snapshot`, or
 * `batch` — `ping` only flows the other way, panel to app) for this long
 * while connected means the app is gone without a `bye` (crashed or killed
 * tab, no pagehide). Set to 3x this client's own `PING_INTERVAL_MS` so a
 * couple of quiet flush cycles don't cause a false positive. */
const LIVENESS_TIMEOUT_MS = 6000;

/** Panel-side handshake driver. Sends hello on `start()`, then every 2s
 * re-announces with hello while disconnected (so connecting is order-
 * independent and survives an app reload) or pings once connected (the hub's
 * heartbeat). Pipes every inbound `AppToInspector` message into the store.
 * Also runs a liveness timer, reset on every inbound message: if it expires
 * while connected (no inbound traffic at all within the window), applies a
 * synthetic `bye` to flip the store to disconnected; the hello loop above
 * keeps re-announcing, so the handshake re-runs and reconnects if the app
 * returns.
 * `dispose()` sends bye and stops both timers. */
export class InspectorClient {
  private readonly channel: Duplex<InspectorToApp, AppToInspector>;

  private readonly store: InspectorStore;

  private inboundSub: Subscription | null = null;

  private pingTimer: ReturnType<typeof setInterval> | null = null;

  private livenessTimer: ReturnType<typeof setTimeout> | null = null;

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
      this.resetLiveness();
      this.store.apply(msg);
    });
    this.channel.send({ kind: "hello", v: PROTOCOL_VERSION });
    this.resetLiveness();
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

  /** Fire a live machine's intent from the inspector. The app-side hub only
   * acts on this in a dev build (the handler is compiled out of production —
   * see DevtoolsHub.attachTransport); against a prod app it is a silent no-op.
   * Independent of the handshake/heartbeat loop — just a send. */
  invokeIntent(
    machineId: string,
    name: string,
    args: readonly unknown[],
  ): void {
    this.channel.send({ kind: "intent:invoke", machineId, name, args });
  }

  dispose(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer);
      this.livenessTimer = null;
    }

    this.channel.send({ kind: "bye" });
    this.inboundSub?.unsubscribe();
    this.inboundSub = null;
  }

  private resetLiveness(): void {
    if (this.livenessTimer !== null) {
      clearTimeout(this.livenessTimer);
    }

    this.livenessTimer = setTimeout((): void => {
      if (this.store.getSnapshot().connected) {
        this.store.apply({ kind: "bye" });
      }
    }, LIVENESS_TIMEOUT_MS);
  }
}
