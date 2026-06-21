// packages/client-react/src/app/adapters/__tests__/FakeWsAdapter.ts

import type { ConnectionEvent } from "@rtc/domain";
import type { RpcResponse } from "@rtc/shared";
import { type Observable, ReplaySubject } from "rxjs";
import type { IWsAdapter, MessageHandler } from "../IWsAdapter";

/**
 * In-memory IWsAdapter for contract + nack tests.
 * - emit(type, payload) drives all `on(type)` subscribers (fake server frame).
 * - nextRpcResponse(type, response) resolves the next pending `rpc(type)` call.
 * - sentMessages() inspects what the port pushed over the wire.
 */
export class FakeWsAdapter implements IWsAdapter {
  private listeners = new Map<string, Set<MessageHandler>>();
  private sent: Array<{ type: string; payload?: unknown }> = [];
  private pendingRpcs: Array<{
    type: string;
    resolve: (r: unknown) => void;
    reject: (e: unknown) => void;
  }> = [];
  private readonly connectionEvents$ = new ReplaySubject<ConnectionEvent>(1);

  on(type: string, handler: MessageHandler): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    (this.listeners.get(type) as Set<MessageHandler>).add(handler);
    return () => {
      this.listeners.get(type)?.delete(handler);
    };
  }

  send(type: string, payload?: unknown): void {
    this.sent.push({ type, payload });
  }

  rpc(type: string, payload?: unknown): Promise<unknown> {
    this.sent.push({ type, payload });
    return new Promise((resolve, reject) => {
      this.pendingRpcs.push({ type, resolve, reject });
    });
  }

  connectionEvents(): Observable<ConnectionEvent> {
    return this.connectionEvents$.asObservable();
  }

  dispose(): void {
    this.connectionEvents$.complete();
    this.listeners.clear();
    this.pendingRpcs = [];
    this.sent = [];
  }

  // ── Test-only API ─────────────────────────────────────────

  /** Drive a fake server frame to all subscribers of `type`. */
  emit(type: string, payload: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(payload);
  }

  /** Resolve the next pending RPC of `type` with `response`. */
  nextRpcResponse(type: string, response: RpcResponse<unknown>): void {
    const idx = this.pendingRpcs.findIndex((r) => r.type === type);
    if (idx < 0) {
      throw new Error(`FakeWsAdapter: no pending RPC of type "${type}"`);
    }
    const removed = this.pendingRpcs.splice(idx, 1)[0];
    if (!removed)
      throw new Error(
        `FakeWsAdapter: splice returned no element for type "${type}"`,
      );
    removed.resolve(response);
  }

  /** Reject the next pending RPC of `type` with `error` (transport-level
   * failure — e.g. the socket dropped — as opposed to an application nack).
   * Drives the `catch (e) { subscriber.error(e) }` propagation arms. */
  rejectPendingRpc(type: string, error: unknown): void {
    const idx = this.pendingRpcs.findIndex((r) => r.type === type);
    if (idx < 0) {
      throw new Error(`FakeWsAdapter: no pending RPC of type "${type}"`);
    }
    const removed = this.pendingRpcs.splice(idx, 1)[0];
    if (!removed)
      throw new Error(
        `FakeWsAdapter: splice returned no element for type "${type}"`,
      );
    removed.reject(error);
  }

  /** Inspect every send() / rpc() the port has made so far. */
  sentMessages(): readonly { type: string; payload?: unknown }[] {
    return [...this.sent];
  }

  /** True iff at least one RPC of `type` is currently awaiting a response. */
  hasPendingRpc(type: string): boolean {
    return this.pendingRpcs.some((r) => r.type === type);
  }

  /** Drive a fake gateway lifecycle event to all connectionEvents() subscribers. */
  emitConnectionEvent(type: "gatewayConnected" | "gatewayDisconnected"): void {
    this.connectionEvents$.next({ type });
  }
}
