import { type BrowserContext, test as base, type Page } from "@playwright/test";

import {
  E2E_SESSION_KEY,
  JARVIS_NARRATOR_OFF_VALUE,
  JARVIS_NARRATOR_STORAGE_KEY,
  seedLocalStorageItem,
} from "#/browser/authSeed.js";
import { buildPlaywrightPageObjects } from "#/browser/page-objects/playwright/factory.js";
import type { TestContext } from "#/browser/testContext.js";
import { Scratchpad } from "#/browser/testContext.js";

import { loginForToken } from "../loginForToken.js";

// The server's HTTP base (forwarded by fullstack/browser-smoke.ts as
// FULLSTACK_PORT — the SAME real server the client under test connects its
// WsReal adapters to, not the client's own Vite port).
const SERVER_PORT = Number(process.env.FULLSTACK_PORT ?? 4124);
const SERVER_BASE = `http://127.0.0.1:${SERVER_PORT}`;

interface TestFixtures {
  ctx: TestContext;
}

interface PlaywrightFixtureArgs {
  page: Page;
}

interface ContextFixtureArgs {
  context: BrowserContext;
}

export const test = base.extend<TestFixtures>({
  // AuthGate now gates the app on a real signed session: before any spec here
  // loads the app, do a genuine POST /login round-trip against the real
  // server (WS-real mode — the WS upgrade itself is token-gated, "no
  // open-when-empty fallback", see packages/server/src/http/loginHandler.ts)
  // and seed the resulting token into localStorage via addInitScript, so
  // it's present before the app's own scripts run on the FIRST navigation.
  // Unlike the simulator-mode `browser/playwright/_context.ts`, the session
  // here is a REAL token, fetched fresh per test rather than a static
  // constant.
  context: async (
    { context }: ContextFixtureArgs,
    use: (value: BrowserContext) => Promise<void>,
  ) => {
    const login = await loginForToken(SERVER_BASE);
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
  ctx: async (
    { page }: PlaywrightFixtureArgs,
    use: (value: TestContext) => Promise<void>,
  ) => {
    const ctx: TestContext = {
      po: buildPlaywrightPageObjects(page),
      scratch: new Scratchpad(),
    };
    await use(ctx);
  },
});
