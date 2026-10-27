import type {
  JarvisBrain,
  JarvisEffort,
  JarvisIndicators,
  JarvisNarratorPreference,
} from "@rtc/domain";

import type { Stream } from "#/stream";

/**
 * The Jarvis desk-assistant preferences: which brain powers it (`brain` —
 * `"scripted"` or a live `claude-*` model), the thinking-effort budget
 * forwarded to a live brain (`effort`, ignored by `"scripted"`), and whether
 * the proactive app-driving narrator may dispatch unsolicited `narrate()`
 * turns (`narrator` — `"on" | "off"`), and which of the budget readout, the
 * per-reply brain tags and the header brain pill are shown (`indicators`).
 *
 * Exposes only the user's STORED preference; the brain a turn actually runs
 * with (`JarvisState.effectiveBrain`, folding in live availability) lives on
 * the Jarvis machine instead.
 */
export interface JarvisPreferencesPresenter {
  readonly brain$: Stream<JarvisBrain>;
  readonly effort$: Stream<JarvisEffort>;
  readonly narrator$: Stream<JarvisNarratorPreference>;
  readonly indicators$: Stream<JarvisIndicators>;
  setBrain(brain: JarvisBrain): void;
  setEffort(effort: JarvisEffort): void;
  setNarrator(preference: JarvisNarratorPreference): void;
  setIndicators(next: JarvisIndicators): void;
}
