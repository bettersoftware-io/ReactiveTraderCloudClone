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

  it("renders the four catalogue sections", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
    });
    expect(page.hasSection("DISPLAY")).toBe(true);
    expect(page.hasSection("TRADING")).toBe(true);
    expect(page.hasSection("NOTIFICATIONS")).toBe(true);
    expect(page.hasSection("DATA & PRIVACY")).toBe(true);
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
});
