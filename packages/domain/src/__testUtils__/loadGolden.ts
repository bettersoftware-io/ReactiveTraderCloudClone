import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface Golden<TCase> {
  readonly _source: string;
  readonly cases: readonly TCase[];
}

/**
 * Loads a golden fixture lifted from the original ReactiveTraderCloud codebase.
 * Fixtures live next to the test that consumes them under `__golden__/` and are
 * named `<name>.original.json`, with a `_source` header citing the original
 * commit + file:line the expected values were derived from.
 */
export function loadGolden<TCase>(name: string): Golden<TCase> {
  const url = new URL(`./__golden__/${name}.original.json`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Golden<TCase>;
}
