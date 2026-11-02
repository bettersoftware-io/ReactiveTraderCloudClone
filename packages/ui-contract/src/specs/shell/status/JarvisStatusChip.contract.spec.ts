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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
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
        budget: null,
        ownBudget: null,
        ownKey: null,
        demo: false,
      },
    });
    expect(page.jarvisChipGateLevel()).toBe("hard");
    expect(page.jarvisChipText()).toBe("JARVIS · scripted · budget exhausted");
  });

  describe("with the server's merged gate", () => {
    it("ignores a spent own cap while the saved brain is a house brain", () => {
      const page = mount(StatusBar, {
        jarvisAvailability: {
          available: true,
          brains: ["scripted", "claude-haiku-4-5"],
          defaultBrain: "claude-haiku-4-5",
          gate: { level: "soft", resetsAtMs: RESETS_AT_MS, gated: [OWN_HAIKU] },
          budget: null,
          ownBudget: spent,
          ownKey: { provider: "anthropic", status: "accepted", capUsd: 1 },
          demo: false,
        },
        jarvisBrain: "claude-haiku-4-5",
      });

      expect(page.jarvisChipGateLevel()).toBeNull();
      expect(page.jarvisChipText()).toBe("JARVIS · Haiku 4.5");
    });

    it("ignores a spent house budget while the saved brain is an own brain", () => {
      const page = mount(StatusBar, {
        jarvisAvailability: {
          available: true,
          brains: ["scripted", OWN_HAIKU],
          defaultBrain: "scripted",
          gate: {
            level: "soft",
            resetsAtMs: RESETS_AT_MS,
            gated: ["claude-haiku-4-5"],
          },
          budget: { ...spent, keyKind: "house", exhausted: "house" },
          ownBudget: null,
          ownKey: { provider: "anthropic", status: "accepted", capUsd: 1 },
          demo: false,
        },
        jarvisBrain: OWN_HAIKU,
      });

      expect(page.jarvisChipBrain()).toBe(OWN_HAIKU);
      expect(page.jarvisChipGateLevel()).toBeNull();
    });

    it("still shows the gate when the spent budget is the saved brain's own", () => {
      const page = mount(StatusBar, {
        jarvisAvailability: {
          available: true,
          brains: ["scripted"],
          defaultBrain: "scripted",
          gate: { level: "soft", resetsAtMs: RESETS_AT_MS, gated: [OWN_HAIKU] },
          budget: null,
          ownBudget: spent,
          ownKey: { provider: "anthropic", status: "accepted", capUsd: 1 },
          demo: false,
        },
        jarvisBrain: OWN_HAIKU,
      });

      expect(page.jarvisChipGateLevel()).toBe("soft");
      expect(page.jarvisChipText()).toBe("JARVIS · scripted · budget-limited");
    });

    const OWN_HAIKU = "own:anthropic:claude-haiku-4-5";

    const RESETS_AT_MS = 1_754_000_000_000;

    const spent = {
      keyKind: "own",
      spentUsd: 1.2,
      limitUsd: 1,
      exhausted: "user",
      resetsAtMs: RESETS_AT_MS,
    } as const;
  });
});
