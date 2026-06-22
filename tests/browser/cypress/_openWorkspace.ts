// tests/browser/cypress/_openWorkspace.ts
import { getCtx } from "./_context";
import * as common from "./scenarios/common";

export function withWorkspaceOpen(): void {
  beforeEach(() => {
    common.openWorkspace(getCtx());
  });
}

export function withFxWorkspaceOpen(): void {
  beforeEach(() => {
    common.openFxWorkspace(getCtx());
  });
}

export function withCreditWorkspaceOpen(): void {
  beforeEach(() => {
    common.openCreditWorkspace(getCtx());
  });
}
