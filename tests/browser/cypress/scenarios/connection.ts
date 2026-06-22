// tests/browser/cypress/scenarios/connection.ts
// Cypress fork of tests/browser/scenarios/connection.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.

import { assertTrue } from "#/browser/scenarios/assert";
import type { TestContext } from "#/browser/testContext";

import { chainable } from "./_chainable";

export function setBrowserOffline(ctx: TestContext, offline: boolean): void {
  // The .should() retry below (and in expectConnectionStatusFooterShows) is
  // load-bearing — switching to .then() loses Cypress's auto-retry. See
  // _chainable.ts for the broader rationale.
  // Cypress synthesizes the online/offline event via win.dispatchEvent (see
  // CypressWorkspace.setOffline). Unlike Playwright's page.context().setOffline,
  // which flips a CDP-level offline switch that the browser delivers whenever
  // the page subscribes, a synthetic dispatch is dropped if no listener is
  // attached yet. The app's connection adapter subscribes via a React effect,
  // so before we can dispatch we must wait for the footer to show "Connected"
  // — that's our proxy for "adapter is wired up". The cucumber Cypress baseline
  // hides this race incidentally via the cy.then chain inserted between every
  // pair of cucumber steps; raw it()-bodies queue commands back-to-back with
  // no such buffer.
  if (offline) {
    chainable(ctx.po.footer.connectionLabel()).should((text) => {
      if (!text.includes("Connected")) {
        throw new Error(
          `expected footer to show "Connected" before dispatching offline; last seen: ${JSON.stringify(text)}`,
        );
      }
    });
  }

  void ctx.po.workspace.setOffline(offline);
}

export function expectConnectionStatusFooterVisible(ctx: TestContext): void {
  chainable(ctx.po.footer.isStatusVisible()).then((v) => {
    return assertTrue(v, "connection status footer not visible");
  });
}

export function expectConnectionStatusFooterShows(
  ctx: TestContext,
  expected: string,
): void {
  // Cypress retries the chain (cy.get + .then + .should) when the .should
  // callback throws. Default timeout is 10s (defaultCommandTimeout in
  // cypress.config.ts). The retry replaces the shared layer's hand-rolled
  // 5s poll loop.
  chainable(ctx.po.footer.connectionLabel()).should((text) => {
    if (!text.includes(expected)) {
      throw new Error(
        `expected footer to contain ${JSON.stringify(expected)}; last seen: ${JSON.stringify(text)}`,
      );
    }
  });
}

export function expectConnectionOverlayHidden(ctx: TestContext): void {
  chainable(ctx.po.connectionOverlay.isHidden()).then((v) => {
    return assertTrue(v, "connection overlay not hidden");
  });
}

export function expectConnectionOverlayVisibleWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.connectionOverlay.waitVisible(seconds * 1_000);
}

export function expectConnectionOverlayHiddenWithin(
  ctx: TestContext,
  seconds: number,
): void {
  void ctx.po.connectionOverlay.waitHidden(seconds * 1_000);
}

export function expectConnectionOverlayTextMatches(
  ctx: TestContext,
  rawRegex: string,
): void {
  const match = rawRegex.match(/^\/(.+)\/([gimsuy]*)$/);
  if (!match) throw new Error(`bad regex literal: ${rawRegex}`);
  const re = new RegExp(match[1], match[2]);
  chainable(ctx.po.connectionOverlay.text()).then((text) => {
    if (!re.test(text)) {
      throw new Error(`expected ${JSON.stringify(text)} to match ${rawRegex}`);
    }
  });
}
