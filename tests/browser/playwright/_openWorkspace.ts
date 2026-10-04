import * as common from "../scenarios/common.ts";
import { test } from "./_context.ts";

export function withWorkspaceOpen(): void {
  test.beforeEach(({ ctx }) => {
    return common.openWorkspace(ctx);
  });
}

export function withFxWorkspaceOpen(): void {
  test.beforeEach(({ ctx }) => {
    return common.openFxWorkspace(ctx);
  });
}

export function withCreditWorkspaceOpen(): void {
  test.beforeEach(({ ctx }) => {
    return common.openCreditWorkspace(ctx);
  });
}
