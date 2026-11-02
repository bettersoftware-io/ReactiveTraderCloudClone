import { describe, expect, it } from "vitest";

import {
  DEFAULT_JARVIS_BRAIN,
  isJarvisBrain,
  JARVIS_BRAIN_LABELS,
  JARVIS_BRAIN_NAMES,
  type JarvisBrain,
  jarvisBrainLabel,
  jarvisBrainName,
  jarvisBrainTakesEffort,
  parseStoredJarvisBrain,
} from "../preferences/preferences.js";
import {
  isJarvisOwnBrain,
  isJarvisProvider,
  JARVIS_OWN_MODELS,
  JARVIS_OWN_PROVIDERS,
  JARVIS_PROVIDERS,
  ownModelOf,
  ownModelsFor,
} from "./jarvisOwnModels.js";

describe("JARVIS_PROVIDERS", () => {
  it("lists every provider, and isJarvisProvider accepts exactly those", () => {
    expect(JARVIS_PROVIDERS).toEqual(["anthropic", "openrouter", "openai"]);

    for (const provider of JARVIS_PROVIDERS) {
      expect(isJarvisProvider(provider)).toBe(true);
    }

    for (const other of ["acme", "", 4, null, undefined, {}]) {
      expect(isJarvisProvider(other)).toBe(false);
    }
  });
});

describe("parseStoredJarvisBrain", () => {
  it("keeps a house brain and a listed own brain", () => {
    expect(parseStoredJarvisBrain("claude-opus-5")).toBe("claude-opus-5");
    expect(parseStoredJarvisBrain("own:anthropic:claude-sonnet-5")).toBe(
      "own:anthropic:claude-sonnet-5",
    );
  });

  it("reads an own brain whose model left the list as scripted, never the default", () => {
    expect(parseStoredJarvisBrain("own:anthropic:retired-model")).toBe(
      "scripted",
    );
  });

  it.each([null, undefined, 3, "", "gpt-9", "own:evil:x"])(
    "falls back to the default brain for %s",
    (value) => {
      expect(parseStoredJarvisBrain(value)).toBe(DEFAULT_JARVIS_BRAIN);
    },
  );
});

describe("jarvisOwnModels", () => {
  it("an own brain keeps provider and model apart from the house brain of the same model", () => {
    expect(ownModelOf("own:anthropic:claude-sonnet-5")?.modelId).toBe(
      "claude-sonnet-5",
    );
    expect(ownModelOf("own:anthropic:claude-sonnet-5")?.provider).toBe(
      "anthropic",
    );
    expect(ownModelOf("claude-sonnet-5")).toBeUndefined();
  });

  it("isJarvisBrain refuses an own brain outside the curated list", () => {
    expect(isJarvisBrain("own:anthropic:claude-sonnet-5")).toBe(true);
    expect(isJarvisBrain("claude-sonnet-5")).toBe(true);
    expect(isJarvisBrain("own:anthropic:made-up")).toBe(false);
    expect(isJarvisBrain("own:evil:claude-sonnet-5")).toBe(false);
  });

  it("every listed model has a positive price and a matching brain string", () => {
    for (const model of JARVIS_OWN_MODELS) {
      expect(model.inputUsdPerMtok).toBeGreaterThan(0);
      expect(model.outputUsdPerMtok).toBeGreaterThan(0);
      expect(model.brain).toBe(`own:${model.provider}:${model.modelId}`);
    }
  });

  it("an Anthropic own model carries the name and label of the house model it mirrors", () => {
    for (const model of ownModelsFor("anthropic")) {
      expect(model.name).toBe(
        JARVIS_BRAIN_NAMES[model.modelId as keyof typeof JARVIS_BRAIN_NAMES],
      );
      expect(model.label).toBe(
        JARVIS_BRAIN_LABELS[model.modelId as keyof typeof JARVIS_BRAIN_LABELS],
      );
    }
  });

  it("ownModelsFor lists a provider's models only", () => {
    expect(ownModelsFor("anthropic")).toHaveLength(3);

    for (const provider of JARVIS_PROVIDERS) {
      for (const model of ownModelsFor(provider)) {
        expect(model.provider).toBe(provider);
      }
    }
  });

  it("offers all three providers, each with a cheap and a strong model besides Anthropic's three", () => {
    expect(JARVIS_OWN_PROVIDERS).toEqual(["anthropic", "openrouter", "openai"]);
    expect(ownModelsFor("openrouter")).toHaveLength(2);
    expect(ownModelsFor("openai")).toHaveLength(2);

    for (const provider of ["openrouter", "openai"] as const) {
      const [cheap, strong] = ownModelsFor(provider);

      expect(cheap?.outputUsdPerMtok).toBeLessThan(
        strong?.outputUsdPerMtok ?? 0,
      );
    }
  });

  it("every listed model has a name and a label of its own", () => {
    const brains = new Set<string>();

    for (const model of JARVIS_OWN_MODELS) {
      expect(model.name.length).toBeGreaterThan(0);
      expect(model.label.length).toBeGreaterThan(0);
      expect(jarvisBrainName(model.brain)).toBe(model.name);
      expect(jarvisBrainLabel(model.brain)).toBe(model.label);
      brains.add(model.brain);
    }

    expect(brains.size).toBe(JARVIS_OWN_MODELS.length);
  });

  it("isJarvisOwnBrain checks the shape, not the list", () => {
    expect(isJarvisOwnBrain("own:openai:anything")).toBe(true);
    expect(isJarvisOwnBrain("own:evil:x")).toBe(false);
    expect(isJarvisOwnBrain("own:anthropic:")).toBe(false);
    expect(isJarvisOwnBrain("claude-sonnet-5")).toBe(false);
    expect(isJarvisOwnBrain(42)).toBe(false);
  });

  it("names and labels read for house and own brains, and fall back to the model id", () => {
    expect(jarvisBrainName("claude-opus-5")).toBe("Claude Opus 5");
    expect(jarvisBrainName("own:anthropic:claude-opus-5")).toBe(
      "Claude Opus 5",
    );
    expect(jarvisBrainLabel("scripted")).toBe("scripted");
    expect(jarvisBrainLabel("own:anthropic:claude-haiku-4-5")).toBe(
      "Haiku 4.5",
    );
    const retired: JarvisBrain = "own:anthropic:retired-model";

    expect(jarvisBrainName(retired)).toBe("retired-model");
    expect(jarvisBrainLabel(retired)).toBe("retired-model");
  });
});

describe("jarvisBrainTakesEffort", () => {
  it("is true for Sonnet and Opus, house or own, and false for Haiku and scripted", () => {
    expect(jarvisBrainTakesEffort("claude-sonnet-5")).toBe(true);
    expect(jarvisBrainTakesEffort("claude-opus-5")).toBe(true);
    expect(jarvisBrainTakesEffort("own:anthropic:claude-sonnet-5")).toBe(true);
    expect(jarvisBrainTakesEffort("own:anthropic:claude-opus-5")).toBe(true);
    expect(jarvisBrainTakesEffort("claude-haiku-4-5")).toBe(false);
    expect(jarvisBrainTakesEffort("own:anthropic:claude-haiku-4-5")).toBe(
      false,
    );
    expect(jarvisBrainTakesEffort("scripted")).toBe(false);
  });
});
