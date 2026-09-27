export interface BootErrorPage {
  /** Clicks the "Load the default core" button `renderBootError` wrote into
   *  `root`. */
  clickReset(root: HTMLElement): void;
}

/** The framework surface for `bootApp.test.ts`'s `renderBootError` case:
 *  `renderBootError` writes plain DOM (no React/Solid), so this page hides
 *  the raw `querySelector` behind a semantic verb instead of a
 *  testing-library render. */
export function bootErrorPage(): BootErrorPage {
  return {
    clickReset(root: HTMLElement): void {
      root.querySelector("button")?.click();
    },
  };
}
