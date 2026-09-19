import { BehaviorSubject } from "rxjs";
import { describe, expect, it } from "vitest";

import type { Stream } from "@rtc/core-api";
import { type PreferencesPort, PreferencesSimulator } from "@rtc/domain";

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
    stream: (p: PreferencesPort) => {
      return createCreditRfqFilterPreferencePresenter(p).filter$;
    },
  },
  {
    port: "eqBlotterView$",
    stream: (p: PreferencesPort) => {
      return createEqBlotterViewPreferencePresenter(p).view$;
    },
  },
  {
    port: "ambientStyle$",
    stream: (p: PreferencesPort) => {
      return createAmbientStylePresenter(p).style$;
    },
  },
  {
    port: "chartSubstrate$",
    stream: (p: PreferencesPort) => {
      return createChartSubstratePresenter(p).substrate$;
    },
  },
  {
    port: "layoutEngine$",
    stream: (p: PreferencesPort) => {
      return createLayoutEnginePresenter(p).engine$;
    },
  },
  {
    port: "animatedBackground$",
    stream: (p: PreferencesPort) => {
      return createAnimatedBackgroundPresenter(p).enabled$;
    },
  },
  {
    port: "forceBootAnimation$",
    stream: (p: PreferencesPort) => {
      return createForceBootAnimationPresenter(p).enabled$;
    },
  },
  {
    port: "loginWaitStyle$",
    stream: (p: PreferencesPort) => {
      return createLoginWaitPreferencesPresenter(p).style$;
    },
  },
  {
    port: "loginWaitDelay$",
    stream: (p: PreferencesPort) => {
      return createLoginWaitPreferencesPresenter(p).delay$;
    },
  },
  {
    port: "jarvisBrain$",
    stream: (p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(p).brain$;
    },
  },
  {
    port: "jarvisEffort$",
    stream: (p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(p).effort$;
    },
  },
  {
    port: "jarvisNarrator$",
    stream: (p: PreferencesPort) => {
      return createJarvisPreferencesPresenter(p).narrator$;
    },
  },
  {
    port: "eqWatchlistSort$",
    stream: (p: PreferencesPort) => {
      return createEqWatchlistSortPreferencePresenter(p).sort$;
    },
  },
];

describe("native preference streams (async)", () => {
  it.each(CASES)(
    "$port is subscribed by the first consumer, replays synchronously, and is released SYNCHRONOUSLY by the last",
    ({ port, stream }) => {
      const subject = new BehaviorSubject<unknown>("seed");
      const stream$ = stream(createPortWithSubject(port, subject));
      // Construction calls the port method but subscribes nothing.
      expect(subject.observed).toBe(false);
      const seen: unknown[] = [];
      const sub = stream$.subscribe((value) => {
        seen.push(value);
      });
      expect(seen).toEqual(["seed"]);
      expect(subject.observed).toBe(true);
      sub.unsubscribe();
      // No `await`: a release that waited on a `finally` after an `await`
      // would still read `true` here (see `mapTopic`'s abort listener).
      expect(subject.observed).toBe(false);
    },
  );
});

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

/** A `PreferencesPort` stream method name — the `$`-suffixed members. */
type PortStreamName = Extract<keyof PreferencesPort, `${string}$`>;

interface StreamCase {
  port: PortStreamName;
  stream: (preferences: PreferencesPort) => Stream<unknown>;
}
