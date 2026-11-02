/**
 * The words of the "Your key" section, shared by both web clients so the
 * promise about the key is one string, not two that can drift apart.
 */
import {
  JARVIS_OWN_CAP_MAX_USD,
  JARVIS_PROVIDER_NAMES,
  type JarvisOwnKeyStatus,
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
      return "Not confirmed by the server yet";
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

/** Whether a new check of the saved key could change the answer: the server
 * could not judge it, or has not reported on it. A refused key stays refused
 * on its connection, so that one needs Replace. */
export function canRetryOwnKey(ownKey: JarvisOwnKeyView | null): boolean {
  return (
    ownKey === null ||
    ownKey.status === "unreachable" ||
    ownKey.status === "limited"
  );
}

const TROUBLED_STATUSES: ReadonlySet<JarvisOwnKeyStatus> = new Set([
  "refused",
  "unreachable",
  "limited",
]);

/** Whether the server's reading says the key is not working (refused, not
 * reachable, rate limited): drawn as a warning. A key still being checked, or
 * not reported on yet, is not. */
export function isOwnKeyTroubled(ownKey: JarvisOwnKeyView | null): boolean {
  return ownKey !== null && TROUBLED_STATUSES.has(ownKey.status);
}

/** A daily limit typed in dollars, or `null` when it is not an amount the
 * server takes: empty, not a number, not above zero, or over the largest cap. */
export function parseOwnKeyCap(text: string): number | null {
  if (text.trim() === "") {
    return null;
  }

  const amount = Number(text);

  return Number.isFinite(amount) &&
    amount > 0 &&
    amount <= JARVIS_OWN_CAP_MAX_USD
    ? amount
    : null;
}
