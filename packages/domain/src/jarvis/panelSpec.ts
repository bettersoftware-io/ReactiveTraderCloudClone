/**
 * `PanelSpec` v1 — the generative-UI vocabulary a Jarvis brain emits to
 * describe one desk panel: where its data comes from, what to do to it, and
 * how to draw it. The application-core contract and every UI name these
 * types, so they are domain vocabulary. `@rtc/shared` holds what the wire
 * adds on top: `parsePanelSpec` and `PANEL_SPEC_JSON_SCHEMA`, both derived
 * from the `const` arrays below so the two descriptions of "what kinds
 * exist" cannot drift apart.
 */

export const PANEL_SOURCE_KINDS = [
  "fxTicks",
  "priceHistory",
  "analytics",
  "blotter",
] as const;

export const PANEL_VIZ_KINDS = [
  "line",
  "table",
  "gauge",
  "sparkGrid",
  "heatmap",
] as const;

export const PANEL_TRANSFORM_KINDS = [
  "window",
  "returns",
  "rollingVol",
  "spread",
  "topN",
] as const;

export const PANEL_ANNOTATION_KINDS = ["hline", "zone"] as const;

export const PANEL_ANNOTATION_TONES = ["info", "warn", "danger"] as const;

export const PANEL_TOPN_BY_VALUES = ["value", "change"] as const;

export type PanelAnnotationTone = (typeof PANEL_ANNOTATION_TONES)[number];

export interface PanelSpecV1 {
  readonly v: 1;
  /** 1-48 chars. */
  readonly title: string;
  /** ≤200 chars, provenance tooltip. */
  readonly rationale?: string;
  readonly source: PanelSource;
  /** ≤4, applied in order. */
  readonly transforms: readonly PanelTransform[];
  readonly viz: PanelViz;
  /** ≤4. */
  readonly annotations?: readonly PanelAnnotation[];
}

export type PanelSource =
  | { readonly kind: "fxTicks"; readonly symbols: readonly string[] }
  | { readonly kind: "priceHistory"; readonly symbols: readonly string[] }
  | { readonly kind: "analytics" }
  | { readonly kind: "blotter" };

export type PanelTransform =
  | { readonly kind: "window"; readonly seconds: number }
  | { readonly kind: "returns" }
  | { readonly kind: "rollingVol"; readonly samples: number }
  | { readonly kind: "spread"; readonly a: string; readonly b: string }
  | {
      readonly kind: "topN";
      readonly n: number;
      readonly by: "value" | "change";
    };

export type PanelViz =
  | { readonly kind: "line" }
  | { readonly kind: "table" }
  | { readonly kind: "gauge"; readonly label?: string }
  | { readonly kind: "sparkGrid" }
  | { readonly kind: "heatmap" };

export type PanelAnnotation =
  | {
      readonly kind: "hline";
      readonly value: number;
      readonly label?: string;
      readonly tone: PanelAnnotationTone;
    }
  | {
      readonly kind: "zone";
      readonly from: number;
      readonly to: number;
      readonly tone: PanelAnnotationTone;
    };
