import { describe, expect, it } from "vitest";

import { matchJarvisIntent } from "@rtc/shared";

import {
  JARVIS_GUIDE_CATALOG,
  sampleGuideChips,
} from "./jarvisGuideCatalog.js";

const KNOWN_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "EURGBP", "AUDUSD"];

describe("JARVIS_GUIDE_CATALOG", () => {
  it("has the four sections in display order", () => {
    expect(JARVIS_GUIDE_CATALOG.map((s) => {
      return s.title;
    })).toEqual([
      "DESK INTELLIGENCE",
      "GENERATIVE UI",
      "DESK CONTROL",
      "EXECUTION",
    ]);
  });

  it("every non-liveOnly command resolves to a non-fallback scripted intent", () => {
    for (const section of JARVIS_GUIDE_CATALOG) {
      for (const item of section.items) {
        if (item.liveOnly) {
          continue;
        }

        const intent = matchJarvisIntent(item.command, KNOWN_SYMBOLS);
        expect(intent.kind, `"${item.command}" fell back`).not.toBe("fallback");
      }
    }
  });

  it("liveOnly rows exist only in DESK CONTROL", () => {
    for (const section of JARVIS_GUIDE_CATALOG) {
      const hasLive = section.items.some((i) => {
        return i.liveOnly === true;
      });
      expect(hasLive).toBe(section.title === "DESK CONTROL");
    }
  });
});

describe("sampleGuideChips", () => {
  it("returns 4 commands, one from each section, none liveOnly", () => {
    const chips = sampleGuideChips(JARVIS_GUIDE_CATALOG, 1);
    expect(chips).toHaveLength(4);
    chips.forEach((chip, i) => {
      const section = JARVIS_GUIDE_CATALOG[i];
      const item = section.items.find((it) => {
        return it.command === chip;
      });
      expect(
        item,
        `chip "${chip}" not in section ${section.title}`,
      ).toBeDefined();
      expect(item?.liveOnly).not.toBe(true);
    });
  });

  it("is deterministic per seed and rotates across seeds", () => {
    expect(sampleGuideChips(JARVIS_GUIDE_CATALOG, 1)).toEqual(
      sampleGuideChips(JARVIS_GUIDE_CATALOG, 1),
    );
    const seeds = [1, 2, 3].map((s) => {
      return sampleGuideChips(JARVIS_GUIDE_CATALOG, s);
    });
    expect(new Set(seeds.map((c) => {
      return c.join("|");
    })).size).toBeGreaterThan(1);
  });

  it("cycles within each section's non-liveOnly items", () => {
    const section = JARVIS_GUIDE_CATALOG[0];
    const pool = section.items.filter((i) => {
      return !i.liveOnly;
    });

    const seen = new Set(
      Array.from(
        { length: pool.length },
        (_, s) => {
          return sampleGuideChips(JARVIS_GUIDE_CATALOG, s + 1)[0];
        },
      ),
    );
    expect(seen.size).toBe(pool.length);
  });
});
