import { PreferencesModal } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

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

  it("renders the five catalogue sections", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.hasSection("DISPLAY")).toBe(true);
    expect(page.hasSection("MOTION")).toBe(true);
    expect(page.hasSection("TRADING")).toBe(true);
    expect(page.hasSection("NOTIFICATIONS")).toBe(true);
    expect(page.hasSection("DATA & PRIVACY")).toBe(true);
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
    ]);
  });

  it("keeps the two columns within one row of each other", () => {
    // The regression guard for the imbalance that prompted MOTION: rows had
    // accumulated in the left column until it ran 15 against the right's 9.
    // A tolerance rather than exact counts, so adding ONE row stays legal and
    // only real drift fails — the point is the property, not a snapshot.
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    const left = page.rowCountInColumn(0);
    const right = page.rowCountInColumn(1);

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
});
