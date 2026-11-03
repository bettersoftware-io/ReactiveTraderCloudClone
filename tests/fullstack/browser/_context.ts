import { type BrowserContext, test as base, type Page } from "@playwright/test";

import type { LoginResponseDto } from "@rtc/shared";

import {
  E2E_SESSION_KEY,
  JARVIS_NARRATOR_OFF_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "#/browser/authSeed.js";
import { watchCspViolations } from "#/browser/cspViolations.js";
import { buildPlaywrightPageObjects } from "#/browser/page-objects/playwright/factory.js";
import { Scratchpad, type TestContext } from "#/browser/testContext.js";

import { loginForToken } from "../loginForToken.js";

// The server's HTTP base (forwarded by fullstack/browser-smoke.ts as
// FULLSTACK_PORT — the SAME real server the client under test connects its
// WsReal adapters to, not the client's own Vite port).
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4124);
const SERVER_BASE = `http://127.0.0.1:${SERVER_PORT}`;

/** The worker's one `demo` login, shared by its tests. */
let demoLogin: Promise<LoginResponseDto> | null = null;

/**
 * One real `POST /login` per worker, not one per test: the server allows
 * `LOGIN_RATE_LIMIT_MAX` logins a minute per IP, and a quick local run of
 * this suite, with the account journeys' own sign-ins, asks for more than
 * that. Each test still gets a fresh browser context seeded with the token;
 * signing out in one test clears only that context. A failed login is not
 * kept, so the next test tries again.
 */
function loginOncePerWorker(): Promise<LoginResponseDto> {
  demoLogin ??= loginForToken(SERVER_BASE).catch((error: unknown) => {
    demoLogin = null;
    throw error;
  });

  return demoLogin;
}

interface TestFixtures {
  ctx: TestContext;
}

interface PlaywrightFixtureArgs {
  page: Page;
}

interface ContextFixtureArgs {
  context: BrowserContext;
}

async function createCtx(
  { page }: PlaywrightFixtureArgs,
  use: (value: TestContext) => Promise<void>,
): Promise<void> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  const ctx: TestContext = {
    po: buildPlaywrightPageObjects(page),
    scratch: new Scratchpad(),
    pageErrors,
    cspViolations: watchCspViolations(page.context()),
  };
  await use(ctx);
}

export const test = base.extend<TestFixtures>({
  // AuthGate now gates the app on a real signed session: before any spec here
  // loads the app, do a genuine POST /login round-trip against the real
  // server (WS-real mode — the WS upgrade itself is token-gated, "no
  // open-when-empty fallback", see packages/server/src/http/loginHandler.ts)
  // and seed the resulting token into localStorage via addInitScript, so
  // it's present before the app's own scripts run on the FIRST navigation.
  // Unlike the simulator-mode `browser/playwright/_context.ts`, the session
  // here is a REAL token rather than a static
  // constant, fetched once per worker (`loginOncePerWorker`).
  context: async (
    { context }: ContextFixtureArgs,
    use: (value: BrowserContext) => Promise<void>,
  ) => {
    const login = await loginOncePerWorker();
    const session = {
      token: login.token,
      username: "demo",
      user: login.user,
      exp: login.exp,
    };
    await context.addInitScript(seedLocalStorageItem, {
      key: E2E_SESSION_KEY,
      value: JSON.stringify(session),
    });
    // Seed JarvisNarrator OFF: fullstack mode drives the client against the
    // REAL server's PricingSimulator, which starts a genuine anomaly episode
    // often enough (aggregated across ~10 pairs) to fire an unsolicited
    // narration turn mid-test — see authSeed.ts for the full rationale. None
    // of the specs in this suite exercise narration, so this makes them
    // deterministic.
    await context.addInitScript(seedLocalStorageItem, {
      key: JARVIS_NARRATOR_STORAGE_KEY,
      value: JARVIS_NARRATOR_OFF_VALUE,
    });
    await use(context);
  },
  ctx: createCtx,
});

/**
 * A `test` with NO seeded session and no `/login` round trip. The account
 * specs sign in through the real form themselves, and the per-test token
 * fetch above would spend the server's `/login` budget (10 per minute per IP)
 * that the specs after them in the same run need.
 */
export const unseededTest = base.extend<TestFixtures>({
  ctx: createCtx,
});
