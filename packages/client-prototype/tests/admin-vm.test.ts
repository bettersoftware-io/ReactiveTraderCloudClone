import { describe, expect, test } from "vitest";

import { seedMetrics } from "#/admin/adminData";
import { kpisVm, servicesVm, sparkPoints, throughputVm } from "#/admin/adminVm";
import type { AdminMetrics } from "#/admin/types";
import { mulberry32 } from "#/mock/rng";

describe("adminVm", () => {
  test("sparkPoints emits one x,y pair per sample", () => {
    const pts = sparkPoints([1, 2, 3, 4]).split(" ");
    expect(pts).toHaveLength(4);
    expect(pts[0]).toMatch(/^\d/);
    expect(pts[0]).toContain(",");
  });

  test("kpisVm returns the four metrics in order with formatted values", () => {
    const kpis = kpisVm(seedMetrics(mulberry32(1)));
    expect(
      kpis.map((k) => {
        return k.key;
      }),
    ).toEqual(["tput", "lat", "err", "sess"]);
    expect(kpis[0].unit).toBe("k msg/s");
  });

  test("kpisVm flags latency warn above 60ms and normal below", () => {
    const hot: AdminMetrics = {
      tput: [1200, 1200],
      lat: [40, 72],
      err: [0.4, 0.4],
      sess: [1280, 1280],
    };
    const cool: AdminMetrics = { ...hot, lat: [40, 40] };
    expect(kpisVm(hot)[1].warn).toBe(true);
    expect(kpisVm(cool)[1].warn).toBe(false);
  });

  test("kpisVm delta sign follows the trend vs the lookback sample", () => {
    const rising: AdminMetrics = {
      tput: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 2000],
      lat: [40, 40, 40, 40, 40, 40, 40, 40, 40, 40],
      err: [0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.4],
      sess: [1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280, 1280],
    };
    expect(kpisVm(rising)[0].deltaUp).toBe(true);
    expect(kpisVm(rising)[0].delta.startsWith("▲")).toBe(true);
  });

  test("throughputVm returns a non-empty polyline and a closed area path", () => {
    const { line, area } = throughputVm(seedMetrics(mulberry32(2)).tput);
    expect(line.length).toBeGreaterThan(0);
    expect(area.startsWith("M0,96")).toBe(true);
    expect(area.endsWith("Z")).toBe(true);
  });

  test("servicesVm derives lat label and a bar % capped at 100, DEGRADED preserved", () => {
    const svc = servicesVm();
    expect(svc).toHaveLength(6);
    const degraded = svc.find((s) => {
      return s.status === "DEGRADED";
    });
    expect(degraded?.name).toBe("REFERENCE DATA");
    expect(degraded?.lat).toBe("48ms");
    expect(
      svc.every((s) => {
        return s.barPct <= 100;
      }),
    ).toBe(true);
  });
});
