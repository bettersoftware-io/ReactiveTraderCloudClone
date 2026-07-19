import { describe, expect, test } from "vitest";

import { radialDockLayout } from "./radialDockLayout";

describe("radialDockLayout", () => {
  test("fans 5 satellites on the prototype's 150→30° arc at r=118", () => {
    const sats = radialDockLayout(5);
    const R = 118;
    const angles = [150, 120, 90, 60, 30];
    const expected = angles.map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return {
        tx: Math.round(Math.cos(a) * R),
        ty: Math.round(-Math.sin(a) * R),
        delayMs: i * 45,
      };
    });
    expect(sats).toEqual(expected);
  });

  test("the centre satellite sits straight up (tx≈0, ty≈-118)", () => {
    const [, , centre] = radialDockLayout(5);
    expect(centre.tx).toBe(0);
    expect(centre.ty).toBe(-118);
    expect(centre.delayMs).toBe(90);
  });

  test("staggers every satellite by 45ms in order", () => {
    const sats = radialDockLayout(3);
    expect(
      sats.map((s) => {
        return s.delayMs;
      }),
    ).toEqual([0, 45, 90]);
  });
});
