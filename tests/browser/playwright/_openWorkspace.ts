import * as common from "../scenarios/common";
import { test } from "./_context";

export const withWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openWorkspace(ctx));
};

export const withFxWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openFxWorkspace(ctx));
};

export const withCreditWorkspaceOpen = (): void => {
  test.beforeEach(({ ctx }) => common.openCreditWorkspace(ctx));
};
