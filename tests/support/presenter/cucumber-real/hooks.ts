// tests/support/presenter/cucumber-real/hooks.ts
import { Before } from "@cucumber/cucumber";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { PresenterWorld } from "./world";

Before(function(this: PresenterWorld) {
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
});
