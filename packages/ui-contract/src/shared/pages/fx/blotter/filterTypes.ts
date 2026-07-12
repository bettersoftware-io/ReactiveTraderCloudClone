import type { Trade } from "@rtc/domain";

/**
 * Structural duplicates of the pure, framework-neutral data shapes exported by
 * client-react's `src/ui/fx/blotter/{columnFilter/filterState,columnSort}.ts`
 * (verbatim field-for-field — no logic, types only). Page objects only need
 * the SHAPE to type props/return values; the real filter/sort functions stay
 * in client-react (and are imported directly by the specs that exercise
 * them). Duplicated here — rather than imported cross-package — because
 * `@rtc/ui-contract` may depend only on `@rtc/client-core`/`@rtc/domain`/rxjs
 * (see `.dependency-cruiser.cjs`); these two source files happen to have zero
 * React coupling today, so relocating them to `@rtc/client-core` would remove
 * this duplication, but that's a wider refactor than this move — tracked as a
 * follow-up, not folded into the harness extraction.
 */
export type Comparator = "eq" | "neq" | "lt" | "lte" | "gt" | "gte" | "inRange";

export type ColumnFilter<TRow = Trade> =
  | { type: "set"; column: keyof TRow; values: Set<string> }
  | {
      type: "number";
      column: keyof TRow;
      comparator: Comparator;
      value: number;
      valueTo?: number;
    }
  | {
      type: "date";
      column: keyof TRow;
      comparator: Comparator;
      value: string;
      valueTo?: string;
    };

type SortDirection = "asc" | "desc" | null;

export interface SortState<TRow = Trade> {
  column: keyof TRow | null;
  direction: SortDirection;
}
