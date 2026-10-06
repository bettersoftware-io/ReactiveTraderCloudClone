// packages/client-react-native/src/ui/ambient/AmbientRays.tsx
import { Circle, Group, SweepGradient, vec } from "@shopify/react-native-skia";
import { type JSX, useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { GlowLayer } from "#/ui/ambient/GlowLayer";
import {
  type Box,
  DRIFT_A,
  DRIFT_B,
  type GlowSpec,
  glowGradient,
  swing,
} from "#/ui/ambient/glowSpec";
import type { RnTheme } from "#/ui/theme/tokens";
import { withAlpha } from "#/ui/theme/withAlpha";

/**
 * The "rays" ambient style: the web client's original backdrop
 * (`client-react/src/ui/shell/background/AmbientBackground.module.css`,
 * `.layerA`, `.layerB`, `.sweep`), layer for layer, drawn in Skia.
 *
 *   - two glow layers in the theme's accents, drifting and breathing on the
 *     same 52 s and 68 s loops the aurora's glows use;
 *   - one beam: a narrow wedge of the primary accent that turns a full circle
 *     every 90 s, like a lighthouse.
 *
 * Unlike the aurora, this style takes its colours from the theme. One
 * deliberate departure from the web: there every layer is scaled by the
 * skin's intensity (`--aurora-opacity`), which leaves the style close to
 * invisible on the calm skins and absent on Classic. Here it is drawn at ONE
 * strength in every skin, the web's Holo level (`RAYS_STRENGTH`) — the
 * owner's choice, 2026-10-06.
 *
 * With `drifting` false no loop runs: the glows rest at their 0% keyframe and
 * the beam points straight up, which is the frame the visual harness
 * captures.
 */
export function AmbientRays({
  width,
  height,
  theme,
  drifting,
}: AmbientRaysProps): JSX.Element {
  const driftA = useSharedValue(0);
  const driftB = useSharedValue(0);
  const turn = useSharedValue(0);

  useEffect(() => {
    const all = [driftA, driftB, turn];

    for (const clock of all) {
      cancelAnimation(clock);
      clock.value = 0;
    }

    if (!drifting) {
      return;
    }

    driftA.value = swing(DRIFT_A.cycleMs);
    driftB.value = swing(DRIFT_B.cycleMs);
    turn.value = withRepeat(
      withTiming(1, { duration: SWEEP_TURN_MS, easing: Easing.linear }),
      -1,
    );

    return () => {
      for (const clock of all) {
        cancelAnimation(clock);
      }
    };
  }, [drifting, driftA, driftB, turn]);

  const [glowA, glowB] = glowSpecs(width, height, theme);

  // The beam's wedge is drawn starting at Skia's zero angle, which points
  // right; a CSS conic gradient starts pointing up, hence the quarter turn.
  const sweepTransform = useDerivedValue(() => {
    return [{ rotate: (turn.value - 0.25) * 2 * Math.PI }];
  });

  const centre = vec(width / 2, height / 2);
  // A typed variable: Skia's prop types do not declare `testID`.
  const sweepProps = { testID: "rays-sweep" };

  return (
    <>
      <GlowLayer
        glow={glowA}
        opacity={GLOW_A_OPACITY * RAYS_STRENGTH}
        clock={driftA}
      />
      <GlowLayer
        glow={glowB}
        opacity={GLOW_B_OPACITY * RAYS_STRENGTH}
        clock={driftB}
      />
      <Group origin={centre} transform={sweepTransform}>
        <Circle
          {...sweepProps}
          c={centre}
          r={Math.max(width, height) * SWEEP_REACH}
          opacity={SWEEP_OPACITY * RAYS_STRENGTH}
        >
          <SweepGradient
            c={centre}
            colors={[
              withAlpha(theme.accentPrimary, 0),
              theme.accentPrimary,
              withAlpha(theme.accentPrimary, 0),
              withAlpha(theme.accentPrimary, 0),
            ]}
            positions={[0, 10 / 360, 34 / 360, 1]}
          />
        </Circle>
      </Group>
    </>
  );
}

interface AmbientRaysProps {
  readonly width: number;
  readonly height: number;
  readonly theme: RnTheme;
  /** False under power-saver Freeze: the layers hold their resting pose. */
  readonly drifting: boolean;
}

/** What the web's Holo skin multiplies this style by (`--aurora-opacity:
 * 0.6`), applied here in every skin. */
const RAYS_STRENGTH = 0.6;
/** `.layerA` and `.layerB`'s own opacities. */
const GLOW_A_OPACITY = 0.18;
const GLOW_B_OPACITY = 0.13;
/** `.sweep`'s own share: `opacity: calc(var(--aurora-opacity) * 0.06)`. */
const SWEEP_OPACITY = 0.06;
/** One full turn of the beam. */
const SWEEP_TURN_MS = 90_000;
/** The beam is a 170vmax square on the web, so it reaches 85vmax from the
 * centre along the axes and further into the corners; a disc of that
 * half-diagonal covers the same ground. */
const SWEEP_REACH: number = 0.85 * Math.SQRT2;

/** The web's `--aurora-a` and `--aurora-b` are the two accents at these
 * alphas (`rgba(0,224,255,0.35)` and `rgba(25,255,208,0.3)` on Holo). */
const ACCENT_A_ALPHA = 0.35;
const ACCENT_B_ALPHA = 0.3;

/** A CSS `color-mix(in srgb, <c> 40%, transparent)` mid stop. */
const MID_STOP = 0.4;

/** `.layerA` and `.layerB`: both `inset: -25%`, so 150% of each dimension. */
function glowSpecs(
  width: number,
  height: number,
  t: RnTheme,
): [GlowSpec, GlowSpec] {
  const box: Box = {
    x: width * -0.25,
    y: height * -0.25,
    w: width * 1.5,
    h: height * 1.5,
  };

  function falloff(
    color: string,
    mid: number,
    end: number,
  ): (readonly [string, number])[] {
    return [
      [color, 0],
      [withAlpha(color, MID_STOP), mid],
      [withAlpha(color, 0), end],
    ];
  }

  const accentA = withAlpha(t.accentPrimary, ACCENT_A_ALPHA);
  const accentB = withAlpha(t.accent2, ACCENT_B_ALPHA);

  return [
    {
      id: "rays-glow-a",
      box,
      drift: DRIFT_A,
      gradients: [
        glowGradient(
          box,
          [0.44, 0.44],
          [0.28, 0.32],
          falloff(accentA, 0.46, 0.76),
        ),
        glowGradient(
          box,
          [0.4, 0.4],
          [0.78, 0.64],
          falloff(accentB, 0.46, 0.76),
        ),
      ],
    },
    {
      id: "rays-glow-b",
      box,
      drift: DRIFT_B,
      gradients: [
        glowGradient(
          box,
          [0.36, 0.42],
          [0.66, 0.22],
          falloff(t.accentPositive, 0.44, 0.75),
        ),
        glowGradient(
          box,
          [0.46, 0.46],
          [0.22, 0.82],
          falloff(t.accentPrimary, 0.44, 0.75),
        ),
      ],
    },
  ];
}
