import { EventEmitter } from "node:events";

import type { WsMessage } from "./protocol.js";

export interface FakeWsClose {
  readonly code: number;
  readonly reason: string;
}

/** Minimal stand-in for the `ws` WebSocket the handler talks to. */
export class FakeWs extends EventEmitter {
  readonly OPEN = 1;

  readyState = 1;

  readonly outbound: WsMessage[] = [];

  /** The `(code, reason)` of the last server-initiated close, if any. */
  closedWith: FakeWsClose | undefined;

  send(data: string): void {
    this.outbound.push(JSON.parse(data) as WsMessage);
  }

  /** The server closing the socket, as `ws`'s `close(code, reason)`. */
  close(code: number, reason: string): void {
    this.closedWith = { code, reason };
    this.closeConnection();
  }

  /** Simulate a client → server frame. */
  receive(msg: WsMessage): void {
    this.emit("message", JSON.stringify(msg));
  }

  /** Simulate the socket closing. */
  closeConnection(): void {
    this.readyState = 3;
    this.emit("close");
  }

  framesOfType(type: string): WsMessage[] {
    return this.outbound.filter((m) => {
      return m.type === type;
    });
  }
}
