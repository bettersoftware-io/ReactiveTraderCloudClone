/**
 * WebSocket transport adapter.
 * Manages connection lifecycle and message routing between client and server.
 */

import { type Observable, ReplaySubject } from "rxjs";

import type { IWsAdapter, MessageHandler } from "@rtc/core-api";
import type { ConnectionEvent } from "@rtc/domain";

import { buildWsUrl } from "#/wsUrl";

interface WsMessage {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

interface PendingRpc {
  resolve: (p: unknown) => void;
  reject: (e: Error) => void;
}

const DEFAULT_RECONNECT_DELAY_MS = 3_000;

export interface WsAdapterOptions {
  reconnectDelayMs?: number;
  /** Whether to open the socket from the constructor. Defaults to `true` for
   * back-compat. Composition roots that gate the transport behind
   * authentication pass `false` and drive `connect()`/`disconnect()` from the
   * auth state instead — otherwise the socket opens tokenless at app mount,
   * is rejected by the server's `verifyClient` upgrade check, and retries
   * forever behind the login screen. */
  autoConnect?: boolean;
}

export class WsAdapter implements IWsAdapter {
  private ws: WebSocket | null = null;

  private readonly url: string;

  private readonly tokenProvider: () => string | undefined;

  private readonly reconnectDelayMs: number;

  private readonly handlers = new Map<string, Set<MessageHandler>>();

  private readonly pendingRpcs = new Map<string, PendingRpc>();

  // Messages issued before the socket reaches OPEN, held until onopen flushes
  // them. Without this, a subscription sent in the same tick as construction
  // (before the handshake completes) would be silently dropped and the stream
  // would never start.
  private readonly sendQueue: string[] = [];

  private nextCorrelationId = 1;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private disposed = false;

  // Socket was closed deliberately (idle timeout, or a sign-out / not-yet-
  // signed-in auth gate) rather than dropped. Suppresses auto-reconnect until
  // an explicit reopen()/connect().
  private suspended = false;

  // The suspension is an idle close, the only kind reopen() may undo. A
  // sign-out (or a socket not yet opened) is suspended too, and reopening
  // that one would send a tokenless upgrade.
  private closedForIdle = false;

  private readonly connectionEvents$ = new ReplaySubject<ConnectionEvent>(1);

  constructor(
    url: string,
    tokenProvider: () => string | undefined,
    options: WsAdapterOptions = {},
  ) {
    this.url = url;
    this.tokenProvider = tokenProvider;
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;

    if (options.autoConnect ?? true) {
      this.openSocket();
    } else {
      // Nothing is open yet, so a later connect() must not be treated as a
      // redundant call on a live socket.
      this.suspended = true;
    }
  }

  /** Open the socket if it isn't already live. Idempotent — safe to call on
   * every authenticated emission. Clears the suspend flag so the normal
   * auto-reconnect behaviour resumes for genuine drops. */
  connect(): void {
    if (this.disposed || this.ws !== null) {
      return;
    }

    this.suspended = false;
    this.closedForIdle = false;
    this.openSocket();
  }

  /** Close the socket deliberately (sign-out) and suppress auto-reconnect, so
   * the adapter goes quiet instead of retrying tokenless upgrades. The
   * adapter stays reusable — a later connect() re-establishes it. */
  disconnect(): void {
    // A sign-out outranks an idle close: only connect() opens it again.
    this.closedForIdle = false;

    if (this.disposed || this.suspended) {
      return;
    }

    this.suspended = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.releaseSocket();
  }

  private openSocket(): void {
    if (this.disposed) {
      return;
    }

    // Read the token fresh on every (re)connect — never baked into `url` — so
    // a token that changes between disconnects (e.g. re-login) is picked up
    // without recreating the adapter.
    const target = buildWsUrl(this.url, this.tokenProvider());
    const socket = new WebSocket(target);
    this.ws = socket;

    // A socket the adapter has let go of (closed on purpose, see
    // releaseSocket) still fires its handlers, and its `close` event can
    // arrive seconds later with no network. None of them may speak for the
    // adapter: a late `close` would schedule a reconnect and open a second
    // socket beside the live one, which no later disconnect() could reach,
    // and a late `open` would report a connection nobody holds.
    const isReleased = (): boolean => {
      return this.ws !== socket;
    };

    socket.onopen = (): void => {
      if (isReleased()) {
        return;
      }

      console.log("[WsAdapter] Connected to", this.url.split("?")[0]);
      this.connectionEvents$.next({ type: "gatewayConnected" });
      this.flushSendQueue();
    };

    socket.onmessage = (event: MessageEvent): void => {
      if (isReleased()) {
        return;
      }

      let msg: WsMessage;

      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      // Handle RPC responses
      if (msg.correlationId && this.pendingRpcs.has(msg.correlationId)) {
        const rpc = this.pendingRpcs.get(msg.correlationId);

        if (rpc) {
          this.pendingRpcs.delete(msg.correlationId);
          rpc.resolve(msg.payload);
          return;
        }
      }

      // Route to stream handlers
      const handlers = this.handlers.get(msg.type);

      if (handlers) {
        // Snapshot before iterating: a handler can synchronously complete an
        // Rx subscriber whose downstream (e.g. JarvisMachine's concatMap)
        // starts a new turn that registers a fresh handler for this same
        // `msg.type` — and ES `Set` iterators DO visit mid-iteration
        // insertions. Iterating the live Set would let that new handler run
        // against THIS frame (a stale/foreign payload) and, if it's a
        // done/error handler, instantly complete the new turn before its own
        // reply ever arrives.
        for (const handler of [...handlers]) {
          handler(msg.payload);
        }
      }
    };

    socket.onclose = (): void => {
      if (this.disposed || isReleased()) {
        return;
      }

      // Only a genuine drop reaches here: a deliberate close (idle timeout
      // or sign-out) released the socket first and reported it itself.
      this.connectionEvents$.next({ type: "gatewayDisconnected" });

      console.log(
        "[WsAdapter] Disconnected, reconnecting in",
        this.reconnectDelayMs,
        "ms",
      );
      this.scheduleReconnect();
    };

    socket.onerror = (): void => {
      // onclose will fire after onerror
    };
  }

