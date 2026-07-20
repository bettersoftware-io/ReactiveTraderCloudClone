/** FNV-1a: a stable 32-bit hash of a string, for deriving a distinct
 * `mulberry32` seed per named entity (e.g. per equity symbol) from a shared
 * base seed. Stable across releases by construction — the constants are
 * fixed and there's no host/runtime input — so a given name always maps to
 * the same seed, and therefore always reproduces the same simulated series. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/** Deterministic 32-bit PRNG (mulberry32). Same seed → same sequence; the
 * determinism backbone for telemetry simulator reproducibility. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;

  return (): number => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
