import { NEVER, of } from "rxjs";
import { describe, expect, it, vi } from "vitest";

import type { JarvisPort, JarvisState } from "@rtc/core-api";

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
    new AbortController().signal,
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
