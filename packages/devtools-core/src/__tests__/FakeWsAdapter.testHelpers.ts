import type { WsAdapterLike } from "../instrument/wsAdapter";

export interface SentFrame {
  type: string;
  payload: unknown;
}

/** Fake `WsAdapterLike` — records outbound frames and lets tests trigger
 * inbound ones via `handlers`. Also exposes an extra member
 * (`connectionEvents`) to prove `instrumentWsAdapter` passes non-tapped
 * members through untouched. */
export class FakeWsAdapter implements WsAdapterLike {
  sent: SentFrame[] = [];

  handlers = new Map<string, (payload: unknown) => void>();

  on(type: string, handler: (payload: unknown) => void): () => void {
    this.handlers.set(type, handler);

    return (): void => {
      this.handlers.delete(type);
    };
  }

  send(type: string, payload?: unknown): void {
    this.sent.push({ type, payload });
  }

  rpc(type: string, payload?: unknown): Promise<unknown> {
    return Promise.resolve({ type, payload, ok: true });
  }

  connectionEvents(): string {
    return "connected";
  }
}
