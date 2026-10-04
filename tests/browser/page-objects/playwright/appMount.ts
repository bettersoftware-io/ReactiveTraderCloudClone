import type { Page } from "@playwright/test";

import { TESTIDS } from "../contracts/testids.ts";

/**
 * Upper bound on a load's boot: navigation `load` → the chosen application
 * core resolved (a lazy chunk for async/Effect) → the first render into
 * `#root`. Generous against a loaded runner; a healthy boot takes well under
 * a second.
 */
const APP_MOUNT_TIMEOUT_MS = 15_000;

/** What the in-page mount probe settles on. */
type MountOutcome = "mounted" | "boot-error";

/**
 * Runs `navigate` (a `goto` or `reload`) and then waits until the app has
 * actually MOUNTED — `page.goto` alone only waits for the document's `load`
 * event, which was enough while boot was synchronous but not since the
 * async/Effect cores load through a dynamic `import()`: `main.tsx` renders
 * only once `bootCore` resolves, so a bare `goto` can return on an empty
 * `#root`.
 *
 * Mounted means `<html data-core-impl>` is set (published by `main.tsx` once
 * the core resolved) AND `#root` has rendered children. A load that ends on
 * the plain-DOM boot-error screen (`renderBootError`, the chunk-load failure
 * path) or throws at module init (an invalid `VITE_CORE_IMPL`) fails HERE with
 * that failure's own message, instead of surfacing later as an opaque locator
 * timeout on a blank page.
 */
export async function navigateAndAwaitMount(
  page: Page,
  navigate: () => Promise<unknown>,
): Promise<void> {
  const pageErrors: string[] = [];

  function recordPageError(error: Error): void {
    pageErrors.push(error.message);
  }

  page.on("pageerror", recordPageError);

  try {
    await navigate();
    await awaitAppMount(page, pageErrors);
  } finally {
    page.off("pageerror", recordPageError);
  }
}

/**
 * Waits (only — no navigation) until the app has mounted; see
 * `navigateAndAwaitMount`. `pageErrors` are the page errors the caller
 * captured during the load, quoted in the timeout message.
 */
export async function awaitAppMount(
  page: Page,
  pageErrors: readonly string[],
): Promise<void> {
  let outcome: MountOutcome;

  try {
    const handle = await page.waitForFunction(
      (resetTestId: string): MountOutcome | false => {
        const root = document.getElementById("root");

        if (root === null || root.childElementCount === 0) {
          return false;
        }

        if (root.querySelector(`[data-testid="${resetTestId}"]`) !== null) {
          return "boot-error";
        }

        return document.documentElement.dataset.coreImpl === undefined
          ? false
          : "mounted";
      },
      TESTIDS.boot.coreReset,
      { timeout: APP_MOUNT_TIMEOUT_MS },
    );
    outcome = (await handle.jsonValue()) as MountOutcome;
  } catch (error) {
    throw new Error(
      `the app did not mount within ${APP_MOUNT_TIMEOUT_MS}ms${describePageErrors(pageErrors)}`,
      { cause: error },
    );
  }

  if (outcome === "boot-error") {
    const text = await page.locator("#root").innerText();
    throw new Error(`the app failed to boot: ${text}`);
  }
}

function describePageErrors(pageErrors: readonly string[]): string {
  return pageErrors.length === 0
    ? " (no page error was thrown)"
    : ` — page errors: ${pageErrors.join(" | ")}`;
}
