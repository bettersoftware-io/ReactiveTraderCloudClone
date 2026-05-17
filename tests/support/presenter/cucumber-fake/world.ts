// tests/support/presenter/cucumber-fake/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
import type { InstalledClock } from "@sinonjs/fake-timers";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { AwaitHelpers } from "../../../scenarios/presenter/_await";

export class FakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  clock!: InstalledClock;
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await this.clock.tickAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await this.clock.tickAsync(n * 1000);
  }
}
setWorldConstructor(FakePresenterWorld);
