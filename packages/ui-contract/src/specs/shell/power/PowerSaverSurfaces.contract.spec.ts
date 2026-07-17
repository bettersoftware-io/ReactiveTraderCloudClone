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

// Power-saver surfaces are react-only for now: the Solid walking skeleton
// has no power-saver UI (see packages/client-solid/tests/ui/contract/vitest.config.ts,
// which excludes this whole shell/power/ directory). These assertions were
// relocated out of the mixed AmbientBackground/PreferencesModal/HeaderChrome
// specs so the file-level exclusion can isolate them cleanly.

describe("AmbientBackground power saver", () => {
  it("keeps only the static grid+vignette when power saver is on", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaver: true,
    });
    expect(page.powerSaverFlag()).toBe("true");
    expect(page.hasAuroraLayers()).toBe(false);
  });

  it("renders the full aurora stack when power saver is off", () => {
    const page = mount(AmbientBackground, {
      animatedBackground: true,
      powerSaver: false,
    });
    expect(page.powerSaverFlag()).toBe("false");
    expect(page.hasAuroraLayers()).toBe(true);
  });
});

describe("PreferencesModal power saver", () => {
  it("reflects the power-saver preference and writes it on toggle", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      powerSaver: false,
    });
    expect(page.powerSaverOn()).toBe(false);

    await page.togglePowerSaver();
    expect(page.powerSaverSets()).toEqual([true]);
    // The seam pushed the new value back, so the switch now reflects it.
    expect(page.powerSaverOn()).toBe(true);
  });
});

describe("HeaderChrome power saver", () => {
  it("exposes a power-saver quick toggle that flips aria-pressed", async () => {
    const header = mount(HeaderChrome, {
      props: { activeTab: "fx", onTabChange: () => {} },
      powerSaver: false,
    });
    expect(header.powerSaverPressed()).toBe("false");
    await header.clickPowerSaver();
    expect(header.powerSaverPressed()).toBe("true");
  });
});
