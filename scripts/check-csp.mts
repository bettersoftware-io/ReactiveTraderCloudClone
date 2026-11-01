// Asserts both web clients ship the same Content-Security-Policy and that it
// keeps the properties the B3c design depends on: no script from anywhere but
// our own origin, no plugins, no <base> rewriting, no framing.
//
// The policy lives in `vercel.react.json` and `vercel.solid.json` (Vercel sends
// it as a response header). Each client's vite.config.ts reads the same value
// for `vite preview`, so the Playwright suites run under the real policy. This
// gate keeps the two Vercel files identical; nothing else holds them together.
//
// `--dist <dir> <config>` also checks a build: see checkDist.
//
// Zero dependencies (Node built-ins only). Chained from `pnpm check:scripts`.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const CONFIGS = ["vercel.react.json", "vercel.solid.json"] as const;

interface VercelHeader {
  readonly key: string;
  readonly value: string;
}

interface VercelHeaderRule {
  readonly source: string;
  readonly headers: readonly VercelHeader[];
}

interface VercelConfig {
  readonly headers?: readonly VercelHeaderRule[];
}

/** The policy a config sends on `/(.*)`, or undefined when it sends none. */
function policyOf(file: string): string | undefined {
  const config = JSON.parse(
    readFileSync(join(repoRoot, file), "utf8"),
  ) as VercelConfig;

  const rule = config.headers?.find((candidate) => {
    return candidate.source === "/(.*)";
  });

  return rule?.headers.find((header) => {
    return header.key === "Content-Security-Policy";
  })?.value;
}

/** The sources of one directive, or undefined when the policy omits it. */
function directive(policy: string, name: string): string | undefined {
  for (const part of policy.split(";")) {
    const [head, ...sources] = part.trim().split(/\s+/);

    if (head === name) {
      return sources.join(" ");
    }
  }

  return undefined;
}

/** Every `https://host` the policy's connect-src allows. */
function connectHosts(policy: string): string[] {
  return (directive(policy, "connect-src") ?? "")
    .split(/\s+/)
    .filter((source) => {
      return source.startsWith("https://");
    })
    .map((source) => {
      return source.slice("https://".length);
    });
}

/** `--dist <dir> <config>`: fail unless the built bundle in `<dir>` names a
 * host the config's connect-src allows (deploy.yml runs this per client). A
 * server that moved would otherwise be blocked by the browser at runtime. */
function checkDist(dir: string, file: string): string[] {
  const policy = policyOf(file);

  if (policy === undefined) {
    return [`${file}: no Content-Security-Policy header on source "/(.*)"`];
  }

  const hosts = connectHosts(policy);
  const bundle = collectText(join(repoRoot, dir));
  const named = hosts.filter((host) => {
    return bundle.includes(host);
  });

  return named.length > 0
    ? []
    : [
        `${dir} names none of the hosts ${file} allows in connect-src (${hosts.join(", ")}) — the browser would block the client's server`,
      ];
}

/** All file contents under `dir`, concatenated. */
function collectText(dir: string): string {
  let text = "";

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    text += entry.isDirectory()
      ? collectText(path)
      : readFileSync(path, "utf8");
  }

  return text;
}

const distFlag = process.argv.indexOf("--dist");

if (distFlag !== -1) {
  const problems = checkDist(
    process.argv[distFlag + 1],
    process.argv[distFlag + 2],
  );

  for (const problem of problems) {
    console.error(`FAIL ${problem}`);
  }

  if (problems.length > 0) {
    process.exit(1);
  }

  console.log("OK: the bundle names a host the CSP allows.");
  process.exit(0);
}

const failures: string[] = [];
const policies = new Map<string, string>();

for (const file of CONFIGS) {
  const policy = policyOf(file);

  if (policy === undefined) {
    failures.push(
      `${file}: no Content-Security-Policy header on source "/(.*)"`,
    );
    continue;
  }

  policies.set(file, policy);

  const checks: ReadonlyArray<readonly [string, string]> = [
    ["default-src", "'self'"],
    ["script-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["frame-ancestors", "'none'"],
  ];

  // script-src-elem and script-src-attr override script-src for their own
  // kind of script, so either one could quietly re-allow inline script.
  for (const name of ["script-src-elem", "script-src-attr"]) {
    if (directive(policy, name) !== undefined) {
      failures.push(
        `${file}: ${name} must not be set — it overrides script-src`,
      );
    }
  }

  for (const [name, expected] of checks) {
    const actual = directive(policy, name);

    if (actual !== expected) {
      failures.push(
        `${file}: ${name} must be exactly ${expected}, found ${actual ?? "(absent)"}`,
      );
    }
  }
}

if (new Set(policies.values()).size > 1) {
  failures.push(
    `${CONFIGS.join(" and ")} carry different Content-Security-Policy values — the two clients must send the same policy`,
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }

  process.exit(1);
}

console.log("OK: both clients send the same Content-Security-Policy.");
