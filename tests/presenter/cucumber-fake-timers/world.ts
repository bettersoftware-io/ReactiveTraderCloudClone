// tests/presenter/cucumber-fake-timers/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import { firstValueFrom, timeout, type Observable, type Subscription } from "rxjs";
// fake-timers 15 ships its own types and merged InstalledClock into Clock
// (install() returns Clock, which now carries uninstall()/tickAsync()).
import type { Clock } from "@sinonjs/fake-timers";
import type { PresenterCtx } from "../scenarios/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../scenarios/_shared/common";
import type { AwaitHelpers } from "../scenarios/_await";

export class FakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  clock!: Clock;
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
