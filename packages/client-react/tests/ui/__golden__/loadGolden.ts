import { existsSync, readFileSync } from "node:fs";
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
 * Resolution strategy: compute the candidate path from import.meta.url and use
 * it when it exists on the real filesystem (node env: import.meta.url is a true
 * filesystem URL so fileURLToPath yields a real path). If the candidate does not
 * exist, fall back to cwd-anchored resolution — vitest jsdom virtualises module
 * URLs, so fileURLToPath may return a synthetic path that doesn't exist on disk;
 * stripping the leading separator and joining with process.cwd() (the package
 * root) recovers the real path.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const jsonName = `${name}.original.json`;
  const candidate = fileURLToPath(new URL(`./${jsonName}`, import.meta.url));
  // If the candidate is a real filesystem path, use it directly; otherwise fall
  // back to cwd-anchored resolution for vitest jsdom's virtual module URLs.
  const filePath = existsSync(candidate)
    ? candidate
    : resolve(process.cwd(), candidate.replace(/^[/\\]/, ""));
  return JSON.parse(readFileSync(filePath, "utf8")) as Golden<TCase>;
}
