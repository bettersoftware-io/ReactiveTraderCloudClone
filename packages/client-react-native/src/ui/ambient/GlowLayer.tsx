// packages/client-react-native/src/ui/ambient/GlowLayer.tsx
import {
  Circle,
  Group,
  RadialGradient,
  rect,
  vec,
} from "@shopify/react-native-skia";
import type { JSX } from "react";
import { type SharedValue, useDerivedValue } from "react-native-reanimated";

import type { GlowSpec } from "#/ui/ambient/glowSpec";

/**
 * One drifting glow layer of the ambient background: what the web client
 * draws as a `<div>` whose background is a stack of elliptical
 * `radial-gradient`s, moved by the `aurora-a` or `aurora-b` keyframes. Both
 * ambient styles are built from two of these (`AuroraCurtains`,
 * `AmbientRays`), on the same two keyframe sets.
 *
 * Each gradient is a unit circle scaled into its ellipse, so the falloff
 * stays elliptical; the layer is clipped to its box, as a CSS background is.
 * The pose is read from `clock` on the UI thread: at 0 it is the 0% keyframe,
 * at 1 the 50% one.
 */
export function GlowLayer({
  glow,
  opacity,
  clock,
}: GlowLayerProps): JSX.Element {
  const { box, drift } = glow;
  const { from, to } = drift;

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
      opacity={opacity}
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

interface GlowLayerProps {
  readonly glow: GlowSpec;
  /** The layer's opacity as drawn (its own, times whatever scales it). */
  readonly opacity: number;
  readonly clock: SharedValue<number>;
}
