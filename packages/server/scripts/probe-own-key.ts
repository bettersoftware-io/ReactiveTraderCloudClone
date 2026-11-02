#!/usr/bin/env tsx
/**
 * Live check of the bring-your-own-key models against a REAL provider, run
 * by hand before a change to the curated list merges (spec §5.1), never in
 * CI. It checks the key where the server does (and prints that URL), then
 * runs one tool-calling turn on each listed model of the provider, through
 * the loop and provider config the server uses, and prints PASS or FAIL per
 * model. A FAIL drops that model from the list. Each turn costs a fraction
 * of a cent on the key.
 *
 *   RTC_PROBE_KEY_FILE=/path/to/key-file pnpm --filter @rtc/server own-key:probe <anthropic|openrouter|openai>
 *
 * The key is read from the file named by RTC_PROBE_KEY_FILE, never from an
 * argument (a shell's history and the process list would keep it). Nothing
 * printed contains the key: a refused request shows its status and error
 * type, never the provider's message. Exit status: 0 when every line
 * passed, 1 when any failed, 2 on a usage error.
 */
import { readFileSync } from "node:fs";

import { JARVIS_OWN_PROVIDERS, type JarvisProvider } from "@rtc/domain";

import { probeOwnKey } from "../src/agent/ownKeyProbe.ts";

const USAGE =
  "usage: RTC_PROBE_KEY_FILE=<path> pnpm --filter @rtc/server own-key:probe <" +
  `${JARVIS_OWN_PROVIDERS.join("|")}>`;

function isOwnProvider(value: string | undefined): value is JarvisProvider {
  return (JARVIS_OWN_PROVIDERS as readonly (string | undefined)[]).includes(
    value,
  );
}

const args: readonly string[] = process.argv.slice(2);
const provider: string | undefined = args[0];
const keyFile: string = process.env.RTC_PROBE_KEY_FILE ?? "";

if (args.length !== 1 || !isOwnProvider(provider)) {
  console.error(
    `probe: name one provider, and nothing else (the key goes in a file)\n${USAGE}`,
  );
  process.exit(2);
}

if (keyFile === "") {
  console.error(
    `probe: set RTC_PROBE_KEY_FILE to the key file's path\n${USAGE}`,
  );
  process.exit(2);
}

let key: string;

try {
  key = readFileSync(keyFile, "utf8").trim();
} catch (error) {
  // The error's code only: its message names the path, not the key, but
  // nothing about the file goes further than this.
  const code =
    error instanceof Error && "code" in error ? String(error.code) : "unknown";
  console.error(`probe: cannot read RTC_PROBE_KEY_FILE (${code})`);
  process.exit(2);
}

if (key === "") {
  console.error("probe: the key file is empty");
  process.exit(2);
}

console.log(`probe: ${provider}`);

const passed: boolean = await probeOwnKey({
  provider,
  key,
  fetchFn: fetch,
  print: (line: string): void => {
    console.log(line);
  },
});

console.log(passed ? "probe: all passed" : "probe: some failed");
process.exit(passed ? 0 : 1);
