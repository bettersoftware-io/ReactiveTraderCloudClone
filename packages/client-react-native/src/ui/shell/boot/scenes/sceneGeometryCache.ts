// packages/client-react-native/src/ui/shell/boot/scenes/sceneGeometryCache.ts

/**
 * A small, bounded, module-scope memoization cache for boot-scene geometry.
 *
 * **Why this exists.** React Compiler ships an explicit Reanimated
 * module-type registry (`getReanimatedModuleType` in
 * `babel-plugin-react-compiler`): `useDerivedValue` and its siblings are
 * registered with `restParam: "freeze"` and `noAlias: true` — the hook
 * promises never to mutate or retain what its closure reads. Under that
 * contract the compiler declines to allocate a memo slot for a value that is
 * read ONLY inside one of those closures and never in JSX — there is nothing
 * for it to guard against re-derivation, since the hook itself is guaranteed
 * not to hold onto a stale reference. Confirmed empirically (compiled-output
 * inspection, not just the `CompileSuccess` event) for `DockingScene`'s
 * `scanlines`/`corridor`/`hudGrid`, `LaserScene`'s `contentShapes` and
 * `GeoScene`/`JarvisScene`/`TopoScene`'s `world` — every one of them compiles
 * with no `$[n] !== dep` guard at all, so it rebuilds on every render rather
 * than once per viewport.
 *
 * These values are pure functions of viewport/panel geometry, not of any
 * component's lifetime, so a React memoization hook was always the wrong
 * home for them regardless of whether the compiler could supply one. Caching
 * them here instead is compiler-independent (it does not depend on the
 * Reanimated registry, or on any future compiler heuristic change) and
 * survives every re-render, including ones the compiler would never see a
 * reason to re-derive for anyway.
 *
 * **Bound.** Each named cache holds at most `MAX_ENTRIES_PER_CACHE` (4)
 * entries, evicted oldest-first (FIFO) once a *new* key would exceed it. A
 * boot scene's viewport/panel keys rarely change — device rotation or a
 * variant swap, not a per-frame event — so 4 is generously more than the
 * handful of distinct keys any one scene sees in practice. This bound is
 * what keeps this an actual cache rather than an unbounded `Map` that grows
 * across rotations/variants for the life of the process.
 */

const MAX_ENTRIES_PER_CACHE = 4;

interface CacheEntry<T> {
  readonly key: string;
  readonly value: T;
}

const caches = new Map<string, CacheEntry<unknown>[]>();

/**
 * Looks up (or computes and stores) the value for `keyParts` in the named
 * cache `cacheName`. Two calls with the same `cacheName` and the same
 * `keyParts` (compared by value, via `join`) return the SAME object
 * identity; a different `keyParts` computes and caches a new one.
 *
 * `cacheName` scopes the cache so unrelated call sites (e.g.
 * `DockingScene`'s `scanlines` vs. its `corridor`) never collide even if
 * their key parts happen to coincide (both keyed on `width`/`height`).
 *
 * Pure and synchronous — no React import, no scheduling. Must be called
 * from React-land during render, exactly where the cached value is
 * computed today; never from inside a worklet (calling a non-worklet
 * function per frame from inside a `useDerivedValue` closure red-boxes on
 * device).
 */
export function cachedSceneGeometry<T>(
  cacheName: string,
  keyParts: readonly (string | number)[],
  compute: () => T,
): T {
  let entries = caches.get(cacheName);

  if (entries === undefined) {
    entries = [];
    caches.set(cacheName, entries);
  }

  const key = keyParts.join("|");
  const hit = entries.find((entry) => {
    return entry.key === key;
  });

  if (hit !== undefined) {
    return hit.value as T;
  }

  const value = compute();
  entries.push({ key, value });

  if (entries.length > MAX_ENTRIES_PER_CACHE) {
    entries.shift();
  }

  return value;
}
