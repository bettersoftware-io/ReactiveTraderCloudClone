import { EventEmitter } from "node:events";

import type { WsMessage } from "./protocol.js";

/** Minimal stand-in for the `ws` WebSocket the handler talks to. */
export class FakeWs extends EventEmitter {
  readonly OPEN = 1;

  readyState = 1;

  readonly outbound: WsMessage[] = [];

  send(data: string): void {
    this.outbound.push(JSON.parse(data) as WsMessage);
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
