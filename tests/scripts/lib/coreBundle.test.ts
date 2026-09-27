import { describe, expect, it } from "vitest";

import { classify, eagerFiles } from "./coreBundle";

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
});

describe("classify", () => {
  it("passes a correctly-shaped build: rxjs eager, async/effect each in their own lazy chunk", () => {
    const files = new Map([
      ["/assets/index.js", RXJS_MARKER],
      ["/assets/vendor.js", "no marker here"],
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
      ["/assets/index.js", `${RXJS_MARKER} ${ASYNC_MARKER}`],
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

  it("fails when the rxjs marker is missing from the eager set", () => {
    const files = new Map([
      ["/assets/index.js", "no rxjs here"],
      ["/assets/async.js", ASYNC_MARKER],
      ["/assets/effect.js", EFFECT_MARKER],
    ]);
    const eager = new Set(["/assets/index.js"]);

    const result = classify({ files, eager });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("rxjs marker is missing from the eager set"),
      ]),
    );
  });

  it("fails when the effect marker sits in two lazy chunks instead of one", () => {
    const files = new Map([
      ["/assets/index.js", RXJS_MARKER],
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
      ["/assets/index.js", RXJS_MARKER],
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

const RXJS_MARKER = "@rtc/client-core:brand";

const ASYNC_MARKER = "@rtc/client-core-async:brand";

const EFFECT_MARKER = "@rtc/client-core-effect:brand";
