// packages/client-react-native/tests/pages/BootCanvasPage.tsx
import { cleanup, screen } from "@testing-library/react-native";
import type { ReactNode } from "react";
import { useSharedValue } from "react-native-reanimated";

import { BootClockContext } from "#/ui/shell/boot/BootClockContext";
import { renderWithTheme } from "#/ui/theme/renderWithTheme";

/** Loaded through `require`, not a static import, and only once a mount is
 * actually asked for. `BootCanvas.test.tsx` mocks this component's
 * DEPENDENCIES (`useGyroDrift`, `useBootMotionEnabled`, `bootScene`) with
 * factories that close over `const`s declared in the spec body. A static
 * import here would pull `bootScene` in while this page module is still being
 * imported — before those `const`s initialise — and the factory would hit the
 * temporal dead zone. The spec used the same `require` for the same reason
 * before this page owned the component. */
function bootCanvas(): typeof import("#/ui/shell/boot/BootCanvas").BootCanvas {
  const module =
    require("#/ui/shell/boot/BootCanvas") as typeof import("#/ui/shell/boot/BootCanvas");

  return module.BootCanvas;
}

/** The scene variants `BootCanvas` can be asked for. `topo` is deliberately
 * unported — one case asserts it renders nothing. */
type BootVariant = "core" | "topo";

interface BootCanvasMountProps {
  variant: BootVariant;
}

/** A clock pinned to fixed values, standing in for the live frame clock. */
interface PinnedClockProps {
  elapsedSec: number;
  now: Date;
}

export interface BootCanvasPage {
  /** Mounts the canvas against the live `BootClockContext` default. */
  mount(props: BootCanvasMountProps): Promise<void>;
  /** Mounts the `core` canvas under a `BootClockContext` pinned to fixed
   * values — the witness that a pinned clock drives the scene and the frame
   * clock never starts. The provider needs `useSharedValue`, a hook, so it
   * lives in a component this page declares rather than a plain wrapper. */
  mountWithPinnedClock(props: PinnedClockProps): Promise<void>;
  unmountAll(): Promise<void>;
  exists(testId: string): boolean;
  awaitExists(testId: string): Promise<boolean>;
}

/** The framework surface for `BootCanvas.test.tsx`. */
export function bootCanvasPage(): BootCanvasPage {
  return {
    async mount(props: BootCanvasMountProps): Promise<void> {
      const BootCanvas = bootCanvas();

      await renderWithTheme(<BootCanvas variant={props.variant} />);
    },
    async mountWithPinnedClock(props: PinnedClockProps): Promise<void> {
      const BootCanvas = bootCanvas();

      function PinnedCanvas(): ReactNode {
        const pinnedElapsed = useSharedValue(props.elapsedSec);

        return (
          <BootClockContext.Provider
            value={{ elapsedSec: pinnedElapsed, now: props.now }}
          >
            <BootCanvas variant="core" />
          </BootClockContext.Provider>
        );
      }

      await renderWithTheme(<PinnedCanvas />);
    },
    async unmountAll(): Promise<void> {
      await cleanup();
    },
    exists(testId: string): boolean {
      return screen.queryByTestId(testId) != null;
    },
    async awaitExists(testId: string): Promise<boolean> {
      await screen.findByTestId(testId);
      return true;
    },
  };
}
