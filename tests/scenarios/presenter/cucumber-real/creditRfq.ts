// tests/scenarios/presenter/cucumber-real/creditRfq.ts
import { firstValueFrom, timeout } from "rxjs";
import type { PresenterWorld } from "../../../support/presenter/cucumber-real/world";

export async function expectRfqListEmptyWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const rfqs = await firstValueFrom(
    w.ctx.app.presenters.rfqs.rfqs$.pipe(timeout(seconds * 1000)),
  );
  if (rfqs.length !== 0) throw new Error(`expected empty RFQ list, got ${rfqs.length}`);
}