  /** Closes the current socket on purpose and reports it. The socket's own
   * `close` event is ignored from here on (it may come late, or after a
   * replacement), so the adapter says `gatewayDisconnected` itself — one
   * microtask later, so the event whose handling closed the socket (an
   * `idleTimeout` passing through `routeIdleLifecycle`) reaches the reducer
   * first, as it did when the socket's `close` event reported it. Nothing
   * is reported if the socket has been reopened by then. */
  private releaseSocket(): void {
    const ws = this.ws;

    if (ws === null) {
      return;
    }

    this.ws = null;
    ws.close();
    queueMicrotask(() => {
      if (!this.disposed && this.ws === null) {
        this.connectionEvents$.next({ type: "gatewayDisconnected" });
      }
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) {
        return;
      }

      // Surface the retry so the connection state machine can show CONNECTING
      // (DISCONNECTED -> CONNECTING) while the socket is being re-established.
      this.connectionEvents$.next({ type: "reconnectAttempt" });
      this.openSocket();
    }, this.reconnectDelayMs);
  }

  send(type: string, payload?: unknown): void {
    if (this.disposed) {
      return;
    }

    const msg: WsMessage = { type, payload };
    const serialized = JSON.stringify(msg);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serialized);
    } else {
      // Socket not open yet (or reconnecting) — buffer until onopen flushes.
      this.sendQueue.push(serialized);
    }
  }

  private flushSendQueue(): void {
    if (this.ws?.readyState !== WebSocket.OPEN) {
      return;
    }

    for (const serialized of this.sendQueue) {
      this.ws.send(serialized);
    }

    this.sendQueue.length = 0;
  }

  rpc(type: string, payload?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const correlationId = String(this.nextCorrelationId++);
      this.pendingRpcs.set(correlationId, { resolve, reject });

      if (this.ws?.readyState !== WebSocket.OPEN) {
        this.pendingRpcs.delete(correlationId);
        reject(new Error("WebSocket not connected"));
        return;
      }

      const msg: WsMessage = { type, payload, correlationId };
      this.ws.send(JSON.stringify(msg));
    });
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }

    const handlerSet = this.handlers.get(type) as Set<MessageHandler>;
    handlerSet.add(handler);

    return (): void => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Wait for the connection to open (or resolve immediately if already open) */
  waitForConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const check = (): void => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };

      check();
    });
  }

  connectionEvents(): Observable<ConnectionEvent> {
    return this.connectionEvents$.asObservable();
  }

  /** Close the current socket for an idle timeout without disposing the adapter.
   * Suppresses auto-reconnect (idle reconnect is user-initiated); preserves
   * sendQueue so subscriptions re-flush on reopen(). Nulls this.ws so any
   * sends while idle-closed are buffered rather than sent to a closing socket.
   * Provenance: original services/connection.ts:91-93. */
  closeForIdle(): void {
    if (this.disposed || this.suspended) {
      return;
    }

    this.suspended = true;
    this.closedForIdle = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.releaseSocket();
  }

  /** Re-establish the socket after an idle close: the Reconnect button, or
   * the browser coming back online. A no-op in every other state, a
   * signed-out or never-opened socket included. */
  reopen(): void {
    if (this.disposed || !this.closedForIdle) {
      return;
    }

    this.closedForIdle = false;
    this.suspended = false;
    this.openSocket();
  }

  dispose(): void {
    this.disposed = true;
    this.connectionEvents$.complete();
    this.sendQueue.length = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.ws?.close();
    this.handlers.clear();

    for (const rpc of this.pendingRpcs.values()) {
      rpc.reject(new Error("WsAdapter disposed"));
    }

    this.pendingRpcs.clear();
  }
}
