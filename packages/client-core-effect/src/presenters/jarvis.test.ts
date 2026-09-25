import { Effect, Exit, Scope } from "effect";
import { NEVER, of, throwError } from "rxjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JarvisEvent } from "@rtc/client-core";
import type { JarvisPort, JarvisState } from "@rtc/core-api";
import { Direction, JARVIS_CONFIRM_TIMEOUT_MS } from "@rtc/domain";

import { createDetachedHost, type EffectHost } from "#/bridge/out";
import { createJarvisMachine, type NativeJarvis } from "#/presenters/jarvis";

// The Effect-only paths the contract harness cannot reach: its jarvis port
// always offers `availability$`, never fails an ask, and never closes the
// parent host mid-countdown.
describe("createJarvisMachine (Effect core)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("with no availability$ on the port it is available on the scripted brain alone", () => {
    const { jarvis } = createRig(createPort());

    expect(jarvis.stateNow()).toMatchObject({
      available: true,
      brains: ["scripted"],
      effectiveBrain: "scripted",
    });
  });

  it("a send after dispose asks the port nothing", () => {
    const port = createPort();
    const { jarvis } = createRig(port);
    jarvis.handle.dispose();

    jarvis.handle.intents.send("too late");

    expect(port.ask).not.toHaveBeenCalled();
  });

  it("a send asks in the same tick, with the effective brain", () => {
    const port = createPort();
    const { jarvis } = createRig(port);

    jarvis.handle.intents.send("hi");

    expect(port.ask).toHaveBeenCalledWith("hi", {
      brain: "scripted",
      effort: "medium",
    });
  });

  it("a port.ask that errors closes its turn as an error: the stub settles and the machine idles", async () => {
    const { jarvis } = createRig({
      ask: vi.fn<JarvisPort["ask"]>(() => {
        return throwError(() => {
          return new Error("socket gone");
        });
      }),
      confirm: () => {
        // unused
      },
    });

    jarvis.handle.intents.send("hi");
    await vi.advanceTimersByTimeAsync(0);

    const state: JarvisState = jarvis.stateNow();
    expect(state.phase).toBe("idle");
    expect(state.entries.at(-1)).toMatchObject({
      text: "socket gone",
      done: true,
    });
  });

  it("closing the parent host mid-countdown ends it: the card is never declined afterwards", async () => {
    const confirm = vi.fn();
    const { jarvis, host } = createRig({
      ask: vi.fn<JarvisPort["ask"]>(() => {
        return of<JarvisEvent>(createConfirmRequest());
      }),
      confirm,
    });
    jarvis.handle.intents.send("buy");
    await vi.advanceTimersByTimeAsync(0);

    await Effect.runPromise(Scope.close(host.scope, Exit.void));
    await vi.advanceTimersByTimeAsync(JARVIS_CONFIRM_TIMEOUT_MS);

    expect(confirm).not.toHaveBeenCalled();
  });
});

interface SpiedPort extends JarvisPort {
  readonly ask: ReturnType<typeof vi.fn<JarvisPort["ask"]>>;
}

interface Rig {
  readonly jarvis: NativeJarvis;
  readonly host: EffectHost;
}

function createPort(): SpiedPort {
  return {
    ask: vi.fn<JarvisPort["ask"]>(() => {
      return NEVER;
    }),
    confirm: () => {
      // unused
    },
  };
}

function createRig(port: JarvisPort): Rig {
  const host = createDetachedHost();
  const jarvis = createJarvisMachine(host, {
    port,
    skin$: of("singularity" as const),
    setSkin: () => {
      // unused
    },
    preferredBrain$: of("claude-haiku-4-5" as const),
    effort$: of("medium" as const),
  });
  return { jarvis, host };
}

function createConfirmRequest(): JarvisEvent {
  return {
    type: "confirmRequest",
    confirmationId: "c-1",
    symbol: "EURUSD",
    direction: Direction.Buy,
    notional: 1_000_000,
    quotedPrice: 1.1,
    ratePrecision: 5,
  };
}
