/**
 * Contract spec for the Preferences "Your key" section and the brain pickers
 * that follow it (B3c). Sociable: the real section over the fake key
 * presenter (`World.jarvisOwnKeyIntents`, which masks like the real one), the
 * real JarvisMachine over a seeded availability frame.
 */

import {
  JarvisOverlay,
  OwnKeySection,
  PreferencesModal,
} from "@ui-contract/components";
import {
  cleanupMounted,
  createWorld,
  mount,
  mountWith,
} from "@ui-contract/mount";
import { afterEach, describe, expect, it } from "vitest";

import type { JarvisAvailability } from "@rtc/core-api";
import {
  formatGateHint,
  OWN_KEY_EXPLANATION,
  OWN_KEY_LIMIT_NOTE,
} from "@rtc/core-logic";
import {
  DEFAULT_JARVIS_INDICATORS,
  JARVIS_BRAINS,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_OWN_CAP_DEFAULT_USD,
  type JarvisOwnKeyStatus,
  type JarvisOwnKeyView,
  type JarvisProvider,
  ownModelsFor,
} from "@rtc/domain";

afterEach(() => {
  cleanupMounted();
});

describe("OwnKeySection", () => {
  it("the explanation comes before the field", () => {
    const page = mount(OwnKeySection, {});

    expect(OWN_KEY_EXPLANATION).toContain("Your key stays in this browser.");
    expect(page.explanationPrecedesField(OWN_KEY_EXPLANATION)).toBe(true);
  });

  it("offers the providers and a key field a browser will not remember", () => {
    const page = mount(OwnKeySection, {});

    expect(page.providers()).toEqual(["anthropic", "openrouter", "openai"]);
    expect(page.keyFieldAttributes()).toEqual({
      type: "password",
      autocomplete: "new-password",
      maxLength: String(JARVIS_KEY_MAX_CHARS),
      onePasswordIgnore: "true",
      lastPassIgnore: "true",
      bitwardenIgnore: "true",
      formType: "other",
    });
    expect(page.rememberChecked()).toBe(false);
    expect(page.capValue()).toBe(String(JARVIS_OWN_CAP_DEFAULT_USD));
    expect(page.noLimitChecked()).toBe(false);
    expect(page.text()).toContain(OWN_KEY_LIMIT_NOTE);
  });

  it("the section is absent for a demo login", () => {
    const page = mount(OwnKeySection, {
      jarvisAvailability: availability({ demo: true }),
    });

    expect(page.isPresent()).toBe(false);
  });

  it("the section is absent while Jarvis is unavailable", () => {
    const page = mount(OwnKeySection, {
      jarvisAvailability: availability({ available: false, brains: [] }),
    });

    expect(page.isPresent()).toBe(false);
  });

  it("refuses to save an empty or blank key", async () => {
    const page = mount(OwnKeySection, {});
    expect(page.saveDisabled()).toBe(true);

    await page.typeKey("   ");

    expect(page.saveDisabled()).toBe(true);
    expect(page.calls()).toEqual([]);
  });

  it("saves the key trimmed, with the provider, the limit and Remember", async () => {
    const page = mount(OwnKeySection, {});

    await page.typeKey(`  ${RAW_KEY}\n`);
    await page.toggleRemember();
    await page.typeCap("2.5");
    await page.save();

    expect(page.calls()).toEqual([
      {
        kind: "save",
        input: {
          provider: "anthropic",
          key: RAW_KEY,
          capUsd: 2.5,
          remember: true,
        },
      },
    ]);
  });

  it("saves the key under the provider chosen", async () => {
    const page = mount(OwnKeySection, {});

    await page.chooseProvider("openrouter");
    await page.typeKey(RAW_KEY);
    await page.save();

    expect(page.calls()).toEqual([
      {
        kind: "save",
        input: {
          provider: "openrouter",
          key: RAW_KEY,
          capUsd: JARVIS_OWN_CAP_DEFAULT_USD,
          remember: false,
        },
      },
    ]);
  });

  it("refuses a limit that is not a positive amount", async () => {
    const page = mount(OwnKeySection, {});
    await page.typeKey(RAW_KEY);

    await page.typeCap("0");
    expect(page.saveDisabled()).toBe(true);

    await page.typeCap("-3");
    expect(page.saveDisabled()).toBe(true);

    await page.typeCap("1");
    expect(page.saveDisabled()).toBe(false);
  });

  it("after Save the DOM holds the mask and not the key", async () => {
    const page = mount(OwnKeySection, {});
    await page.typeKey(RAW_KEY);
    expect(page.pageHolds(RAW_KEY)).toBe(true);

    await page.save();

    expect(page.showsMasked()).toBe(true);
    expect(page.masked()).toBe(MASKED_KEY);
    expect(page.showsForm()).toBe(false);
    expect(page.pageHolds(RAW_KEY)).toBe(false);
    expect(page.pageHolds("SECRETSECRET")).toBe(false);
  });

  it("Remove returns to the empty form; Replace shows it again", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });
    expect(page.showsMasked()).toBe(true);
    expect(page.showsForm()).toBe(false);

    await page.replace();

    expect(page.showsForm()).toBe(true);
    expect(page.keyFieldValue()).toBe("");
    expect(page.calls()).toEqual([]);

    const removed = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });
    await removed.remove();

    expect(removed.calls()).toEqual([{ kind: "remove" }]);
    expect(removed.showsForm()).toBe(true);
    expect(removed.showsMasked()).toBe(false);
    expect(removed.keyFieldValue()).toBe("");
  });

  it("Replace goes through Remove first, so a topped-up key gets a fresh check", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });
    await page.replace();
    await page.typeKey(RAW_KEY);

    await page.save();

    expect(
      page.calls().map((call) => {
        return call.kind;
      }),
    ).toEqual(["remove", "save"]);
    expect(page.showsMasked()).toBe(true);
    expect(page.showsForm()).toBe(false);
    expect(page.pageHolds(RAW_KEY)).toBe(false);
  });

  it("No limit disables the amount and saves null", async () => {
    const page = mount(OwnKeySection, {});
    await page.typeKey(RAW_KEY);

    await page.toggleNoLimit();

    expect(page.noLimitChecked()).toBe(true);
    expect(page.capDisabled()).toBe(true);

    await page.save();

    expect(page.calls()).toEqual([
      {
        kind: "save",
        input: {
          provider: "anthropic",
          key: RAW_KEY,
          capUsd: null,
          remember: false,
        },
      },
    ]);
    expect(page.noLimitChecked()).toBe(true);
    expect(page.capDisabled()).toBe(true);
  });

  it("shows a saved key's limit as an estimate", () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    expect(page.capValue()).toBe("2");
    expect(page.text()).toContain(OWN_KEY_LIMIT_NOTE);
  });

  it("a saved key's limit is adjustable, committed on blur through setCap", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });
    expect(page.capValue()).toBe("2");
    expect(page.capDisabled()).toBe(false);

    await page.typeCap("3.5");
    expect(page.calls()).toEqual([]);
    await page.blurCap();

    expect(page.calls()).toEqual([{ kind: "setCap", capUsd: 3.5 }]);
    expect(page.capValue()).toBe("3.5");
  });

  it("a saved key's limit is committed on Enter", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    await page.typeCap("4");
    await page.pressEnterInCap();

    expect(page.calls()).toEqual([{ kind: "setCap", capUsd: 4 }]);
  });

  it("an unchanged or invalid limit commits nothing and reverts", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    await page.typeCap("2");
    await page.blurCap();
    expect(page.calls()).toEqual([]);

    await page.typeCap("0");
    await page.blurCap();
    expect(page.calls()).toEqual([]);
    expect(page.capValue()).toBe("2");
  });

  it("No limit on a saved key commits null, and clearing it restores the amount", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    await page.toggleNoLimit();

    expect(page.calls()).toEqual([{ kind: "setCap", capUsd: null }]);
    expect(page.noLimitChecked()).toBe(true);
    expect(page.capDisabled()).toBe(true);

    await page.toggleNoLimit();

    expect(page.calls()).toEqual([
      { kind: "setCap", capUsd: null },
      { kind: "setCap", capUsd: 2 },
    ]);
    expect(page.noLimitChecked()).toBe(false);
  });

  it("keeps the key out of the markup while it is being typed", async () => {
    const page = mount(OwnKeySection, {});

    await page.typeKey(RAW_KEY);

    expect(page.keyFieldValue()).toBe(RAW_KEY);
    expect(page.keyFieldValueAttribute()).toBeNull();
    expect(page.markupHolds(RAW_KEY)).toBe(false);
    expect(page.saveDisabled()).toBe(false);
  });

  it("Replace starts from the saved key's settings, and Cancel goes back", async () => {
    const remembered = {
      ...SAVED,
      capUsd: 5,
      remember: true,
    } as const;
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: remembered });

    await page.replace();

    expect(page.capValue()).toBe("5");
    expect(page.rememberChecked()).toBe(true);

    await page.cancel();

    expect(page.showsMasked()).toBe(true);
    expect(page.showsForm()).toBe(false);
    expect(page.calls()).toEqual([]);
    expect(page.focusedControl()).toBe("jarvis-key-replace");

    cleanupMounted();

    const unlimited = mount(OwnKeySection, {
      jarvisOwnKeySaved: { ...SAVED, capUsd: null },
    });
    await unlimited.replace();

    expect(unlimited.noLimitChecked()).toBe(true);
    expect(unlimited.capDisabled()).toBe(true);
  });

  it("announces the status, and says nothing of Cancel without a key to go back to", () => {
    const page = mount(OwnKeySection, {
      jarvisOwnKeySaved: SAVED,
      jarvisAvailability: withOwnKey("refused"),
    });

    expect(page.statusRole()).toBe("status");

    const empty = mount(OwnKeySection, {});
    expect(empty.hasCancel()).toBe(false);
  });

  it("moves focus to where the removed control's job continues", async () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    await page.replace();
    expect(page.focusedControl()).toBe("jarvis-key-input");

    await page.typeKey(RAW_KEY);
    await page.save();
    expect(page.focusedControl()).toBe("jarvis-key-replace");

    await page.remove();
    expect(page.focusedControl()).toBe("jarvis-key-input");
  });

  it("each status renders its copy", () => {
    const copy: [JarvisOwnKeyStatus, string][] = [
      ["checking", "Checking…"],
      ["accepted", "Accepted"],
      ["refused", "Anthropic refused this key"],
      ["unreachable", "Couldn't reach Anthropic. Try again shortly."],
      ["limited", "Too many checks. Try again later."],
    ];

    for (const [status, text] of copy) {
      const page = mount(OwnKeySection, {
        jarvisOwnKeySaved: SAVED,
        jarvisAvailability: withOwnKey(status),
      });

      expect(page.status()).toBe(text);
      cleanupMounted();
    }
  });

  it("says a saved key the server has not reported on is not confirmed, not that it is being checked", () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    expect(page.status()).toBe("Not confirmed by the server yet");
  });

  it("offers Try again while a new check could change the answer", () => {
    const offered: [JarvisOwnKeyStatus, boolean][] = [
      ["checking", false],
      ["accepted", false],
      // A refused key may have been topped up since.
      ["refused", true],
      ["unreachable", true],
      ["limited", true],
    ];

    for (const [status, shown] of offered) {
      const page = mount(OwnKeySection, {
        jarvisOwnKeySaved: SAVED,
        jarvisAvailability: withOwnKey(status),
      });

      expect(page.hasRetry()).toBe(shown);
      cleanupMounted();
    }
  });

  it("offers Try again for a saved key the server has not reported on", () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    expect(page.hasRetry()).toBe(true);
  });

  it("offers no Try again with no key saved", () => {
    const page = mount(OwnKeySection, {});

    expect(page.hasRetry()).toBe(false);
  });

  it("Try again sends the saved limit back through setCap, and hands focus on", async () => {
    const page = mount(OwnKeySection, {
      jarvisOwnKeySaved: SAVED,
      jarvisAvailability: withOwnKey("unreachable"),
    });

    await page.retry();

    expect(page.calls()).toEqual([{ kind: "setCap", capUsd: SAVED.capUsd }]);
    expect(page.focusedControl()).toBe("jarvis-key-replace");
  });

  it("Try again with no limit sends no limit", async () => {
    const page = mount(OwnKeySection, {
      jarvisOwnKeySaved: { ...SAVED, capUsd: null },
      jarvisAvailability: withOwnKey("limited"),
    });

    await page.retry();

    expect(page.calls()).toEqual([{ kind: "setCap", capUsd: null }]);
  });
});

