import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Golden<TCase> {
  readonly _source: string;
  readonly cases: readonly TCase[];
}

/**
 * Loads a golden fixture lifted from the original ReactiveTraderCloud codebase
 * (commit 4a31f01). Fixtures live under tests/ui/__golden__/<name>.original.json
 * with a `_source` header citing the original file:line.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const url = new URL(`./${name}.original.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Golden<TCase>;
}
