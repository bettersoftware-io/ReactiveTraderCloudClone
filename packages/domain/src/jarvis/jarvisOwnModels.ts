import type {
  JarvisBrain,
  JarvisOwnBrain,
  JarvisProvider,
} from "../preferences/preferences.js";

/** One curated bring-your-own-key model: the person's key, their provider,
 * a model the app lists. `brain` is the string every other layer carries. */
export interface JarvisOwnModel {
  readonly brain: JarvisOwnBrain;
  readonly provider: JarvisProvider;
  readonly modelId: string;
  readonly name: string;
  readonly label: string;
  readonly inputUsdPerMtok: number;
  readonly outputUsdPerMtok: number;
}

/** Providers a person can bring a key for. OpenRouter and OpenAI join in PR 4. */
export const JARVIS_OWN_PROVIDERS: readonly JarvisProvider[] = ["anthropic"];

export const JARVIS_PROVIDER_NAMES: Readonly<Record<JarvisProvider, string>> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  openai: "OpenAI",
};

function anthropicModel(
  modelId: string,
  name: string,
  label: string,
  inputUsdPerMtok: number,
  outputUsdPerMtok: number,
): JarvisOwnModel {
  return {
    brain: `own:anthropic:${modelId}`,
    provider: "anthropic",
    modelId,
    name,
    label,
    inputUsdPerMtok,
    outputUsdPerMtok,
  };
}

/** The curated own-key models, in picker order. Prices match the house table. */
export const JARVIS_OWN_MODELS: readonly JarvisOwnModel[] = [
  anthropicModel("claude-haiku-4-5", "Claude Haiku 4.5", "Haiku 4.5", 1, 5),
  anthropicModel("claude-sonnet-5", "Claude Sonnet 5", "Sonnet 5", 2, 10),
  anthropicModel("claude-opus-5", "Claude Opus 5", "Opus 5", 5, 25),
];

export function ownModelOf(brain: JarvisBrain): JarvisOwnModel | undefined {
  return JARVIS_OWN_MODELS.find((model) => {
    return model.brain === brain;
  });
}

export function ownModelsFor(
  provider: JarvisProvider,
): readonly JarvisOwnModel[] {
  return JARVIS_OWN_MODELS.filter((model) => {
    return model.provider === provider;
  });
}

/** Shape check only: `own:<provider>:<model>` with a known provider. Whether
 * the model is listed is `isJarvisBrain`'s question. */
export function isJarvisOwnBrain(value: unknown): value is JarvisOwnBrain {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.split(":");

  return (
    parts.length >= 3 &&
    parts[0] === "own" &&
    (parts[1] === "anthropic" ||
      parts[1] === "openrouter" ||
      parts[1] === "openai") &&
    parts.slice(2).join(":").length > 0
  );
}

/** Default spend cap for a bring-your-own key, in USD per day. */
export const JARVIS_OWN_CAP_DEFAULT_USD = 1;
/** Largest cap a person may set. */
export const JARVIS_OWN_CAP_MAX_USD = 1_000;
/** Longest key the server will read. */
export const JARVIS_KEY_MAX_CHARS = 512;

export type JarvisOwnKeyStatus =
  | "checking"
  | "accepted"
  | "refused"
  | "unreachable"
  | "limited";

/** What the server says about the caller's key. Never carries the key. */
export interface JarvisOwnKeyView {
  readonly provider: JarvisProvider;
  readonly status: JarvisOwnKeyStatus;
  readonly capUsd: number | null;
}

/** What the app hands the transport. `core-api` depends on `@rtc/domain` only,
 * so this lives here and the adapter maps it to the wire payload. */
export interface JarvisOwnKeySetting {
  readonly provider: JarvisProvider;
  readonly key: string;
  readonly capUsd: number | null;
}
