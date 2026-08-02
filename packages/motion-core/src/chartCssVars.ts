import type {
  ChartScene,
  ChartVarStyle,
  CrosshairScene,
  NavigatorWindowScene,
  SceneCandle,
  VolumeSceneBar,
} from "./chartScene.js";
// Type-only import — no runtime edge, so no cycle at the module-graph level
// (the repo's dependency-cruiser config sets `tsPreCompilationDeps: false`,
// which excludes type-only edges from circular-dependency detection). If
// `pnpm check:deps` ever stops treating this as acceptable, the fallback is
// to move the ChartVm/VolumeBarVm/TimeLabelVm/CandleVm/GridLineVm/
// PriceLabelVm interfaces into chartScene.ts and re-export them from
// chartVm.ts like every other moved export.
import type { ChartVm, VolumeBarVm } from "./chartVm.js";
// Same type-only cycle-safety as above: crosshairVm.ts has a runtime import
// of this module's `crosshairVmFromScene`, so this edge back to it must stay
// type-only.
import type { CrosshairVm } from "./crosshairVm.js";

/**
 * Projects a numeric {@link ChartScene} into the string-keyed CSS custom
 * properties `chartVm` has always returned — the exact mechanical inverse of
 * `chartScene`'s "every `--foo: N` becomes `--foo: "${N}%"`" rule. This is
 * the ONLY place that constructs `ChartVarStyle` values for the chart;
 * `chartScene`/`volumeScene` never see a `%` or `calc(`.
 */
export function chartVmFromScene(scene: ChartScene): ChartVm {
  return {
    candles: scene.candles.map(candleVmFromScene),
    grid: scene.grid.map((g) => {
      return { key: g.key, style: { "--gtop": `${g.top}%` } as ChartVarStyle };
    }),
    labels: scene.priceLabels.map((l) => {
      return {
        key: l.key,
        txt: l.txt,
        style: { "--ltop": `calc(${l.top}% - 6px)` } as ChartVarStyle,
      };
    }),
    linePoints: scene.linePoints,
    timeLabels: scene.timeLabels.map((l) => {
      return {
        key: l.key,
        txt: l.txt,
        style: { "--tx": `${l.x}%` } as ChartVarStyle,
      };
    }),
    scale: scene.scale,
  };
}

function candleVmFromScene(cd: SceneCandle): ChartVm["candles"][number] {
  return {
    key: cd.key,
    up: cd.up,
    last: cd.last,
    glow: cd.glow,
    style: {
      "--x": `${cd.x}%`,
      "--top": `${cd.top}%`,
      "--h": `${cd.h}%`,
      "--w": `${cd.w}%`,
      "--wleft-offset": `${cd.w / 2}%`,
    } as ChartVarStyle,
    wickStyle: {
      "--wx": `calc(${cd.wickX}% - 0.5px)`,
      "--wtop": `${cd.wickTop}%`,
      "--wh": `${cd.wickH}%`,
    } as ChartVarStyle,
  };
}

export function volumeBarsFromScene(
  bars: readonly VolumeSceneBar[],
): readonly VolumeBarVm[] {
  return bars.map((b) => {
    return {
      key: b.key,
      up: b.up,
      style: {
        "--x": `${b.x}%`,
        "--w": `${b.w}%`,
        "--h": `${b.h}%`,
      } as ChartVarStyle,
    };
  });
}

/**
 * Projects a numeric {@link CrosshairScene} into the string-keyed
 * `--chx`/`--chy` CSS custom properties `crosshairVm` has always returned;
 * `price`/`readout` are already preformatted label text on the scene (see
 * {@link CrosshairScene}'s doc comment) and pass through unchanged.
 */
export function crosshairVmFromScene(
  scene: CrosshairScene | null,
): CrosshairVm | null {
  if (!scene) {
    return null;
  }

  return {
    idx: scene.idx,
    style: {
      "--chx": `${scene.x}%`,
      "--chy": `${scene.y}%`,
    } as ChartVarStyle,
    price: scene.price,
    readout: scene.readout,
  };
}

/**
 * Projects a numeric {@link NavigatorWindowScene} into the string-keyed
 * `--nav-left`/`--nav-w` CSS custom properties `navigatorWindowStyle` has
 * always returned.
 */
export function navigatorWindowStyleFromScene(
  win: NavigatorWindowScene,
): ChartVarStyle {
  return {
    "--nav-left": `${win.left}%`,
    "--nav-w": `${win.w}%`,
  } as ChartVarStyle;
}
