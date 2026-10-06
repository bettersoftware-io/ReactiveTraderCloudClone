// packages/client-react-native/src/ui/ambient/AuroraCurtains.tsx
import {
  Blend,
  Circle,
  Group,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  rect,
  vec,
} from "@shopify/react-native-skia";
import { type JSX, useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  type SharedValue,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

/**
 * The "aurora" ambient style: the web client's northern-lights curtains
 * (`client-react/src/ui/shell/background/AmbientBackground.module.css`,
 * "AURORA STYLE"), layer for layer, drawn in Skia.
 *
 *   - two glow layers (`.auroraBlobA`/`B`): elliptical radial gradients that
 *     drift and breathe on 52 s and 68 s loops;
 *   - three curtains (`.auroraCurtainA`/`B`/`C`): striped bands hanging from
 *     the top edge, faded out downwards, swaying on 44 s, 61 s and 27 s loops;
 *   - a static wash over the top half (`.auroraWash`).
 *
 * The palette is fixed (green, teal, sky, purple, magenta) and not taken
 * from the theme, so it reads as an aurora in every skin. As on the web, only
 * the two glow layers are scaled by the skin's `aurora` intensity
 * (`glowStrength`); the curtains and the wash are drawn at their own
 * strength.
 *
 * Every number below is the web stylesheet's. CSS percentages are resolved
 * against the layer's own box, which is what `box` carries.
 *
 * Motion is five Reanimated shared values, one per CSS animation, read by
 * Skia on the UI thread through `useDerivedValue`: transform only, no React
 * render per frame. With `drifting` false no loop runs and every layer rests
 * at its 0% keyframe, which is the frame the visual harness captures.
 */
export function AuroraCurtains({
  width,
  height,
  glowStrength,
  drifting,
}: AuroraCurtainsProps): JSX.Element {
  const clocks = useAuroraClocks(drifting);

  return (
    <>
      {glowSpecs(width, height).map((glow) => {
        return (
          <AuroraGlow
            key={glow.id}
            glow={glow}
            strength={glowStrength}
            clock={clocks[glow.clock]}
          />
        );
      })}
      {curtainSpecs(width, height).map((curtain) => {
        return (
          <AuroraCurtain
            key={curtain.id}
            curtain={curtain}
            clock={clocks[curtain.clock]}
          />
        );
      })}
      <AuroraWash width={width} height={height} />
    </>
  );
}

interface AuroraCurtainsProps {
  readonly width: number;
  readonly height: number;
  /** The skin's `aurora` intensity, applied to the two glow layers only. */
  readonly glowStrength: number;
  /** False under power-saver Freeze: the layers hold their 0% keyframe. */
  readonly drifting: boolean;
}

/** One clock per CSS animation: `aurora-a` … `aurora-e`. */
type AuroraClock = "a" | "b" | "c" | "d" | "e";

type AuroraClocks = Readonly<Record<AuroraClock, SharedValue<number>>>;

/** Full-cycle durations of the web's five animations, in ms. */
const CYCLE_MS: Readonly<Record<AuroraClock, number>> = {
  a: 52_000,
  b: 68_000,
  c: 44_000,
  d: 61_000,
  e: 27_000,
};

/** CSS `ease-in-out`, which the web applies to each keyframe segment. */
const EASE_IN_OUT = Easing.bezier(0.42, 0, 0.58, 1);

/** `aurora-e` is the one animation with four keyframes (0/33/66/100%), so its
 * clock runs 0→1→2→3 and wraps; the other four swing 0→1→0. */
const E_SEGMENTS: readonly number[] = [0.33, 0.33, 0.34];

function useAuroraClocks(drifting: boolean): AuroraClocks {
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const c = useSharedValue(0);
  const d = useSharedValue(0);
  const e = useSharedValue(0);

  useEffect(() => {
    const all = [a, b, c, d, e];

    for (const clock of all) {
      cancelAnimation(clock);
      clock.value = 0;
    }

    if (!drifting) {
      return;
    }

    a.value = swing(CYCLE_MS.a);
    b.value = swing(CYCLE_MS.b);
    c.value = swing(CYCLE_MS.c);
    d.value = swing(CYCLE_MS.d);
    e.value = withRepeat(
      withSequence(
        ...E_SEGMENTS.map((share, index) => {
          return withTiming(index + 1, {
            duration: CYCLE_MS.e * share,
            easing: EASE_IN_OUT,
          });
        }),
        // Back to the start of the cycle in no time: the 100% keyframe is
        // the 0% keyframe, so the wrap does not show.
        withTiming(0, { duration: 0 }),
      ),
      -1,
    );

    return () => {
      for (const clock of all) {
        cancelAnimation(clock);
      }
    };
  }, [drifting, a, b, c, d, e]);

  return { a, b, c, d, e };
}

/** A two-keyframe CSS animation as a there-and-back loop: each half is one
 * eased segment, as CSS eases 0%→50% and 50%→100% separately. */
function swing(cycleMs: number): number {
  return withRepeat(
    withTiming(1, { duration: cycleMs / 2, easing: EASE_IN_OUT }),
    -1,
    true,
  );
}

/** A layer's box in canvas px: what its CSS percentages are measured on. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** One `radial-gradient(<rx> <ry> at <cx> <cy>, …)` of a glow layer, already
 * resolved to canvas px. */
interface GlowGradient {
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  readonly colors: readonly string[];
  readonly positions: readonly number[];
}

/** A glow layer's pose at one keyframe: `translate3d(x%, y%, 0) scale(s)`. */
interface GlowPose {
  readonly tx: number;
  readonly ty: number;
  readonly scale: number;
}

interface GlowSpec {
  readonly id: string;
  readonly box: Box;
  readonly gradients: readonly GlowGradient[];
  /** The layer's own CSS opacity, before the skin's intensity. */
  readonly opacity: number;
  readonly clock: AuroraClock;
  readonly from: GlowPose;
  readonly to: GlowPose;
}

interface AuroraGlowProps {
  readonly glow: GlowSpec;
  readonly strength: number;
  readonly clock: SharedValue<number>;
}

/** One glow layer. Each gradient is a unit circle scaled into its ellipse, so
 * the falloff stays elliptical; the layer is clipped to its box, as a CSS
 * background is. */
function AuroraGlow({ glow, strength, clock }: AuroraGlowProps): JSX.Element {
  const { box, from, to } = glow;

  const transform = useDerivedValue(() => {
    const p = clock.value;

    return [
      { translateX: (from.tx + (to.tx - from.tx) * p) * box.w },
      { translateY: (from.ty + (to.ty - from.ty) * p) * box.h },
      { scale: from.scale + (to.scale - from.scale) * p },
    ];
  });

  // A typed variable: Skia's prop types do not declare `testID` (see
  // `TestGroup` in AmbientBackground.tsx).
  const testProps = { testID: glow.id };

  return (
    <Group
      {...testProps}
      origin={vec(box.x + box.w / 2, box.y + box.h / 2)}
      transform={transform}
      clip={rect(box.x, box.y, box.w, box.h)}
      opacity={glow.opacity * strength}
    >
      {glow.gradients.map((gradient) => {
        return (
          <Group
            key={`${gradient.cx}-${gradient.cy}`}
            transform={[
              { translateX: gradient.cx },
              { translateY: gradient.cy },
              { scaleX: gradient.rx },
              { scaleY: gradient.ry },
            ]}
          >
            <Circle cx={0} cy={0} r={1}>
              <RadialGradient
                c={vec(0, 0)}
                r={1}
                colors={[...gradient.colors]}
                positions={[...gradient.positions]}
              />
            </Circle>
          </Group>
        );
      })}
    </Group>
  );
}

/** A curtain's pose at one keyframe:
 * `translate3d(x%, y%, 0) skewX(deg) scaleY(s)`. */
interface CurtainPose {
  readonly tx: number;
  readonly ty: number;
  readonly skewDeg: number;
  readonly scaleY: number;
}

interface CurtainSpec {
  readonly id: string;
  readonly box: Box;
  /** The band's outline: flat on top, two quarter-ellipses below
   * (`border-radius: 0 0 R% L% / 0 0 100% 100%`). */
  readonly outline: string;
  /** The `repeating-linear-gradient` stripes: one period, start to end. */
  readonly stripeStart: { readonly x: number; readonly y: number };
  readonly stripeEnd: { readonly x: number; readonly y: number };
  readonly stripeColors: readonly string[];
  readonly stripePositions: readonly number[];
  /** The top-to-bottom `mask-image` fade, as white at the mask's alpha. */
  readonly fadeColors: readonly string[];
  readonly fadePositions: readonly number[];
  readonly opacity: number;
  readonly clock: AuroraClock;
  /** Keyframes in order; the clock's value indexes into them. */
  readonly poses: readonly CurtainPose[];
}

interface AuroraCurtainProps {
  readonly curtain: CurtainSpec;
  readonly clock: SharedValue<number>;
}

/** One curtain: the stripes multiplied by the downward fade in a single
 * shader (`modulate` multiplies colour and alpha alike, so the fade thins the
 * stripes without tinting them), which keeps the band one draw with no
 * offscreen layer. */
function AuroraCurtain({ curtain, clock }: AuroraCurtainProps): JSX.Element {
  const { box, poses } = curtain;

  const transform = useDerivedValue(() => {
    const last = poses.length - 1;
    const at = Math.min(Math.max(clock.value, 0), last);
    const index = Math.min(Math.floor(at), last - 1);
    const p = at - index;
    const from = poses[index];
    const to = poses[index + 1];

    if (from === undefined || to === undefined) {
      return [];
    }

    return [
      { translateX: (from.tx + (to.tx - from.tx) * p) * box.w },
      { translateY: (from.ty + (to.ty - from.ty) * p) * box.h },
      {
        skewX:
          ((from.skewDeg + (to.skewDeg - from.skewDeg) * p) * Math.PI) / 180,
      },
      { scaleY: from.scaleY + (to.scaleY - from.scaleY) * p },
    ];
  });

  const testProps = { testID: curtain.id };

  return (
    <Group
      origin={vec(box.x + box.w / 2, box.y + box.h / 2)}
      transform={transform}
    >
      <Path {...testProps} path={curtain.outline} opacity={curtain.opacity}>
        <Blend mode="modulate">
          <LinearGradient
            start={vec(curtain.stripeStart.x, curtain.stripeStart.y)}
            end={vec(curtain.stripeEnd.x, curtain.stripeEnd.y)}
            colors={[...curtain.stripeColors]}
            positions={[...curtain.stripePositions]}
            mode="repeat"
          />
          <LinearGradient
            start={vec(box.x, box.y)}
            end={vec(box.x, box.y + box.h)}
            colors={[...curtain.fadeColors]}
            positions={[...curtain.fadePositions]}
          />
        </Blend>
      </Path>
    </Group>
  );
}

interface AuroraWashProps {
  readonly width: number;
  readonly height: number;
}

const WASH_OPACITY = 0.5;

/** `.auroraWash`: a still purple-to-sky wash over the top 52%. */
function AuroraWash({ width, height }: AuroraWashProps): JSX.Element {
  const testProps = { testID: "aurora-wash" };
  const washHeight = height * 0.52;

  return (
    <Rect
      {...testProps}
      x={0}
      y={0}
      width={width}
      height={washHeight}
      opacity={WASH_OPACITY}
    >
      <LinearGradient
        start={vec(0, 0)}
        end={vec(0, washHeight)}
        colors={[
          rgba(PURPLE, 0.14),
          rgba(SKY, 0.06),
          // CSS fades to `transparent` in premultiplied space, so the hue
          // holds; the same colour at alpha 0 reproduces that.
          rgba(SKY, 0),
        ]}
        positions={[0, 0.55, 1]}
      />
    </Rect>
  );
}

type Rgb = readonly [number, number, number];

const GREEN: Rgb = [61, 255, 171];
const TEAL: Rgb = [45, 212, 191];
const SKY: Rgb = [56, 189, 248];
const PURPLE: Rgb = [168, 85, 247];
const MAGENTA: Rgb = [217, 70, 239];
const WHITE: Rgb = [255, 255, 255];

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
}

