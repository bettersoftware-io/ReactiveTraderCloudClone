/** FX tile grid column count for a viewport width. Phones (portrait) get one
 * column; tablets / landscape (>= 700px) get two. Extracted as a pure function
 * so the breakpoint is unit-tested without mounting the RN FlatList. */
export function fxColumnCount(width: number): number {
  return width >= 700 ? 2 : 1;
}
