import type { JarvisProvider } from "@rtc/domain";

import { JARVIS_KEY_CHECK_TIMEOUT_MS } from "#/config/limits";

import { OWN_KEY_ENDPOINTS } from "./ownKeyEndpoints.js";

export type OwnKeyVerdict = "accepted" | "refused" | "unreachable";

export type VerifyOwnKey = (
  provider: JarvisProvider,
  key: string,
  signal: AbortSignal,
) => Promise<OwnKeyVerdict>;

/**
 * Asks the provider whether it accepts `key`. 200 accepts, 401 and 403
 * refuse, anything else (a 5xx, a 429, a timeout, a network error, a
 * redirect) is unreachable — the key was not judged. Nothing is logged but
 * the provider id and a status or error NAME: the URL's headers carry the
 * key, and an error's message may quote them.
 */
export async function verifyOwnKey(
  provider: JarvisProvider,
  key: string,
  signal: AbortSignal,
  fetchFn: typeof fetch = fetch,
): Promise<OwnKeyVerdict> {
  const endpoint = OWN_KEY_ENDPOINTS[provider];

  try {
    const response = await fetchFn(endpoint.url, {
      method: "GET",
      headers: endpoint.headers(key),
      redirect: "error",
      signal: AbortSignal.any([
        signal,
        AbortSignal.timeout(JARVIS_KEY_CHECK_TIMEOUT_MS),
      ]),
    });

    await response.body?.cancel();

    if (response.status === 200) {
      return "accepted";
    }

    if (response.status === 401 || response.status === 403) {
      return "refused";
    }

    console.warn(`jarvis-key: ${provider} check answered ${response.status}`);

    return "unreachable";
  } catch (error) {
    const name = error instanceof Error ? error.name : "unknown";

    console.warn(`jarvis-key: ${provider} check failed (${name})`);

    return "unreachable";
  }
}

/** The check under `RTC_JARVIS_FAKE=1`: no network. A key starting
 * `fake-good` is accepted, any other refused. */
export function fakeVerifyOwnKey(
  _provider: JarvisProvider,
  key: string,
): Promise<OwnKeyVerdict> {
  return Promise.resolve(key.startsWith("fake-good") ? "accepted" : "refused");
}