/** `.auroraBlobA` and `.auroraBlobB`: both `inset: -12% -6%`, so 112% of the
 * width and 124% of the height. */
function glowSpecs(width: number, height: number): GlowSpec[] {
  const box: Box = {
    x: width * -0.06,
    y: height * -0.12,
    w: width * 1.12,
    h: height * 1.24,
  };

  function gradient(
    rx: number,
    ry: number,
    cx: number,
    cy: number,
    stops: readonly (readonly [Rgb, number, number])[],
  ): GlowGradient {
    return {
      cx: box.x + box.w * cx,
      cy: box.y + box.h * cy,
      rx: box.w * rx,
      ry: box.h * ry,
      colors: stops.map(([color, alpha]) => {
        return rgba(color, alpha);
      }),
      positions: stops.map(([, , position]) => {
        return position;
      }),
    };
  }

  return [
    {
      id: "aurora-glow-a",
      box,
      opacity: 0.26,
      clock: "a",
      from: { tx: -0.07, ty: -0.04, scale: 1.08 },
      to: { tx: 0.07, ty: 0.05, scale: 1.28 },
      gradients: [
        gradient(1.2, 0.3, 0.5, 0.12, [
          [GREEN, 0.42, 0],
          [TEAL, 0.2, 0.46],
          [TEAL, 0, 0.74],
        ]),
        gradient(0.9, 0.24, 0.3, 0.26, [
          [SKY, 0.3, 0],
          [SKY, 0, 0.68],
        ]),
        gradient(0.8, 0.22, 0.74, 0.06, [
          [PURPLE, 0.38, 0],
          [MAGENTA, 0.14, 0.52],
          [MAGENTA, 0, 0.76],
        ]),
      ],
    },
    {
      id: "aurora-glow-b",
      box,
      opacity: 0.2,
      clock: "b",
      from: { tx: 0.06, ty: 0.04, scale: 1.22 },
      to: { tx: -0.06, ty: -0.04, scale: 1.04 },
      gradients: [
        gradient(0.7, 0.18, 0.62, 0.2, [
          [MAGENTA, 0.3, 0],
          [MAGENTA, 0, 0.64],
        ]),
        gradient(0.95, 0.26, 0.18, 0.1, [
          [TEAL, 0.34, 0],
          [TEAL, 0, 0.66],
        ]),
      ],
    },
  ];
}

