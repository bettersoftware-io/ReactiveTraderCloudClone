import type { Page } from "@playwright/test";

import type { CspPO, InjectionOutcome } from "../contracts/Csp.ts";

/** The flag the injected inline script sets if it runs. */
interface FlagWindow {
  __cspInlineRan?: boolean;
}

/** Playwright impl of {@link CspPO}. */
export class PlaywrightCsp implements CspPO {
  private readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async policyHeader(path: string): Promise<string | undefined> {
    const response = await this.page.request.get(path);

    return response.headers()["content-security-policy"];
  }

  async injectScripts(foreignSrc: string): Promise<InjectionOutcome> {
    return this.page.evaluate(async (src: string) => {
      const inline = document.createElement("script");
      inline.textContent = "window.__cspInlineRan = true;";
      document.head.append(inline);

      // A blocked script fires `error` at once; an allowed one would try the
      // network. Either way the event settles, so the wait is bounded.
      const foreign = document.createElement("script");
      foreign.src = src;
      await new Promise<void>((resolve) => {
        foreign.addEventListener("error", () => {
          resolve();
        });
        foreign.addEventListener("load", () => {
          resolve();
        });
        document.head.append(foreign);
      });

      return {
        inlineRan: (window as unknown as FlagWindow).__cspInlineRan === true,
      };
    }, foreignSrc);
  }
}
