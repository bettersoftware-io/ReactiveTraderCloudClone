// packages/client/src/app/adapters/IWsAdapter.ts
/**
 * Common surface for the real WsAdapter and the test-only FakeWsAdapter.
 * Both must agree on these method signatures so port factories work against either.
 */
export type MessageHandler = (payload: unknown) => void;

export interface IWsAdapter {
  on(type: string, handler: MessageHandler): () => void;
  send(type: string, payload?: unknown): void;
  rpc(type: string, payload?: unknown): Promise<unknown>;
  dispose(): void;
}
