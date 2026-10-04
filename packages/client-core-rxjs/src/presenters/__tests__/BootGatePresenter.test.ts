import { describe, expect, it } from "vitest";

import { BootGatePresenter } from "../BootGatePresenter";

describe("BootGatePresenter", () => {
  it("starts visible by default, dismiss() lowers, reboot() re-raises", () => {
    const p = new BootGatePresenter();
    const seen: boolean[] = [];
    const sub = p.visible$.subscribe((v) => {
      return seen.push(v);
    });
    p.dismiss();
    p.reboot();
    sub.unsubscribe();
    expect(seen).toEqual([true, false, true]);
  });

  it("seeds hidden when the boot-splash decision is false (webdriver/nosplash)", () => {
    const p = new BootGatePresenter(false);
    let latest: boolean | undefined;
    const sub = p.visible$.subscribe((v) => {
      latest = v;
    });
    sub.unsubscribe();
    expect(latest).toBe(false);
  });

  it("replays the current visibility to late subscribers", () => {
    const p = new BootGatePresenter();
    p.dismiss();
    let latest: boolean | undefined;
    const sub = p.visible$.subscribe((v) => {
      latest = v;
    });
    sub.unsubscribe();
    expect(latest).toBe(false);
  });
});
