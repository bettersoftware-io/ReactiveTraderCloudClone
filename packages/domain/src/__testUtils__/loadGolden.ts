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
 *
 * @param name - fixture name (without `.original.json` extension)
 * @param baseUrl - `import.meta.url` of the calling test file; defaults to
 *   this module's URL so existing callers that omit the arg still work.
 */
export function loadGolden<TCase>(
  name: string,
  baseUrl: string = import.meta.url,
): Golden<TCase> {
  const url = new URL(`./__golden__/${name}.original.json`, baseUrl);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as Golden<TCase>;
}
