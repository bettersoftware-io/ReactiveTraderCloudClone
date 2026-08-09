// packages/client-react-native/src/ui/shell/hud/dockMetrics.ts

/** Geometry shared by the radial dock's FAB and the chrome it is painted over.
 *
 * The dock is drawn after `StatusStrip` in `app/(app)/_layout.tsx`, so the FAB
 * sits ON TOP of the strip by construction — that is the design's intent (a
 * centred hex straddling the bottom chrome), not a bug. What WAS a bug: the
 * strip's telemetry cells ran straight under it, so `60FPS` was fully occluded
 * at rest on every screen (docs/rn-open-items.md P8, measured from the a11y
 * tree — FAB `x=172 w=58` against `60FPS` at `x=195.7 w=31.7`).
 *
 * The prototype cannot be read for the fix. Its own numbers are ported here
 * verbatim (`bottom:26px`, `58x58`, strip `gap:11px`/`padding:4px 0 3px`,
 * module row `height:60px`), yet its reference shot shows the hex merely
 * nicking the strip — because the mock renders inside a phone frame at ~89%
 * scale (its hex measures 155px where a true 1:1 iPhone 17 render of 58pt
 * gives 174px). At real device scale the same numbers collide. So the mock hid
 * a latent geometry bug, and no golden could catch it either: a golden
 * compares the app to ITSELF, and the strip has been occluded in every capture
 * it ever took.
 *
 * Hence the FAB does not move — moving it to clear the strip would need
 * `bottom <= 2`, parking it on the home-indicator gesture bar. Instead the
 * telemetry row reserves this much centre width and lays its cells either
 * side. */
export const DOCK_FAB_SIZE = 58;

/** Centre width the telemetry row keeps clear for the FAB: the hex itself plus
 * one of the strip's own 11pt inter-cell gaps on each side, so the cells sit
 * off the hex at the same rhythm they sit off each other. */
export const DOCK_FAB_CLEARANCE: number = DOCK_FAB_SIZE + 22;
