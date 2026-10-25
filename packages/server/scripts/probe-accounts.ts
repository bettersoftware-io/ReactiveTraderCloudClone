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
 * PROBE_EMAIL_DOMAIN: a domain you control or a test inbox. It also proves
 * the address lookup (`findByEmail`: found, with the same id, for the account
 * it just created; missing for a never-registered address). It never calls
 * `purgeUnconfirmedBefore` against a live project: a purge deletes real
 * accounts, and the unit tests cover it.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… PROBE_EMAIL_DOMAIN=… pnpm --filter @rtc/server accounts:probe
 *
 * Last, it executes the daily-budget SQL function (`record_jarvis_spend`) on
 * a sentinel day (2000-01-01) and owner (`roster:__probe__`), reads the
 * totals back, and deletes the probe's rows for that day.
 *
 * Prints account ids, outcomes and how long each directory call took (in
 * ms, to compare a known and an unknown address for a response-time
 * oracle) — never a key, a password or a code.
 */
import { performance } from "node:perf_hooks";

import type {
  AccountDirectory,
  AccountListing,
  AccountLookup,
  AdminWrite,
  ConfirmOutcome,
  PasswordCheck,
  PurgeOutcome,
  RegistrationCount,
  ResetOutcome,
  SendOutcome,
  SignUpInput,
  SignUpOutcome,
} from "../src/accounts/AccountDirectory.ts";
import { createSupabaseAccountDirectory } from "../src/accounts/SupabaseAccountDirectory.ts";
import { createSupabaseSpendStore } from "../src/services/jarvisBudget/SupabaseSpendStore.ts";

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
/** How long the latest directory call took; printed (and cleared) by the
 * next `check`. Null when the check did not call the directory. */
let lastCallMs: number | null = null;

const directory: AccountDirectory = timeEveryCall(
  createSupabaseAccountDirectory({
    url,
    secretKey,
    timeoutMs: 10_000,
  }),
);

const CODE_SHAPE = /^\d{8}$/;

let failures = 0;

function check(label: string, pass: boolean, detail: string): void {
  if (!pass) {
    failures += 1;
  }

  const took = lastCallMs === null ? "" : `, ${lastCallMs} ms`;
  lastCallMs = null;

  console.log(`  ${pass ? "✓" : "✗"} ${label} (${detail}${took})`);
}

/** Runs one directory call and records its duration in `lastCallMs`. */
async function recordDuration<T>(run: () => Promise<T>): Promise<T> {
  const started = performance.now();

  try {
    return await run();
  } finally {
    lastCallMs = Math.round(performance.now() - started);
  }
}

/** The same directory, with every call's duration recorded. */
function timeEveryCall(inner: AccountDirectory): AccountDirectory {
  return {
    kind: inner.kind,
    signUp: (input: SignUpInput, ip: string): Promise<SignUpOutcome> => {
      return recordDuration(() => {
        return inner.signUp(input, ip);
      });
    },
    resendCode: (address: string, ip: string): Promise<SendOutcome> => {
      return recordDuration(() => {
        return inner.resendCode(address, ip);
      });
    },
    confirmEmail: (
      address: string,
      code: string,
      password: string,
      ip: string,
    ): Promise<ConfirmOutcome> => {
      return recordDuration(() => {
        return inner.confirmEmail(address, code, password, ip);
      });
    },
    checkPassword: (
      address: string,
      password: string,
      ip: string,
    ): Promise<PasswordCheck> => {
      return recordDuration(() => {
        return inner.checkPassword(address, password, ip);
      });
    },
    requestReset: (address: string, ip: string): Promise<SendOutcome> => {
      return recordDuration(() => {
        return inner.requestReset(address, ip);
      });
    },
    resetPassword: (
      address: string,
      code: string,
      password: string,
      ip: string,
    ): Promise<ResetOutcome> => {
      return recordDuration(() => {
        return inner.resetPassword(address, code, password, ip);
      });
    },
    findAccount: (accountId: string): Promise<AccountLookup> => {
      return recordDuration(() => {
        return inner.findAccount(accountId);
      });
    },
    findByEmail: (address: string): Promise<AccountLookup> => {
      return recordDuration(() => {
        return inner.findByEmail(address);
      });
    },
    purgeUnconfirmedBefore: (
      cutoffMs: number,
      limit: number,
    ): Promise<PurgeOutcome> => {
      return recordDuration(() => {
        return inner.purgeUnconfirmedBefore(cutoffMs, limit);
      });
    },
    countRegistrationsSince: (sinceMs: number): Promise<RegistrationCount> => {
      return recordDuration(() => {
        return inner.countRegistrationsSince(sinceMs);
      });
    },
    ping: (): Promise<boolean> => {
      return recordDuration(() => {
        return inner.ping();
      });
    },
    listAccounts: (limit: number): Promise<AccountListing> => {
      return recordDuration(() => {
        return inner.listAccounts(limit);
      });
    },
    setApproved: (accountId: string): Promise<AdminWrite> => {
      return recordDuration(() => {
        return inner.setApproved(accountId);
      });
    },
    setBlocked: (
      accountId: string,
      blocked: boolean,
      stampAtMs: number,
    ): Promise<AdminWrite> => {
      return recordDuration(() => {
        return inner.setBlocked(accountId, blocked, stampAtMs);
      });
    },
    rename: (
      accountId: string,
      displayName: string,
      stampAtMs: number,
    ): Promise<AdminWrite> => {
      return recordDuration(() => {
        return inner.rename(accountId, displayName, stampAtMs);
      });
    },
    deleteAccount: (accountId: string): Promise<AdminWrite> => {
      return recordDuration(() => {
        return inner.deleteAccount(accountId);
      });
    },
    revokeSessions: (
      accountId: string,
      stampAtMs: number,
    ): Promise<AdminWrite> => {
      return recordDuration(() => {
        return inner.revokeSessions(accountId, stampAtMs);
      });
    },
  };
}

