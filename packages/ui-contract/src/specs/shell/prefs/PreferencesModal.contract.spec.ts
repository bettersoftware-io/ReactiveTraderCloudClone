import { AppShell, PreferencesModal } from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import {
  createDefaultLayoutPort,
  formatGateResetTime,
  parseWorkspaceLayout,
  type UNSUPPORTED_SENTINEL_SPEC,
} from "@rtc/client-core";
import { JARVIS_BRAINS } from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("PreferencesModal", () => {
  it("renders nothing while closed", () => {
    const page = mount(PreferencesModal, {
      props: { open: false, onClose: () => {} },
    });
    expect(page.isOpen()).toBe(false);
  });

  it("reflects the animated-background preference and writes it on toggle", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      animatedBackground: false,
    });
    expect(page.isOpen()).toBe(true);
    expect(page.animatedBgOn()).toBe(false);

    await page.toggleAnimatedBg();
    expect(page.animatedBgSets()).toEqual([true]);
    // The seam pushed the new value back, so the switch now reflects it.
    expect(page.animatedBgOn()).toBe(true);
  });

  // Power-saver assertions live in shell/power/PowerSaverSurfaces.contract.spec.ts
  // (react-only; excluded from the Solid contract run).

  it("force-boot-animation toggle reflects the preference and writes it on toggle", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      forceBootAnimation: true,
    });
    expect(page.forceBootAnimationOn()).toBe(true);
    await page.toggleForceBootAnimation();
    expect(page.forceBootAnimationSets()).toEqual([false]);
  });

  it("closes on the dismiss (✕) control", async () => {
    let closed = 0;
    const page = mount(PreferencesModal, {
      props: {
        open: true,
        onClose: () => {
          closed += 1;
        },
      },
    });
    await page.close();
    expect(closed).toBe(1);
  });

  it("closes on the DONE control", async () => {
    let closed = 0;
    const page = mount(PreferencesModal, {
      props: {
        open: true,
        onClose: () => {
          closed += 1;
        },
      },
    });
    await page.done();
    expect(closed).toBe(1);
  });

  it("renders the six catalogue sections", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.hasSection("DISPLAY")).toBe(true);
    expect(page.hasSection("MOTION")).toBe(true);
    expect(page.hasSection("TRADING")).toBe(true);
    expect(page.hasSection("NOTIFICATIONS")).toBe(true);
    expect(page.hasSection("DATA & PRIVACY")).toBe(true);
    expect(page.hasSection("JARVIS")).toBe(true);
  });

  it("splits the sections across the two columns as looks | behaviour", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.sectionsInColumn(0)).toEqual(["DISPLAY", "MOTION"]);
    expect(page.sectionsInColumn(1)).toEqual([
      "TRADING",
      "NOTIFICATIONS",
      "DATA & PRIVACY",
      "JARVIS",
    ]);
  });

  it("keeps the two columns within one row of each other, aside from the deliberately-appended JARVIS section", () => {
    // The regression guard for the imbalance that prompted MOTION: rows had
    // accumulated in the left column until it ran 15 against the right's 9.
    // A tolerance rather than exact counts, so adding ONE row stays legal and
    // only real drift fails — the point is the property, not a snapshot.
    //
    // The JARVIS section (brain + effort segments) was appended later at the
    // foot of column 2 WITHOUT rebalancing — PreferencesModal.tsx's own doc
    // comment: "sits at the foot of column 2, so it doesn't reopen that
    // balance". Its 2 rows are carved out of the comparison below so this
    // guard still catches real drift in the ORIGINAL catalogue, rather than
    // needing a permanently wider tolerance for one intentional exception.
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    const JARVIS_ROW_COUNT = 2; // pref-segment-jarvisBrain, pref-segment-jarvisEffort
    const left = page.rowCountInColumn(0);
    const right = page.rowCountInColumn(1) - JARVIS_ROW_COUNT;

    expect(left).toBeGreaterThan(0);
    expect(right).toBeGreaterThan(0);
    expect(Math.abs(left - right)).toBeLessThanOrEqual(1);
  });

  it("groups every motion control under MOTION rather than DISPLAY", () => {
    // "Reduce motion" moved out of DISPLAY when MOTION was introduced; this
    // pins the intent (movement lives together) rather than the row order.
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.sectionsInColumn(0)).toContain("MOTION");
    expect(page.hasToggle("reduceMotion")).toBe(true);
    expect(page.hasToggle("forceBootAnimation")).toBe(true);
  });

  it("shows the login-wait style segment defaulting to Auto, and writes the pin on select", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.segmentActive("loginWaitStyle", "auto")).toBe(true);

    await page.selectSegment("loginWaitStyle", "reactor");
    expect(page.loginWaitStyleSets()).toEqual(["reactor"]);
    expect(page.segmentActive("loginWaitStyle", "reactor")).toBe(true);
    expect(page.segmentActive("loginWaitStyle", "auto")).toBe(false);
  });

  it("reflects a seeded login-wait style pin", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      loginWaitStyle: "handshake",
    });
    expect(page.segmentActive("loginWaitStyle", "handshake")).toBe(true);
    expect(page.segmentActive("loginWaitStyle", "auto")).toBe(false);
  });

  it("shows the login-wait delay segment defaulting to Off, and writes the choice on select", async () => {
    // Off by default matters: a stored preference must not slow anyone's
    // sign-in until they ask it to.
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.segmentActive("loginWaitDelay", "off")).toBe(true);

    await page.selectSegment("loginWaitDelay", "3s");
    expect(page.loginWaitDelaySets()).toEqual(["3s"]);
    expect(page.segmentActive("loginWaitDelay", "3s")).toBe(true);
  });

  it("reflects a seeded login-wait delay", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      loginWaitDelay: "6s",
    });
    expect(page.segmentActive("loginWaitDelay", "6s")).toBe(true);
    expect(page.segmentActive("loginWaitDelay", "off")).toBe(false);
  });

  it("keeps the two login-wait rows independent of each other", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      loginWaitStyle: "reactor",
      loginWaitDelay: "1s",
    });
    expect(page.segmentActive("loginWaitStyle", "reactor")).toBe(true);
    expect(page.segmentActive("loginWaitDelay", "1s")).toBe(true);
    expect(page.loginWaitStyleSets()).toEqual([]);
    expect(page.loginWaitDelaySets()).toEqual([]);
  });

  it("flips a cosmetic toggle locally (decorative, not wired to any port)", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      animatedBackground: false,
    });
    expect(page.hasToggle("reduceMotion")).toBe(true);
    expect(page.cosmeticOn("reduceMotion")).toBe(false);

    await page.toggleCosmetic("reduceMotion");
    expect(page.cosmeticOn("reduceMotion")).toBe(true);
    // A cosmetic click does NOT touch the real animated-background seam.
    expect(page.animatedBgSets()).toEqual([]);
  });

  it("selects a cosmetic segment option locally", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.segmentActive("density", "comfortable")).toBe(true);
    expect(page.segmentActive("density", "compact")).toBe(false);

    await page.selectSegment("density", "compact");
    expect(page.segmentActive("density", "compact")).toBe(true);
    expect(page.segmentActive("density", "comfortable")).toBe(false);
  });

  it("shows the REAL Ambient style segment reflecting the active option, and writes through the seam on select", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      ambientStyle: "aurora",
    });
    expect(page.ambientStyleActive("aurora")).toBe(true);
    expect(page.ambientStyleActive("rays")).toBe(false);

    await page.selectAmbientStyle("rays");
    // The seam pushed the new value back, so the segment now reflects it.
    expect(page.ambientStyleActive("rays")).toBe(true);
    expect(page.ambientStyleActive("aurora")).toBe(false);
  });

  it("shows the REAL Chart renderer segment reflecting the active option, and writes through the seam on select", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      chartSubstrate: "dom",
    });

    expect(page.chartSubstrateActive("dom")).toBe(true);
    expect(page.chartSubstrateActive("canvas")).toBe(false);

    await page.selectChartSubstrate("canvas");

    expect(page.chartSubstrateActive("canvas")).toBe(true);
    expect(page.chartSubstrateActive("dom")).toBe(false);
  });

  it("renders the Jarvis brain segment with all four options", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(JARVIS_BRAINS).toHaveLength(4);

    // jarvisBrainDisabled() reads the option's testid via getByTestId, which
    // throws if the button isn't rendered — so a clean pass over all four
    // proves every option is present, independent of its disabled state.
    for (const brain of JARVIS_BRAINS) {
      expect(() => {
        page.jarvisBrainDisabled(brain);
      }).not.toThrow();
    }
  });

  it("disables real (non-scripted) brain options when the server offers only scripted, but never disables scripted itself", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: null,
      },
    });

    expect(page.jarvisBrainDisabled("scripted")).toBe(false);
    expect(page.jarvisBrainDisabled("claude-haiku-4-5")).toBe(true);
    expect(page.jarvisBrainDisabled("claude-sonnet-5")).toBe(true);
    expect(page.jarvisBrainDisabled("claude-opus-5")).toBe(true);
  });

  it("does not disable any brain option when the server offers every brain", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: "claude-haiku-4-5",
        gate: null,
      },
    });

    for (const brain of JARVIS_BRAINS) {
      expect(page.jarvisBrainDisabled(brain)).toBe(false);
    }
  });

  it("selecting a brain writes through the useJarvisPreferences seam and reflects it", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: "claude-haiku-4-5",
        gate: null,
      },
      jarvisBrain: "scripted",
    });
    expect(page.segmentActive("jarvisBrain", "scripted")).toBe(true);

    await page.selectSegment("jarvisBrain", "claude-opus-5");
    expect(page.jarvisBrainSets()).toEqual(["claude-opus-5"]);
    expect(page.segmentActive("jarvisBrain", "claude-opus-5")).toBe(true);
    expect(page.segmentActive("jarvisBrain", "scripted")).toBe(false);
  });

  it("disables gated brains and titles them with the reset time", () => {
    const resetsAtMs = 1_754_000_000_000;
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: {
        available: true,
        // "claude-sonnet-5"/"claude-opus-5" are absent from `brains`
        // entirely (env-removed, unrelated to the gate); only
        // "claude-haiku-4-5" is BOTH offered AND in `gate.gated`.
        brains: ["scripted", "claude-haiku-4-5"],
        defaultBrain: "claude-haiku-4-5",
        gate: {
          level: "soft",
          resetsAtMs,
          gated: ["claude-haiku-4-5"],
        },
      },
    });

    // Gated AND offered: disabled, with the reset-time title.
    expect(page.jarvisBrainDisabled("claude-haiku-4-5")).toBe(true);
    expect(page.jarvisBrainOptionTitle("claude-haiku-4-5")).toBe(
      `Budget window — resets ${formatGateResetTime(resetsAtMs)}`,
    );

    // Env-removed (absent from `brains`) but NOT in `gate.gated`: disabled,
    // but WITHOUT a title — the `title: gated ? gateHint : undefined`
    // branch only fires for a brain the GATE itself removed, not merely a
    // not-currently-offered one. (Routed T6 review finding.)
    expect(page.jarvisBrainDisabled("claude-sonnet-5")).toBe(true);
    expect(page.jarvisBrainOptionTitle("claude-sonnet-5")).toBeNull();

    // Never gated, never env-removed: enabled, no title.
    expect(page.jarvisBrainDisabled("scripted")).toBe(false);
    expect(page.jarvisBrainOptionTitle("scripted")).toBeNull();
  });

  it("shows the budget hint line under the Brain row while gated, and not when ungated", () => {
    const resetsAtMs = 1_754_000_000_000;
    const gatedPage = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: {
        available: true,
        brains: JARVIS_BRAINS,
        defaultBrain: "claude-haiku-4-5",
        gate: {
          level: "hard",
          resetsAtMs,
          gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
    expect(gatedPage.jarvisBrainHintText()).toBe(
      `Budget window — resets ${formatGateResetTime(resetsAtMs)}`,
    );

    const ungatedPage = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(ungatedPage.jarvisBrainHintText()).toBeNull();
  });

  it("disables the Effort row entirely when the stored brain is scripted", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisBrain: "scripted",
    });
    expect(page.jarvisEffortDisabled()).toBe(true);
  });

  it("leaves the Effort row enabled and writes through the seam when the stored brain is a real model", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisBrain: "claude-haiku-4-5",
    });
    expect(page.jarvisEffortDisabled()).toBe(false);
    expect(page.segmentActive("jarvisEffort", "medium")).toBe(true);

    await page.selectSegment("jarvisEffort", "high");
    expect(page.jarvisEffortSets()).toEqual(["high"]);
    expect(page.segmentActive("jarvisEffort", "high")).toBe(true);
  });

  it("shows the REAL Narrator row defaulting to on, and writes through the seam on toggle (Task 12/P5)", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.segmentActive("jarvisNarrator", "on")).toBe(true);

    await page.selectSegment("jarvisNarrator", "off");
    expect(page.jarvisNarratorSets()).toEqual(["off"]);
    expect(page.segmentActive("jarvisNarrator", "off")).toBe(true);
    expect(page.segmentActive("jarvisNarrator", "on")).toBe(false);
  });

  it("reflects a seeded narrator preference", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisNarrator: "off",
    });
    expect(page.segmentActive("jarvisNarrator", "off")).toBe(true);
    expect(page.segmentActive("jarvisNarrator", "on")).toBe(false);
  });
});

