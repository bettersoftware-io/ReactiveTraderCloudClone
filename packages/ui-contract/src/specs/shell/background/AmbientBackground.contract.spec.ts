import { AmbientBackground } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("AmbientBackground", () => {
  it("renders a calm (data-animated=false) decorative backdrop when the preference is off", () => {
    const page = mount(AmbientBackground, { animatedBackground: false });
    expect(page.hasRoot()).toBe(true);
    expect(page.animatedFlag()).toBe("false");
  });

  it("flags the backdrop animated (data-animated=true) when the preference is on", () => {
    const page = mount(AmbientBackground, { animatedBackground: true });
    expect(page.hasRoot()).toBe(true);
    expect(page.animatedFlag()).toBe("true");
  });

  it("is aria-hidden so the decorative backdrop is invisible to assistive tech", () => {
    const page = mount(AmbientBackground, { animatedBackground: true });
    expect(page.ariaHidden()).toBe("true");
  });

  // Power-saver assertions live in shell/power/PowerSaverSurfaces.contract.spec.ts
  // (react-only; excluded from the Solid contract run).

  describe("ambient style branch (aurora vs rays)", () => {
    it("reflects the aurora style and mounts ONLY the aurora-curtains layer group", () => {
      const page = mount(AmbientBackground, { ambientStyle: "aurora" });
      expect(page.ambientStyle()).toBe("aurora");
      expect(page.hasLayer("aurora-curtains")).toBe(true);
      expect(page.hasLayer("rays")).toBe(false);
    });

    it("reflects the rays style and mounts ONLY the rays layer group", () => {
      const page = mount(AmbientBackground, { ambientStyle: "rays" });
      expect(page.ambientStyle()).toBe("rays");
      expect(page.hasLayer("rays")).toBe(true);
      expect(page.hasLayer("aurora-curtains")).toBe(false);
    });

    it("omits both styles' layer groups under power saver, regardless of style", () => {
      const page = mount(AmbientBackground, {
        ambientStyle: "aurora",
        powerSaver: true,
      });
      expect(page.hasLayer("aurora-curtains")).toBe(false);
      expect(page.hasLayer("rays")).toBe(false);
    });
  });
});
