import { of, Subject } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisEvent } from "@rtc/client-core";
import type { JarvisDemoState, JarvisPort } from "@rtc/core-api";
import { DEMO_STEP_BEAT_MS } from "@rtc/domain";

import { createDetachedHost } from "#/bridge/out";
import { createJarvisMachine } from "#/presenters/jarvis";
import { createJarvisDemo } from "#/presenters/jarvisDemo";

// The Effect demo's own re-entrancy — a listener that stops or restarts the
// demo synchronously, in reaction to a state it just wrote (RxJS makes both
// safe by construction: takeUntil / exhaustMap's synchronous inner end).
describe("createJarvisDemo (Effect core) — step watchers are released", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a step that settles normally releases its state and event listeners — only the running step's pair stays attached", async () => {
    const rig = createRig();

    rig.demo.intents.startDemo();
    await vi.advanceTimersByTimeAsync(0);
    expect(rig.liveListeners()).toBe(2);

    rig.replyToLatest({ type: "done" });
    await vi.advanceTimersByTimeAsync(DEMO_STEP_BEAT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(rig.asks).toHaveLength(2);
    expect(rig.liveListeners()).toBe(2);
  });
});

describe("createJarvisDemo (Effect core) — re-entrant stop and start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("a stop issued from a state listener as step 2 begins sends no step-2 turn", async () => {
    const rig = createRig();
    rig.demo.state$.subscribe((state: JarvisDemoState) => {
      if (state.stepIndex === 2) {
        rig.demo.intents.stopDemo();
      }
    });

    rig.demo.intents.startDemo();
    await vi.advanceTimersByTimeAsync(0);
    rig.replyToLatest({ type: "done" });
    await vi.advanceTimersByTimeAsync(DEMO_STEP_BEAT_MS);
    await vi.advanceTimersByTimeAsync(0);

    expect(rig.asks).toHaveLength(1);
  });

  it("a start issued from a state listener the moment a run ends to idle begins a new run", async () => {
    const rig = createRig();
    let restarted = false;
    rig.demo.state$.subscribe((state: JarvisDemoState) => {
      if (!state.running && rig.asks.length === 1 && !restarted) {
        restarted = true;
        rig.demo.intents.startDemo();
      }
    });

    rig.demo.intents.startDemo();
    await vi.advanceTimersByTimeAsync(0);
    rig.replyToLatest({ type: "error", message: "boom" });
    await vi.advanceTimersByTimeAsync(0);

    expect(restarted).toBe(true);
    expect(rig.asks).toHaveLength(2);
  });
});

interface Rig {
  readonly demo: ReturnType<typeof createJarvisDemo>;
  readonly asks: Subject<JarvisEvent>[];
  replyToLatest(event: JarvisEvent): void;
  /** The demo's listeners currently attached to jarvis, state + events. */
  liveListeners(): number;
}

function createRig(): Rig {
  const asks: Subject<JarvisEvent>[] = [];
  const port: JarvisPort = {
    ask: () => {
      const reply = new Subject<JarvisEvent>();
      asks.push(reply);
      return reply;
    },
    confirm: () => {
      // unused
    },
  };
  const host = createDetachedHost();
  const jarvis = createJarvisMachine(host, {
    port,
    skin$: of("singularity" as const),
    setSkin: () => {
      // unused
    },
    preferredBrain$: of("scripted" as const),
    effort$: of("medium" as const),
  });

  let live = 0;

  function counted<T>(
    listen: (listener: (value: T) => void) => () => void,
  ): (listener: (value: T) => void) => () => void {
    return (listener: (value: T) => void) => {
      live += 1;
      const release = listen(listener);

      return () => {
        live -= 1;
        release();
      };
    };
  }

  const demo = createJarvisDemo(host, {
    jarvisStateNow: jarvis.stateNow,
    listenState: counted(jarvis.listenState),
    listenEvents: counted(jarvis.listenEvents),
    jarvis: jarvis.handle.intents,
    powerSaverLevel: () => {
      return "off";
    },
  });
  return {
    demo,
    asks,
    liveListeners: () => {
      return live;
    },
    replyToLatest: (event: JarvisEvent) => {
      const reply = asks.at(-1);
      reply?.next(event);
      reply?.complete();
    },
  };
}
