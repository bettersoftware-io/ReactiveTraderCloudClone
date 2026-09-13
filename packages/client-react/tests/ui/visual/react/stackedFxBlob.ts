/** A version-2 (gap-0, integer-model) Dockview blob of the fx seed with
 * `fx-rates` and `fx-analytics` CENTRE-STACKED in one group (rates active,
 * analytics as the inactive chip) — the `shell/layout-dockview-stacked`
 * scenario's deterministic seed. Captured from a real jsdom
 * `createDockEngine` + `moveTo({ position: "center" })` round (Phase 2 plan,
 * Task 3) and hand-set to `activeView: "fx-rates"`; the engine test
 * "loads the stacked visual fixture blob" pins that this exact shape keeps
 * loading as 3 groups with the 2-panel stack — if the blob format moves,
 * that test (and this fixture) fail loudly together. Titles inside the blob
 * are cosmetic: the bridge re-applies PANEL_SPECS titles on load. */
export const STACKED_FX_BLOB =
  '{"grid":{"root":{"type":"branch","data":[{"type":"branch","data":[{"type":"leaf","data":{"views":["fx-rates","fx-analytics"],"activeView":"fx-rates","id":"group-1"},"size":419},{"type":"leaf","data":{"views":["fx-blotter"],"activeView":"fx-blotter","id":"group-2"},"size":281}],"size":942},{"type":"leaf","data":{"views":["fx-positions"],"activeView":"fx-positions","id":"group-4"},"size":318}],"size":700},"width":1260,"height":700,"orientation":"HORIZONTAL"},"panels":{"fx-rates":{"id":"fx-rates","contentComponent":"rtc-panel","title":"fx-rates"},"fx-analytics":{"id":"fx-analytics","contentComponent":"rtc-panel","title":"fx-analytics"},"fx-blotter":{"id":"fx-blotter","contentComponent":"rtc-panel","title":"fx-blotter"},"fx-positions":{"id":"fx-positions","contentComponent":"rtc-panel","title":"fx-positions"}},"activeGroup":"group-1","rtcBlobVersion":2,"rtcDesignPins":[]}';
