import { firstValueFrom, type Observable, timeout } from "rxjs";
import { afterEach, beforeEach, describe, it, vi } from "vitest";

import {
  buildIncidentPresenterApp,
  type IncidentPresenterCtx,
} from "../scenarios/_buildApp";
import * as incident from "../scenarios/_shared/adminIncident";

describe("@presenter Feature: Admin incident injection breaks the live connection", () => {
  let w: IncidentPresenterWorld;
  // Held for the whole test to keep status$'s shareReplay warm.
  let statusSub: ReturnType<
    IncidentPresenterCtx["app"]["presenters"]["connection"]["status$"]["subscribe"]
  >;

  beforeEach(() => {
    // Install fake timers BEFORE buildIncidentPresenterApp so simulators
    // capture patched setTimeout/setInterval. Same ordering as
    // presenter/vitest-fake-timers/_world.ts.
    vi.useFakeTimers({ now: Date.now(), shouldAdvanceTime: false });
    const ctx = buildIncidentPresenterApp();
    statusSub = ctx.app.presenters.connection.status$.subscribe();
    w = {
      ctx,
      async awaitFirstWithin<T>(
        source$: Observable<T>,
        timeoutMs: number,
      ): Promise<T> {
        const p = firstValueFrom(source$.pipe(timeout(timeoutMs)));
        await vi.advanceTimersByTimeAsync(timeoutMs);
        return p;
      },
      async waitSeconds(n: number): Promise<void> {
        await vi.advanceTimersByTimeAsync(n * 1000);
      },
    };
  });

  afterEach(() => {
    statusSub.unsubscribe();
    w.ctx.bridgeSub.unsubscribe();
    w.ctx.app.presenters.incident.dispose();
    vi.useRealTimers();
  });

  it("Injecting a service-down incident disconnects the app", async () => {
    await incident.expectStatusEqualsWithin(w, incident.CS_CONNECTED, 5);
    await incident.operatorInjectsIncident(w, "serviceDown");
    await incident.expectStatusEqualsWithin(w, incident.CS_DISCONNECTED, 5);
    await incident.operatorClearsIncident(w);
    await incident.expectStatusEqualsWithin(w, incident.CS_CONNECTED, 5);
  });
});

interface IncidentPresenterWorld {
  ctx: IncidentPresenterCtx;
  awaitFirstWithin<T>(source$: Observable<T>, timeoutMs: number): Promise<T>;
  waitSeconds(n: number): Promise<void>;
}
