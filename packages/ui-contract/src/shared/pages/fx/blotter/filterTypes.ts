/**
 * Re-exported from `@rtc/client-core` (its `blotter/` module), where the
 * pure, framework-neutral column-filter/sort state shapes and functions live
 * — relocated there out of client-react (they had zero React coupling: only
 * `@rtc/domain`). Page objects only need the SHAPE to type props/return
 * values, so only the types are re-exported here.
 */
export type { ColumnFilter, Comparator, SortState } from "@rtc/client-core";
