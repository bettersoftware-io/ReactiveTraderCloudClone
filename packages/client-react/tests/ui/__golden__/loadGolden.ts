import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface Golden<TCase> {
  readonly _source: string;
  readonly cases: readonly TCase[];
}

/**
 * Loads a golden fixture lifted from the original ReactiveTraderCloud codebase
 * (commit 4a31f01). Fixtures live under tests/ui/__golden__/<name>.original.json
 * with a `_source` header citing the original file:line.
 *
 * Resolution strategy: use import.meta.url when it is an absolute filesystem
 * URL; fall back to process.cwd() when vitest jsdom exposes a synthetic virtual
 * URL (e.g. "file:///tests/ui/__golden__/...") whose decoded path lacks the
 * host-filesystem prefix.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const jsonName = `${name}.original.json`;
  const candidate = fileURLToPath(new URL(`./${jsonName}`, import.meta.url));
  // Vitest jsdom virtualises module URLs: the decoded path may start with
  // "/tests/…" (a synthetic root-relative path, not a real filesystem path).
  // Detect by checking whether the candidate is under a real directory; fall
  // back to cwd-anchored resolution (vitest sets cwd = package root).
  const filePath = candidate.startsWith("/tests/")
    ? resolve(process.cwd(), candidate.slice(1)) // strip leading "/" then join with cwd
    : candidate;
  return JSON.parse(readFileSync(filePath, "utf8")) as Golden<TCase>;
}