describe("the brain pickers with a key set", () => {
  it("the Preferences Your key row lists the own brains and saves the one picked", async () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: withOwnKey(),
      jarvisOwnKeySaved: SAVED,
    });

    for (const brain of OWN_BRAINS) {
      expect(page.hasSegmentOption("jarvisOwnBrain", brain)).toBe(true);
      expect(page.segmentDisabled("jarvisOwnBrain", brain)).toBe(false);
    }

    await page.selectSegment("jarvisOwnBrain", "own:anthropic:claude-sonnet-5");

    expect(page.jarvisBrainSets()).toEqual(["own:anthropic:claude-sonnet-5"]);
    expect(
      page.segmentActive("jarvisOwnBrain", "own:anthropic:claude-sonnet-5"),
    ).toBe(true);
    expect(page.segmentActive("jarvisBrain", "claude-haiku-4-5")).toBe(false);
  });

  it("keeps the Your key row, disabled with the reset hint, while the own cap is spent", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: spentOwnCap(),
      jarvisOwnKeySaved: SAVED,
    });

    for (const brain of OWN_BRAINS) {
      expect(page.hasSegmentOption("jarvisOwnBrain", brain)).toBe(true);
      expect(page.segmentDisabled("jarvisOwnBrain", brain)).toBe(true);
      expect(page.segmentTitle("jarvisOwnBrain", brain)).toBe(
        formatGateHint(1_754_000_000_000),
      );
    }
  });

  it("keeps the pill menu's Your key group, disabled, while the own cap is spent", async () => {
    const overlay = mountWith(
      createWorld({
        jarvisAvailability: spentOwnCap(),
        jarvisIndicators: { ...DEFAULT_JARVIS_INDICATORS, brainPill: true },
      }),
      JarvisOverlay,
    );
    await overlay.pressHotkey();
    await overlay.clickBrainPill();

    expect(overlay.brainGroupLabels()).toEqual([
      ["house", "House key"],
      ["own", "Your key"],
    ]);
    expect(
      overlay.brainOptionViews().filter((view) => {
        return view.brain.startsWith("own:");
      }),
    ).toEqual(
      OWN_BRAINS.map((brain) => {
        return { brain, checked: false, disabled: true };
      }),
    );
  });

  it("lists only the models of the provider the key is for", () => {
    const openaiBrains = ownModelsFor("openai").map((model) => {
      return model.brain;
    });

    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: withOwnKey("accepted", "openai"),
      jarvisOwnKeySaved: { ...SAVED, provider: "openai" },
    });

    for (const brain of openaiBrains) {
      expect(page.hasSegmentOption("jarvisOwnBrain", brain)).toBe(true);
      expect(page.segmentDisabled("jarvisOwnBrain", brain)).toBe(false);
    }

    for (const brain of OWN_BRAINS) {
      expect(page.hasSegmentOption("jarvisOwnBrain", brain)).toBe(false);
    }
  });

  it("has no Your key row while no own brain is offered", () => {
    const page = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: availability(),
    });

    for (const brain of OWN_BRAINS) {
      expect(page.hasSegmentOption("jarvisOwnBrain", brain)).toBe(false);
    }
  });

  it("keeps Effort for an Anthropic own brain that takes it, and disables it otherwise", () => {
    const sonnet = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: withOwnKey(),
      jarvisBrain: "own:anthropic:claude-sonnet-5",
    });
    expect(sonnet.jarvisEffortDisabled()).toBe(false);
    cleanupMounted();

    const haiku = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: withOwnKey(),
      jarvisBrain: "own:anthropic:claude-haiku-4-5",
    });
    expect(haiku.jarvisEffortDisabled()).toBe(true);
    cleanupMounted();

    const houseHaiku = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: availability(),
      jarvisBrain: "claude-haiku-4-5",
    });
    expect(houseHaiku.jarvisEffortDisabled()).toBe(true);
  });

  it("disables Effort when either the saved brain or the one running cannot take it", () => {
    // Saved Opus, but only Haiku is offered, so Haiku runs.
    const runningHaiku = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: availability({
        brains: ["scripted", "claude-haiku-4-5"],
      }),
      jarvisBrain: "claude-opus-5",
    });
    expect(runningHaiku.jarvisEffortDisabled()).toBe(true);
    cleanupMounted();

    // Saved Haiku, but only Sonnet is offered (and the default), so Sonnet runs.
    const savedHaiku = mount(PreferencesModal, {
      props: { open: true, onClose: () => {} },
      jarvisAvailability: availability({
        brains: ["scripted", "claude-sonnet-5"],
        defaultBrain: "claude-sonnet-5",
      }),
      jarvisBrain: "claude-haiku-4-5",
    });
    expect(savedHaiku.jarvisEffortDisabled()).toBe(true);
  });

  it("with a key set, the pill menu groups House key and Your key, and picking one saves that brain", async () => {
    const world = createWorld({
      jarvisAvailability: withOwnKey(),
      jarvisIndicators: { ...DEFAULT_JARVIS_INDICATORS, brainPill: true },
    });
    const overlay = mountWith(world, JarvisOverlay);
    await overlay.pressHotkey();
    await overlay.clickBrainPill();

    expect(overlay.brainGroupLabels()).toEqual([
      ["house", "House key"],
      ["own", "Your key"],
    ]);
    expect(overlay.brainOptionGroups()).toEqual([
      ...JARVIS_BRAINS.map((brain) => {
        return { brain, group: "House key" };
      }),
      ...OWN_BRAINS.map((brain) => {
        return { brain, group: "Your key" };
      }),
    ]);

    await overlay.chooseBrain("own:anthropic:claude-opus-5");

    expect(overlay.jarvisBrainSets()).toEqual(["own:anthropic:claude-opus-5"]);
  });

  it("shows no group labels while only house brains are offered", async () => {
    const overlay = mountWith(
      createWorld({
        jarvisAvailability: availability(),
        jarvisIndicators: { ...DEFAULT_JARVIS_INDICATORS, brainPill: true },
      }),
      JarvisOverlay,
    );
    await overlay.pressHotkey();
    await overlay.clickBrainPill();

    expect(overlay.brainGroupLabels()).toEqual([]);
  });
});

