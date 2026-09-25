import type {
  AnalyticsPort,
  BlotterPort,
  PricingPort,
  ReferenceDataPort,
} from "@rtc/domain";

/** The subset of domain ports a `PanelSpecV1`'s `source` can read from —
 * copied from `ScriptedJarvisEngine`'s `ScriptedJarvisDeps` (minus
 * `execution`/`instantReveal$`, which no panel source needs). */
export interface PanelStreamDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
}
