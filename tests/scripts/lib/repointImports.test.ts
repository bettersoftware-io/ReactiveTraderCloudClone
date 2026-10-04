import { describe, expect, it } from "vitest";

import { type RepointMap, repointImports } from "./repointImports.ts";

describe("repointImports", () => {
  it("moves a type-only import to `import type` from the new home", () => {
    const out = repointImports(
      "a.ts",
      'import type { PanelId, AppPorts } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      'import type { AppPorts, PanelId } from "@rtc/core-api";\n',
    );
    expect(out.moved).toBe(2);
  });

  it("keeps an inline-type-only import erasable: it becomes `import type`", () => {
    const out = repointImports(
      "a.ts",
      'import { type PanelId } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe('import type { PanelId } from "@rtc/core-api";\n');
  });

  it("splits a mixed import by home and leaves the names that stay", () => {
    const out = repointImports(
      "a.ts",
      'import { PANEL_SPECS, WsAdapter, type PanelId } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      [
        'import type { PanelId } from "@rtc/core-api";',
        'import { PANEL_SPECS } from "@rtc/core-logic";',
        'import { WsAdapter } from "@rtc/client-core";',
        "",
      ].join("\n"),
    );
  });

  it("re-renders what stays as `import type` when only types stay", () => {
    const out = repointImports(
      "a.ts",
      'import { PANEL_SPECS, type WsAdapterOptions } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      [
        'import { PANEL_SPECS } from "@rtc/core-logic";',
        'import type { WsAdapterOptions } from "@rtc/client-core";',
        "",
      ].join("\n"),
    );
  });

  it("merges into an existing import of the new home as one block with inline `type`", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { CoreImpl } from "@rtc/core-api";',
        'import { PANEL_SPECS } from "@rtc/core-logic";',
        'import { instanceIdFor, type PanelId } from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      [
        'import type { CoreImpl, PanelId } from "@rtc/core-api";',
        'import { instanceIdFor, PANEL_SPECS } from "@rtc/core-logic";',
        "",
      ].join("\n"),
    );
  });

  it("turns a type-only import of the new home into one mixed declaration", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { WorkspaceDock } from "@rtc/core-logic";',
        'import { PANEL_SPECS } from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      'import { PANEL_SPECS, type WorkspaceDock } from "@rtc/core-logic";\n',
    );
  });

  it("collapses a split type/value pair of the new home into one declaration", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { WorkspaceDock } from "@rtc/core-logic";',
        'import { createWorkspaceDock } from "@rtc/core-logic";',
        'import { PANEL_SPECS } from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      'import { createWorkspaceDock, PANEL_SPECS, type WorkspaceDock } from "@rtc/core-logic";\n',
    );
  });

  it("handles a declaration that both loses names and gains them", () => {
    const out = repointImports(
      "a.ts",
      [
        'import type { RfqsPresenter } from "@rtc/client-core";',
        'import { type AppPorts, createApp } from "@rtc/client-core/core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      [
        'import type { AppPorts } from "@rtc/core-api";',
        'import { createApp, type RfqsPresenter } from "@rtc/client-core/core";',
        "",
      ].join("\n"),
    );
    expect(out.moved).toBe(2);
  });

  it("keeps an alias", () => {
    const out = repointImports(
      "a.ts",
      'import { PANEL_SPECS as SPECS } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      'import { PANEL_SPECS as SPECS } from "@rtc/core-logic";\n',
    );
  });

  it("rewrites a re-export, one declaration per new home", () => {
    const out = repointImports(
      "a.ts",
      'export { instanceIdFor, PANEL_SPECS, type PanelId, WsAdapter } from "@rtc/client-core";\n',
      MAP,
    );

    expect(out.text).toBe(
      [
        'export type { PanelId } from "@rtc/core-api";',
        'export { instanceIdFor, PANEL_SPECS } from "@rtc/core-logic";',
        'export { WsAdapter } from "@rtc/client-core";',
        "",
      ].join("\n"),
    );
    expect(out.moved).toBe(3);
  });

  it("leaves a file alone when nothing in it moves", () => {
    const text = [
      'import type { CoreImpl } from "@rtc/core-api";',
      'import { createWorkspaceDock } from "@rtc/core-logic";',
      "import {",
      "  WsAdapter,",
      '} from "@rtc/client-core";',
      "",
    ].join("\n");
    const out = repointImports("a.ts", text, MAP);

    expect(out.text).toBe(text);
    expect(out.moved).toBe(0);
    expect(out.problems).toEqual([]);
  });

  it("leaves the rest of the file byte for byte, comments included", () => {
    const out = repointImports(
      "a.tsx",
      [
        "// header comment",
        'import { useState } from "react";',
        "",
        "// why this import exists",
        'import type { PanelId } from "@rtc/client-core";',
        "",
        "export const x = <div />;",
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.text).toBe(
      [
        "// header comment",
        'import { useState } from "react";',
        "",
        "// why this import exists",
        'import type { PanelId } from "@rtc/core-api";',
        "",
        "export const x = <div />;",
        "",
      ].join("\n"),
    );
  });

  it("reports a namespace import and a star re-export instead of guessing", () => {
    const out = repointImports(
      "a.ts",
      [
        'import * as core from "@rtc/client-core";',
        'export * from "@rtc/client-core";',
        "",
      ].join("\n"),
      MAP,
    );

    expect(out.moved).toBe(0);
    expect(out.problems).toHaveLength(2);
    expect(out.problems[0]).toContain("a.ts");
  });
});

const MAP: RepointMap = {
  "@rtc/client-core": {
    AppPorts: "@rtc/core-api",
    PanelId: "@rtc/core-api",
    PANEL_SPECS: "@rtc/core-logic",
    instanceIdFor: "@rtc/core-logic",
    RfqsPresenter: "@rtc/client-core/core",
  },
  "@rtc/client-core/core": {
    AppPorts: "@rtc/core-api",
  },
};
