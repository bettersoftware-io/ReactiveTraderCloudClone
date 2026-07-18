import {
  AmbientBackground,
  HeaderChrome,
  PreferencesModal,
} from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AmbientBackground power saver", () => {
  it("keeps only the static grid+vignette when the level is calm", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaverLevel: "calm",
    });
    expect(page.powerSaverFlag()).toBe("on");
    expect(page.hasAuroraLayers()).toBe(false);
  });

  it("keeps only the static grid+vignette when the level is freeze (Freeze ⊇ Calm)", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaverLevel: "freeze",
    });
    expect(page.powerSaverFlag()).toBe("on");
    expect(page.hasAuroraLayers()).toBe(false);
  });

  it("renders the full aurora stack when the level is off", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaverLevel: "off",
    });
    expect(page.powerSaverFlag()).toBe("off");
    expect(page.hasAuroraLayers()).toBe(true);
  });
});

describe("PreferencesModal power saver", () => {
  it("reflects the power-saver level and writes it on selection", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      powerSaverLevel: "off",
    });
    expect(page.powerSaverLevel()).toBe("off");

    await page.selectPowerSaverLevel("freeze");
    expect(page.powerSaverLevelSets()).toEqual(["freeze"]);
    // The seam pushed the new value back, so the segment now reflects it.
    expect(page.powerSaverLevel()).toBe("freeze");
  });

  it("selects calm from the segment", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      powerSaverLevel: "off",
    });

    await page.selectPowerSaverLevel("calm");
    expect(page.powerSaverLevelSets()).toEqual(["calm"]);
    expect(page.powerSaverLevel()).toBe("calm");
  });
});

describe("HeaderChrome power saver", () => {
  it("exposes a power-saver control that cycles off -> calm -> freeze -> off", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
      powerSaverLevel: "off",
    });
    expect(header.powerSaverLevel()).toBe("off");

    await header.cyclePowerSaver();
    expect(header.powerSaverLevel()).toBe("calm");

    await header.cyclePowerSaver();
    expect(header.powerSaverLevel()).toBe("freeze");

    await header.cyclePowerSaver();
    expect(header.powerSaverLevel()).toBe("off");
  });
});
