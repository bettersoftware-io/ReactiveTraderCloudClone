// Declared locally rather than imported from @rtc/motion-core — client-core
// must not depend on motion-core (see global constraints; the same EqPaneId
// doctrine as EqWorkspaceMachine). motion-core's drawingScene types unify
// with these structurally.
export type EqDrawTool = "cursor" | "trendline" | "hline";

export interface EqDrawingAnchor {
  readonly index: number; // candle index, snapped to a center at commit
  readonly price: number; // unsnapped
}

export type EqDrawing =
  | {
      readonly id: string;
      readonly kind: "trendline";
      readonly a: EqDrawingAnchor;
      readonly b: EqDrawingAnchor;
    }
  | { readonly id: string; readonly kind: "hline"; readonly price: number };

export interface EqDrawingsState {
  readonly tool: EqDrawTool;
  readonly drawings: Readonly<Record<string, readonly EqDrawing[]>>;
  readonly selectedId: string | null;
}

export interface EqDrawingsIntents {
  setTool(tool: EqDrawTool): void;
  addDrawing(sym: string, drawing: EqDrawing): void;
  updateDrawing(sym: string, drawing: EqDrawing): void;
  selectDrawing(id: string | null): void;
  deleteSelected(sym: string): void;
  shiftAnchors(sym: string, by: number): void;
}
