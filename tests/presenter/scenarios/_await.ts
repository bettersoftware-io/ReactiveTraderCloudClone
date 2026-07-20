// tests/presenter/scenarios/_await.ts
import type { Observable } from "rxjs";

export interface AwaitHelpers {
  /** Resolves to first emission within timeoutMs; rejects with TimeoutError otherwise. */
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T>;
  /** Advances time by n seconds (real or virtual). */
  waitSeconds(n: number): Promise<void>;
}
