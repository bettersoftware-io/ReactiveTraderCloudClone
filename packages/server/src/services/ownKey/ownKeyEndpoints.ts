import type { JarvisProvider } from "@rtc/domain";

/** Where a key is checked and how it is presented. A read-only GET that
 * answers 200 for a valid key and 401/403 for a bad one. */
export interface OwnKeyEndpoint {
  readonly url: string;
  readonly headers: (key: string) => Readonly<Record<string, string>>;
}

export const OWN_KEY_ENDPOINTS: Readonly<
  Record<JarvisProvider, OwnKeyEndpoint>
> = {
  anthropic: {
    url: "https://api.anthropic.com/v1/models",
    headers: (key: string): Record<string, string> => {
      return { "x-api-key": key, "anthropic-version": "2023-06-01" };
    },
  },
  openai: {
    url: "https://api.openai.com/v1/models",
    headers: (key: string): Record<string, string> => {
      return { Authorization: `Bearer ${key}` };
    },
  },
  // OpenRouter's models list is public and proves nothing about a key, so
  // the check goes to the key-info route.
  openrouter: {
    url: "https://openrouter.ai/api/v1/key",
    headers: (key: string): Record<string, string> => {
      return { Authorization: `Bearer ${key}` };
    },
  },
};
