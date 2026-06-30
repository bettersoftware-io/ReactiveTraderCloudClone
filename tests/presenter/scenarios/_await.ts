// tests/presenter/scenarios/_await.ts
import { firstValueFrom, type Observable, timeout } from "rxjs";

export interface AwaitHelpers {
  /** Resolves to first emission within timeoutMs; rejects with TimeoutError otherwise. */
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T>;
  /** Advances time by n seconds (real or virtual). */
  waitSeconds(n: number): Promise<void>;
}

// eslint-disable-next-line rtc/class-filename-match -- await-helper bundle in a purpose-named scenarios module
export class RealAwaitHelpers implements AwaitHelpers {
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    return firstValueFrom(source$.pipe(timeout(timeoutMs)));
  }

  waitSeconds(n: number): Promise<void> {
    return new Promise((r) => {
      return setTimeout(r, n * 1000);
    });
  }
}