/** One stop of a `repeating-linear-gradient`: colour, alpha, and its
 * distance along the gradient line in px. */
type StripeStop = readonly [Rgb, number, number];

interface CurtainShape {
  readonly id: string;
  /** `left`/`right` overhang, `top` and `height`, as shares of the canvas. */
  readonly overhang: number;
  readonly top: number;
  readonly heightShare: number;
  /** Share of the width taken by the bottom-RIGHT corner's radius; the
   * bottom-left takes the rest. */
  readonly rightRadius: number;
  /** The CSS gradient angle, in degrees. */
  readonly angleDeg: number;
  /** Stops of one period; the last stop's distance is the period. */
  readonly stripes: readonly StripeStop[];
  /** The mask's alpha stops, top to bottom. */
  readonly fade: readonly (readonly [number, number])[];
  readonly opacity: number;
  readonly clock: AuroraClock;
  readonly poses: readonly CurtainPose[];
}

const CURTAIN_SHAPES: readonly CurtainShape[] = [
  {
    id: "aurora-curtain-a",
    overhang: 0.18,
    top: -0.06,
    heightShare: 0.46,
    rightRadius: 0.5,
    angleDeg: 94,
    stripes: [
      [GREEN, 0, 0],
      [GREEN, 0.1, 14],
      [GREEN, 0.42, 26],
      [TEAL, 0.18, 40],
      [TEAL, 0, 58],
      [SKY, 0, 92],
      [SKY, 0.3, 110],
      [GREEN, 0.12, 126],
      [GREEN, 0, 148],
      [GREEN, 0, 205],
    ],
    fade: [
      [0.95, 0.06],
      [0.6, 0.45],
      [0.18, 0.75],
      [0, 1],
    ],
    opacity: 0.3,
    clock: "c",
    poses: [
      { tx: -0.04, ty: -0.02, skewDeg: -4, scaleY: 1.05 },
      { tx: 0.05, ty: 0.02, skewDeg: 5, scaleY: 1.18 },
    ],
  },
  {
    id: "aurora-curtain-b",
    overhang: 0.18,
    top: -0.04,
    heightShare: 0.4,
    rightRadius: 0.6,
    angleDeg: 86,
    stripes: [
      [PURPLE, 0, 0],
      [PURPLE, 0, 44],
      [PURPLE, 0.36, 66],
      [MAGENTA, 0.16, 84],
      [MAGENTA, 0, 106],
      [GREEN, 0, 170],
      [GREEN, 0.22, 192],
      [GREEN, 0, 216],
      [GREEN, 0, 275],
    ],
    fade: [
      [0.9, 0.04],
      [0.5, 0.42],
      [0.12, 0.72],
      [0, 1],
    ],
    opacity: 0.24,
    clock: "d",
    poses: [
      { tx: 0.04, ty: 0.01, skewDeg: 6, scaleY: 1.14 },
      { tx: -0.05, ty: -0.02, skewDeg: -5, scaleY: 1.02 },
    ],
  },
  {
    id: "aurora-curtain-c",
    overhang: 0.14,
    top: 0.02,
    heightShare: 0.3,
    rightRadius: 0.45,
    angleDeg: 91,
    stripes: [
      [WHITE, 0, 0],
      [WHITE, 0, 26],
      [WHITE, 0.16, 34],
      [GREEN, 0.3, 42],
      [GREEN, 0, 54],
      [GREEN, 0, 120],
    ],
    fade: [
      [0.9, 0.08],
      [0.35, 0.55],
      [0, 0.92],
    ],
    opacity: 0.22,
    clock: "e",
    poses: [
      { tx: -0.02, ty: 0, skewDeg: -2, scaleY: 1 },
      { tx: 0.03, ty: 0.01, skewDeg: 4, scaleY: 1.22 },
      { tx: -0.01, ty: -0.01, skewDeg: -3, scaleY: 1.08 },
      { tx: -0.02, ty: 0, skewDeg: -2, scaleY: 1 },
    ],
  },
];

