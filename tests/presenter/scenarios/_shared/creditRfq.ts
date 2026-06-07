// tests/presenter/scenarios/_shared/creditRfq.ts
import type { PresenterWorld } from "../_world";

export async function expectRfqListEmptyWithin(w: PresenterWorld, seconds: number): Promise<void> {
  const rfqs = await w.awaitFirstWithin(
    w.ctx.app.presenters.rfqs.rfqs$,
    seconds * 1000,
  );
  if (rfqs.length !== 0) throw new Error(`expected empty RFQ list, got ${rfqs.length}`);
}
