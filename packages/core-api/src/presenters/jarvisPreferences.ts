import type {
  JarvisBrain,
  JarvisEffort,
  JarvisNarratorPreference,
} from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The Jarvis desk-assistant preferences: which brain powers it (`brain` —
 * `"scripted"` or a live `claude-*` model), the thinking-effort budget
 * forwarded to a live brain (`effort`, ignored by `"scripted"`), and whether
 * the proactive app-driving narrator may dispatch unsolicited `narrate()`
 * turns (`narrator` — `"on" | "off"`).
 *
 * Exposes only the user's STORED preference; the brain a turn actually runs
 * with (`JarvisState.effectiveBrain`, folding in live availability) lives on
 * the Jarvis machine instead.
 */
export interface JarvisPreferencesPresenter {
  readonly brain$: Stream<JarvisBrain>;
  readonly effort$: Stream<JarvisEffort>;
  readonly narrator$: Stream<JarvisNarratorPreference>;
  setBrain(brain: JarvisBrain): void;
  setEffort(effort: JarvisEffort): void;
  setNarrator(preference: JarvisNarratorPreference): void;
}
