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
import { OWN_KEY_EXPLANATION, OWN_KEY_LIMIT_NOTE } from "@rtc/core-logic";
import {
  DEFAULT_JARVIS_INDICATORS,
  JARVIS_BRAINS,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_OWN_CAP_DEFAULT_USD,
  JARVIS_OWN_MODELS,
  type JarvisOwnKeyStatus,
  type JarvisOwnKeyView,
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

    expect(page.providers()).toEqual(["anthropic"]);
    expect(page.keyFieldAttributes()).toEqual({
      type: "password",
      autocomplete: "off",
      maxLength: String(JARVIS_KEY_MAX_CHARS),
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
    expect(page.limitText()).toBe("No limit");
  });

  it("shows a saved key's limit as an estimate", () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    expect(page.limitText()).toBe("$2.00 a day");
    expect(page.text()).toContain(OWN_KEY_LIMIT_NOTE);
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

  it("reads a saved key the server has not reported on as being checked", () => {
    const page = mount(OwnKeySection, { jarvisOwnKeySaved: SAVED });

    expect(page.status()).toBe("Checking…");
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

const OWN_BRAINS = JARVIS_OWN_MODELS.map((model) => {
  return model.brain;
});

const RAW_KEY = "sk-ant-api03-SECRETSECRETSECRET-4321";

const MASKED_KEY = "sk-ant-…4321";

function keyView(status: JarvisOwnKeyStatus): JarvisOwnKeyView {
  return { provider: "anthropic", status, capUsd: 1 };
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

/** What an accepted key offers: every house brain and every own brain. */
function withOwnKey(
  status: JarvisOwnKeyStatus = "accepted",
): JarvisAvailability {
  return availability({
    brains: [...JARVIS_BRAINS, ...OWN_BRAINS],
    ownKey: keyView(status),
  });
}

const SAVED = {
  provider: "anthropic",
  masked: MASKED_KEY,
  capUsd: 2,
  remember: false,
} as const;
