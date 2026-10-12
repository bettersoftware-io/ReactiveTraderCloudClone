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
 * an 8-digit code; Supabase also expires and rate-limits codes. */
export const CODE_ENTRY_RATE_LIMIT_MAX = 10;
export const CODE_ENTRY_RATE_LIMIT_WINDOW_MS = 10 * 60_000;

/** B2 — `/confirm-email` and `/reset-password` per normalized email address,
 * one budget shared by both, charged only for a request that reaches the
 * account store. 5 tries per 15 minutes is 480 a day per address; against
 * 100,000,000 eight-digit codes that is about 5 in a million per address per
 * day. The limiter is in memory, so a restart or a scale-to-zero resets it.
 * The price: anyone who can send five
 * well-formed code attempts for an address makes it wait out the window;
 * that is what bounding guessing from many IPs costs. */
export const CODE_ENTRY_PER_ADDRESS_MAX = 5;
export const CODE_ENTRY_PER_ADDRESS_WINDOW_MS = 15 * 60 * 1000;

/** B2 — addresses the per-address limiter holds. The keys are caller-chosen:
 * every eviction of a live window costs an attacker this many well-formed
 * requests through the per-IP limits for five more guesses. A key is a
 * normalized address of up to 254 ASCII characters, so the worst case is
 * roughly 400 bytes per key (the string, the Map entry and its window): a
 * full table is about 20 MB. The send limiter (`SEND_PER_ADDRESS_MAX_KEYS`)
 * holds a second table of the same size. */
export const CODE_ENTRY_PER_ADDRESS_MAX_KEYS = 50_000;

/** B2 — emails sent per normalized address per window, one budget shared by
 * the three paths that send one: `/register` (also for an address that
 * already has an account), `/resend-code` and `/request-reset`. Charged only
 * for a request that passes local validation. Over it: `429 rate_limited`,
 * no ban strike (the caller may be the owner). Bounds mailing one victim. */
export const SEND_PER_ADDRESS_MAX = 3;
export const SEND_PER_ADDRESS_WINDOW_MS = 60 * 60 * 1000;
export const SEND_PER_ADDRESS_MAX_KEYS = 50_000;

/** B2 — sign-ups per window across the whole server: a fuse on `/register`
 * only. Every counted sign-up really is sent an email, so it must sit BELOW
 * the Supabase project's own email rate limit: the server answers `503
 * unavailable` honestly instead of the store answering "sent" and losing
 * the mail silently, and the rest of the project's allowance is left for
 * resends and resets. Not charged on `/resend-code` or `/request-reset`: a
 * request for an address with no account sends nothing at Supabase, so
 * charging them would let 25 junk addresses an hour make every resend and
 * reset answer 503 for everyone. */
export const EMAIL_SENDS_PER_HOUR_MAX = 25;
export const EMAIL_SENDS_WINDOW_MS = 60 * 60 * 1000;

/** B2 — registrations per day across the whole service: a fuse against a
 * scripted flood. Counted in the account store, so a restart keeps it. */
export const MAX_REGISTRATIONS_PER_DAY = 200;

/** B2 — one account-store call. A slow Supabase must not hold a request. */
export const ACCOUNT_DIRECTORY_TIMEOUT_MS = 5_000;

/** B2 — how long the upgrade trusts a cached account status, and how many
 * accounts the cache holds. A dashboard block lands within this window. */
export const ACCOUNT_STATUS_CACHE_TTL_MS = 60_000;
export const ACCOUNT_STATUS_CACHE_MAX_ENTRIES = 1_000;

/** B2 — shortest `AUTH_SECRET` (trimmed) a server with accounts starts
 * with: it is the key that signs account and admin session tokens, so a
 * guessable one forges any of them. */
export const AUTH_SECRET_MIN_LENGTH = 32;

/** B2 — `/health/accounts` re-reads the store at most this often. */
export const ACCOUNTS_HEALTH_CACHE_MS = 60_000;
