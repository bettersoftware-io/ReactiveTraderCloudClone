// packages/client-react-native/src/ui/shell/hud/DockOpenContext.ts
import { createContext } from "react";

/** A pinned initial dock state the visual harness injects so a golden can hold
 * `RadialCommandDock` FANNED OPEN. The dock's `open` flag is internal
 * `useState` reachable only by tapping the FAB, so until this seam existed the
 * expanded satellite arc had no golden at all — `ShellFrameFixture` captured
 * the dock collapsed in every framed scenario, and its docstring recorded the
 * gap as "needs the Maestro tier, which can tap". The same seam shape as
 * `LockHoldProgressContext` and `BootClockContext`: `null` in production ⇒ no
 * provider, the dock owns its own state and starts collapsed exactly as it
 * always has. Read ONCE, as the `useState` initial value rather than as the
 * live one, so the FAB and the scrim still toggle the dock during a capture
 * the way they do on device. */
export const DockOpenContext = createContext<boolean | null>(null);
