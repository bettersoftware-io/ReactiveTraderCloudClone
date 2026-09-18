import { afterEach, describe, expect, it, vi } from "vitest";

import type { PanelHeadControlsProps } from "#/ui/shell/layout/engine/PanelHeadControls";
import { panelHeadControlsPage } from "#tests/ui/pages/PanelHeadControlsPage";

afterEach(() => {
  page.unmountAll();
});

describe("PanelHeadControls pop-out slot", () => {
  it("renders the pop-out control only when the slot is attached, and clicking it fires the slot", () => {
    const onPopout = vi.fn();
    page.mount({ ...createBase(), onPopout });

    expect(page.exists("panel-fx-rates-popout")).toBe(true);
    page.click("panel-fx-rates-popout");
    expect(onPopout).toHaveBeenCalledTimes(1);
  });

  it("renders no pop-out control without the slot — the in-house head shape", () => {
    page.mount(createBase());

    expect(page.exists("panel-fx-rates-popout")).toBe(false);
  });

  it("greys collapse, maximize and the pop-out control itself while popped", () => {
    page.mount({ ...createBase(), onPopout: vi.fn(), poppedHere: true });

    expect(page.disabled("panel-fx-rates-collapse")).toBe(true);
    expect(page.disabled("panel-fx-rates-maximize")).toBe(true);
    expect(page.disabled("panel-fx-rates-popout")).toBe(true);
  });

  it("keeps collapse and maximize live while not popped", () => {
    page.mount({ ...createBase(), onPopout: vi.fn() });

    expect(page.disabled("panel-fx-rates-collapse")).toBe(false);
    expect(page.disabled("panel-fx-rates-maximize")).toBe(false);
  });
});

describe("PanelHeadControls float slot", () => {
  it("renders the float control only when the slot is attached, and clicking it fires the slot", () => {
    const onFloat = vi.fn();
    page.mount({ ...base(), onFloat });

    expect(page.exists("panel-fx-rates-float")).toBe(true);
    page.click("panel-fx-rates-float");
    expect(onFloat).toHaveBeenCalledTimes(1);
  });

  it("renders no float control without the slot — the in-house head shape", () => {
    page.mount(base());

    expect(page.exists("panel-fx-rates-float")).toBe(false);
  });

  it("labels the control 'Float …' while docked", () => {
    page.mount({ ...base(), onFloat: vi.fn() });
    expect(page.label("panel-fx-rates-float")).toBe("Float Live Rates");
  });

  it("relabels the control 'Dock …' once floating", () => {
    page.mount({ ...base(), onFloat: vi.fn(), floatingHere: true });
    expect(page.label("panel-fx-rates-float")).toBe("Dock Live Rates");
  });

  it("hides collapse and maximize outright while floating, but keeps the float control itself live", () => {
    page.mount({ ...base(), onFloat: vi.fn(), floatingHere: true });

    expect(page.exists("panel-fx-rates-collapse")).toBe(false);
    expect(page.exists("panel-fx-rates-maximize")).toBe(false);
    expect(page.disabled("panel-fx-rates-float")).toBe(false);
  });

  it("greys the float control while popped, like its siblings", () => {
    page.mount({ ...base(), onFloat: vi.fn(), poppedHere: true });

    expect(page.disabled("panel-fx-rates-float")).toBe(true);
  });
});

describe("PanelHeadControls close slot", () => {
  it("renders the close control only when the slot is attached, and clicking it fires the slot", () => {
    const onClose = vi.fn();
    page.mount({ ...createBase(), onClose });

    expect(page.exists("panel-fx-rates-close")).toBe(true);
    page.click("panel-fx-rates-close");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders no close control without the slot — every static head's shape", () => {
    page.mount({ ...createBase(), onPopout: vi.fn() });

    expect(page.exists("panel-fx-rates-close")).toBe(false);
  });

  it("greys the close control while popped, like its siblings", () => {
    page.mount({ ...createBase(), onClose: vi.fn(), poppedHere: true });

    expect(page.disabled("panel-fx-rates-close")).toBe(true);
  });
});

function createBase(): PanelHeadControlsProps {
  return {
    panelId: "fx-rates",
    title: "Live Rates",
    maximizable: true,
    maximizedHere: false,
    onCollapse: vi.fn(),
    onMaximize: vi.fn(),
    onRestore: vi.fn(),
  };
}

const page = panelHeadControlsPage();
