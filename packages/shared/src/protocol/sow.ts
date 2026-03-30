/**
 * Variant A: Bulk State-of-the-World envelope.
 * Used by BlotterService, ReferenceDataService, AnalyticsService.
 */
export interface BulkSoWMessage<T> {
  readonly updates: readonly T[];
  readonly isStateOfTheWorld: boolean;
  readonly isStale: boolean;
}

/**
 * Variant B: Marker-based State-of-the-World events.
 * Used by WorkflowService, InstrumentService, DealerService.
 */
export type MarkerEvent<T> =
  | { readonly type: "startOfStateOfTheWorld" }
  | { readonly type: "endOfStateOfTheWorld" }
  | { readonly type: "added"; readonly payload: T }
  | { readonly type: "removed"; readonly payload: number };
