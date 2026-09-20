import { Effect, Exit, Layer, ManagedRuntime, Scope } from "effect";
import { BehaviorSubject } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import { type PreferencesPort, PreferencesSimulator } from "@rtc/domain";

import type { EffectHost } from "#/bridge/out";
import {
  createJarvisPreferencesPresenter,
  createLoginWaitPreferencesPresenter,
} from "#/presenters/groupedPreferences";
import {
  createAmbientStylePresenter,
  createAnimatedBackgroundPresenter,
  createChartSubstratePresenter,
  createCreditRfqFilterPreferencePresenter,
  createEqBlotterViewPreferencePresenter,
  createForceBootAnimationPresenter,
  createLayoutEnginePresenter,
} from "#/presenters/preferences";
import { createEqWatchlistSortPreferencePresenter } from "#/presenters/readPreferences";

const CASES: StreamCase[] = [
  {
    port: "creditRfqFilter$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createCreditRfqFilterPreferencePresenter(h, p).filter$;
    },
  },
  {
    port: "eqBlotterView$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createEqBlotterViewPreferencePresenter(h, p).view$;
    },
  },
  {
    port: "ambientStyle$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createAmbientStylePresenter(h, p).style$;
    },
  },
  {
    port: "chartSubstrate$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createChartSubstratePresenter(h, p).substrate$;
    },
  },
  {
    port: "layoutEngine$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createLayoutEnginePresenter(h, p).engine$;
    },
  },
  {
    port: "animatedBackground$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createAnimatedBackgroundPresenter(h, p).enabled$;
    },
  },
  {
    port: "forceBootAnimation$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createForceBootAnimationPresenter(h, p).enabled$;
    },
  },
  {
    port: "loginWaitStyle$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createLoginWaitPreferencesPresenter(h, p).style$;
    },
  },
  {
    port: "loginWaitDelay$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createLoginWaitPreferencesPresenter(h, p).delay$;
    },
  },
  {
    port: "jarvisBrain$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(h, p).brain$;
    },
  },
  {
    port: "jarvisEffort$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(h, p).effort$;
    },
  },
  {
    port: "jarvisNarrator$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(h, p).narrator$;
    },
  },
  {
    port: "eqWatchlistSort$",
    stream: (h: EffectHost, p: PreferencesPort) => {
      return createEqWatchlistSortPreferencePresenter(h, p).sort$;
    },
  },
];

describe("native preference streams (effect)", () => {
  afterEach(async () => {
    while (hosts.length > 0) {
      const host = hosts.pop();

      if (host) {
        await Effect.runPromise(Scope.close(host.scope, Exit.void));
        await host.runtime.dispose();
      }
    }
  });

  it.each(CASES)(
    "$port is subscribed by the first consumer, replays synchronously, and is released once the warm period's scope has closed",
    async ({ port, stream }) => {
      const subject = new BehaviorSubject<unknown>("seed");
      const stream$ = stream(useHost(), createPortWithSubject(port, subject));
      // Construction calls the port method but subscribes nothing:
      // `fromObservable` is only called inside the fold's `run`.
      expect(subject.observed).toBe(false);
      const seen: unknown[] = [];
      const sub = stream$.subscribe((value) => {
        seen.push(value);
      });
      expect(seen).toEqual(["seed"]);
      // Warm in the SAME tick: the producer's `fromObservable` subscribed
      // the port eagerly, before `runFork` (the slice-1a finding).
      expect(subject.observed).toBe(true);
      sub.unsubscribe();
      await tick();
      await tick();
      expect(subject.observed).toBe(false);
    },
  );

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

/** A `PreferencesPort` stream method name — the `$`-suffixed members. */
type PortStreamName = Extract<keyof PreferencesPort, `${string}$`>;

interface StreamCase {
  port: PortStreamName;
  stream: (host: EffectHost, preferences: PreferencesPort) => Stream<unknown>;
}

/** A real simulator whose `<name>` stream method returns the CALLER's own
 * subject, so the test can read that subject's `observed` flag directly. A
 * Proxy rather than an object spread: TypeScript drops a class's methods
 * from a spread type, so `{ ...simulator, [name]: … }` would not satisfy
 * `PreferencesPort`; the proxy keeps every other method — and its `this` —
 * intact (the same shape as `themePreference.test.ts`). */
function createPortWithSubject(
  name: PortStreamName,
  subject: BehaviorSubject<unknown>,
): PreferencesPort {
  return new Proxy(new PreferencesSimulator(), {
    get: (
      target: PreferencesSimulator,
      property: string | symbol,
      receiver: unknown,
    ) => {
      if (property === name) {
        return () => {
          return subject;
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

function tick(): Promise<unknown> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** The host these tests build: a `ManagedRuntime` (which satisfies
 * `EffectRunner` structurally) plus the scope every stream fiber is forked
 * into — and, unlike the narrow `EffectHost`, the runtime's own `dispose`,
 * which the teardown drives directly. */
interface TestHost extends EffectHost {
  runtime: ManagedRuntime.ManagedRuntime<never, never>;
}
