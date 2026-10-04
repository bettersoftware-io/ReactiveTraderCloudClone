// Every client dev server the e2e harness starts gets RTC_LEAN_DEPS=1, which
// both clients' vite.config.ts read: pre-bundled dependencies are then served
// minified and without a source map. Why it matters: each test opens a fresh
// browser context, so every test downloads every dependency again, and Vite
// appends each one's source map to the response — `effect` alone was 11 MB per
// page load, the main reason the effect-core e2e job ran ~1.65x the default
// one (measured 2026-10-04; the numbers live beside the switch in
// vite.config.ts and in tests/README.md).
//
// The switch leans on Vite internals (a transform hook answering "no source
// map"), so a Vite upgrade could silently bring the maps back and the slowness
// with them. `assertDepsServedLean` makes that loud: it reads the entry module's
// dependencies, plus one import-free dependency, off the freshly started
// server and fails the run if any of them has a map attached.

export const LEAN_DEPS_ENV: Readonly<Record<string, string>> = {
  RTC_LEAN_DEPS: "1",
};

/** Fetches a URL's body as text; injected so the check is testable offline. */
export type FetchText = (url: string) => Promise<string>;

/** The app's entry module in the dev server's index.html — the first module
 * script that is not one of Vite's own (`/@vite/client`, `/@react-refresh`). */
export function findEntryModuleUrl(html: string): string | null {
  for (const match of html.matchAll(MODULE_SCRIPT_RE)) {
    const src = match[1];

    if (src !== undefined && !src.startsWith("/@")) {
      return src;
    }
  }

  return null;
}

/** Every pre-bundled dependency a transformed module imports, once each. */
export function findDepUrls(moduleCode: string): string[] {
  return [...new Set(moduleCode.match(DEP_URL_RE) ?? [])];
}

export function carriesInlineSourceMap(code: string): boolean {
  return code.includes("//# sourceMappingURL=data:");
}

/**
 * Fails unless the dev server at `origin` serves its pre-bundled dependencies
 * without an inline source map. Finding NO dependency to inspect is a failure
 * too — an empty reading must never pass as a clean one.
 */
export async function assertDepsServedLean(
  origin: string,
  fetchText: FetchText,
): Promise<void> {
  const entryUrl = findEntryModuleUrl(await fetchText(`${origin}/`));

  if (entryUrl === null) {
    throw new Error(
      `lean-deps check: no entry module script in ${origin}/ — cannot tell whether dependencies are served lean`,
    );
  }

  const depUrls = findDepUrls(await fetchText(`${origin}${entryUrl}`));

  if (depUrls.length === 0) {
    throw new Error(
      `lean-deps check: ${entryUrl} imports no pre-bundled dependency — cannot tell whether dependencies are served lean`,
    );
  }

  for (const depUrl of [...depUrls, IMPORT_FREE_DEP_URL]) {
    if (carriesInlineSourceMap(await fetchText(`${origin}${depUrl}`))) {
      throw new Error(
        `lean-deps check: ${depUrl} is served WITH an inline source map although the harness set RTC_LEAN_DEPS=1. ` +
          "Every e2e page load now re-downloads every dependency's map (11 MB for `effect`), which is the main thing " +
          "that made the effect-core e2e job ~1.65x slower. See `dropDepSourcemaps` in the client's vite.config.ts.",
      );
    }
  }
}

// A dependency with no imports of its own, which both web clients load (via
// @rtc/layout-dockview). The entry module's dependencies all import a shared
// chunk, so Vite rewrites their code anyway; this one it leaves byte-identical,
// which is the case where Vite would keep the loaded map — the reason the
// switch's transform appends a newline. Sampling it keeps that path guarded.
// If dockview ever stops being a dependency this fetch fails loudly: pick
// another import-free one.
const IMPORT_FREE_DEP_URL = "/node_modules/.vite/deps/dockview.js";

const MODULE_SCRIPT_RE = /<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g;

const DEP_URL_RE = /\/node_modules\/\.vite\/deps\/[^"'\s]+/g;
