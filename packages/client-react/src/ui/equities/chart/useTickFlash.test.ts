import { afterEach, describe, expect, it } from "vitest";

import { tickFlashPage } from "#tests/ui/pages/UseTickFlashPage";

const page = tickFlashPage();

afterEach(() => {
  page.unmountAll();
});

describe("useTickFlash", () => {
  it("returns idle on the first render (no previous value to compare against)", () => {
    const handle = page.mount(100);

    expect(handle.state).toEqual({ flashOn: false, dir: "up" });
  });

  it("flashes up when the value increases", () => {
    const handle = page.mount(100);

    handle.rerender(101);

    expect(handle.state).toEqual({ flashOn: true, dir: "up" });
  });

  it("flashes down when the value decreases", () => {
    const handle = page.mount(100);

    handle.rerender(99);

    expect(handle.state).toEqual({ flashOn: true, dir: "down" });
  });

  it("returns idle on a null -> number transition (no prior value to compare against)", () => {
    const handle = page.mount(null);

    handle.rerender(100);

    expect(handle.state).toEqual({ flashOn: false, dir: "up" });
  });

  it("returns idle on a number -> null transition", () => {
    const handle = page.mount(100);

    handle.rerender(null);

    expect(handle.state).toEqual({ flashOn: false, dir: "up" });
  });

  it("keeps the previous flash object across a render where the value is unchanged", () => {
    const handle = page.mount(100);

    handle.rerender(101);

    const flashed = handle.state;

    handle.rerender(101);

    expect(handle.state).toBe(flashed);
  });
});
