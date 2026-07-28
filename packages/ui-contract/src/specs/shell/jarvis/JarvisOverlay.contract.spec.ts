/**
 * JarvisOverlay contract spec (Phase-1 Task 9).
 *
 * Sociable tier: the REAL createJarvisMachine (built by each framework's
 * viewModelFromWorld over `world.jarvis`, the controllable fake JarvisPort)
 * drives the real overlay UI. The overlay renders nothing while closed, so
 * `pressHotkey()` (the global ⌘/Ctrl+J shortcut it binds unconditionally) is
 * how these specs open it — no co-mounted orb needed (that pairing is covered
 * by JarvisOrb.contract.spec.ts instead, for scenarios needing the orb's own
 * `data-jarvis-state`/badge).
 *
 * Every confirmRequest pushed here is immediately approved or rejected before
 * the test ends: an unresolved confirmation leaves the machine's REAL 60s
 * countdown (a plain `setInterval`-backed rxjs `interval`) ticking in the
 * background past the test's lifetime — approve/decline cancels it via
 * `takeUntil`. The auto-decline-at-60s path itself is a JarvisMachine unit
 * concern, not asserted here; the countdown ring's mere presence is enough.
 */

import { JarvisOverlay } from "@ui-contract/components";
import { cleanupMounted, createWorld, mountWith } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import { Direction } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("JarvisOverlay", () => {
  it("is hidden until opened", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);

    expect(overlay.isOpen()).toBe(false);

    await overlay.pressHotkey();
    expect(overlay.isOpen()).toBe(true);
  });

  it("shows the greeting entry once opened", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);

    await overlay.pressHotkey();

    const entries = overlay.entries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ role: "jarvis", done: true });
    expect(entries[0]?.text).toMatch(/J\.A\.R\.V\.I\.S online/);
  });

  it("send appends a user entry and streams deltas into one jarvis entry", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("Where is EURUSD?");

    let entries = overlay.entries();
    expect(entries).toHaveLength(3); // greeting + user + the streaming jarvis stub
    expect(entries[1]).toMatchObject({
      role: "user",
      text: "Where is EURUSD?",
      done: true,
    });
    expect(entries[2]).toMatchObject({ role: "jarvis", text: "", done: false });

    overlay.emitEvents([
      { type: "delta", text: "EURUSD is at " },
      { type: "delta", text: "1.0800, sir." },
    ]);

    entries = overlay.entries();
    expect(entries[2]?.text).toBe("EURUSD is at 1.0800, sir.");
    expect(entries[2]?.done).toBe(false);

    overlay.emitEvents([{ type: "done" }]);

    entries = overlay.entries();
    expect(entries[2]?.done).toBe(true);
  });

  it("does not send when the input is empty or whitespace-only", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    // Default input is empty — clicking SEND is a no-op (submit()'s guard).
    await overlay.clickSend();
    expect(overlay.entries()).toHaveLength(1); // just the greeting

    // Whitespace-only input is likewise a no-op.
    await overlay.typeInput("   ");
    await overlay.clickSend();
    expect(overlay.entries()).toHaveLength(1);
  });

  it("pressing Enter in the input also sends (not just clicking SEND)", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.sendViaEnter("Buy 1M USDJPY");

    const entries = overlay.entries();
    expect(
      entries.some((e) => {
        return e.role === "user" && e.text === "Buy 1M USDJPY";
      }),
    ).toBe(true);

    overlay.emitEvents([{ type: "done" }]);
  });

  it("disables input, SEND, and suggestion chips while speaking, re-enables once done", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    expect(overlay.isInputDisabled()).toBe(false);
    expect(overlay.isSendDisabled()).toBe(false);
    expect(overlay.areSuggestionsDisabled()).toBe(false);

    await overlay.send("What's moving?");
    expect(overlay.isInputDisabled()).toBe(true);
    expect(overlay.isSendDisabled()).toBe(true);
    expect(overlay.areSuggestionsDisabled()).toBe(true);

    overlay.emitEvents([{ type: "done" }]);
    expect(overlay.isInputDisabled()).toBe(false);
    expect(overlay.isSendDisabled()).toBe(false);
    expect(overlay.areSuggestionsDisabled()).toBe(false);
  });

  it("renders a tool chip that transitions running -> done", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("How am I doing?");
    overlay.emitEvents([
      { type: "toolEvent", tool: "desk-briefing", status: "running" },
    ]);
    expect(overlay.toolChipStatus()).toBe("running");

    overlay.emitEvents([
      { type: "toolEvent", tool: "desk-briefing", status: "done" },
    ]);
    expect(overlay.toolChipStatus()).toBe("done");

    overlay.emitEvents([{ type: "done" }]);
  });

  it("renders the confirm card (pair/direction/notional/price); approve records + clears", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("Buy 5M EURUSD");
    overlay.emitEvents([
      {
        type: "confirmRequest",
        confirmationId: "conf-approve",
        symbol: "EURUSD",
        direction: Direction.Buy,
        notional: 5_000_000,
        quotedPrice: 1.08123,
        ratePrecision: 5,
      },
    ]);

    expect(overlay.hasConfirmCard()).toBe(true);
    expect(overlay.confirmDirection()).toBe("buy");
    expect(overlay.confirmSymbol()).toBe("EURUSD");
    expect(overlay.confirmNotional()).toBe("5,000,000");
    expect(overlay.confirmPrice()).toBe("1.08123");
    expect(overlay.hasCountdownRing()).toBe(true);

    await overlay.approveConfirm();

    expect(overlay.hasConfirmCard()).toBe(false);
    expect(world.jarvis.confirms).toEqual([["conf-approve", true]]);

    overlay.emitEvents([{ type: "done" }]);
  });

  it("formats the quoted price at the pair's ratePrecision — a JPY-style 3-dp pair shows 3 decimals, not toPrecision(6)'s padded 4", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("Buy 1M AUDJPY");
    overlay.emitEvents([
      {
        type: "confirmRequest",
        confirmationId: "conf-jpy",
        symbol: "AUDJPY",
        direction: Direction.Buy,
        notional: 1_000_000,
        quotedPrice: 82.5,
        ratePrecision: 3,
      },
    ]);

    expect(overlay.confirmPrice()).toBe("82.500");

    await overlay.rejectConfirm();
    overlay.emitEvents([{ type: "done" }]);
  });

  it("reject records [id, false] in world.jarvis.confirms and clears the card", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("Sell 2M GBPUSD");
    overlay.emitEvents([
      {
        type: "confirmRequest",
        confirmationId: "conf-reject",
        symbol: "GBPUSD",
        direction: Direction.Sell,
        notional: 2_000_000,
        quotedPrice: 1.265,
        ratePrecision: 5,
      },
    ]);

    expect(overlay.hasConfirmCard()).toBe(true);

    await overlay.rejectConfirm();

    expect(overlay.hasConfirmCard()).toBe(false);
    expect(world.jarvis.confirms).toEqual([["conf-reject", false]]);

    overlay.emitEvents([{ type: "done" }]);
  });

  it("clicking a suggestion chip sends its exact text", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    const suggestions = overlay.suggestions();
    expect(suggestions.length).toBeGreaterThan(0);
    const [first] = suggestions;

    await overlay.clickSuggestion(first as string);

    const entries = overlay.entries();
    expect(
      entries.some((e) => {
        return e.role === "user" && e.text === first;
      }),
    ).toBe(true);

    overlay.emitEvents([{ type: "done" }]);
  });

  it("switching skin updates data-skin on the dialog and follows the preference seam", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    expect(overlay.dialogSkin()).toBe("singularity");
    expect(world.jarvisSkin.getValue()).toBe("singularity");
    expect(overlay.isSkinActive("singularity")).toBe(true);

    await overlay.selectSkin("reactor");

    expect(overlay.dialogSkin()).toBe("reactor");
    expect(overlay.isSkinActive("reactor")).toBe(true);
    expect(overlay.isSkinActive("singularity")).toBe(false);
    // The seam is followed, not written to directly: the machine's setSkin
    // intent calls World's setter, and state.skin only ever changes by
    // following jarvisSkin back (see JarvisMachine's skinPatches$).
    expect(world.jarvisSkin.getValue()).toBe("reactor");
  });

  it("Escape closes the overlay", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();
    expect(overlay.isOpen()).toBe(true);

    await overlay.pressEscape();
    expect(overlay.isOpen()).toBe(false);
  });

  it("the close (✕) control closes the overlay", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.close();
    expect(overlay.isOpen()).toBe(false);
  });

  it("the global ⌘/Ctrl+J hotkey toggles open and closed", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);

    expect(overlay.isOpen()).toBe(false);
    await overlay.pressHotkey();
    expect(overlay.isOpen()).toBe(true);
    await overlay.pressHotkey();
    expect(overlay.isOpen()).toBe(false);
  });
});
