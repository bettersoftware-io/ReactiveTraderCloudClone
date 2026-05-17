// tests/scenarios/presenter/cucumber-real/analytics.ts
import type { PresenterWorld } from "../_world";

export async function expectAnalyticsVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const snapshot = await w.awaitFirstWithin(
    w.ctx.app.presenters.analytics.position$,
    seconds * 1000,
  );
  if (!snapshot) throw new Error("analytics emitted but value was falsy");
}

export async function expectAnalyticsEmits(w: PresenterWorld, seconds: number): Promise<void> {
  return expectAnalyticsVisibleWithin(w, seconds);
}
