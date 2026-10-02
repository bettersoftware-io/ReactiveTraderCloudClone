/**
 * Every per-caller bound the server enforces, in one place (hardening spec
 * §2.2 S1/S2/S4/S8 and §9.2). The values are deliberately generous for one
 * real client — a browser tab opens one socket and sends a few dozen frames
 * in its first second — and deliberately tight for a flood. Tune here, not
 * at the call sites. The trusted-IP header default lives in
 * `http/clientIp.ts` and the rate-limit table size in `auth/rateLimit.ts`,
 * next to the code that owns each.
 */

/** S1 — largest WebSocket frame accepted. The largest legitimate frame is a
 * `jarvis.chat` carrying 20 history entries of 2 000 chars plus a 4 000-char
 * message (~45 KiB with JSON overhead). `ws` closes the socket with 1009. */
export const WS_MAX_PAYLOAD_BYTES = 64 * 1024;

/** S2 — `/login` body cap, by bytes RECEIVED (`413` past it). A username +
 * password JSON object is < 200 bytes. */
export const LOGIN_MAX_BODY_BYTES = 4 * 1024;

/** `/mcp` body cap — declared `Content-Length` only, since the MCP transport
 * reads the body itself. */
export const MCP_MAX_BODY_BYTES = 64 * 1024;

/** S8 — live sockets across the whole process; below Fly's `hard_limit`
 * (fly.toml) so the app refuses with 503 before the proxy starts queueing. */
export const MAX_CONNECTIONS_TOTAL = 200;

/** S8 — live sockets per client IP: several tabs plus a phone, not a flood. */
export const MAX_CONNECTIONS_PER_IP = 8;

/** S8 — per-socket inbound token bucket: burst capacity and refill rate. A
 * browser tab sends a few dozen frames in its first second. */
export const INBOUND_BURST = 100;
export const INBOUND_REFILL_PER_SECOND = 25;

/** S8 — frames dropped by an exhausted bucket before the socket is closed
 * (1008) and the caller takes a ban strike. */
export const INBOUND_DROPS_BEFORE_CLOSE = 100;

/** S3/S4 — `/login` attempts per IP per window (unchanged from before B1).
 * The table's own size cap is the rate limiter's `maxKeys` default. */
export const LOGIN_RATE_LIMIT_MAX = 10;
export const LOGIN_RATE_LIMIT_WINDOW_MS = 60_000;

/** §9.2 — weighted strikes (failed login 1, rate-limit hit 2, oversized
 * frame 3, flood 3) within the window that earn a ban, how long a ban
 * lasts, and how many IPs the table holds. */
export const BAN_STRIKES = 10;
export const BAN_STRIKE_WINDOW_MS = 10 * 60_000;
export const BAN_DURATION_MS = 15 * 60_000;
export const BAN_MAX_ENTRIES = 10_000;
