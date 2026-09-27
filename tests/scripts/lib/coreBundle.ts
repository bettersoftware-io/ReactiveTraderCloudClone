/**
 * Pure helpers behind `scripts/check-core-bundle.mjs` (§4 of
 * docs/superpowers/specs/2026-09-27-runtime-core-switch-design.md): since
 * slice 8/the runtime core switch, a web client ships ONE production build
 * that boots the RxJS core eagerly (statically imported) and loads the
 * async/Effect cores as lazy chunks fetched only once chosen
 * (src/app/coreSelection.ts's `loadCore`). So the bundle isolation check is
 * no longer "one build per core" — it is "one build; the eager graph carries
 * only RxJS; each alternative core lives in exactly one lazy chunk".
 *
 * A page's "eager set" is every file the browser fetches before any user
 * choice: its own entry `<script type="module">` plus everything Vite's
 * `<link rel="modulepreload">` hints alongside it. `eagerFiles` reads that
 * set out of one HTML page; the caller unions both pages a client ships
 * (`index.html` and `popout.html`) since either can be the first page loaded.
 */

const CORE_MARKERS = {
  rxjs: "@rtc/client-core:brand",
  async: "@rtc/client-core-async:brand",
  effect: "@rtc/client-core-effect:brand",
} as const;

type Core = keyof typeof CORE_MARKERS;

const CORES = Object.keys(CORE_MARKERS) as readonly Core[];

/** One `classify` input file: its path (as it appears in an HTML `src`/`href`
 * attribute, e.g. `/assets/index-abc123.js`) and its full text content. */
export interface ClassifyInput {
  readonly files: ReadonlyMap<string, string>;
  readonly eager: ReadonlySet<string>;
}

export interface ClassifyResult {
  readonly failures: readonly string[];
  readonly sizes: Record<Core, number>;
  /** Which file(s) `classify` attributed to each core (by marker), for a
   * caller that wants to report on the real files (e.g. their on-disk gzip
   * size) rather than just the byte count above. */
  readonly owners: Record<Core, readonly string[]>;
}

/** The paths a browser fetches up front for this one HTML page: every
 * `<script type="module" src="…">` entry plus every `<link
 * rel="modulepreload" href="…">` hint. Attribute order within a tag is not
 * assumed (`type` can precede or follow `src`). */
export function eagerFiles(html: string): string[] {
  const files: string[] = [];

  for (const attrs of matchTagAttrs(html, "script")) {
    if (readAttr(attrs, "type") === "module") {
      const src = readAttr(attrs, "src");

      if (src !== undefined) {
        files.push(src);
      }
    }
  }

  for (const attrs of matchTagAttrs(html, "link")) {
    if (readAttr(attrs, "rel") === "modulepreload") {
      const href = readAttr(attrs, "href");

      if (href !== undefined) {
        files.push(href);
      }
    }
  }

  return files;
}

/**
 * Classifies a build's files against the three rules a runtime-switchable
 * bundle must satisfy:
 *
 * 1. the eager set carries the rxjs marker, and neither alternative marker;
 * 2. exactly one non-eager (lazy) file carries the async marker, exactly one
 *    the effect marker;
 * 3. no single file carries two different core markers (a core that reached
 *    for another core's composition root instead of its own).
 *
 * `sizes` reports each core's owning file(s) as UTF-8 byte length — the
 * bytes actually shipped for that chunk, gzip being an orthogonal transport
 * concern the caller (which has real files on disk) can layer on top.
 */
export function classify(input: ClassifyInput): ClassifyResult {
  const failures: string[] = [];
  const owners: Record<Core, string[]> = { rxjs: [], async: [], effect: [] };

  for (const [path, text] of input.files) {
    const present = CORES.filter((core) => {
      return text.includes(CORE_MARKERS[core]);
    });

    if (present.length > 1) {
      failures.push(
        `${path} contains more than one core's marker: ${present.join(", ")}`,
      );
    }

    for (const core of present) {
      owners[core].push(path);
    }
  }

  const eagerRxjs = owners.rxjs.filter((path) => {
    return input.eager.has(path);
  });

  if (eagerRxjs.length === 0) {
    failures.push("the rxjs marker is missing from the eager set");
  }

  for (const core of ["async", "effect"] as const) {
    const eagerHits = owners[core].filter((path) => {
      return input.eager.has(path);
    });

    for (const path of eagerHits) {
      failures.push(`${core} marker found in eager file ${path}`);
    }

    const lazyHits = owners[core].filter((path) => {
      return !input.eager.has(path);
    });

    if (lazyHits.length !== 1) {
      failures.push(
        `expected exactly one lazy chunk carrying the ${core} marker, found ${lazyHits.length}${
          lazyHits.length > 0 ? ` (${lazyHits.join(", ")})` : ""
        }`,
      );
    }
  }

  const sizes = Object.fromEntries(
    CORES.map((core) => {
      const bytes = owners[core].reduce((sum, path) => {
        return sum + byteLength(input.files.get(path) ?? "");
      }, 0);
      return [core, bytes];
    }),
  ) as Record<Core, number>;

  return { failures, sizes, owners };
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function matchTagAttrs(html: string, tagName: string): string[] {
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, "gi");
  const out: string[] = [];
  let match = re.exec(html);

  while (match !== null) {
    out.push(match[1] ?? "");
    match = re.exec(html);
  }

  return out;
}

function readAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = attrs.match(re);
  return match ? match[1] : undefined;
}
