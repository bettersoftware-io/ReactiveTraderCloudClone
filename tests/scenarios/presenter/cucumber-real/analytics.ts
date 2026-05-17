// tests/scenarios/presenter/cucumber-real/analytics.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectAnalyticsVisibleWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const snapshot = await firstValueFrom(
    w.ctx.app.presenters.analytics.position$.pipe(timeout(seconds * 1000)),
  );
  if (!snapshot) throw new Error("analytics emitted but value was falsy");
}

export async function expectAnalyticsEmits(w: PresenterWorld, seconds: number): Promise<void> {
  return expectAnalyticsVisibleWithin(w, seconds);
}
