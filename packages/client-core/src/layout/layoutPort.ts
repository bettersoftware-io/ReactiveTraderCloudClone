/** The replaceable layout seam. Moved to `@rtc/core-api` (pluggable-core-slice-0
 * Task 2) — re-exported here so every existing `import … from "@rtc/client-core"`
 * keeps working unchanged. */
export type {
  LayoutNode,
  LayoutPort,
  LayoutState,
  PanelId,
  PanelSpec,
  SplitDir,
} from "@rtc/core-api";
