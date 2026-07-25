// packages/client-react-native/src/ui/shell/boot/scenes/laserPanelContent.ts
import { clamp01, ease } from "#/ui/shell/boot/scenes/coreGeometry";
import type { LaserRect } from "#/ui/shell/boot/scenes/laserGeometry";

/**
 * The per-kind interior content of a `laser` panel — the layer phase 6a
 * deferred as "`drawPanelContent`'s five branches".
 *
 * Ported verbatim from `drawPanelContent` in
 * `packages/boot-splash/src/bootCanvas.ts` (lines 169-279) plus the content
 * scale/ease block (409-427).
 *
 * Pure geometry only: each branch returns shapes in absolute pixel space,
 * computed once per panel per viewport size and animated by nothing but the
 * group's opacity and scale. Nothing here runs per frame, so — unlike the
 * `core*` modules — these are NOT worklets: `LaserScene` is the declarative
 * scene and calls them from React render, where the shapes become props.
 *
 * `contentEase`/`contentScale` ARE worklets: `LaserScene` calls both from
 * inside a `useDerivedValue` callback (the content group's opacity/scale
 * animate off `elapsedSec` every frame), so both carry the `"worklet"`
 * directive, transitively reaching `ease`/`clamp01` from `coreGeometry.ts`
 * (already marked there).
 */

// Each variant is a named `interface` (not an inline object type) so a
// consumer can narrow to one by name — e.g. a test wanting `shape is
// FillRectContentShape` — without an inline object type as a generic
// argument to `Extract<...>`, which the repo's `no-restricted-syntax` bans
// even inside a type alias (only `interface` bodies and union-member object
// types stay legal — see eslint.config.mjs's `restrictedSyntax` comment).
export interface FillRectContentShape {
  readonly kind: "fillRect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly useAltColor: boolean;
}

// The three variants below are not exported by name — unlike
// `FillRectContentShape` (imported directly by `laserPanelContent.test.ts` to
// narrow with `shape is FillRectContentShape`), nothing outside this module
// narrows to these by name today; each is still reachable through the
// exported `ContentShape` union.
interface StrokeRectContentShape {
  readonly kind: "strokeRect";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly useAltColor: boolean;
  readonly strokeWidth: number;
}

interface LineContentShape {
  readonly kind: "line";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly alpha: number;
  readonly useAltColor: boolean;
}

interface PolylineContentShape {
  readonly kind: "polyline";
  readonly points: readonly (readonly [number, number])[];
  readonly alpha: number;
  readonly useAltColor: boolean;
  readonly strokeWidth: number;
}

export type ContentShape =
  | FillRectContentShape
  | StrokeRectContentShape
  | LineContentShape
  | PolylineContentShape;

/** Inner padding as a fraction of the panel's smaller side — the web's
 * `Math.min(w, h) * 0.11`. */
const PAD_FACTOR = 0.11;
const CONTENT_WINDOW = 0.24;
const CONTENT_MIN_SCALE = 0.32;

export function contentEase(progress: number, t1: number): number {
  "worklet";
  const end = Math.min(1, t1 + CONTENT_WINDOW);
  return ease(clamp01((progress - t1) / (end - t1)));
}

export function contentScale(eased: number): number {
  "worklet";
  return CONTENT_MIN_SCALE + (1 - CONTENT_MIN_SCALE) * eased;
}

export function panelContentShapes(
  kind: string,
  rect: LaserRect,
): readonly ContentShape[] {
  const pad = Math.min(rect.width, rect.height) * PAD_FACTOR;
  const inner = {
    x: rect.x + pad,
    y: rect.y + pad,
    width: rect.width - pad * 2,
    height: rect.height - pad * 2,
  };

  if (kind === "header") {
    return headerShapes(inner);
  }

  if (kind === "main") {
    return mainShapes(inner);
  }

  if (kind === "list") {
    return listShapes(inner);
  }

  if (kind === "blotter") {
    return blotterShapes(inner);
  }

  if (kind === "status") {
    return statusShapes(inner);
  }

  return [];
}

/** Four header chips at `innerX + i*72`, the first (`i === 0`) in the alt
 * colour — verbatim from the web's `panel.kind === "header"` branch. */
function headerShapes(inner: LaserRect): ContentShape[] {
  const shapes: ContentShape[] = [];

  for (let i = 0; i < 4; i++) {
    shapes.push({
      kind: "fillRect",
      x: inner.x + i * 72,
      y: inner.y + inner.height * 0.3,
      width: 54,
      height: inner.height * 0.4,
      alpha: 0.55,
      useAltColor: i === 0,
    });
  }

  return shapes;
}

