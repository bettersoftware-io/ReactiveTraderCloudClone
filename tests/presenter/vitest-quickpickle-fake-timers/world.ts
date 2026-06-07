// tests/presenter/vitest-quickpickle-fake-timers/world.ts
import { setWorldConstructor, QuickPickleWorld } from "quickpickle";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import { vi } from "vitest";
import type { PresenterCtx } from "../scenarios/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../scenarios/_shared/common";
import type { AwaitHelpers } from "../scenarios/_await";

export class VitestFakePresenterWorld extends QuickPickleWorld implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await vi.advanceTimersByTimeAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await vi.advanceTimersByTimeAsync(n * 1000);
  }
}
setWorldConstructor(VitestFakePresenterWorld);
