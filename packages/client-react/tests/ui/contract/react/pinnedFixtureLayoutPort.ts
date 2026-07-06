import type { LayoutPort, PanelId, PanelSpec } from "@rtc/client-core";

/** Synthetic pinned + fixedPx tree for the contract suite only.
 *
 * Task 2 removed `pinned` and `fixedPx` from every default layout tree
 * (`defaultLayoutPort.ts`) so every split is user-resizable — but the engine
 * (`InhouseLayoutEngine`) keeps rendering both for a future panel that
 * genuinely needs to opt out of resizing (per the brief: "keep the pinned
 * machinery/types for future use"). Nothing in the shipped default trees
 * exercises those render branches anymore, so this fixture — mounted only via
 * `LayoutEngineHost`'s `pinnedFixture` prop — keeps the machinery covered by
 * the contract suite instead of rotting unexercised. It reuses the real
 * fx-rates/fx-analytics/fx-blotter panel ids so it renders through the same
 * `layoutTestRegistry` bodies as the default fixture. */
export const pinnedFixtureSpecs: Readonly<Record<PanelId, PanelSpec>> = {
  "fx-rates": { id: "fx-rates", title: "Live Rates" },
  "fx-analytics": { id: "fx-analytics", title: "Analytics" },
  "fx-blotter": { id: "fx-blotter", title: "Blotter", pinned: true },
};

export const pinnedFixtureLayoutPort: LayoutPort = {
  initial: {
    root: {
      kind: "split",
      dir: "column",
      sizes: [0.78, 0.22],
      children: [
        {
          kind: "split",
          dir: "row",
          sizes: [0.7, 0.3],
          fixedPx: [undefined, 360],
          children: [
            { kind: "panel", panelId: "fx-rates" },
            { kind: "panel", panelId: "fx-analytics" },
          ],
        },
        { kind: "panel", panelId: "fx-blotter" },
      ],
    },
    maximized: null,
    collapsed: [],
  },
};