/** 2x2 tile grid, each tile an outline (`strokeRect`), a head band
 * (`fillRect`) and a 13-point sine sparkline (`polyline`) — verbatim from
 * the web's `panel.kind === "main"` branch. */
function mainShapes(inner: LaserRect): ContentShape[] {
  const shapes: ContentShape[] = [];
  const tileW = (inner.width - 14) / 2;
  const tileH = (inner.height - 14) / 2;

  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const tileX = inner.x + i * (tileW + 14);
      const tileY = inner.y + j * (tileH + 14);

      shapes.push({
        kind: "strokeRect",
        x: tileX,
        y: tileY,
        width: tileW,
        height: tileH,
        alpha: 0.5,
        useAltColor: false,
        strokeWidth: 1,
      });

      shapes.push({
        kind: "fillRect",
        x: tileX,
        y: tileY,
        width: tileW,
        height: tileH * 0.34,
        alpha: 0.16,
        useAltColor: false,
      });

      const points: Array<[number, number]> = [];

      for (let sampleIdx = 0; sampleIdx <= 12; sampleIdx++) {
        const sampleX = tileX + 6 + ((tileW - 12) * sampleIdx) / 12;
        const sampleY =
          tileY +
          tileH * 0.78 -
          Math.sin(sampleIdx * 0.8 + i * 2 + j) * tileH * 0.13;
        points.push([sampleX, sampleY]);
      }

      shapes.push({
        kind: "polyline",
        points,
        alpha: 0.7,
        useAltColor: true,
        strokeWidth: 1.4,
      });
    }
  }

  return shapes;
}

/** Four rows of decreasing width (`0.92 - i*0.14`) and alpha (`0.42 -
 * i*0.06`) — verbatim from the web's `panel.kind === "list"` branch. */
function listShapes(inner: LaserRect): ContentShape[] {
  const shapes: ContentShape[] = [];
  const rows = 4;
  const rowH = inner.height / rows;

  for (let i = 0; i < rows; i++) {
    shapes.push({
      kind: "fillRect",
      x: inner.x,
      y: inner.y + i * rowH + rowH * 0.25,
      width: inner.width * (0.92 - i * 0.14),
      height: rowH * 0.4,
      alpha: 0.42 - i * 0.06,
      useAltColor: false,
    });
  }

  return shapes;
}

/** Header band (alt colour) plus 3 rules, each rule carrying a 5-cell row —
 * verbatim from the web's `panel.kind === "blotter"` branch. A `line` shape's
 * `x`/`y` is its start point and `width`/`height` its horizontal/vertical
 * extent (here always `{ width: innerW, height: 0 }`, a flat rule). */
function blotterShapes(inner: LaserRect): ContentShape[] {
  const shapes: ContentShape[] = [];
  const rows = 4;
  const rowH = inner.height / rows;

  shapes.push({
    kind: "fillRect",
    x: inner.x,
    y: inner.y,
    width: inner.width,
    height: rowH * 0.45,
    alpha: 0.5,
    useAltColor: true,
  });

  for (let i = 1; i < rows; i++) {
    shapes.push({
      kind: "line",
      x: inner.x,
      y: inner.y + i * rowH,
      width: inner.width,
      height: 0,
      alpha: 0.3,
      useAltColor: false,
    });

    for (let col = 0; col < 5; col++) {
      shapes.push({
        kind: "fillRect",
        x: inner.x + col * (inner.width / 5) + 5,
        y: inner.y + i * rowH + rowH * 0.3,
        width: (inner.width / 5) * 0.6,
        height: rowH * 0.34,
        alpha: 0.3,
        useAltColor: false,
      });
    }
  }

  return shapes;
}

/** Nine pips, every third (`i % 3 === 0`) in the alt colour — verbatim from
 * the web's `panel.kind === "status"` branch. */
function statusShapes(inner: LaserRect): ContentShape[] {
  const shapes: ContentShape[] = [];

  for (let i = 0; i < 9; i++) {
    shapes.push({
      kind: "fillRect",
      x: inner.x + i * (inner.width / 9),
      y: inner.y + inner.height * 0.3,
      width: (inner.width / 9) * 0.55,
      height: inner.height * 0.4,
      alpha: 0.5,
      useAltColor: i % 3 === 0,
    });
  }

  return shapes;
}
