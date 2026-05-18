/**
 * WebSocket transport adapter.
 * Manages connection lifecycle and message routing between client and server.
 */

import type { IWsAdapter, MessageHandler } from "./IWsAdapter";

interface WsMessage {
  readonly type: string;
  readonly payload?: unknown;
  readonly correlationId?: string;
}

const RECONNECT_DELAY_MS = 3_000;

export class WsAdapter implements IWsAdapter {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers = new Map<string, Set<MessageHandler>>();
  private readonly pendingRpcs = new Map<string, { resolve: (p: unknown) => void; reject: (e: Error) => void }>();
  private nextCorrelationId = 1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  private connect(): void {
    if (this.disposed) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WsAdapter] Connected to", this.url);
    };

    this.ws.onmessage = (event) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      // Handle RPC responses
      if (msg.correlationId && this.pendingRpcs.has(msg.correlationId)) {
        const rpc = this.pendingRpcs.get(msg.correlationId)!;
        this.pendingRpcs.delete(msg.correlationId);
        rpc.resolve(msg.payload);
        return;
      }

      // Route to stream handlers
      const handlers = this.handlers.get(msg.type);
      if (handlers) {
        for (const handler of handlers) {
          handler(msg.payload);
        }
      }
    };

    this.ws.onclose = () => {
      if (this.disposed) return;
      console.log("[WsAdapter] Disconnected, reconnecting in", RECONNECT_DELAY_MS, "ms");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      // onclose will fire after onerror
    };
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connect(), RECONNECT_DELAY_MS);
  }

  send(type: string, payload?: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const msg: WsMessage = { type, payload };
    this.ws.send(JSON.stringify(msg));
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
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Wait for the connection to open (or resolve immediately if already open) */
  waitForConnection(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.handlers.clear();
    for (const rpc of this.pendingRpcs.values()) {
      rpc.reject(new Error("WsAdapter disposed"));
    }
    this.pendingRpcs.clear();
  }
}
