import { Effect, Exit, Scope } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import { createSyncRef } from "#/presenters/syncRef";

describe("SyncRef", () => {
  afterEach(async () => {
    for (const host of hosts.splice(0)) {
      await Effect.runPromise(Scope.close(host.scope, Exit.void));
    }
  });

  it("commits synchronously and notifies listeners at once, replaying the current value on listen", () => {
    const ref = createSyncRef(useHost(), 1);
    const heard: number[] = [];
    const stop = ref.listen((value) => {
      heard.push(value);
    });

    ref.set((n) => {
      return n + 1;
    });
    expect(ref.get()).toBe(2);
    expect(heard).toEqual([1, 2]);
    stop();
    ref.set((n) => {
      return n + 1;
    });
    expect(heard).toEqual([1, 2]);
  });

  it("an unchanged write notifies nobody", () => {
    const ref = createSyncRef(useHost(), "same");
    const heard: string[] = [];
    ref.listen((value) => {
      heard.push(value);
    });

    ref.set((value) => {
      return value;
    });
    expect(heard).toEqual(["same"]);
  });

  it("a subscriber joining after a commit reads the committed value at once — no fiber step", () => {
    const ref = createSyncRef(useHost(), "initial");
    const warm = ref.warm();
    ref.set(() => {
      return "restored";
    });

    const seen: string[] = [];
    warm.state$
      .subscribe((value) => {
        seen.push(value);
      })
      .unsubscribe();
    expect(seen).toEqual(["restored"]);
    warm.release();
  });

  const hosts: EffectHost[] = [];

  function useHost(): EffectHost {
    const host = createDetachedHost();
    hosts.push(host);
    return host;
  }
});
