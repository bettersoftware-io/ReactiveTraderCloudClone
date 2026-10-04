import { describe, expect, it } from "vitest";

import {
  assertDepsServedLean,
  carriesInlineSourceMap,
  type FetchText,
  findDepUrls,
  findEntryModuleUrl,
} from "./leanDeps";

describe("findEntryModuleUrl", () => {
  it("skips Vite's own module scripts and returns the app entry", () => {
    expect(findEntryModuleUrl(createIndexHtml())).toBe("/src/main.tsx");
  });

  it("returns null when the page has no app module script", () => {
    expect(
      findEntryModuleUrl('<script type="module" src="/@vite/client"></script>'),
    ).toBeNull();
  });
});

describe("findDepUrls", () => {
  it("lists each pre-bundled dependency once, with its version query", () => {
    expect(findDepUrls(createEntryModule())).toEqual([
      "/node_modules/.vite/deps/react.js?v=860cf5f8",
      "/node_modules/.vite/deps/react-dom_client.js?v=860cf5f8",
    ]);
  });

  it("returns nothing for a module that imports only source files", () => {
    expect(findDepUrls('import { App } from "/src/App.tsx";')).toEqual([]);
  });
});

describe("carriesInlineSourceMap", () => {
  it("spots the inline map Vite appends to a dependency", () => {
    expect(carriesInlineSourceMap(createDepWithMap())).toBe(true);
  });

  it("passes code that merely mentions source maps", () => {
    expect(
      carriesInlineSourceMap('const hint = "sourceMappingURL";\nexport {};\n'),
    ).toBe(false);
  });
});

describe("assertDepsServedLean", () => {
  it("passes when every dependency of the entry module is served bare", async () => {
    await expect(
      assertDepsServedLean(ORIGIN, createFetchText({})),
    ).resolves.toBeUndefined();
  });

  it("fails, naming the dependency, when a later one carries a map", async () => {
    await expect(
      assertDepsServedLean(
        ORIGIN,
        createFetchText({
          "/node_modules/.vite/deps/react-dom_client.js?v=860cf5f8":
            createDepWithMap(),
        }),
      ),
    ).rejects.toThrow(/react-dom_client\.js\?v=860cf5f8 is served WITH/);
  });

  it("fails when the import-free dependency carries a map", async () => {
    await expect(
      assertDepsServedLean(
        ORIGIN,
        createFetchText({
          "/node_modules/.vite/deps/dockview.js": createDepWithMap(),
        }),
      ),
    ).rejects.toThrow(/dockview\.js is served WITH/);
  });

  it("fails rather than passes when the page has no entry module", async () => {
    await expect(
      assertDepsServedLean(ORIGIN, createFetchText({ "/": "<html></html>" })),
    ).rejects.toThrow(/no entry module script/);
  });

  it("fails rather than passes when the entry imports no dependency", async () => {
    await expect(
      assertDepsServedLean(
        ORIGIN,
        createFetchText({ "/src/main.tsx": "export {};" }),
      ),
    ).rejects.toThrow(/imports no pre-bundled dependency/);
  });
});

const ORIGIN = "http://127.0.0.1:3001";

function createIndexHtml(): string {
  return [
    "<head>",
    '<script type="module">import { injectIntoGlobalHook } from "/@react-refresh";</script>',
    '<script type="module" src="/@vite/client"></script>',
    "</head>",
    '<body><div id="root"></div>',
    '<script type="module" src="/src/main.tsx"></script>',
    "</body>",
  ].join("\n");
}

function createEntryModule(): string {
  return [
    'import __vite__cjsImport0_react from "/node_modules/.vite/deps/react.js?v=860cf5f8";',
    'import __vite__cjsImport1 from "/node_modules/.vite/deps/react-dom_client.js?v=860cf5f8";',
    'import { StrictMode } from "/node_modules/.vite/deps/react.js?v=860cf5f8";',
    'import { App } from "/src/App.tsx";',
  ].join("\n");
}

function createDepWithMap(): string {
  return "export const x = 1;\n//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozfQ==";
}

/** A dev server whose index, entry module and three dependencies are all lean
 * unless `overrides` replaces a path's body. */
function createFetchText(overrides: Record<string, string>): FetchText {
  const bodies: Record<string, string> = {
    "/": createIndexHtml(),
    "/src/main.tsx": createEntryModule(),
    "/node_modules/.vite/deps/react.js?v=860cf5f8": "export const x = 1;\n",
    "/node_modules/.vite/deps/react-dom_client.js?v=860cf5f8":
      "export const y = 2;\n",
    "/node_modules/.vite/deps/dockview.js": "export const z = 3;\n",
    ...overrides,
  };

  return (url: string) => {
    const body = bodies[url.slice(ORIGIN.length)];

    if (body === undefined) {
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    }

    return Promise.resolve(body);
  };
}
