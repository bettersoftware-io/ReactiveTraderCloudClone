/** Shared test fixture: a component that always throws during render, used
 * by both PanelErrorBoundary.test.tsx (direct child) and
 * InhouseLayoutEngine.smoke.test.tsx (mounted through a registry entry, the
 * shape a real panel actually takes: `() => <ThrowingPanel />`). Lives in its
 * own (non-`.test.`) module so it can be a plain exported component — biome's
 * `useComponentExportOnlyModules` requires the export, and `noExportsInTest`
 * forbids exporting from a `*.test.*` file, so a shared fixture module is
 * the only way to satisfy both. */
export function ThrowingPanel(): never {
  throw new Error("boom");
}
