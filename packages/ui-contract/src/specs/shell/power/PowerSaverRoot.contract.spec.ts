import { PowerSaverRoot } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
  delete document.documentElement.dataset.powerSaver;
  document.documentElement.style.removeProperty("--fx-play");
});

describe("PowerSaverRoot", () => {
  it("stamps data-power-saver=false and --fx-play: running by default", () => {
    const page = mount(PowerSaverRoot, {});
    expect(page.powerSaverFlag()).toBe("false");
    expect(page.fxPlay()).toBe("running");
  });

  it("stamps data-power-saver=true and --fx-play: paused when the preference is on", () => {
    const page = mount(PowerSaverRoot, { powerSaver: true });
    expect(page.powerSaverFlag()).toBe("true");
    expect(page.fxPlay()).toBe("paused");
  });
});
