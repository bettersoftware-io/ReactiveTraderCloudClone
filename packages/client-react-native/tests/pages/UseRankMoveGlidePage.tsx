// packages/client-react-native/tests/pages/UseRankMoveGlidePage.tsx
import { cleanup, render, screen } from "@testing-library/react-native";
import type { JSX, ReactElement } from "react";
import type { ViewStyle } from "react-native";
import Animated from "react-native-reanimated";

import { useRankMoveGlide } from "#/ui/equities/markets/useRankMoveGlide";

function overlayStyle(): ViewStyle {
  return screen.getByTestId("overlay").props.style as ViewStyle;
}

export interface UseRankMoveGlidePage {
  mount(
    rank: number,
    riseColor: string,
    fallColor: string,
    enabled: boolean,
  ): Promise<void>;
  // Reanimated's jest mock evaluates `useAnimatedStyle` SYNCHRONOUSLY as part
  // of render, but this hook's shared-value writes happen inside a
  // `useEffect` — an effect commits AFTER the render that triggered it
  // already returned its style, so the write from rerendering to a new
  // `rank` is invisible in THAT render's own committed style. Two SEPARATE
  // renders (standing in for the next frame a real device would
  // re-evaluate on) are needed to read it back.
  advance(rank: number, enabled: boolean): Promise<void>;
  unmountAll(): Promise<void>;
  overlayBackground(): unknown;
  overlayOpacity(): unknown;
}

/** The framework surface for `useRankMoveGlide.test.tsx`. */
export function rankMoveGlidePage(): UseRankMoveGlidePage {
  let rerender: ((el: ReactElement) => Promise<void>) | undefined;
  let riseColor = "";
  let fallColor = "";

  // Declared inside the factory (not at module scope), as `useActiveModule`'s
  // page does: Biome's `useComponentExportOnlyModules` requires every
  // top-level component in a module to be exported, which a page-internal
  // test fixture must not be.
  interface ProbeProps {
    rank: number;
    enabled: boolean;
  }

  function Probe({ rank, enabled }: ProbeProps): JSX.Element {
    const { overlayStyle: style } = useRankMoveGlide(
      rank,
      riseColor,
      fallColor,
      enabled,
    );
    return <Animated.View testID="overlay" style={style} />;
  }

  function probeTree(rank: number, enabled: boolean): ReactElement {
    return <Probe rank={rank} enabled={enabled} />;
  }

  return {
    async mount(
      rank: number,
      rise: string,
      fall: string,
      enabled: boolean,
    ): Promise<void> {
      riseColor = rise;
      fallColor = fall;
      const result = await render(probeTree(rank, enabled));
      rerender = result.rerender;
    },
    async advance(rank: number, enabled: boolean): Promise<void> {
      if (!rerender) {
        throw new Error("mount() must be called before advance()");
      }

      // Two SEPARATE element literals, not one reused reference: React
      // bails out of re-invoking a function component when the new props
      // object is REFERENTIALLY identical to the previous one.
      await rerender(probeTree(rank, enabled));
      await rerender(probeTree(rank, enabled));
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    overlayBackground(): unknown {
      return overlayStyle().backgroundColor;
    },
    overlayOpacity(): unknown {
      return overlayStyle().opacity;
    },
  };
}
