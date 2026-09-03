import { afterEach, describe, expect, it } from "vitest";

import { modalShellPage } from "#tests/ui/pages/ModalShellPage";

const page = modalShellPage();

afterEach(() => {
  page.unmountAll();
});

describe("ModalShell", () => {
  it("renders nothing when closed", () => {
    page.mount(false);
    expect(page.exists("shell-root")).toBe(false);
  });

  it("renders chrome, children and testids when open", () => {
    page.mount(true);
    expect(page.exists("shell-root")).toBe(true);
    expect(page.hasText("TITLE")).toBe(true);
    expect(page.hasText("SUB")).toBe(true);
    expect(page.hasText("NOTE")).toBe(true);
    expect(page.exists("shell-child")).toBe(true);
    expect(page.hasDialog("Test dialog")).toBe(true);
  });

  it("fires onClose from the ✕ control", () => {
    const { onClose } = page.mount(true);
    page.click("shell-close");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("fires onClose from the DONE button", () => {
    const { onClose } = page.mount(true);
    page.click("shell-done");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