/**
 * DATA & PRIVACY → "Reset workspace layout" (GenUI L3). The one `PrefAction`
 * row in the modal: an action, not a stored value, so there is nothing to
 * reflect back — what it does is only observable in the WORKSPACE. Both
 * surfaces are therefore mounted on ONE shared World (`mountWith`, the
 * `JarvisPanelLayer.contract.spec.ts` pattern): the modal to press RESET, the
 * real `App` shell to witness the tree, the docked panels and the persisted
 * preference return to their defaults.
 */
describe("PreferencesModal — reset workspace layout", () => {
  it("restores every tab's default tree, unpins every docked panel, and clears the stored preference", async () => {
    const world = createWorld();
    const app = mountWith(world, AppShell);
    const prefs = mountWith(world, PreferencesModal, {
      open: true,
      onClose: () => {},
    });

    await app.overlay.pressHotkey();
    await app.overlay.send("show me desk positions");
    app.overlay.emitEvents([
      { type: "panel", panelId: RESET_PANEL_ID, spec: DESK_POSITIONS_SPEC },
      { type: "done" },
    ]);
    await app.panels.dockPanel(RESET_PANEL_ID);
    expect(app.layout.isDocked(RESET_PANEL_ID)).toBe(true);

    // A non-default TREE too, so the reset has both halves to undo. Asserted
    // before the maximize is applied to the docked leaf's own head: a
    // maximized sibling turns every other panel into a strip, which replaces
    // the docked head (and its unpin control) with a restore bar.
    app.layout.maximize("fx-rates");
    await flushWorkspacePersistence();

    expect(app.maximizedPanelId()).toBe("fx-rates");
    const pinned = world.workspaceLayout.getValue();
    expect(pinned).not.toBeNull();
    expect(parseWorkspaceLayout(pinned)?.tabs.fx?.docked).toHaveLength(1);

    await prefs.resetWorkspaceLayout();

    expect(app.layout.isDocked(RESET_PANEL_ID)).toBe(false);
    expect(app.maximizedPanelId()).toBe("");
    // Unpinned by DISMISSAL, not by undocking — the panel is gone entirely,
    // it does not reappear in the floating cascade.
    expect(app.panels.isPresent()).toBe(false);

    // The STORED preference: reset nulls it, but the reset's own state
    // changes immediately kick the writer, so what a later boot would read is
    // a re-persisted DEFAULT workspace — deliberate (composition's own doc:
    // better than leaving the cleared preference and live state disagreeing).
    // The bare `null` in between is not observable from here, because
    // awaiting the click already yields to the task the writer runs on.
    await flushWorkspacePersistence();
    const rewritten = parseWorkspaceLayout(world.workspaceLayout.getValue());
    expect(rewritten?.tabs.fx?.docked).toEqual([]);
    expect(rewritten?.tabs.fx?.layout.maximized).toBeNull();
    // …and the tree itself is the DEFAULT one, compared against the same
    // `createDefaultLayoutPort` the machine's own `reset()` returns to rather
    // than a hand-copied literal.
    expect(rewritten?.tabs.fx?.layout).toEqual(
      createDefaultLayoutPort("fx").initial,
    );
  });
});

/** The panel the reset scenario pins — an `analytics`-sourced table, the
 * cheapest spec whose body mounts without any seeded World data. */
const RESET_PANEL_ID = "panel-desk-positions";

/** No public export of `PanelSpecV1` reaches `@rtc/ui-contract`, so this
 * borrows the type off the one already-exported `PanelSpecV1`-typed const —
 * the same trick `JarvisPanelLayer.contract.spec.ts` uses. */
type PanelSpecV1 = typeof UNSUPPORTED_SENTINEL_SPEC;

const DESK_POSITIONS_SPEC: PanelSpecV1 = {
  v: 1,
  title: "Desk Positions",
  source: { kind: "analytics" },
  transforms: [],
  viz: { kind: "table" },
};

/** One macrotask — the whole window of the contract fixture's workspace
 * persistence writer (the REAL `createWorkspacePersistenceWriter` at
 * `debounceMs: 0`; see `LayoutEngine.contract.spec.ts`'s twin helper). */
function flushWorkspacePersistence(): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}
