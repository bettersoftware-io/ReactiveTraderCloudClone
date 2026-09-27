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

/**
 * The brand markers above name a CORE'S COMPOSITION ROOT, not its whole
 * runtime — a bundler is free to fold a library's own code into a shared
 * eager vendor chunk without the brand, which lives only in the one file
 * that constructs the app. The Effect library's Fiber module carries this
 * distinctive string internally, so it stands in for "the Effect runtime
 * itself", checked independently of whichever chunk happens to carry
 * `@rtc/client-core-effect:brand` (controller ruling, fix round 1). There is
 * no equivalent async-kernel check: `@rtc/client-core-async`'s kernel has no
 * comparably distinctive library string to grep for.
 */
export const EFFECT_RUNTIME_MARKER = "effect/Fiber";

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
 * Classifies a build's files against the four rules a runtime-switchable
 * bundle must satisfy:
 *
 * 1. the eager set carries the rxjs marker, and neither alternative marker;
 * 2. exactly one non-eager (lazy) file carries the async marker, exactly one
 *    the effect marker;
 * 3. no single file carries two different core markers (a core that reached
 *    for another core's composition root instead of its own);
 * 4. no eager file carries `EFFECT_RUNTIME_MARKER` — the brand rules above
 *    prove the composition ROOT stays out of the eager graph, not the
 *    library itself.
 *
 * The eager set rules 1, 2 and 4 check against is not `input.eager`
 * verbatim — it is that set's transitive closure over each file's own
 * STATIC ES imports (`import … from "…"`, a bare side-effect `import "…"`),
 * computed by `expandEagerClosure`. That keeps the check meaningful even if
 * a future build ever stops emitting `<link rel="modulepreload">` hints: the
 * browser still fetches a statically-imported chunk up front regardless of
 * whether it was hinted. A dynamic `import(…)` call is deliberately excluded
 * from the closure — deferring the fetch until called is what makes a chunk
 * actually lazy.
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

  const eager = expandEagerClosure(input.eager, input.files);

  const eagerRxjs = owners.rxjs.filter((path) => {
    return eager.has(path);
  });

  if (eagerRxjs.length === 0) {
    failures.push("the rxjs marker is missing from the eager set");
  }

  for (const core of ["async", "effect"] as const) {
    const eagerHits = owners[core].filter((path) => {
      return eager.has(path);
    });

    for (const path of eagerHits) {
      failures.push(`${core} marker found in eager file ${path}`);
    }

    const lazyHits = owners[core].filter((path) => {
      return !eager.has(path);
    });

    if (lazyHits.length !== 1) {
      failures.push(
        `expected exactly one lazy chunk carrying the ${core} marker, found ${lazyHits.length}${
          lazyHits.length > 0 ? ` (${lazyHits.join(", ")})` : ""
        }`,
      );
    }
  }

  for (const path of eager) {
    const text = input.files.get(path);

    if (text?.includes(EFFECT_RUNTIME_MARKER)) {
      failures.push(
        `the Effect runtime marker (${EFFECT_RUNTIME_MARKER}) leaked into eager file ${path}`,
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

/** Grows `initial` (the HTML-derived eager set) to its transitive closure
 * over every file's own static import specifiers, resolving only the
 * relative ones that point at another file already present in `files` — an
 * external/bare specifier (a real npm package, already inlined by the
 * bundler) has nothing further to resolve. */
function expandEagerClosure(
  initial: ReadonlySet<string>,
  files: ReadonlyMap<string, string>,
): Set<string> {
  const closure = new Set(initial);
  const queue = [...initial];

  while (queue.length > 0) {
    const path = queue.pop();

    if (path === undefined) {
      continue;
    }

    const text = files.get(path);

    if (text === undefined) {
      continue;
    }

    for (const spec of staticImportSpecifiers(text)) {
      const resolved = resolveRelativeSpecifier(path, spec);

      if (
        resolved !== undefined &&
        files.has(resolved) &&
        !closure.has(resolved)
      ) {
        closure.add(resolved);
        queue.push(resolved);
      }
    }
  }

  return closure;
}

/** Bare specifiers of every STATIC ES import/export this file's compiled
 * output performs — `import … from "spec"` / `export … from "spec"`, and a
 * side-effect-only `import "spec"`. Deliberately excludes a dynamic
 * `import("spec")` call: that form (a `(` between `import` and the string)
 * is the one a bundler defers until runtime, which is what makes a chunk
 * actually lazy — folding it into the eager closure would defeat the check
 * it's used by. */
function staticImportSpecifiers(text: string): string[] {
  const specifiers: string[] = [];

  for (const re of [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
  ]) {
    let match = re.exec(text);

    while (match !== null) {
      const specifier = match[1];

      if (specifier !== undefined) {
        specifiers.push(specifier);
      }

      match = re.exec(text);
    }
  }

  return specifiers;
}

/** Resolves a `./…`/`../…` specifier against the importing file's own path
 * (both in the `/assets/name.js` form the caller's file map keys use).
 * A bare/absolute specifier (no leading `.`) is left unresolved
 * (`undefined`) — an external package import, not one of this build's own
 * chunks. */
function resolveRelativeSpecifier(
  fromPath: string,
  spec: string,
): string | undefined {
  if (!spec.startsWith(".")) {
    return undefined;
  }

  const dir = fromPath.slice(0, fromPath.lastIndexOf("/"));
  const combined = `${dir}/${spec}`;
  const segments: string[] = [];

  for (const segment of combined.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }

    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return `/${segments.join("/")}`;
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

/** Reads attribute `name`'s value out of a captured attribute-list string.
 * Anchored on start-of-string-or-whitespace before `name` (not `\b`) — a
 * bare `\b` word boundary also fires right after a hyphen, so `\bsrc=` would
 * misread `data-src="…"` as the real `src`. */
function readAttr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const match = attrs.match(re);
  return match ? match[1] : undefined;
}
