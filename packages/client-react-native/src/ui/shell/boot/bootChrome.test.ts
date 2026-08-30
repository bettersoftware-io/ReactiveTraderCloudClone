import { describe, expect, test } from "vitest";

import { BOOT_VARIANTS } from "@rtc/domain";

import {
  BOOT_LOG_LINES,
  BOOT_SCENE_NAMES,
  bootLogLine,
  bootSequenceLine,
  textTopForBaseline,
} from "#/ui/shell/boot/bootChrome";

describe("BOOT_SCENE_NAMES", () => {
  test("names every variant the boot cycle can select", () => {
    for (const variant of BOOT_VARIANTS) {
      expect(BOOT_SCENE_NAMES[variant]).toBeTruthy();
    }
  });

  test("carries no key that is not a real boot variant", () => {
    for (const key of Object.keys(BOOT_SCENE_NAMES)) {
      expect(BOOT_VARIANTS).toContain(key);
    }
  });

  test("gives each variant its own name (guards a copy-paste)", () => {
    const names = Object.values(BOOT_SCENE_NAMES);

    expect(new Set(names).size).toBe(names.length);
  });
});

describe("bootSequenceLine", () => {
  test("prints the 1-based cycle position and the real total", () => {
    expect(bootSequenceLine("core")).toBe(
      `MOBILE OS  //  SEQ 1/${BOOT_VARIANTS.length} · CORE SYNC`,
    );
  });

  test("prints the last variant's position, not a hard-coded 8", () => {
    const last = BOOT_VARIANTS[BOOT_VARIANTS.length - 1];

    expect(bootSequenceLine(last)).toContain(
      `SEQ ${BOOT_VARIANTS.length}/${BOOT_VARIANTS.length}`,
    );
  });

  test("names the scene rather than echoing the variant key", () => {
    expect(bootSequenceLine("topo")).toContain("VOL TERRAIN");
    expect(bootSequenceLine("topo")).not.toContain("TOPO");
  });
});

describe("bootLogLine", () => {
  test("shows the first line at 0%", () => {
    expect(bootLogLine(0)).toBe(`▸ ${BOOT_LOG_LINES[0]}`);
  });

  test("shows the fifth line at 60% (floor(0.6 * 7) === 4)", () => {
    expect(bootLogLine(60)).toBe(`▸ ${BOOT_LOG_LINES[4]}`);
  });

  test("clamps to the last line at 100% rather than running off the end", () => {
    expect(bootLogLine(100)).toBe(
      `▸ ${BOOT_LOG_LINES[BOOT_LOG_LINES.length - 1]}`,
    );
  });

  test("advances monotonically across the ramp", () => {
    const seen = [0, 20, 40, 60, 80, 100].map((pct) => {
      return BOOT_LOG_LINES.indexOf(bootLogLine(pct).slice(2));
    });

    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
  });

  test("clamps a negative percentage to the first line", () => {
    expect(bootLogLine(-10)).toBe(`▸ ${BOOT_LOG_LINES[0]}`);
  });
});

describe("textTopForBaseline", () => {
  test("puts the baseline at 80% of the font size when lineHeight === fontSize", () => {
    expect(textTopForBaseline(100, 10, 10)).toBe(92);
  });

  test("absorbs half of the extra leading when lineHeight exceeds fontSize", () => {
    expect(textTopForBaseline(100, 10, 20)).toBe(87);
  });
});
