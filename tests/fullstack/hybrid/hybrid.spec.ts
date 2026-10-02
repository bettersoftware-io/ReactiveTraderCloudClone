import {
  expect,
  type Frame,
  type Page,
  type Request,
  test,
  type WebSocket,
} from "@playwright/test";

import { TESTIDS } from "#/browser/page-objects/contracts/testids.js";

/**
 * The hybrid build's one security property (hardening spec §8.4): demo
 * credentials are verified in the browser and never reach the server. The
 * launcher starts the server with the e2e roster `demo:demo` and the client
 * with `VITE_DEMO_AUTH={"demo":"mcdc2026"}`, so the SAME username has one
 * local and one server password — which is exactly what credential-match
 * routing must tell apart. Playwright contexts are fresh per test, so the
 * stored choice and session start empty each time.
 */
test.describe("hybrid data source", () => {
  test("demo credentials sign in locally: no request to the server, no reload, choice = sim", async ({
    page,
  }) => {
    const serverHits = recordServerRequests(page);
    const navigations = countMainFrameNavigations(page);

    await page.goto("/");
    const navigationsAfterLoad = navigations.count();
    await signIn(page, "demo", DEMO_PASSWORD);

    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByTestId(TESTIDS.shell.header)).toBeVisible({
      timeout: SETTLE_TIMEOUT_MS,
    });
    expect(serverHits).toEqual([]);
    expect(navigations.count()).toBe(navigationsAfterLoad);
    // Only the routing port writes this key — a plain live or sim page never
    // does — so "sim" here also witnesses that the page WAS composed hybrid.
    await expect
      .poll(() => {
        return readDataSourceChoice(page);
      })
      .toBe("sim");
  });

  test("server credentials reload once into the live composition and open a WebSocket", async ({
    page,
  }) => {
    const serverHits = recordServerRequests(page);
    const sockets = recordWebSockets(page);
    const navigations = countMainFrameNavigations(page);

    await page.goto("/");
    const navigationsAfterLoad = navigations.count();
    const reloaded = waitForMainFrameNavigation(page);
    await signIn(page, "demo", SERVER_PASSWORD);
    await reloaded;

    // The reloaded page resumes the stored session into the live composition:
    // no login screen, the socket opens with the stored token (spec §8.3 step 4).
    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect
      .poll(
        () => {
          return sockets.some((url) => {
            return url.includes(SERVER_ORIGIN);
          });
        },
        { timeout: SETTLE_TIMEOUT_MS },
      )
      .toBe(true);
    expect(
      serverHits.some((url) => {
        return url.endsWith("/login");
      }),
    ).toBe(true);
    expect(navigations.count()).toBe(navigationsAfterLoad + 1);
    expect(await readDataSourceChoice(page)).toBe("live");
  });

  test("a second visit with a stored live choice boots live without a reload", async ({
    page,
  }) => {
    await page.goto("/");
    const reloaded = waitForMainFrameNavigation(page);
    await signIn(page, "demo", SERVER_PASSWORD);
    await reloaded;
    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({
      timeout: SETTLE_TIMEOUT_MS,
    });

    const navigations = countMainFrameNavigations(page);
    await page.goto("/");
    const navigationsAfterLoad = navigations.count();

    // Session restored, live composed, no login screen and no further
    // navigation (spec §8.3 step 5).
    await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeHidden({
      timeout: SETTLE_TIMEOUT_MS,
    });
    await expect(page.getByTestId(TESTIDS.shell.header)).toBeVisible({
      timeout: SETTLE_TIMEOUT_MS,
    });
    expect(navigations.count()).toBe(navigationsAfterLoad);
    expect(await readDataSourceChoice(page)).toBe("live");
  });
});

/** Drives the real LoginScreen: username, password, AUTHENTICATE. */
async function signIn(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await expect(page.getByTestId(TESTIDS.auth.loginScreen)).toBeVisible({
    timeout: SETTLE_TIMEOUT_MS,
  });
  await page.getByTestId(TESTIDS.auth.loginUsername).fill(username);
  await page.getByTestId(TESTIDS.auth.loginPassword).fill(password);
  await page.getByTestId(TESTIDS.auth.loginSubmit).click();
}

/** Collects the URL of every request the page sends to the real server. */
function recordServerRequests(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request: Request) => {
    if (request.url().includes(SERVER_ORIGIN)) {
      hits.push(request.url());
    }
  });
  return hits;
}

/** Collects the URL of every WebSocket the page opens. */
function recordWebSockets(page: Page): string[] {
  const sockets: string[] = [];
  page.on("websocket", (ws: WebSocket) => {
    sockets.push(ws.url());
  });
  return sockets;
}

/** A running count of main-frame navigations since it was armed. */
interface NavigationCounter {
  readonly count: () => number;
}

/** Counts main-frame navigations from now on — a `goto` or a reload each
 * add one; the app performs no same-document (History API) navigations. */
function countMainFrameNavigations(page: Page): NavigationCounter {
  let navigations = 0;
  page.on("framenavigated", (frame: Frame) => {
    if (frame === page.mainFrame()) {
      navigations += 1;
    }
  });
  return {
    count: () => {
      return navigations;
    },
  };
}

/** Resolves on the next main-frame navigation (the mode-change reload). */
function waitForMainFrameNavigation(page: Page): Promise<Frame> {
  return page.waitForEvent("framenavigated", {
    predicate: (frame: Frame) => {
      return frame === page.mainFrame();
    },
    timeout: SETTLE_TIMEOUT_MS,
  });
}

/** The stored data-source choice, or null when nothing wrote it. */
function readDataSourceChoice(page: Page): Promise<string | null> {
  return page.evaluate((key: string) => {
    return localStorage.getItem(key);
  }, DATA_SOURCE_KEY);
}

// The real server's origin (forwarded by fullstack/hybrid-smoke.ts as
// FULLSTACK_PORT). Everything the page sends there — the /login POST, the
// WebSocket upgrade — is what the first test must see NONE of.
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4125);

const SERVER_ORIGIN = `127.0.0.1:${SERVER_PORT}`;

/** `DATA_SOURCE_STORAGE_KEY` in @rtc/client-core — the stored choice. */
const DATA_SOURCE_KEY = "rtc.dataSource";

/** The bundle's demo entry for `demo` (set by the launcher's VITE_DEMO_AUTH). */
const DEMO_PASSWORD = "mcdc2026";

/** The server's e2e roster entry for `demo` (startServer's AUTH_USERS). */
const SERVER_PASSWORD = "demo";

// The login wait (withLoginDelay) and a mode-change reload both sit inside
// this; a healthy run finishes each step in well under a second.
const SETTLE_TIMEOUT_MS = 20_000;
