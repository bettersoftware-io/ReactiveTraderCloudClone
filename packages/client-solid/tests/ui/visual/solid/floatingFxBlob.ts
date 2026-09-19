/** A version-2 (gap-0, integer-model) Dockview blob of the fx seed with
 * `fx-analytics` FLOATED off its rail slot — the `shell/layout-dockview-
 * floating` scenario's deterministic seed, and the pixel witness for #763's
 * fix (a floating group over a translucent-panel skin was see-through until
 * its `.dv-resize-container` got an opaque `--bg-primary` base).
 *
 * Captured HONESTLY, not hand-written: a throwaway `DockviewLayoutEngine`
 * was mounted in a real Chromium (vitest-browser, so `getBoundingClientRect`
 * reports real layout — jsdom always reports zero-size rects, which would
 * make a floated group's captured bounds 0x0) at the SAME 1200x700 stage
 * size this golden's own harness uses below, with a fresh
 * `InMemoryDockLayoutStore` whose `save` was tapped to record what
 * `onLayoutChange` wrote. The real head control
 * (`panel-fx-analytics-float`, the same one a user clicks) was clicked, the
 * 250ms debounce was awaited, and the recorded blob is reproduced here
 * VERBATIM (only re-indented/re-quoted as an object literal — see the
 * `no-minified-json-literal` comment below) — this is the exact shape
 * dockview itself emits for a float, not an approximation of one.
 *
 * Floating `fx-analytics` removes its group from the rail, so `fx-positions`
 * (its only rail sibling) reflows to fill the FULL column height. The
 * float's box is frozen at `fx-analytics`'s pre-removal rect — the rail's
 * TOP half — which after the reflow sits directly over the top portion of
 * the now-full-height `fx-positions`: a floating panel's card overlapping
 * ANOTHER panel's live content, exactly the shape the #763 bug needed (a
 * float over empty space could never have shown a see-through regression).
 * `rtcDesignPins` still lists the analytics/positions pin — R5 (pin
 * suspension) leaves a floated member's pin recorded but inert, which is
 * real engine behaviour, not a capture artifact.
 *
 * Spelled as a literal + `JSON.stringify` rather than a minified string
 * (`rtc/no-minified-json-literal`) so the shape is readable and diffable —
 * `JSON.stringify` emits the captured blob byte for byte (key order is
 * insertion order), so what reaches the store is unchanged. `JSON.stringify`
 * over an already-named identifier is the sanctioned shape at any size
 * (`rtc/json-fixtures-in-factories`), the same pattern `stackedFxBlob.ts`
 * uses. The object is deliberately NOT typed as dockview's
 * `SerializedDockview`: the engine is confined to `@rtc/layout-dockview`
 * (dependency-cruiser `dockview-only-in-layout-dockview`), so a client may
 * not name its types. */
const FLOATING_FX_LAYOUT = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "branch",
          data: [
            {
              type: "leaf",
              data: {
                views: ["fx-rates"],
                activeView: "fx-rates",
                id: "group-1",
              },
              size: 451,
            },
            {
              type: "leaf",
              data: {
                views: ["fx-blotter"],
                activeView: "fx-blotter",
                id: "group-2",
              },
              size: 236,
            },
          ],
          size: 820,
        },
        {
          type: "leaf",
          data: {
            views: ["fx-positions"],
            activeView: "fx-positions",
            id: "group-4",
          },
          size: 367,
        },
      ],
      size: 687,
    },
    width: 1187,
    height: 687,
    orientation: "HORIZONTAL",
  },
  panels: {
    "fx-rates": {
      id: "fx-rates",
      contentComponent: "rtc-panel",
      title: "Live Rates",
    },
    "fx-blotter": {
      id: "fx-blotter",
      contentComponent: "rtc-panel",
      title: "Blotter",
    },
    "fx-analytics": {
      id: "fx-analytics",
      contentComponent: "rtc-panel",
      title: "Analytics",
    },
    "fx-positions": {
      id: "fx-positions",
      contentComponent: "rtc-panel",
      title: "Positions",
    },
  },
  activeGroup: "group-3",
  floatingGroups: [
    {
      data: {
        views: ["fx-analytics"],
        activeView: "fx-analytics",
        id: "group-3",
      },
      position: { top: 3.5, left: 823, width: 364, height: 341 },
    },
  ],
  rtcBlobVersion: 2,
  rtcDesignPins: [
    { panelIds: ["fx-analytics", "fx-positions"], px: 360, axis: "width" },
  ],
};

export const FLOATING_FX_BLOB = JSON.stringify(FLOATING_FX_LAYOUT);
