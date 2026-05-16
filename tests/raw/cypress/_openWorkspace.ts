// tests/raw/cypress/_openWorkspace.ts
import { getCtx } from "./_context";
import * as common from "../../scenarios/cypress/common";

export const withWorkspaceOpen       = (): void => { beforeEach(() => { common.openWorkspace(getCtx()); }); };
export const withFxWorkspaceOpen     = (): void => { beforeEach(() => { common.openFxWorkspace(getCtx()); }); };
export const withCreditWorkspaceOpen = (): void => { beforeEach(() => { common.openCreditWorkspace(getCtx()); }); };
