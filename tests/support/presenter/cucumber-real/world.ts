// tests/support/presenter/cucumber-real/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { Subscription } from "rxjs";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import { type AwaitHelpers, RealAwaitHelpers } from "../../../scenarios/presenter/_await";

export class PresenterWorld extends World implements AwaitHelpers {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
  /** Held for the entire scenario to keep shareReplay streams warm. */
  _statusSub?: Subscription;
  private readonly _await = new RealAwaitHelpers();
  awaitFirstWithin = this._await.awaitFirstWithin.bind(this._await);
  waitSeconds = this._await.waitSeconds.bind(this._await);
}
setWorldConstructor(PresenterWorld);
