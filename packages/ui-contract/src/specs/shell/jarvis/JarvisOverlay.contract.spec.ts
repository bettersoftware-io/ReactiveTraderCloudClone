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

import {
  formatGateResetTime,
  JARVIS_GUIDE_CATALOG,
  sampleGuideChips,
} from "@rtc/client-core";
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

  it("the global hotkey is a no-op while the Jarvis backend reports unavailable", async () => {
    // Same positional-seed run as JarvisOrb.contract.spec.ts's unavailable
    // scenario — the 18th seed (jarvisAvailabilitySeed, the structured
    // JarvisAvailability since Task 10) set to `available: false`.
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
      { available: false, brains: [], defaultBrain: "scripted", gate: null },
    );
    const overlay = mountWith(world, JarvisOverlay);

    expect(overlay.isOpen()).toBe(false);
    await overlay.pressHotkey();
    expect(overlay.isOpen()).toBe(false);
  });

  it("stamps data-origin=system on the budget-downgrade line appended when a live gate moves the effective brain mid-session", async () => {
    // world's default jarvisAvailability seed offers every brain (Task 8 of
    // Phase 5's `createWorld` default), so the stored DEFAULT_JARVIS_BRAIN
    // preference ("claude-haiku-4-5") starts as the effective brain.
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    // Complete one ordinary turn first — JarvisMachine's budget-downgrade
    // line only appends when there's an open conversation to append to
    // (more than just the canned greeting entry).
    await overlay.send("Where is EURUSD?");
    overlay.emitEvents([{ type: "done" }]);
    expect(overlay.entries()).toHaveLength(3); // greeting + user + reply

    // A hard gate lands mid-session, removing every live brain (offered
    // brains narrow to just "scripted") — the preferred "claude-haiku-4-5"
    // is no longer offered, so the effective brain actually moves.
    const resetsAtMs = 1_754_000_000_000;
    overlay.setJarvisAvailability({
      available: true,
      brains: ["scripted"],
      defaultBrain: "scripted",
      gate: {
        level: "hard",
        resetsAtMs,
        gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
      },
    });

    const entries = overlay.entries();
    expect(entries).toHaveLength(4);
    const last = overlay.lastEntry();
    expect(last?.role).toBe("jarvis");
    expect(last?.done).toBe(true);
    expect(last?.origin).toBe("system");
    expect(last?.text).toBe(
      `Usage budget reached — continuing on scripted until ${formatGateResetTime(resetsAtMs)}.`,
    );
  });
});

describe("rotating chips", () => {
  it("chips render the sampleGuideChips set for the current openCount", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey(); // first open → openCount 1

    expect(overlay.suggestions()).toEqual([
      ...sampleGuideChips(JARVIS_GUIDE_CATALOG, 1),
    ]);
  });

  // Paired with the seed-1 case above: together they kill a mutant that
  // hardcodes openCount's sampled seed to a constant (e.g. 0) — seed 1
  // alone already differs from seed 0 for most sections, but only a SECOND,
  // genuinely incremented open proves the seed tracks openCount rather than
  // just happening to equal 1 once.
  it("chips rotate on the next open (seed 2)", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey(); // open → openCount 1
    await overlay.pressHotkey(); // close
    await overlay.pressHotkey(); // reopen → openCount 2

    expect(overlay.suggestions()).toEqual([
      ...sampleGuideChips(JARVIS_GUIDE_CATALOG, 2),
    ]);
  });
});

describe("demo guide", () => {
  it("ⓘ toggles the guide panel with every catalog section and row", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    expect(overlay.isGuideOpen()).toBe(false);

    await overlay.toggleGuide();

    expect(overlay.isGuideOpen()).toBe(true);
    expect(overlay.guideSectionTitles()).toEqual(
      JARVIS_GUIDE_CATALOG.map((section) => {
        return section.title;
      }),
    );
    expect(overlay.guideRows()).toEqual(
      JARVIS_GUIDE_CATALOG.flatMap((section) => {
        return section.items.map((item) => {
          return item.command;
        });
      }),
    );

    await overlay.toggleGuide();
    expect(overlay.isGuideOpen()).toBe(false);
  });

  it("liveOnly rows carry the live-brain badge, others do not", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();
    await overlay.toggleGuide();

    const expected = JARVIS_GUIDE_CATALOG.flatMap((section) => {
      return section.items
        .filter((item) => {
          return item.liveOnly === true;
        })
        .map((item) => {
          return item.command;
        });
    });

    expect(overlay.liveBadgedRows()).toEqual(expected);
  });

  it("clicking a guide row sends its exact command as a user turn", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();
    await overlay.toggleGuide();

    await overlay.clickGuideRow("Where is EURUSD?");

    const entries = overlay.entries();
    expect(
      entries.some((e) => {
        return e.role === "user" && e.text === "Where is EURUSD?";
      }),
    ).toBe(true);

    overlay.emitEvents([{ type: "done" }]);
  });
});

