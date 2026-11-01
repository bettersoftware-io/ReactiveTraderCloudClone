import { describe, expect, it } from "vitest";

import {
  isJarvisBrain,
  JARVIS_BRAIN_LABELS,
  JARVIS_BRAIN_NAMES,
  type JarvisBrain,
  jarvisBrainLabel,
  jarvisBrainName,
} from "../preferences/preferences.js";
import {
  isJarvisOwnBrain,
  JARVIS_OWN_MODELS,
  ownModelOf,
  ownModelsFor,
} from "./jarvisOwnModels.js";

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

  it("an own model carries the name and label of the house model it mirrors", () => {
    for (const model of JARVIS_OWN_MODELS) {
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
    expect(ownModelsFor("openai")).toEqual([]);
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
