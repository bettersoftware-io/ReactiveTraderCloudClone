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
        gate: null,
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
        gate: null,
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
        gate: null,
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
        gate: null,
      },
      // Preferred, but NOT among the offered brains above.
      jarvisBrain: "claude-opus-5",
    });
    expect(page.jarvisChipBrain()).toBe("scripted");
    expect(page.jarvisChipText()).toBe("JARVIS · scripted");
  });

  it("carries no data-gate attribute when no gate is active", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: null,
      },
    });
    // Explicit attribute-absence assertion, not just textContent — the chip
    // must not stamp `data-gate=""` for the ungated case.
    expect(page.jarvisChipGateLevel()).toBeNull();
  });

  it("suffixes budget-limited and stamps data-gate=soft under a soft gate", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted", "claude-haiku-4-5"],
        defaultBrain: "claude-haiku-4-5",
        gate: {
          level: "soft",
          resetsAtMs: 1_754_000_000_000,
          gated: ["claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
    expect(page.jarvisChipGateLevel()).toBe("soft");
    expect(page.jarvisChipText()).toBe("JARVIS · Haiku 4.5 · budget-limited");
  });

  it("suffixes budget exhausted and stamps data-gate=hard under a hard gate", () => {
    const page = mount(StatusBar, {
      jarvisAvailability: {
        available: true,
        brains: ["scripted"],
        defaultBrain: "scripted",
        gate: {
          level: "hard",
          resetsAtMs: 1_754_000_000_000,
          gated: ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-5"],
        },
      },
    });
    expect(page.jarvisChipGateLevel()).toBe("hard");
    expect(page.jarvisChipText()).toBe("JARVIS · scripted · budget exhausted");
  });
});
