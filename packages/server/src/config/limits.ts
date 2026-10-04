/**
 * Every per-caller bound the server enforces, in one place (hardening spec
 * §2.2 S1/S2/S4/S8 and §9.2). The values are deliberately generous for one
 * real client — a browser tab opens one socket and sends a few dozen frames
 * in its first second — and deliberately tight for a flood. Tune here, not
 * at the call sites. The trusted-IP header default lives in
 * `http/clientIp.ts` and the rate-limit table size in `auth/rateLimit.ts`,
 * next to the code that owns each.
 */

/** S1 — largest WebSocket frame accepted, in BYTES. The largest legitimate
 * frame is a `jarvis.chat` carrying 20 history entries of 2 000 chars plus a
 * 4 000-char message: 44 000 chars, which is ~45 KiB in ASCII but ~132 KiB in
 * a 3-byte script (CJK) and ~176 KiB in emoji — the per-field caps bound the
 * SHAPE, UTF-8 decides the bytes. 256 KiB fits every such frame and is still
 * nothing against the 256 MB VM; past it `ws` closes the socket with 1009. */
export const WS_MAX_PAYLOAD_BYTES = 256 * 1024;

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

/** B2 — body cap for the account endpoints, by bytes RECEIVED. */
export const ACCOUNT_MAX_BODY_BYTES = 4 * 1024;

/** B2 — `/register` per IP. A person registers once. */
export const REGISTER_RATE_LIMIT_MAX = 5;
export const REGISTER_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/** B2 — `/resend-code` and `/request-reset` per IP, each. Each sends an email. */
export const SEND_CODE_RATE_LIMIT_MAX = 5;
export const SEND_CODE_RATE_LIMIT_WINDOW_MS = 60 * 60_000;

/** B2 — `/confirm-email` and `/reset-password` per IP, each. Bounds guessing
 * a 6-digit code; Supabase also expires and rate-limits codes. */
export const CODE_ENTRY_RATE_LIMIT_MAX = 10;
export const CODE_ENTRY_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

/** B2 — `/confirm-email` and `/reset-password` per normalized email address,
 * one budget shared by both. 5 tries per 15 minutes makes a 1-in-a-million
 * code unguessable in its lifetime, at the cost that someone can make an
 * address wait 15 minutes by burning its tries. */
export const CODE_ENTRY_PER_ADDRESS_MAX = 5;
export const CODE_ENTRY_PER_ADDRESS_WINDOW_MS = 15 * 60 * 1000;

/** B2 — registrations per day across the whole service: a fuse against a
 * scripted flood. Counted in the account store, so a restart keeps it. */
export const MAX_REGISTRATIONS_PER_DAY = 200;

/** B2 — one account-store call. A slow Supabase must not hold a request. */
export const ACCOUNT_DIRECTORY_TIMEOUT_MS = 5_000;

/** B2 — how long the upgrade trusts a cached account status, and how many
 * accounts the cache holds. A dashboard block lands within this window. */
export const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;
export const ACCOUNT_STATUS_CACHE_MAX_ENTRIES = 1_000;

/** B2 — `/health/accounts` re-reads the store at most this often. */
export const ACCOUNTS_HEALTH_CACHE_MS = 60_000;
