// tests/support/presenter/cucumber-real/hooks.ts
import { Before, After } from "@cucumber/cucumber";
import { Subscription } from "rxjs";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/cucumber-real/common";
import type { PresenterWorld } from "./world";

Before(function(this: PresenterWorld) {
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
  // Keep status$ subscribed for the entire scenario lifetime so that
  // shareReplay({ refCount: true }) never resets its buffer between steps.
  this._statusSub = this.ctx.app.presenters.connection.status$.subscribe();
});

After(function(this: PresenterWorld) {
  this._statusSub?.unsubscribe();
});
