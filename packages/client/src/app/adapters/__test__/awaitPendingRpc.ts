import type { FakeWsAdapter } from "./FakeWsAdapter";

/**
 * Yield to microtasks until `ws.hasPendingRpc(name)` is true, with an
 * explicit upper bound on iterations to surface stuck tests with a clear
 * error message rather than relying on Vitest's 5s default timeout.
 */
export async function awaitPendingRpc(
  ws: FakeWsAdapter,
  name: string,
  maxIterations = 1000,
): Promise<void> {
  for (let i = 0; i < maxIterations; i++) {
    if (ws.hasPendingRpc(name)) return;
    await Promise.resolve();
  }
  throw new Error(
    `Expected pending RPC "${name}" but none registered after ${maxIterations} microtask yields`,
  );
}
