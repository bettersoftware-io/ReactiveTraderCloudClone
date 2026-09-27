/**
 * Drops the `--` separator that pnpm forwards verbatim.
 *
 * `pnpm --filter @rtc/tests test:browser:playwright -- layout` reaches
 * `with-server.ts` as `playwright test --config … -- layout`. Playwright reads
 * everything after a bare `--` as not-a-filter, so the whole suite ran and
 * the filter was silently ignored. Only the FIRST bare `--` is the
 * separator; a later one belongs to the child and is kept.
 */
export function dropArgSeparator(args: readonly string[]): string[] {
  const index = args.indexOf("--");

  if (index === -1) {
    return [...args];
  }

  return [...args.slice(0, index), ...args.slice(index + 1)];
}
