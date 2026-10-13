/** The setting the policy reads; named in every refusal, never its value. */
const SETTING = "RTC_ALLOWED_ORIGINS";
const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
]);

export interface OriginPolicy {
  /** `list`: `RTC_ALLOWED_ORIGINS`. `localhost`: a dev machine with no setting. */
  readonly kind: "list" | "localhost";
  /** Whether a browser on `origin` (the `Origin` header's value) may use the POST routes. */
  allows(origin: string): boolean;
}

/**
 * Which pages may make a browser post to the server (spec §3.1). A request
 * with no `Origin` header is not a browser's and is not this policy's
 * business; the literal `null` origin is a browser's and is never allowed.
 * On a deployed machine the setting is required: a server that would accept
 * every page is not a configuration anyone meant.
 */
export function resolveOriginPolicy(env: NodeJS.ProcessEnv): OriginPolicy {
  const raw = env[SETTING]?.trim() ?? "";

  if (raw !== "") {
    const allowed = new Set(parseAllowedOrigins(raw));

    return {
      kind: "list",
      allows(origin: string): boolean {
        return allowed.has(origin.trim().toLowerCase());
      },
    };
  }

  if (env.FLY_APP_NAME || env.RTC_DEPLOYED) {
    throw new Error(`${SETTING} must be set on a deployed server`);
  }

  return {
    kind: "localhost",
    allows(origin: string): boolean {
      const parsed = parseOrigin(origin);

      return (
        parsed !== null &&
        parsed.protocol === "http:" &&
        LOCALHOST_HOSTS.has(parsed.hostname)
      );
    },
  };
}

/** The entries of the setting as normalized origins; throws on one that is
 * not an http(s) origin, naming its position (1-based) and not its text. */
export function parseAllowedOrigins(raw: string): string[] {
  return raw.split(",").map((entry, index) => {
    const parsed = parseOrigin(entry.trim());

    if (
      parsed === null ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.pathname !== "/" ||
      parsed.search !== "" ||
      parsed.hash !== "" ||
      parsed.username !== "" ||
      parsed.password !== ""
    ) {
      throw new Error(
        `${SETTING} entry ${index + 1} is not an origin of the form scheme://host[:port]`,
      );
    }

    return parsed.origin;
  });
}

/** `application/json`, any case, with or without parameters. */
export function isJsonContentType(value: string | undefined): boolean {
  if (value === undefined) {
    return false;
  }

  const mediaType = value.split(";")[0]?.trim().toLowerCase();

  return mediaType === "application/json";
}

function parseOrigin(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
