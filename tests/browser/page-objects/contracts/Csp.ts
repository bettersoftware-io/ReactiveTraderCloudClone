/**
 * The Content-Security-Policy as the browser enforces it. Playwright-only,
 * like {@link InspectorPO}: it needs the raw response headers and a script
 * injected into the page, neither of which the shared drivers offer.
 */
/** What an injected-script attempt did. */
export interface InjectionOutcome {
  inlineRan: boolean;
}

export interface CspPO {
  /** The `Content-Security-Policy` response header the server sends for
   *  `path`, or undefined when there is none. */
  policyHeader(path: string): Promise<string | undefined>;
  /** From inside the open app page, append an inline `<script>` and a
   *  `<script src>` from another origin. Resolves with whether the inline one
   *  ran (it must not have) once the browser has settled both. */
  injectScripts(foreignSrc: string): Promise<InjectionOutcome>;
}
