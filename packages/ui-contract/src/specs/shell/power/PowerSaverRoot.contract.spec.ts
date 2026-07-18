import { PowerSaverRoot } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
  delete document.documentElement.dataset.powerSaver;
  document.documentElement.style.removeProperty("--fx-play");
});

describe("PowerSaverRoot", () => {
  it("stamps data-power-saver=off and --fx-play: running by default", () => {
    const page = mount(PowerSaverRoot, {});
    expect(page.powerSaverFlag()).toBe("off");
    expect(page.fxPlay()).toBe("running");
  });

  it("stamps data-power-saver=calm and --fx-play: paused when the level is calm", () => {
    const page = mount(PowerSaverRoot, { powerSaverLevel: "calm" });
    expect(page.powerSaverFlag()).toBe("calm");
    expect(page.fxPlay()).toBe("paused");
  });

  it("stamps data-power-saver=freeze and --fx-play: paused when the level is freeze (Freeze ⊇ Calm)", () => {
    const page = mount(PowerSaverRoot, { powerSaverLevel: "freeze" });
    expect(page.powerSaverFlag()).toBe("freeze");
    expect(page.fxPlay()).toBe("paused");
  });
});
