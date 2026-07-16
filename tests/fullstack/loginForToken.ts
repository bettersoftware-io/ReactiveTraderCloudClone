/**
 * Shared `POST /login` helper for the full-stack smokes.
 *
 * Both smokes connect to the REAL server, whose WS upgrade is token-gated
 * (`authorizeUpgrade` in packages/server/src/http/loginHandler.ts — "no
 * open-when-empty fallback"): a client must first exchange credentials for a
 * signed token over this HTTP route before the socket will accept it. The
 * server is started with `AUTH_SECRET` + `AUTH_USERS="demo:demo"` (see
 * `startServer` in ./_orchestration.ts), so `demo`/`demo` is always a valid
 * credential here — it also matches the `demo` roster identity
 * (packages/domain/src/auth/roster.ts), the same one the browser suites seed
 * via tests/browser/authSeed.ts.
 */
import type { LoginResponseDto } from "@rtc/shared";

export async function loginForToken(
  httpBaseUrl: string,
  username = "demo",
  password = "demo",
): Promise<LoginResponseDto> {
  const response = await fetch(`${httpBaseUrl}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(
      `POST ${httpBaseUrl}/login failed: ${response.status} ${bodyText}`,
    );
  }

  return (await response.json()) as LoginResponseDto;
}
