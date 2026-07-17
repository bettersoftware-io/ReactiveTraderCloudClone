/**
 * Default session lifetime for simulator-mode auth, where there is no server
 * `AUTH_TTL_MS` to source a real expiry from. Mirrors the server's 8h default
 * so simulator and real-WS sessions age identically. Real-WS sessions ignore
 * this and use the server-provided `exp` (see `HttpAuthAdapter`).
 */
export const DEFAULT_AUTH_TTL_MS = 8 * 60 * 60 * 1000;
