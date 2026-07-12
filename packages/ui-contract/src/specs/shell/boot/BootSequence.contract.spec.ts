import { BootSequence } from "@ui-contract/components";
import { mount } from "@ui-contract/mount";
import { describe, expect, it } from "vitest";

describe("BootSequence", () => {
  it("renders the boot-sequence root element", () => {
    const page = mount(BootSequence, {});
    expect(page.hasRoot()).toBe(true);
  });

  it("renders the wordmark, a progress readout, and a SKIP control while booting", () => {
    const page = mount(BootSequence, {});
    expect(page.wordmark()).toMatch(/REACTIVE/i);
    expect(page.hasSkip()).toBe(true);
    expect(page.progressLabel()).toMatch(/%$/);
  });

  it("renders a progress bar container", () => {
    const page = mount(BootSequence, {});
    expect(page.hasProgressBar()).toBe(true);
  });

  it("invokes onDone and transitions to done when SKIP is pressed", async () => {
    const page = mount(BootSequence, {});
    await page.skip();
    expect(page.onDoneCount()).toBe(1);
  });
});
