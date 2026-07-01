/**
 * WebSocket transport adapter.
 * Manages connection lifecycle and message routing between client and server.
 */

import { type Observable, ReplaySubject } from "rxjs";

import type { IWsAdapter, MessageHandler } from "@rtc/client-core";
import type { ConnectionEvent } from "@rtc/domain";

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
}

export class WsAdapter implements IWsAdapter {
  private ws: WebSocket | null = null;

  private readonly url: string;

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

  private idleClosed = false;

  private readonly connectionEvents$ = new ReplaySubject<ConnectionEvent>(1);

  constructor(url: string, options: WsAdapterOptions = {}) {
    this.url = url;
    this.reconnectDelayMs =
      options.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = (): void => {
      console.log("[WsAdapter] Connected to", this.url.split("?")[0]);
      this.connectionEvents$.next({ type: "gatewayConnected" });
      this.flushSendQueue();
    };

    this.ws.onmessage = (event: MessageEvent): void => {
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
        for (const handler of handlers) {
          handler(msg.payload);
        }
      }
    };

    this.ws.onclose = (): void => {
      if (this.disposed) return;
      this.connectionEvents$.next({ type: "gatewayDisconnected" });

      if (this.idleClosed) {
        // Idle close: suppress auto-reconnect; user must call reopen() explicitly.
        return;
      }

      console.log(
        "[WsAdapter] Disconnected, reconnecting in",
        this.reconnectDelayMs,
        "ms",
      );
      this.scheduleReconnect();
    };

    this.ws.onerror = (): void => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectTimer = setTimeout(() => {
      if (this.disposed) return;
      // Surface the retry so the connection state machine can show CONNECTING
      // (DISCONNECTED -> CONNECTING) while the socket is being re-established.
      this.connectionEvents$.next({ type: "reconnectAttempt" });
      this.connect();
    }, this.reconnectDelayMs);
  }

  send(type: string, payload?: unknown): void {
    if (this.disposed) return;
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
    if (this.ws?.readyState !== WebSocket.OPEN) return;

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
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
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
    if (this.disposed || this.idleClosed) return;
    this.idleClosed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Re-establish the socket after an idle close (user activity). */
  reopen(): void {
    if (this.disposed || !this.idleClosed) return;
    this.idleClosed = false;
    this.connect();
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
