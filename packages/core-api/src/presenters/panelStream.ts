import type {
  AnalyticsPort,
  BlotterPort,
  PricingPort,
  ReferenceDataPort,
} from "@rtc/domain";
import type { PanelAnnotation } from "@rtc/shared";

/** A single numeric sample on a line/spark series — `t` is a timestamp in ms
 * (whatever epoch the underlying tick carries), `v` its value. */
export type PanelPoint = { readonly t: number; readonly v: number };

export type PanelTone = "up" | "down" | "flat" | "info" | "warn" | "danger";

/** The rendered shape a `JarvisPanelVm.data$` carries — one variant per
 * `PanelViz.kind`, so the UI shell can switch on `.kind` without a further
 * lookup. Every render path is TOTAL (see `composePanelStream`'s doc): a
 * transform chain that doesn't make sense for its source, or a viz that
 * doesn't make sense for its data, yields the EMPTY form of its own kind
 * rather than throwing or omitting a field. */
export type PanelData =
  | {
      readonly kind: "line";
      readonly series: readonly {
        readonly label: string;
        readonly points: readonly PanelPoint[];
      }[];
      readonly annotations: readonly PanelAnnotation[];
    }
  | {
      readonly kind: "table";
      readonly columns: readonly string[];
      readonly rows: readonly {
        readonly cells: readonly string[];
        readonly tone: PanelTone;
      }[];
    }
  | {
      readonly kind: "gauge";
      readonly label: string;
      readonly value: string;
      readonly delta: string;
      readonly tone: PanelTone;
    }
  | {
      readonly kind: "sparkGrid";
      readonly cells: readonly {
        readonly label: string;
        readonly points: readonly number[];
        readonly change: string;
        readonly tone: PanelTone;
      }[];
    }
  | {
      readonly kind: "heatmap";
      readonly rows: readonly {
        readonly label: string;
        readonly cells: readonly {
          readonly label: string;
          /** -1..1 */
          readonly intensity: number;
          readonly text: string;
        }[];
      }[];
    };

/** The subset of domain ports a `PanelSpecV1`'s `source` can read from —
 * copied from `ScriptedJarvisEngine`'s `ScriptedJarvisDeps` (minus
 * `execution`/`instantReveal$`, which no panel source needs). */
export interface PanelStreamDeps {
  readonly referenceData: ReferenceDataPort;
  readonly pricing: PricingPort;
  readonly blotter: BlotterPort;
  readonly analytics: AnalyticsPort;
}
