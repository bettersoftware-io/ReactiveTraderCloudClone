/**
 * The dock's first-render recorder, installed once per browser context by
 * each runner's bootstrap (playwright/_context.ts and playwright-cucumber's
 * world) and inert until a scenario arms it.
 *
 * It used to be registered with `page.addInitScript` a few milliseconds
 * before the reload it was meant to observe. On a loaded CI runner that
 * reload once came up with the restored float correctly on screen but no
 * recorder in the document (layout.spec.ts:175, effect-core e2e job,
 * 2026-09-26): the wait timed out on a snapshot that nothing was ever going
 * to write. Registering at context creation takes the registration off the
 * navigation edge, and arming through `sessionStorage` (which a reload
 * keeps) replaces the late registration. The `armed` marker makes a missing
 * recorder a named failure instead of a timeout.
 */

/** The `sessionStorage` key `PlaywrightLayout.recordFirstDockRender` arms
 * the recorder through. */
export const FIRST_DOCK_RENDER_ARM_KEY = "rtc.e2e.firstDockRender";

/** What arming stores under `FIRST_DOCK_RENDER_ARM_KEY`: the test ids the
 * recorder looks for, JSON-encoded. */
export interface FirstDockRenderArm {
  readonly engineRoot: string;
  readonly float: string;
  readonly collapse: string;
  readonly maximize: string;
}

/** Args for the serialized init script (it cannot close over Node-side
 * values, like `seedLocalStorageItem`'s). */
export interface FirstDockRenderRecorderArgs {
  readonly armKey: string;
}

/** The page globals the recorder writes. Type-only: the init script ships
 * as source text, and these annotations are erased from it. */
export interface FirstDockRenderWindow {
  __rtcFirstDockRender?: unknown;
  __rtcFirstDockRenderArmed?: boolean;
}

/** Runs at the start of every document in the context. It does nothing
 * unless the arm key is set, and it consumes the key, so only the one
 * document loaded after arming records. That document snapshots ONCE, in
 * the microtask right after the render that first mounts the armed panel's
 * head controls: everything that render committed is in the DOM, and
 * nothing a LATER layout change publishes (a container settle, a resize, a
 * drag) can have reached it yet. A polled wait cannot make that distinction:
 * it reads true the moment any later change repairs the state, which is
 * exactly how a restored float's missing publish once hid behind a passing
 * `waitDockFloating`. */
export function installFirstDockRenderRecorder({
  armKey,
}: FirstDockRenderRecorderArgs): void {
  let raw: string | null;

  try {
    raw = window.sessionStorage.getItem(armKey);
  } catch {
    // about:blank (a fresh page's first document) denies storage access.
    return;
  }

  if (raw === null) {
    return;
  }

  window.sessionStorage.removeItem(armKey);

  const { engineRoot, float, collapse, maximize } = JSON.parse(
    raw,
  ) as FirstDockRenderArm;
  const win = window as unknown as FirstDockRenderWindow;
  win.__rtcFirstDockRenderArmed = true;

  const observer = new MutationObserver(() => {
    const control = document.querySelector(
      `[data-testid="${engineRoot}"][data-engine="dockview"] [data-testid="${float}"]`,
    );

    if (control === null || win.__rtcFirstDockRender !== undefined) {
      return;
    }

    const root = control.closest(`[data-testid="${engineRoot}"]`);
    const floating = root?.getAttribute("data-floating") ?? "";

    win.__rtcFirstDockRender = {
      floating: floating === "" ? [] : floating.split(" "),
      floatControlLabel: control.getAttribute("aria-label"),
      hasCollapseControl:
        document.querySelector(`[data-testid="${collapse}"]`) !== null,
      hasMaximizeControl:
        document.querySelector(`[data-testid="${maximize}"]`) !== null,
    };
    observer.disconnect();
  });

  observer.observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
  });
}
