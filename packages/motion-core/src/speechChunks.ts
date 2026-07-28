export const SPEECH_CHUNK_MIN_CHARS = 2;
export const SPEECH_CHUNK_MAX_CHARS = 4;
/** Cadence of the typed-out reveal (per chunk), matching the v5 prototype. */
export const SPEECH_CHUNK_INTERVAL_MS = 26;

const CYCLE = [2, 3, 4] as const;

/**
 * Split reply text into the deterministic 2/3/4-char chunk sequence the
 * scripted adapter emits as JarvisEvent deltas. Pure; the rxjs timing that
 * paces the chunks stays in the app layer (ScriptedJarvisAdapter).
 */
export function speechChunks(text: string): readonly string[] {
  const chunks: string[] = [];
  let i = 0;
  let step = 0;

  while (i < text.length) {
    const size = CYCLE[step % CYCLE.length] ?? SPEECH_CHUNK_MAX_CHARS;
    chunks.push(text.slice(i, i + size));
    i += size;
    step += 1;
  }

  return chunks;
}
