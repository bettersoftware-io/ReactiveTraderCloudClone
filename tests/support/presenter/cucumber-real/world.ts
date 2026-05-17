// tests/support/presenter/cucumber-real/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Observable, Subscription } from "rxjs";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import { type AwaitHelpers, RealAwaitHelpers } from "../../../scenarios/presenter/_await";

export class PresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;
  private readonly _await = new RealAwaitHelpers();

  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T> {
    return this._await.awaitFirstWithin(source$, timeoutMs);
  }
  waitSeconds(n: number): Promise<void> {
    return this._await.waitSeconds(n);
  }
}
setWorldConstructor(PresenterWorld);
