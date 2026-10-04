import { describe, expect, it } from "vitest";

import { classify, EFFECT_RUNTIME_MARKER, eagerFiles } from "./coreBundle.ts";

describe("eagerFiles", () => {
  it("collects the entry module script plus every modulepreload hint", () => {
    const html = createIndexHtml({
      entrySrc: "/assets/index-abc123.js",
      preloadHrefs: ["/assets/dist-def456.js", "/assets/vendor-ghi789.js"],
    });

    const files = eagerFiles(html);

    expect(files).toHaveLength(3);
    expect(files).toEqual(
      expect.arrayContaining([
        "/assets/index-abc123.js",
        "/assets/dist-def456.js",
        "/assets/vendor-ghi789.js",
      ]),
    );
  });

  it("ignores a stylesheet link and a non-module script", () => {
    const html = createIndexHtml({
      entrySrc: "/assets/index-abc123.js",
      preloadHrefs: [],
      extraHead:
        '<link rel="stylesheet" href="/assets/index-xyz.css">' +
        '<script src="/assets/legacy-nomodule.js"></script>',
    });

    const files = eagerFiles(html);

    expect(files).toEqual(["/assets/index-abc123.js"]);
  });

  it("reads attributes regardless of order (type before or after src)", () => {
    const html =
      '<html><head><script src="/assets/a.js" type="module"></script></head></html>';

    expect(eagerFiles(html)).toEqual(["/assets/a.js"]);
  });

  it("does not read a decoy data-src attribute as the real src", () => {
    const html =
      '<html><head><script type="module" data-src="/assets/decoy.js"></script></head></html>';

    expect(eagerFiles(html)).toEqual([]);
  });
});

describe("classify", () => {
  it("passes a correctly-shaped build: no core eager, each of the three in its own lazy chunk", () => {
    const files = new Map([
      ["/assets/index.js", "the entry: shell, adapters, the loader"],
      ["/assets/vendor.js", "no marker here"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js", "/assets/vendor.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual([]);
    expect(result.sizes.rxjs).toBeGreaterThan(0);
    expect(result.sizes.async).toBeGreaterThan(0);
    expect(result.sizes.effect).toBeGreaterThan(0);
  });

  it("fails when the async marker leaks into an eager file", () => {
    const files = new Map([
      ["/assets/index.js", ASYNC_MARKER],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("async marker found in eager file"),
      ]),
    );
  });

  it("fails when the rxjs marker sits in an eager file (approach B: no core is privileged)", () => {
    const files = new Map([
      ["/assets/index.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "rxjs marker found in eager file /assets/index.js",
        ),
      ]),
    );
  });

  it("fails when no lazy chunk carries the rxjs marker at all", () => {
    const files = new Map([
      ["/assets/index.js", "no core here"],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "expected exactly one lazy chunk carrying the rxjs marker, found 0",
        ),
      ]),
    );
  });

  it("fails when the effect marker sits in two lazy chunks instead of one", () => {
    const files = new Map([
      ["/assets/index.js", "entry"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/effect-a.js", EFFECT_MARKER],
      ["/assets/effect-b.js", EFFECT_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "expected exactly one lazy chunk carrying the effect marker, found 2",
        ),
      ]),
    );
  });

  it("fails when a single file carries two different core markers", () => {
    const files = new Map([
      ["/assets/index.js", "entry"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/mixed.js", `${ASYNC_MARKER} ${EFFECT_MARKER}`],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "/assets/mixed.js contains more than one core's marker",
        ),
      ]),
    );
  });

  it("fails when no lazy chunk carries the async marker at all", () => {
    const files = new Map([
      ["/assets/index.js", "entry"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "expected exactly one lazy chunk carrying the async marker, found 0",
        ),
      ]),
    );
  });

  it("fails when no lazy chunk carries the effect marker at all", () => {
    const files = new Map([
      ["/assets/index.js", "entry"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "expected exactly one lazy chunk carrying the effect marker, found 0",
        ),
      ]),
    );
  });

  it("fails when the Effect library's runtime marker leaks into an eager file without the effect brand", () => {
    const files = new Map([
      ["/assets/index.js", `entry ${EFFECT_RUNTIME_MARKER}`],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(EFFECT_RUNTIME_MARKER),
        expect.stringContaining("/assets/index.js"),
      ]),
    );
  });

  it("flags the Effect runtime marker in a chunk the entry imports statically without a modulepreload hint", () => {
    const files = new Map([
      ["/assets/index.js", `import"./vendor.js";import("./lazy.js");`],
      ["/assets/vendor.js", EFFECT_RUNTIME_MARKER],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    // Only the entry is hinted; vendor.js is eager by static import alone.
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          `the Effect runtime marker (${EFFECT_RUNTIME_MARKER}) leaked into eager file /assets/vendor.js`,
        ),
      ]),
    );
  });

  it("does not flag the Effect runtime marker sitting in the lazy effect chunk", () => {
    const files = new Map([
      ["/assets/index.js", "entry"],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", `${EFFECT_MARKER} ${EFFECT_RUNTIME_MARKER}`],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual([]);
  });

  it('recognizes a minified static import with no space after `from` (e.g. `from"./x.js"`)', () => {
    const files = new Map([
      [
        "/assets/index.js",
        `import a from"./vendor.js";import("./lazy-dynamic.js");`,
      ],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/vendor.js", ASYNC_MARKER],
      ["/assets/lazy-dynamic.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    // The minified STATIC import is folded into the eager closure...
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "async marker found in eager file /assets/vendor.js",
        ),
      ]),
    );
    // ...but the dynamic import call stays lazy, same as the spaced form.
    expect(result.failures).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("effect marker found in eager file"),
      ]),
    );
  });

  it("treats a statically-imported chunk as eager even without a modulepreload hint", () => {
    const files = new Map([
      ["/assets/index.js", `import"./vendor.js";import("./lazy-dynamic.js");`],
      ["/assets/rxjs.js", RXJS_MARKER],
      ["/assets/vendor.js", ASYNC_MARKER],
      ["/assets/lazy-dynamic.js", EFFECT_MARKER],
    ]);
    // Only the entry is in the HTML-derived eager set (no modulepreload for
    // either chunk it references).
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    // The STATICALLY imported chunk is folded into the eager closure...
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "async marker found in eager file /assets/vendor.js",
        ),
      ]),
    );
    // ...but the DYNAMICALLY imported chunk must not be — that is what keeps
    // it lazy in the first place.
    expect(result.failures).not.toEqual(
      expect.arrayContaining([
        expect.stringContaining("effect marker found in eager file"),
      ]),
    );
  });
});

interface CreateIndexHtmlOptions {
  readonly entrySrc: string;
  readonly preloadHrefs: readonly string[];
  readonly extraHead?: string;
}

function createIndexHtml(options: CreateIndexHtmlOptions): string {
  const preloads = options.preloadHrefs
    .map((href) => {
      return `<link rel="modulepreload" crossorigin href="${href}">`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <script type="module" crossorigin src="${options.entrySrc}"></script>
    ${preloads}
    ${options.extraHead ?? ""}
  </head>
  <body><div id="root"></div></body>
</html>`;
}

const RXJS_MARKER = "@rtc/client-core-rxjs:brand";

const ASYNC_MARKER = "@rtc/client-core-async:brand";

const EFFECT_MARKER = "@rtc/client-core-effect:brand";