describe("full demo", () => {
  it("starting the demo shows STEP progress and ■ STOP; stop returns the ▶ entry", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    expect(overlay.demoProgressText()).toBeNull();

    await overlay.runDemoFromFooter();
    expect(overlay.demoProgressText()).toMatch(/^STEP 1\/7 · /);

    await overlay.stopDemo();
    expect(overlay.demoProgressText()).toBeNull();
  });

  it("running the demo from the open guide panel behaves the same as the footer control", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();
    await overlay.toggleGuide();

    await overlay.runDemoFromGuide();
    expect(overlay.demoProgressText()).toMatch(/^STEP 1\/7 · /);

    overlay.emitEvents([{ type: "done" }]);
    await overlay.stopDemo();
    expect(overlay.demoProgressText()).toBeNull();
  });

  it("a manual send while the demo runs halts it", async () => {
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.runDemoFromFooter();
    expect(overlay.demoProgressText()).toMatch(/^STEP 1\/7 · /);
    // Step 1's `sendScripted` reaches the same fake port as an ordinary
    // send(), so it stays in-flight (phase "speaking") until an event is
    // pushed — input/SEND/chips are disabled the whole time, exactly like
    // an ordinary turn.
    expect(overlay.isInputDisabled()).toBe(true);

    // Settle step 1's turn: demoState.running stays true through the
    // post-settle beat (a real, un-instrumented timer that hasn't elapsed
    // yet at this point in the test) — the one window where the input
    // isn't gated by `speaking`, so a manual send can actually reach
    // submit()'s `demoState.running` guard instead of being blocked by
    // `disabled`.
    overlay.emitEvents([{ type: "done" }]);
    expect(overlay.isInputDisabled()).toBe(false);

    await overlay.send("Where is EURUSD?");

    expect(overlay.demoProgressText()).toBeNull();
  });
});

describe("auto-scroll on reopen", () => {
  it("re-applies scroll-to-bottom to the freshly mounted transcript after close+reopen", async () => {
    // Regression coverage for the Task 6 fix: the auto-scroll layout effect
    // is keyed on BOTH `entries.length` AND `state.open` — without `open` in
    // the deps, a reopen whose entries.length happens to match the last
    // (no-op, while-closed) run would skip re-firing the effect entirely,
    // leaving the freshly mounted `.messages` div at its default scrollTop.
    const world = createWorld();
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();

    await overlay.send("first");
    overlay.emitEvents([{ type: "done" }]);
    await overlay.send("second");
    overlay.emitEvents([{ type: "done" }]);

    const probe = probeScrollTop(800, 200);

    try {
      await overlay.pressHotkey(); // close
      await overlay.pressHotkey(); // reopen — mounts a FRESH `.messages` div

      // The reopened container's own `scrollTop = scrollHeight` assignment,
      // clamped like a real browser would — proves the effect actually
      // re-ran against the NEW node rather than being skipped as a no-op.
      expect(probe.lastScrollTop()).toBe(800 - 200);
    } finally {
      probe.restore();
    }
  });
});

/** {@link probeScrollTop}'s return: a live read of the last clamped
 * `scrollTop` write, plus the teardown that restores the original
 * `Element.prototype` descriptors. */
interface ScrollProbe {
  readonly lastScrollTop: () => number;
  readonly restore: () => void;
}

/** Patches `Element.prototype`'s scroll geometry so ANY freshly created DOM
 * node reports the given `scrollHeight`/`clientHeight` and clamps writes to
 * `scrollTop` the way a real browser would — jsdom implements no layout, so
 * both geometry getters always read 0 and its own `scrollTop` setter applies
 * no clamp, making "did this scroll to the bottom?" unobservable without
 * this. A PROTOTYPE-level patch (not an instance-level one on a captured
 * element) is required because JarvisOverlay's `.messages` container is
 * unmounted/remounted fresh on every close→reopen (both frameworks tear the
 * whole overlay subtree down while closed — `JarvisOverlay`'s own component
 * instance never unmounts, so its `useLayoutEffect`/`createEffect` deps are
 * compared against the PREVIOUS render rather than treated as a fresh
 * mount, which is exactly what the Task 6 fix this probes for depends on):
 * an instance grabbed before `close()` would already be detached by the
 * time the reopened render's layout effect fires, and by then it's too late
 * to install a per-instance stub. Used only by the auto-scroll-on-reopen
 * regression case above; always paired with `restore()` in a `finally` so
 * the patch never leaks into another test. */
function probeScrollTop(
  scrollHeight: number,
  clientHeight: number,
): ScrollProbe {
  const proto = Element.prototype;

  const originalScrollHeight = Object.getOwnPropertyDescriptor(
    proto,
    "scrollHeight",
  );

  const originalClientHeight = Object.getOwnPropertyDescriptor(
    proto,
    "clientHeight",
  );

  const originalScrollTop = Object.getOwnPropertyDescriptor(proto, "scrollTop");
  let last = 0;

  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get: () => {
      return scrollHeight;
    },
  });
  Object.defineProperty(proto, "clientHeight", {
    configurable: true,
    get: () => {
      return clientHeight;
    },
  });
  Object.defineProperty(proto, "scrollTop", {
    configurable: true,
    get: () => {
      return last;
    },
    set: (value: number) => {
      last = Math.max(0, Math.min(value, scrollHeight - clientHeight));
    },
  });

  return {
    lastScrollTop: () => {
      return last;
    },
    restore: () => {
      if (originalScrollHeight) {
        Object.defineProperty(proto, "scrollHeight", originalScrollHeight);
      }

      if (originalClientHeight) {
        Object.defineProperty(proto, "clientHeight", originalClientHeight);
      }

      if (originalScrollTop) {
        Object.defineProperty(proto, "scrollTop", originalScrollTop);
      }
    },
  };
}
