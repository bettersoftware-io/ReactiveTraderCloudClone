import { next } from "@vercel/edge";

export const config = { matcher: "/(.*)" };

/**
 * Single shared-password gate via HTTP Basic Auth. Returns 401 +
 * WWW-Authenticate so the browser shows its native credential dialog; the
 * username is ignored, only the password (SITE_PASSWORD) is checked. The
 * browser caches the credential for the session, so assets load after one
 * prompt. This protects only the Vercel-served UI — the Fly WS is gated
 * separately by the access token (Task 1).
 */
export default function middleware(request: Request): Response {
  const expected = process.env.SITE_PASSWORD;
  if (!expected) return next();

  const header = request.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");

  if (scheme === "Basic" && encoded) {
    const decoded = atob(encoded);
    const password = decoded.slice(decoded.indexOf(":") + 1);
    if (password === expected) return next();
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="RTC"' },
  });
}
