#!/usr/bin/env tsx
/**
 * Live check of `SupabaseAccountDirectory` against a REAL project. The unit
 * tests replay Supabase's documented responses; this proves the real ones
 * still match. It needs SUPABASE_URL and SUPABASE_SECRET_KEY, creates ONE
 * throwaway account through the admin API (so no email is sent and no inbox
 * is needed), walks it through confirm → sign-in → reset, and deletes it.
 * It also signs up ONE fresh address through the adapter to prove nobody
 * knows a sign-up's password, and deletes that account too. That sign-up
 * sends ONE real confirmation email, so the addresses use
 * PROBE_EMAIL_DOMAIN: a domain you control or a test inbox.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… PROBE_EMAIL_DOMAIN=… pnpm --filter @rtc/server accounts:probe
 *
 * Prints account ids and outcomes only — never a key, a password or a code.
 */
import type {
  AccountDirectory,
  SignUpOutcome,
} from "../src/accounts/AccountDirectory.ts";
import { createSupabaseAccountDirectory } from "../src/accounts/SupabaseAccountDirectory.ts";

const url: string = process.env.SUPABASE_URL ?? "";
const secretKey: string = process.env.SUPABASE_SECRET_KEY ?? "";
const emailDomain: string = process.env.PROBE_EMAIL_DOMAIN ?? "";

if (url === "" || secretKey === "" || emailDomain === "") {
  console.error(
    "probe: set SUPABASE_URL, SUPABASE_SECRET_KEY and PROBE_EMAIL_DOMAIN " +
      "(a domain you control or a test inbox — the probe sends one real " +
      "confirmation email to it)",
  );
  process.exit(2);
}

const PROBE_IP = "203.0.113.1";
const email = `probe-${Date.now()}@${emailDomain}`;
const freshEmail = `probe-fresh-${Date.now()}@${emailDomain}`;
const firstPassword = "Probe2026!first";
const secondPassword = "Probe2026!second";
const thirdPassword = "Probe2026!third";
const directory: AccountDirectory = createSupabaseAccountDirectory({
  url,
  secretKey,
  timeoutMs: 10_000,
});

let failures = 0;

function check(label: string, pass: boolean, detail: string): void {
  if (!pass) {
    failures += 1;
  }

  console.log(`  ${pass ? "✓" : "✗"} ${label} (${detail})`);
}

interface GeneratedLink {
  readonly id: string;
  readonly email_otp: string;
}

/** Admin API: creates (or re-issues for) a user and returns the emailed
 * code WITHOUT sending an email. */
async function generateCode(
  type: "signup" | "recovery",
): Promise<GeneratedLink> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/auth/v1/admin/generate_link`,
    {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      // The metadata tries to grant itself admin, approval and a block; the
      // profile trigger must ignore all three (a sign-up cannot set its role).
      body: JSON.stringify({
        type,
        email,
        password: firstPassword,
        data: {
          display_name: "Probe Account",
          role: "admin",
          approved: true,
          blocked: true,
        },
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`generate_link ${type} answered ${response.status}`);
  }

  return (await response.json()) as GeneratedLink;
}

/** The id of the profile row for an address, through PostgREST. */
async function findAccountIdByEmail(address: string): Promise<string | null> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/profiles?email=eq.${encodeURIComponent(address)}&select=id`,
    {
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    return null;
  }

  const rows = (await response.json()) as readonly { readonly id: string }[];

  return rows[0]?.id ?? null;
}

