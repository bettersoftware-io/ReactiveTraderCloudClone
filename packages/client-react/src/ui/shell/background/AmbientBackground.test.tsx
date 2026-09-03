/**
 * Co-located unit test for the AmbientBackground Aurora/Rays branch.
 * The shared ui-contract tier (packages/ui-contract/specs/shell/background/)
 * covers the cross-framework animated/power-saver/aria contract; this file
 * covers the React-local render branch introduced for the Aurora ambient
 * style (v5): which `data-layer` group mounts for each `ambientStyle`.
 */
import { afterEach, describe, expect, it } from "vitest";

import { ambientBackgroundPage } from "#tests/ui/pages/AmbientBackgroundPage";

const page = ambientBackgroundPage();

afterEach(() => {
  page.unmountAll();
});

describe("AmbientBackground — ambient style branch", () => {
  it("renders the aurora curtains when ambientStyle is aurora", () => {
    page.mount({ ambientStyle: "aurora" });

    expect(page.ambientStyleAttr()).toBe("aurora");
    expect(page.hasLayer("aurora-curtains")).toBe(true);
    expect(page.hasLayer("rays")).toBe(false);
  });

  it("renders the rays layers when ambientStyle is rays", () => {
    page.mount({ ambientStyle: "rays" });

    expect(page.ambientStyleAttr()).toBe("rays");
    expect(page.hasLayer("rays")).toBe(true);
    expect(page.hasLayer("aurora-curtains")).toBe(false);
  });

  it("omits both branches' animated layers under power saver, regardless of style", () => {
    page.mount({ ambientStyle: "aurora", powerSaver: true });

    expect(page.hasLayer("aurora-curtains")).toBe(false);
    expect(page.hasLayer("rays")).toBe(false);
  });
});
