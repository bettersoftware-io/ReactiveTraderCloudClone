import type { Observable } from "rxjs";
import { Subject } from "rxjs";

import type { Duplex } from "./channel";

/** The structural subset of the platform `WebSocket` this adapter drives.
 * Declaring it ourselves (instead of leaning on the DOM `WebSocket` lib type)
 * keeps `@rtc/devtools-core` free of a DOM-lib dependency and lets the adapter
 * be unit-tested with a plain controllable fake in node. The real global
 * `WebSocket` (browsers, React Native, Node 26) is structurally compatible via
 * the default factory. */
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: WebSocketMessageEvent) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

/** The shape of the `MessageEvent` this adapter reads — just the `data` field
 * carried across the structural `WebSocketLike.onmessage` handler. */
export interface WebSocketMessageEvent {
  data: unknown;
}

/** Opens a socket to `url`. Injected so tests supply a fake; the default reaches
 * the platform `WebSocket` via `globalThis`. */
export type WebSocketFactory = (url: string) => WebSocketLike;

const WS_OPEN = 1;
const DEFAULT_RECONNECT_DELAY_MS = 1000;

/** `globalThis`, narrowed to the one member this module reads off it. */
interface GlobalWithWebSocket {
  WebSocket?: new (url: string) => WebSocketLike;
}

function defaultWebSocketFactory(url: string): WebSocketLike {
  const Ctor = (globalThis as GlobalWithWebSocket).WebSocket;

  if (!Ctor) {
    throw new Error(
      "WsRelayDuplex: no global WebSocket is available in this environment",
    );
  }

  return new Ctor(url);
}

/** A `Duplex` (and therefore a `DevtoolsTransport`) over a WebSocket to the
 * standalone devtools relay — the React-Native / cross-machine counterpart of
 * `BroadcastChannelDuplex`, for environments with no same-origin
 * `BroadcastChannel`. The RN app opens `role: "app"`, the browser panel opens
 * `role: "panel"`, and the relay forwards frames between them.
 *
 * Frames are JSON (the wire protocol is JSON-serializable by design), so `send`
 * stringifies and inbound messages are parsed. Pre-open sends are buffered and
 * flushed on open (mirroring `WsAdapter`); a dropped socket transparently
 * reconnects until `dispose()` — the v1 `InspectorClient` re-hello / hub
 * re-welcome path resynchronises over the fresh socket. */
export class WsRelayDuplex<TSend, TRecv> implements Duplex<TSend, TRecv> {
  private readonly inboundSubject = new Subject<TRecv>();

  readonly inbound$: Observable<TRecv> = this.inboundSubject.asObservable();

  private readonly taggedUrl: string;

  private readonly createSocket: WebSocketFactory;

  private readonly reconnectDelayMs: number;

  private readonly sendQueue: string[] = [];

  private socket: WebSocketLike | null = null;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private disposed = false;

  constructor(
    url: string,
    role: "app" | "panel",
    createSocket: WebSocketFactory = defaultWebSocketFactory,
    reconnectDelayMs: number = DEFAULT_RECONNECT_DELAY_MS,
  ) {
    this.taggedUrl = url.includes("?")
      ? `${url}&role=${role}`
      : `${url}?role=${role}`;
    this.createSocket = createSocket;
    this.reconnectDelayMs = reconnectDelayMs;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) {
      return;
    }

    const socket = this.createSocket(this.taggedUrl);
    this.socket = socket;

    socket.onopen = (): void => {
      this.flushSendQueue();
    };

    socket.onmessage = (event: WebSocketMessageEvent): void => {
      let parsed: TRecv;

      try {
        parsed = JSON.parse(String(event.data)) as TRecv;
      } catch {
        return;
      }

      this.inboundSubject.next(parsed);
    };

    socket.onclose = (): void => {
      if (this.disposed) {
        return;
      }

      this.scheduleReconnect();
    };

    socket.onerror = (): void => {
      // onclose fires after onerror; reconnection is handled there.
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout((): void => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelayMs);
  }

  private flushSendQueue(): void {
    if (this.socket?.readyState !== WS_OPEN) {
      return;
    }

    for (const frame of this.sendQueue) {
      this.socket.send(frame);
    }

    this.sendQueue.length = 0;
  }

  send(msg: TSend): void {
    if (this.disposed) {
      return;
    }

    const frame = JSON.stringify(msg);

    if (this.socket?.readyState === WS_OPEN) {
      this.socket.send(frame);
    } else {
      this.sendQueue.push(frame);
    }
  }

  dispose(): void {
    this.disposed = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.sendQueue.length = 0;
    this.socket?.close();
    this.socket = null;
    this.inboundSubject.complete();
  }
}
