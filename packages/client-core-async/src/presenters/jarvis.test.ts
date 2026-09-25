import { NEVER, of, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { JarvisEvent } from "@rtc/client-core";
import type { JarvisPort, JarvisState } from "@rtc/core-api";
import { Direction, JARVIS_CONFIRM_TIMEOUT_MS } from "@rtc/domain";

import { createJarvisMachine } from "#/presenters/jarvis";

// The async-only paths the contract harness cannot reach: its jarvis port
// always offers `availability$`, and it never sends after a dispose.
describe("createJarvisMachine (async core)", () => {
  it("with no availability$ on the port it is available on the scripted brain alone", () => {
    const machine = createMachine(createPort());

    expect(readState(machine.state$)).toMatchObject({
      available: true,
      brains: ["scripted"],
      effectiveBrain: "scripted",
    });
    machine.dispose();
  });

  it("a send after dispose asks the port nothing", () => {
    const port = createPort();
    const machine = createMachine(port);
    machine.dispose();

    machine.intents.send("too late");

    expect(port.ask).not.toHaveBeenCalled();
  });

  it("aborting the lifetime alone tears down like dispose: a pending card's countdown never declines afterwards", async () => {
    vi.useFakeTimers();

    try {
      const confirm = vi.fn();
      const lifetime = new AbortController();
      const port: JarvisPort = {
        ask: () => {
          return of<JarvisEvent>(createConfirmRequest());
        },
        confirm,
      };
      const machine = createMachine(port, lifetime.signal);
      machine.intents.send("buy");
      await vi.advanceTimersByTimeAsync(0);
      lifetime.abort();
      await vi.advanceTimersByTimeAsync(JARVIS_CONFIRM_TIMEOUT_MS);

      expect(confirm).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a port.ask that errors closes its turn as an error: the stub settles and the machine idles", async () => {
    const port: JarvisPort = {
      ask: () => {
        return throwError(() => {
          return new Error("socket gone");
        });
      },
      confirm: () => {
        // unused
      },
    };
    const machine = createMachine(port);

    machine.intents.send("hi");
    await Promise.resolve();

    const state = readState(machine.state$);
    expect(state.phase).toBe("idle");
    expect(state.entries.at(-1)).toMatchObject({
      role: "jarvis",
      text: "socket gone",
      done: true,
    });
    machine.dispose();
  });

  it("a send before dispose asks once, with the effective brain", () => {
    const port = createPort();
    const machine = createMachine(port);

    machine.intents.send("hi");

    expect(port.ask).toHaveBeenCalledWith("hi", {
      brain: "scripted",
      effort: "medium",
    });
    machine.dispose();
  });
});

interface SpiedPort extends JarvisPort {
  readonly ask: ReturnType<typeof vi.fn<JarvisPort["ask"]>>;
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

function createMachine(
  port: JarvisPort,
  lifetime: AbortSignal = new AbortController().signal,
): ReturnType<typeof createJarvisMachine> {
  return createJarvisMachine(
    {
      port,
      skin$: of("singularity" as const),
      setSkin: () => {
        // unused
      },
      preferredBrain$: of("claude-haiku-4-5" as const),
      effort$: of("medium" as const),
    },
    lifetime,
  );
}

function readState(
  state$: ReturnType<typeof createJarvisMachine>["state$"],
): JarvisState {
  let latest: JarvisState | undefined;
  state$
    .subscribe((state: JarvisState) => {
      latest = state;
    })
    .unsubscribe();

  if (latest === undefined) {
    throw new Error("state$ delivered nothing synchronously");
  }

  return latest;
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