function curtainSpecs(width: number, height: number): CurtainSpec[] {
  return CURTAIN_SHAPES.map((shape) => {
    const box: Box = {
      x: width * -shape.overhang,
      y: height * shape.top,
      w: width * (1 + 2 * shape.overhang),
      h: height * shape.heightShare,
    };
    const right = box.x + box.w;
    const bottom = box.y + box.h;
    const rightRadius = box.w * shape.rightRadius;
    const leftRadius = box.w - rightRadius;

    // A CSS gradient line runs through the box's centre at `angle` clockwise
    // from "up", and is as long as the box's extent along that direction.
    const angle = (shape.angleDeg * Math.PI) / 180;
    const dirX = Math.sin(angle);
    const dirY = -Math.cos(angle);
    const lineLength = Math.abs(box.w * dirX) + Math.abs(box.h * dirY);
    const startX = box.x + box.w / 2 - (dirX * lineLength) / 2;
    const startY = box.y + box.h / 2 - (dirY * lineLength) / 2;
    const period = shape.stripes[shape.stripes.length - 1]?.[2] ?? 1;

    return {
      id: shape.id,
      box,
      outline:
        `M${box.x} ${box.y} H${right} ` +
        `A${rightRadius} ${box.h} 0 0 1 ${right - rightRadius} ${bottom} ` +
        `A${leftRadius} ${box.h} 0 0 1 ${box.x} ${box.y} Z`,
      stripeStart: { x: startX, y: startY },
      stripeEnd: { x: startX + dirX * period, y: startY + dirY * period },
      stripeColors: shape.stripes.map(([color, alpha]) => {
        return rgba(color, alpha);
      }),
      stripePositions: shape.stripes.map(([, , distance]) => {
        return distance / period;
      }),
      fadeColors: shape.fade.map(([alpha]) => {
        return rgba(WHITE, alpha);
      }),
      fadePositions: shape.fade.map(([, position]) => {
        return position;
      }),
      opacity: shape.opacity,
      clock: shape.clock,
      poses: shape.poses,
    };
  });
}
