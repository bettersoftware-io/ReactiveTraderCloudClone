// tests/support/presenter/cucumber-fake/hooks.ts
import { Before, After } from "@cucumber/cucumber";
import FakeTimers from "@sinonjs/fake-timers";
import { buildPresenterApp } from "../../../scenarios/presenter/_buildApp";
import { newScratchpad } from "../../../scenarios/presenter/_shared/common";
import type { FakePresenterWorld } from "./world";

Before(function(this: FakePresenterWorld) {
  // Install clock BEFORE buildPresenterApp so simulators capture patched setTimeout/setInterval.
  // Seed virtual now() with real Date.now() to keep simulator historical timestamps sensible.
  this.clock = FakeTimers.install({ now: Date.now(), shouldAdvanceTime: false });
  this.ctx = buildPresenterApp();
  this.scratch = newScratchpad();
  this._statusSub = this.ctx.app.presenters.connection.status$.subscribe();
});

After(function(this: FakePresenterWorld) {
  this._statusSub?.unsubscribe();
  this.clock.uninstall();
});
