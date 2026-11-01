/**
 * React DevTools extension guard. The extension's backend serialises every
 * component's props on every commit; the inspector deliberately carries a
 * 5000-row log and whole InspectorState snapshots as props, so under live
 * traffic the extension storms "RangeError: Invalid string length" and the tab
 * goes unresponsive (live-acceptance, 2026-07-21). react-dom reads
 * `hook.isDisabled` at module-evaluation time, so this module must evaluate
 * before react-dom does: index.html loads it as its own `<script type="module">`
 * ahead of `main.tsx`, and it imports nothing, so nothing can be hoisted above
 * it. Opt back in (to debug the inspector's own React tree) with
 * `?react-devtools`. Asserted post-build by check:devtools-dist.
 *
 * A module, not an inline `<script>`: the deployed site's
 * Content-Security-Policy is `script-src 'self'`, which blocks inline script.
 */

interface ReactDevtoolsHook {
  isDisabled?: boolean;
}

/** Disable `hook` unless the page was opened with `keep` set. */
export function disableReactDevtoolsHook(
  hook: ReactDevtoolsHook | undefined,
  keep: boolean,
): void {
  if (hook !== undefined && !keep) {
    hook.isDisabled = true;
  }
}

interface HookWindow {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook;
}

disableReactDevtoolsHook(
  (window as HookWindow).__REACT_DEVTOOLS_GLOBAL_HOOK__,
  new URLSearchParams(window.location.search).has("react-devtools"),
);
