/** A current-version Dockview blob of the FX tab with `fx-analytics` and
 * `fx-positions` ATTACHED side by side in one floating window — the seed for
 * the `shell/layout-dockview-attached` golden and the contract specs' detach
 * button. Captured HONESTLY from a real engine save (see the plan
 * 2026-10-02-float-magnets.md, Task 5 step 1): the running React client at a
 * 1200×700 viewport, both panels floated by their head controls, dragged
 * flush by a real pointer, the debounced save read back from localStorage.
 * `rtcBlobVersion` is the literal 3 the save carried: this package may not
 * import `@rtc/layout-dockview`, and a version bump there is meant to fail
 * this fixture loudly (the engine falls back to the seed, un-attaching the
 * pair, and every consumer reds). */
const ATTACHED_FX_LAYOUT: Record<string, unknown> = {
  grid: {
    root: {
      type: "branch",
      data: [
        {
          type: "leaf",
          data: { views: ["fx-rates"], activeView: "fx-rates", id: "group-1" },
          size: 394,
        },
        {
          type: "leaf",
          data: {
            views: ["fx-blotter"],
            activeView: "fx-blotter",
            id: "group-2",
          },
          size: 206,
        },
      ],
      size: 1187,
    },
    width: 1187,
    height: 600,
    orientation: "VERTICAL",
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
  activeGroup: "group-4",
  floatingGroups: [
    {
      grid: {
        root: {
          type: "branch",
          data: [
            {
              type: "leaf",
              data: {
                views: ["fx-analytics"],
                activeView: "fx-analytics",
                id: "group-3",
              },
              size: 367,
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
          size: 395,
        },
        width: 732,
        height: 395,
        orientation: "HORIZONTAL",
      },
      position: { top: 154, left: 410, width: 734, height: 397.4375 },
    },
  ],
  rtcBlobVersion: 3,
  rtcDesignPins: [],
  rtcFloatSizes: {
    "fx-analytics": { axis: "height", size: 300 },
    "fx-positions": { axis: "width", size: 367 },
  },
};

export const ATTACHED_FX_BLOB = JSON.stringify(ATTACHED_FX_LAYOUT);
