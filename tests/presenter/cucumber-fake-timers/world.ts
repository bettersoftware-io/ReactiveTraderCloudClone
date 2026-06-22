// tests/presenter/cucumber-fake-timers/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
// fake-timers 15 ships its own types and merged InstalledClock into Clock
// (install() returns Clock, which now carries uninstall()/tickAsync()).
import type { Clock } from "@sinonjs/fake-timers";
import {
  firstValueFrom,
  type Observable,
  type Subscription,
  timeout,
} from "rxjs";

import type { AwaitHelpers } from "../scenarios/_await";
import type { PresenterCtx } from "../scenarios/_buildApp";
import {
  newScratchpad,
  type PresenterScratchpad,
} from "../scenarios/_shared/common";

export class FakePresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  clock!: Clock;
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;

  async awaitFirstWithin<T>(
    source$: Observable<T>,
    timeoutMs: number,
  ): Promise<T> {
    const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
    await this.clock.tickAsync(timeoutMs);
    return p;
  }
  async waitSeconds(n: number): Promise<void> {
    await this.clock.tickAsync(n * 1000);
  }
}
setWorldConstructor(FakePresenterWorld);
