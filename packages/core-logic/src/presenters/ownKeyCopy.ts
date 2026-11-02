/**
 * The words of the "Your key" section, shared by both web clients so the
 * promise about the key is one string, not two that can drift apart.
 */
import {
  JARVIS_PROVIDER_NAMES,
  type JarvisOwnKeyView,
  type JarvisProvider,
} from "@rtc/domain";

/** Shown before the key field, verbatim: what happens to the key. */
export const OWN_KEY_EXPLANATION =
  "Your key stays in this browser. It is sent to our server only to make your requests, held in memory for your connection, and never stored or logged. Use a dedicated key with its own spend limit: an Anthropic Console workspace limit, an OpenAI project budget or an OpenRouter credit limit.";

/** Beside the daily limit: it is our count, not the provider's. */
export const OWN_KEY_LIMIT_NOTE =
  "An estimate from the usage we see, not a bill. Your provider's own limit is the real backstop.";

/** What the server says about the held key, in the section's words. `null` is
 * a key saved here that the server has not reported on yet. */
export function describeOwnKeyStatus(
  ownKey: JarvisOwnKeyView | null,
  provider: JarvisProvider,
): string {
  const name = JARVIS_PROVIDER_NAMES[provider];

  switch (ownKey?.status) {
    case undefined:
    case "checking":
      return "Checking…";
    case "accepted":
      return "Accepted";
    case "refused":
      return `${name} refused this key`;
    case "unreachable":
      return `Couldn't reach ${name}. Try again shortly.`;
    case "limited":
      return "Too many checks. Try again later.";
  }
}
