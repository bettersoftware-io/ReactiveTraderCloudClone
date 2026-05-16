// tests/support/presenter/cucumber-real/world.ts
import { setWorldConstructor, World } from "@cucumber/cucumber";
import type { PresenterCtx } from "../../../scenarios/presenter/_buildApp";
import { type PresenterScratchpad, newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";

export class PresenterWorld extends World {
  ctx!: PresenterCtx;
  scratch: PresenterScratchpad = newScratchpad();
}
setWorldConstructor(PresenterWorld);