/** The brains an accepted Anthropic key offers. */
const OWN_BRAINS = ownModelsFor("anthropic").map((model) => {
  return model.brain;
});

const RAW_KEY = "sk-ant-api03-SECRETSECRETSECRET-4321";

const MASKED_KEY = "sk-ant-…4321";

function keyView(
  status: JarvisOwnKeyStatus,
  provider: JarvisProvider = "anthropic",
): JarvisOwnKeyView {
  return { provider, status, capUsd: 1 };
}

function availability(
  patch: Partial<JarvisAvailability> = {},
): JarvisAvailability {
  return {
    available: true,
    brains: JARVIS_BRAINS,
    defaultBrain: "claude-haiku-4-5",
    gate: null,
    budget: null,
    ownBudget: null,
    ownKey: null,
    demo: false,
    ...patch,
  };
}

/** What an accepted key offers: every house brain and the own brains of
 * the key's provider. */
function withOwnKey(
  status: JarvisOwnKeyStatus = "accepted",
  provider: JarvisProvider = "anthropic",
): JarvisAvailability {
  return availability({
    brains: [
      ...JARVIS_BRAINS,
      ...ownModelsFor(provider).map((model) => {
        return model.brain;
      }),
    ],
    ownKey: keyView(status, provider),
  });
}

const SAVED = {
  provider: "anthropic",
  masked: MASKED_KEY,
  capUsd: 2,
  remember: false,
} as const;

/** An accepted key whose own daily cap is spent: the gate removes the own
 * brains from the offer, though the key is fine. */
function spentOwnCap(): JarvisAvailability {
  return availability({
    brains: [...JARVIS_BRAINS],
    gate: {
      level: "soft",
      resetsAtMs: 1_754_000_000_000,
      gated: [...OWN_BRAINS],
    },
    ownBudget: {
      keyKind: "own",
      spentUsd: 1.2,
      limitUsd: 1,
      exhausted: "user",
      resetsAtMs: 1_754_000_000_000,
    },
    ownKey: keyView("accepted"),
  });
}