async function deleteAccount(accountId: string): Promise<number> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/auth/v1/admin/users/${accountId}`,
    {
      method: "DELETE",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  return response.status;
}

console.log("accounts probe: starting");
check("ping", await directory.ping(), "profiles table reachable");

const signup: GeneratedLink = await generateCode("signup");

try {
  const before = await directory.checkPassword(email, firstPassword, PROBE_IP);
  check(
    "sign-in before confirming",
    before.outcome === "unconfirmed",
    before.outcome,
  );

  // An unconfirmed user must not reveal itself: a wrong password is
  // `invalid`, not `unconfirmed`.
  const guessed = await directory.checkPassword(
    email,
    "Wrong2026!pass",
    PROBE_IP,
  );
  check(
    "a wrong password before confirming",
    guessed.outcome === "invalid",
    guessed.outcome,
  );

  const wrong = await directory.confirmEmail(
    email,
    "000000",
    secondPassword,
    PROBE_IP,
  );
  check("a wrong code", wrong === "invalid_code", wrong);

  const confirmed = await directory.confirmEmail(
    email,
    signup.email_otp,
    secondPassword,
    PROBE_IP,
  );
  check(
    "the right code sets the password",
    confirmed === "confirmed",
    confirmed,
  );

  const after = await directory.checkPassword(email, secondPassword, PROBE_IP);
  check(
    "sign-in with the confirmed password",
    after.outcome === "match",
    after.outcome,
  );

  const replaced = await directory.checkPassword(
    email,
    firstPassword,
    PROBE_IP,
  );
  check(
    "the pre-confirmation password no longer signs in",
    replaced.outcome === "invalid",
    replaced.outcome,
  );

  const bad = await directory.checkPassword(email, "Wrong2026!pass", PROBE_IP);
  check("a wrong password", bad.outcome === "invalid", bad.outcome);

  const again = await directory.signUp(
    { email, displayName: "Probe Again" },
    PROBE_IP,
  );
  check("signing up the existing address", again === "sent", again);

  const found = await directory.findAccount(signup.id);
  check(
    "the profile row ignores a self-granted role, approval and block",
    found.outcome === "found" &&
      found.account.status === "pending" &&
      found.account.access === "user" &&
      found.account.displayName === "Probe Account",
    found.outcome === "found"
      ? `${found.account.status}/${found.account.access}`
      : found.outcome,
  );

  const counted = await directory.countRegistrationsSince(
    Date.now() - 60 * 60 * 1_000,
  );
  check(
    "registration count",
    counted.outcome === "counted" && counted.count >= 1,
    counted.outcome === "counted" ? String(counted.count) : counted.outcome,
  );

  // A recovery code proves the mailbox too, but only the sign-up code may
  // confirm: at /confirm-email it must not become a second reset path.
  const recovery = await generateCode("recovery");
  const crossed = await directory.confirmEmail(
    email,
    recovery.email_otp,
    "Probe2026!crossed",
    PROBE_IP,
  );
  check(
    "a recovery code does not confirm",
    crossed === "invalid_code",
    crossed,
  );

  const reset = await directory.resetPassword(
    email,
    recovery.email_otp,
    thirdPassword,
    PROBE_IP,
  );
  check("password reset", reset === "changed", reset);

  const relogin = await directory.checkPassword(email, thirdPassword, PROBE_IP);
  check(
    "sign-in with the new password",
    relogin.outcome === "match",
    relogin.outcome,
  );
} finally {
  const status = await deleteAccount(signup.id);
  check(
    "cleanup",
    status === 200,
    `account ${signup.id}, delete answered ${status}`,
  );
}

const fresh: SignUpOutcome = await directory.signUp(
  { email: freshEmail, displayName: "Probe Fresh" },
  PROBE_IP,
);
check("a fresh sign-up", fresh === "sent", fresh);

const freshId: string | null = await findAccountIdByEmail(freshEmail);

// Without an account the next check's `invalid` would prove nothing.
check(
  "the fresh sign-up created an account",
  freshId !== null,
  freshId ?? "no profile row — the unknowable-password check is skipped",
);

if (freshId !== null) {
  try {
    // The sign-up stored a random password: no password the caller could
    // know signs in, so the answer is `invalid`, never `unconfirmed`.
    const unknowable = await directory.checkPassword(
      freshEmail,
      firstPassword,
      PROBE_IP,
    );
    check(
      "no known password opens a fresh sign-up",
      unknowable.outcome === "invalid",
      unknowable.outcome,
    );
  } finally {
    const status = await deleteAccount(freshId);
    check(
      "fresh cleanup",
      status === 200,
      `account ${freshId}, delete answered ${status}`,
    );
  }
}

console.log(
  failures === 0
    ? "accounts probe: PASS"
    : `accounts probe: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