/** The server refuses any code that is not eight digits before it reaches
 * Supabase, so a project still sending six would fail every confirmation.
 * The probe calls the directory directly and would not notice otherwise. */
function checkCodeLength(label: string, code: string): void {
  check(
    `${label} is eight digits`,
    CODE_SHAPE.test(code),
    CODE_SHAPE.test(code)
      ? `${code.length} digits`
      : "set Email OTP length to 8 in the project's Auth settings",
  );
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

const SPEND_PROBE_DAY = "2000-01-01";
const SPEND_PROBE_OWNER = "roster:__probe__";
const SPEND_PROBE_USD = 0.01;
const EPSILON = 1e-9;

/** Deletes the spend rows the probe wrote: its own owner row and the house
 * row for the sentinel day. Returns the PostgREST status. */
async function deleteSpendRows(): Promise<number> {
  const owners = ["house", SPEND_PROBE_OWNER]
    .map((owner) => {
      return encodeURIComponent(`"${owner}"`);
    })
    .join(",");

  const response = await fetch(
    `${url.replace(/\/+$/, "")}/rest/v1/jarvis_spend_daily?day=eq.${SPEND_PROBE_DAY}&owner=in.(${owners})`,
    {
      method: "DELETE",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  return response.status;
}

/** Runs the budget's SQL function and table on the live project. */
async function probeSpendStore(): Promise<void> {
  const spend = createSupabaseSpendStore({ url, secretKey, timeoutMs: 10_000 });

  try {
    await spend.record(
      SPEND_PROBE_OWNER,
      SPEND_PROBE_DAY,
      "house",
      SPEND_PROBE_USD,
    );
    const second = await spend.record(
      SPEND_PROBE_OWNER,
      SPEND_PROBE_DAY,
      "house",
      SPEND_PROBE_USD,
    );
    check(
      "record_jarvis_spend adds up an owner's day",
      second !== "unavailable" &&
        Math.abs(second.ownerUsd - 2 * SPEND_PROBE_USD) < EPSILON &&
        second.houseUsd >= 2 * SPEND_PROBE_USD - EPSILON,
      second === "unavailable"
        ? second
        : `owner ${second.ownerUsd}, house ${second.houseUsd}`,
    );

    const read = await spend.read(SPEND_PROBE_OWNER, SPEND_PROBE_DAY, "house");
    check(
      "the spend table reads the totals back",
      read !== "unavailable" &&
        Math.abs(read.ownerUsd - 2 * SPEND_PROBE_USD) < EPSILON &&
        read.houseUsd >= 2 * SPEND_PROBE_USD - EPSILON,
      read === "unavailable"
        ? read
        : `owner ${read.ownerUsd}, house ${read.houseUsd}`,
    );
  } finally {
    const status = await deleteSpendRows();
    check(
      "spend cleanup",
      status >= 200 && status < 300,
      `day ${SPEND_PROBE_DAY}, delete answered ${status}`,
    );
  }
}

console.log("accounts probe: starting");
check("ping", await directory.ping(), "profiles table reachable");

const signup: GeneratedLink = await generateCode("signup");
checkCodeLength("the sign-up code", signup.email_otp);

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
    "00000000",
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

  const byEmail = await directory.findByEmail(email);
  check(
    "findByEmail finds the account by its address",
    byEmail.outcome === "found" && byEmail.account.id === signup.id,
    byEmail.outcome === "found" ? byEmail.account.status : byEmail.outcome,
  );

  const nobody = await directory.findByEmail(
    `probe-nobody-${Date.now()}@${emailDomain}`,
  );
  check(
    "findByEmail is missing for an unknown address",
    nobody.outcome === "missing",
    nobody.outcome,
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
  checkCodeLength("the recovery code", recovery.email_otp);
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
  check(
    "password reset",
    typeof reset === "object" && reset.outcome === "changed",
    typeof reset === "object" ? reset.outcome : reset,
  );

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

await probeSpendStore();

console.log(
  failures === 0
    ? "accounts probe: PASS"
    : `accounts probe: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
