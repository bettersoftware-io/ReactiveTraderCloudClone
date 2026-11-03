import type {
  JarvisBrain,
  JarvisOwnBrain,
} from "../preferences/preferences.js";

/** Where an own-key brain's key is from. */
export const JARVIS_PROVIDERS = ["anthropic", "openrouter", "openai"] as const;

export type JarvisProvider = (typeof JARVIS_PROVIDERS)[number];

/** Every provider the app knows, whether or not it is offered yet
 * (`JARVIS_OWN_PROVIDERS` is the offered subset). */
export function isJarvisProvider(value: unknown): value is JarvisProvider {
  return (JARVIS_PROVIDERS as readonly unknown[]).includes(value);
}

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

/** Providers a person can bring a key for, in the order the form offers
 * them. */
export const JARVIS_OWN_PROVIDERS: readonly JarvisProvider[] = [
  "anthropic",
  "openrouter",
  "openai",
];

export const JARVIS_PROVIDER_NAMES: Readonly<Record<JarvisProvider, string>> = {
  anthropic: "Anthropic",
  openrouter: "OpenRouter",
  openai: "OpenAI",
};

function ownModel(
  provider: JarvisProvider,
  modelId: string,
  name: string,
  label: string,
  inputUsdPerMtok: number,
  outputUsdPerMtok: number,
): JarvisOwnModel {
  return {
    brain: `own:${provider}:${modelId}`,
    provider,
    modelId,
    name,
    label,
    inputUsdPerMtok,
    outputUsdPerMtok,
  };
}

/**
 * The curated own-key models, in picker order: per provider, the cheap one
 * first. Prices are USD per million tokens, from each provider's own price
 * list. Anthropic's match the house table.
 *
 * Every OpenRouter and OpenAI model here calls function tools over Chat
 * Completions with reasoning switched off, which the loop's provider config
 * does on every request (`ownKeyLoops.ts` in the server). None is a model
 * that must reason: a cancelled request is booked from the characters it
 * streamed, which would miss hidden reasoning tokens. Changing the list,
 * and checking a candidate first: `docs/running-real-jarvis.md`.
 */
export const JARVIS_OWN_MODELS: readonly JarvisOwnModel[] = [
  ownModel(
    "anthropic",
    "claude-haiku-4-5",
    "Claude Haiku 4.5",
    "Haiku 4.5",
    1,
    5,
  ),
  ownModel(
    "anthropic",
    "claude-sonnet-5",
    "Claude Sonnet 5",
    "Sonnet 5",
    2,
    10,
  ),
  ownModel("anthropic", "claude-opus-5", "Claude Opus 5", "Opus 5", 5, 25),
  ownModel(
    "openrouter",
    "deepseek/deepseek-v4.1-flash",
    "DeepSeek V4.1 Flash",
    "DeepSeek V4.1",
    0.045,
    0.5,
  ),
  ownModel(
    "openrouter",
    "anthropic/claude-sonnet-5",
    "Claude Sonnet 5",
    "Sonnet 5",
    2,
    10,
  ),
  ownModel("openai", "gpt-6-luna", "GPT-6 Luna", "GPT-6 Luna", 0.1, 0.5),
  ownModel("openai", "gpt-5.6-sol", "GPT-5.6 Sol", "GPT-5.6 Sol", 4, 20),
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
    isJarvisProvider(parts[1]) &&
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
