/** Neutralises the React DevTools browser extension on the inspector page,
 * BEFORE react-dom evaluates. The extension's backend serialises every
 * component's props on every commit; the inspector deliberately carries a
 * 5000-row log and whole InspectorState snapshots as props, so under live
 * traffic (~15 commits/s) the extension storms `RangeError: Invalid string
 * length` and the tab goes unresponsive (live-acceptance, 2026-07-21).
 * react-dom's injectInternals() runs at module-evaluation time and bails on
 * `hook.isDisabled` — so this must be the FIRST import of the entry module.
 * Opt back in (to debug the inspector's own React tree) with `?react-devtools`. */
disableReactDevtoolsHook(
  readReactDevtoolsHook(),
  keepReactDevtools(globalThis.location),
);

interface ReactDevtoolsHook {
  isDisabled?: boolean;
}

interface HookHost {
  __REACT_DEVTOOLS_GLOBAL_HOOK__?: ReactDevtoolsHook;
}

function readReactDevtoolsHook(): ReactDevtoolsHook | undefined {
  return (globalThis as HookHost).__REACT_DEVTOOLS_GLOBAL_HOOK__;
}

function keepReactDevtools(location: Location | undefined): boolean {
  if (location === undefined) {
    return false;
  }

  return new URLSearchParams(location.search).has("react-devtools");
}

function disableReactDevtoolsHook(
  hook: ReactDevtoolsHook | undefined,
  keep: boolean,
): void {
  if (hook !== undefined && !keep) {
    hook.isDisabled = true;
  }
}

// No named exports — the file's only job is its top-level side effect above.
// `export {}` marks it an ES module (not a global script) under
// isolatedModules/verbatimModuleSyntax, which the dynamic `import(...)` in
// this file's test and in `#/main.tsx`'s side-effect import both require.
export {};
