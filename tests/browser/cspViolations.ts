import type { BrowserContext, ConsoleMessage } from "@playwright/test";

/** True when a console line is the browser reporting a Content-Security-Policy
 *  block ("Refused to load the script ... violates the following Content
 *  Security Policy directive ..."). */
function isCspViolation(text: string): boolean {
  return /Content.Security.Policy/i.test(text);
}

/** Collect every CSP violation any page of `context` logs — the app, the
 *  `/devtools/` inspector and a dockview pop-out alike. The returned array
 *  fills as the test runs. */
export function watchCspViolations(context: BrowserContext): string[] {
  const violations: string[] = [];
  context.on("console", (message: ConsoleMessage) => {
    if (isCspViolation(message.text())) {
      violations.push(message.text());
    }
  });

  return violations;
}
