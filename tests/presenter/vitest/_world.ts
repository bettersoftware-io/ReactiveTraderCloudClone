import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import { vi } from "vitest";
import { buildPresenterApp, type PresenterCtx } from "../scenarios/_buildApp";
import { newScratchpad, type PresenterScratchpad } from "../scenarios/_shared/common";
import type { AwaitHelpers } from "../scenarios/_await";

export interface VitestPlainPresenterWorld extends AwaitHelpers {
  ctx: PresenterCtx;
  scratch: PresenterScratchpad;
  /** Held for the entire test to keep shareReplay streams warm. */
  _statusSub: Subscription;
}

export function buildWorld(): VitestPlainPresenterWorld {
  // Install fake timers BEFORE buildPresenterApp so simulators capture patched
  // setTimeout/setInterval. Seed virtual now() with real Date.now() so simulator
  // historical timestamps stay sensible. Same ordering as vitest-fake-timers/hooks.ts.
  vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
  const ctx = buildPresenterApp();
  const w: VitestPlainPresenterWorld = {
    ctx,
    scratch: newScratchpad(),
    _statusSub: ctx.app.presenters.connection.status$.subscribe(),
    async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
      const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
      await vi.advanceTimersByTimeAsync(timeoutMs);
      return p;
    },
    async waitSeconds(n: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(n * 1000);
    },
  };
  return w;
}

export function teardownWorld(w: VitestPlainPresenterWorld): void {
  w._statusSub.unsubscribe();
  vi.useRealTimers();
}
