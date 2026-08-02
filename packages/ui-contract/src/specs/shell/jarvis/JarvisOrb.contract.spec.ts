/**
 * JarvisOrb contract spec (Phase-1 Task 9).
 *
 * The orb is hook-driven off the REAL JarvisMachine (built by each framework's
 * viewModelFromWorld over `world.jarvis`, the controllable fake JarvisPort) —
 * a sociable spec: real machine + real UI, only the port is faked. Scenarios
 * that need `send()` (only reachable through the overlay's rendered input)
 * mount both JarvisOrb and JarvisOverlay via `mountWith(world, …)` on one
 * shared World, so both observe the same machine instance.
 */

import { JarvisOrb, JarvisOverlay } from "@ui-contract/components";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("JarvisOrb", () => {
  it("renders nothing when the Jarvis backend reports unavailable", () => {
    // createWorld's positional seeds, up to the 18th (jarvisAvailabilitySeed
    // — the structured JarvisAvailability since Task 10, not a plain
    // boolean) — mirrors OrderTicket.contract.spec.ts's own
    // long-undefined-run form, the existing convention for reaching a late
    // positional seed.
    const world = createWorld(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { available: false, brains: [], defaultBrain: "scripted" },
    );
    const orb = mountWith(world, JarvisOrb);

    expect(orb.isPresent()).toBe(false);
  });

  it("renders idle with no unread badge before any interaction", () => {
    const world = createWorld();
    const orb = mountWith(world, JarvisOrb);

    expect(orb.state()).toBe("idle");
    expect(orb.badge()).toBeNull();
    expect(orb.isActive()).toBe(false);
  });

  it("click toggles data-active", async () => {
    const world = createWorld();
    const orb = mountWith(world, JarvisOrb);

    await orb.click();
    expect(orb.isActive()).toBe(true);

    await orb.click();
    expect(orb.isActive()).toBe(false);
  });

  it("flips to speaking while a turn streams, back to idle once done", async () => {
    const world = createWorld();
    const orb = mountWith(world, JarvisOrb);
    const overlay = mountWith(world, JarvisOverlay);

    await orb.click(); // open, so the overlay's input/send are in the DOM
    await overlay.send("Where is EURUSD?");
    expect(orb.state()).toBe("speaking");

    overlay.emitEvents([{ type: "delta", text: "It's at 1.0800, sir." }]);
    expect(orb.state()).toBe("speaking");

    overlay.emitEvents([{ type: "done" }]);
    expect(orb.state()).toBe("idle");
  });

  it("shows attention while a confirmation is pending (overrides speaking)", async () => {
    const world = createWorld();
    const orb = mountWith(world, JarvisOrb);
    const overlay = mountWith(world, JarvisOverlay);

    await orb.click();
    await overlay.send("Buy 5M EURUSD");
    expect(orb.state()).toBe("speaking");

    overlay.emitEvents([
      {
        type: "confirmRequest",
        confirmationId: "conf-attn",
        symbol: "EURUSD",
        direction: Direction.Buy,
        notional: 5_000_000,
        quotedPrice: 1.08123,
        ratePrecision: 5,
      },
    ]);

    expect(orb.state()).toBe("attention");

    // Resolve it — leaving a pending confirmation running would leave the
    // machine's real 60s countdown timer ticking past this test's end.
    await overlay.approveConfirm();
    overlay.emitEvents([{ type: "done" }]);
  });

  it("shows an unread badge for a reply that lands while closed, clears on reopen", async () => {
    const world = createWorld();
    const orb = mountWith(world, JarvisOrb);
    const overlay = mountWith(world, JarvisOverlay);

    await orb.click(); // open
    await overlay.send("What's moving?");
    await orb.click(); // close mid-turn (open→false)

    overlay.emitEvents([
      { type: "delta", text: "Movers: EURUSD +0.4%, sir." },
      { type: "done" },
    ]);

    expect(orb.badge()).toBe(1);

    await orb.click(); // reopen — clears unread
    expect(orb.badge()).toBeNull();
  });
});
