import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import type { EqDrawing, EqDrawingsState } from "@rtc/core-api";

import type { EffectHost } from "#/bridge/out";
import { createEqDrawingsMachine } from "#/machines/eqDrawings";

describe("eqDrawings machine", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("is warm from construction: a change made with nobody watching is the next subscriber's first value", async () => {
    const m = createEqDrawingsMachine(useHost());
    m.intents.addDrawing("AAPL", TREND);
    await tick();
    expect(m.state$.getValue()).toMatchObject({ drawings: { AAPL: [TREND] } });
    const seen: EqDrawingsState[] = [];
    m.state$.subscribe((state: EqDrawingsState) => {
      seen.push(state);
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.selectedId).toBe("t1");
    m.dispose();
  });

  it("an intent after dispose() is ignored, and dispose() is safe to repeat", async () => {
    const m = createEqDrawingsMachine(useHost());
    m.intents.setTool("hline");
    await tick();
    m.dispose();
    m.dispose();
    m.intents.setTool("trendline");
    await tick();
    // Read through a fresh SUBSCRIPTION, not `getValue()`: releasing the
    // keep-warm drops `state()`'s cached current value, so a cold
    // `getValue()` is back to the construction-time default (uncontracted
    // after dispose, slice 2). The ref itself is what the intent must not
    // have moved.
    const seen: EqDrawingsState[] = [];
    m.state$.subscribe((state: EqDrawingsState) => {
      seen.push(state);
    });
    expect(seen[0]?.tool).toBe("hline");
  });

  it("the parent host's scope ending disposes the machine's own", async () => {
    const parent = useHost();
    const m = createEqDrawingsMachine(parent);
    m.intents.setTool("hline");
    await tick();
    await Effect.runPromise(Scope.close(parent.scope, Exit.void));
    await tick();
    // The warm fiber was forked into the machine's scope, a child of the
    // parent's — so the parent's close is what ends it. A fresh subscriber
    // still reads the ref, which is all a disposed machine promises.
    const seen: EqDrawingsState[] = [];
    m.state$.subscribe((state: EqDrawingsState) => {
      seen.push(state);
    });
    expect(seen).toHaveLength(1);
    m.dispose();
  });

  const hosts: TestHost[] = [];

  function useHost(): TestHost {
    const host: TestHost = {
      runtime: ManagedRuntime.make(Layer.empty),
      scope: Effect.runSync(Scope.make()),
    };
    hosts.push(host);
    return host;
  }
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

const TREND: EqDrawing = {
  id: "t1",
  kind: "trendline",
  a: { index: 10, price: 100 },
  b: { index: 20, price: 110 },
};
