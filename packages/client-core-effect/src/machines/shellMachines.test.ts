import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BootSequenceState, WorkspaceNavState } from "@rtc/core-api";
import {
  BOOT_DURATION_MS,
  BOOT_TICK_MS,
  BOOT_VARIANTS,
  type BootVariant,
} from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import { createBootMachine } from "#/machines/boot";
import { createWorkspaceNavMachine } from "#/machines/workspaceNav";

describe("createWorkspaceNavMachine (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it("drops a switch to the tab already active and moves on a new one", async () => {
    const nav = createWorkspaceNavMachine(useHost());
    const seen: WorkspaceNavState[] = [];
    const sub = nav.state$.subscribe((s) => {
      seen.push(s);
    });
    nav.intents.switchTab("fx");
    await tick();
    nav.intents.switchTab("credit");
    await tick();

    expect(seen).toEqual([{ activeTab: "fx" }, { activeTab: "credit" }]);
    sub.unsubscribe();
  });

  // Read from a FRESH subscriber's seed after the close: a subscriber made
  // before it follows the ref on a fiber the close interrupted.
  it("after the host scope closes, switchTab changes nothing", async () => {
    const host = useHost();
    const nav = createWorkspaceNavMachine(host);
    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    nav.intents.switchTab("credit");
    const fresh: WorkspaceNavState[] = [];
    nav.state$
      .subscribe((s) => {
        fresh.push(s);
      })
      .unsubscribe();

    expect(fresh).toEqual([{ activeTab: "fx" }]);
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

describe("createBootMachine (effect)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("advances the persisted variant at creation and finishes after the ramp, calling onDone once", async () => {
    vi.useFakeTimers();
    const advanced: BootVariant[] = [];
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: (next: BootVariant) => {
        advanced.push(next);
      },
      onDone: () => {
        done += 1;
      },
    });

    expect(advanced).toEqual([BOOT_VARIANTS[1]]);
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS + BOOT_TICK_MS);
    m.intents.skip();
    expect(done).toBe(1);
    m.dispose();
  });

  it("a skip in the same tick as creation stays finished — the ramp fiber, starting later, writes nothing over it", async () => {
    vi.useFakeTimers();
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: () => {},
      onDone: () => {
        done += 1;
      },
    });
    const seen: BootSequenceState[] = [];
    const sub = m.state$.subscribe((s) => {
      seen.push(s);
    });
    m.intents.skip();
    await vi.advanceTimersByTimeAsync(BOOT_TICK_MS * 3);

    expect(seen.at(-1)).toMatchObject({ progress: 100, done: true });
    expect(done).toBe(1);
    sub.unsubscribe();
    m.dispose();
  });

  it("dispose stops the ramp itself — no later state for an attached subscriber — and onDone never runs", async () => {
    vi.useFakeTimers();
    let done = 0;
    const m = createBootMachine({
      variant: BOOT_VARIANTS[0],
      advance: () => {},
      onDone: () => {
        done += 1;
      },
    });
    const seen: BootSequenceState[] = [];
    const sub = m.state$.subscribe((s) => {
      seen.push(s);
    });
    await vi.advanceTimersByTimeAsync(BOOT_TICK_MS * 3);
    m.dispose();
    await vi.advanceTimersByTimeAsync(0);
    const count = seen.length;
    await vi.advanceTimersByTimeAsync(BOOT_DURATION_MS * 2);
    m.intents.skip();

    expect(seen.length).toBe(count);
    expect(done).toBe(0);
    sub.unsubscribe();
  });
});

interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
