// tests/browser/cypress/scenarios/common.ts
// Cypress fork of tests/browser/scenarios/common.ts — synchronous bodies, queue-aware.
// See Phase 5A.4 spec §3.3.
import type { TestContext } from "#/browser/testContext";

export function openWorkspace(ctx: TestContext): void {
  // PO method queues cy.visit. Discard the returned chainable; cy queue handles ordering.
  void ctx.po.workspace.open();
}

export function openFxWorkspace(ctx: TestContext): void {
  void ctx.po.workspace.openFx();
}

export function openCreditWorkspace(ctx: TestContext): void {
  void ctx.po.workspace.openCredit();
}

export function clickTab(ctx: TestContext, tab: string): void {
  if (tab !== "fx" && tab !== "credit" && tab !== "admin") {
    throw new Error(`unsupported tab: ${tab}`);
  }

  void ctx.po.workspace.clickTab(tab);
}

export function reloadPage(ctx: TestContext): void {
  void ctx.po.workspace.reload();
}

export function waitSeconds(ctx: TestContext, seconds: number): void {
  void ctx.po.workspace.wait(seconds * 1_000);
}
