/**
 * JarvisStatusChip contract spec (Task 10 of Phase 3, brain picker).
 *
 * The chip is embedded in the shell StatusBar (StatusBar.tsx), so this spec
 * mounts the real `StatusBar` component (there's no standalone
 * `JarvisStatusChip` component token) and reads it through
 * `StatusBarPage`'s jarvisChip* accessors. Sociable: real StatusBar + real
 * hook-driven JarvisMachine (built by viewModelFromWorld over
 * World.jarvisAvailability/jarvisBrain), only the World subjects are seeded.
 */

import { StatusBar } from "@ui-contract/components";
import { cleanupMounted, mount } from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  cleanupMounted();
});

describe("JarvisStatusChip", () => {
  it("renders nothing while Jarvis is unavailable", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: false,
        brains: [],
        defaultBrain: "scripted",
      },
    });
    expect(page.jarvisChipPresent()).toBe(false);
  });

  it("shows the effective brain's label and data-brain when available", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted", "claude-opus-5"],
        defaultBrain: "scripted",
      },
      jarvisBrain: "claude-opus-5",
    });
    expect(page.jarvisChipPresent()).toBe(true);
    expect(page.jarvisChipBrain()).toBe("claude-opus-5");
    expect(page.jarvisChipText()).toBe("JARVIS · Opus 5");
  });

  it("renders the scripted brain's label plainly", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
      },
      jarvisBrain: "scripted",
    });
    expect(page.jarvisChipBrain()).toBe("scripted");
    expect(page.jarvisChipText()).toBe("JARVIS · scripted");
  });

  it("falls back to defaultBrain when the preferred brain isn't currently offered", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
      },
      // Preferred, but NOT among the offered brains above.
      jarvisBrain: "claude-opus-5",
    });
    expect(page.jarvisChipBrain()).toBe("scripted");
    expect(page.jarvisChipText()).toBe("JARVIS · scripted");
  });
});
