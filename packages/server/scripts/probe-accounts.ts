#!/usr/bin/env tsx
/**
 * Live check of `SupabaseAccountDirectory` against a REAL project. The unit
 * tests replay Supabase's documented responses; this proves the real ones
 * still match. It needs SUPABASE_URL and SUPABASE_SECRET_KEY, creates ONE
 * throwaway account through the admin API (so no email is sent and no inbox
 * is needed), walks it through confirm → sign-in → reset, and deletes it.
 *
 *   SUPABASE_URL=… SUPABASE_SECRET_KEY=… pnpm --filter @rtc/server accounts:probe
 *
 * Prints account ids and outcomes only — never a key, a password or a code.
 */
import type { AccountDirectory } from "../src/accounts/AccountDirectory.ts";
import { createSupabaseAccountDirectory } from "../src/accounts/SupabaseAccountDirectory.ts";

const url: string = process.env.SUPABASE_URL ?? "";
const secretKey: string = process.env.SUPABASE_SECRET_KEY ?? "";

if (url === "" || secretKey === "") {
  console.error("probe: set SUPABASE_URL and SUPABASE_SECRET_KEY");
  process.exit(2);
}

const PROBE_IP = "203.0.113.1";
const email = `probe-${Date.now()}@rtc-probe.dev`;
const firstPassword = "Probe2026!first";
const secondPassword = "Probe2026!second";
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
      body: JSON.stringify({
        type,
        email,
        password: firstPassword,
        data: { display_name: "Probe Account" },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`generate_link ${type} answered ${response.status}`);
  }

  return (await response.json()) as GeneratedLink;
}

async function deleteAccount(accountId: string): Promise<number> {
  const response = await fetch(
    `${url.replace(/\/+$/, "")}/auth/v1/admin/users/${accountId}`,
    {
      method: "DELETE",
      headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` },
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

  const wrong = await directory.confirmEmail(email, "000000", PROBE_IP);
  check("a wrong code", wrong === "invalid_code", wrong);

  const confirmed = await directory.confirmEmail(
    email,
    signup.email_otp,
    PROBE_IP,
  );
  check("the right code", confirmed === "confirmed", confirmed);

  const after = await directory.checkPassword(email, firstPassword, PROBE_IP);
  check("sign-in after confirming", after.outcome === "match", after.outcome);

  const bad = await directory.checkPassword(email, "Wrong2026!pass", PROBE_IP);
  check("a wrong password", bad.outcome === "invalid", bad.outcome);

  const found = await directory.findAccount(signup.id);
  check(
    "the profile row",
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

  const recovery = await generateCode("recovery");
  const reset = await directory.resetPassword(
    email,
    recovery.email_otp,
    secondPassword,
    PROBE_IP,
  );
  check("password reset", reset === "changed", reset);

  const relogin = await directory.checkPassword(
    email,
    secondPassword,
    PROBE_IP,
  );
  check(
    "sign-in with the new password",
    relogin.outcome === "match",
    relogin.outcome,
  );
} finally {
  const status = await deleteAccount(signup.id);
  check("cleanup", status === 200, `delete answered ${status}`);
}

console.log(
  failures === 0
    ? "accounts probe: PASS"
    : `accounts probe: FAIL (${failures})`,
);
process.exit(failures === 0 ? 0 : 1);
