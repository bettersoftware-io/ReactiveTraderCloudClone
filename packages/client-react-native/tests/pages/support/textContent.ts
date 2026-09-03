// packages/client-react-native/tests/pages/support/textContent.ts
//
// Aggregates a rendered element's full text content across every descendant
// Text node — the same tree-walk RNTL's own `toHaveTextContent` matcher does
// internally (`getTextContent` in its `helpers/text-content`, not part of its
// public API), replicated here so a page can expose a semantic
// `hasTextContent(testId, text)`/`textOf(testId)` surface without a spec ever
// importing the matcher (or `expect`) itself. The walk is a faithful replica;
// the COMPARISON a caller performs against the walked string is the caller's
// own choice — `hasTextContent` normalizes and compares exactly (matching
// `toHaveTextContent`'s default `exact: true` semantics), not a substring
// test.
interface TextInstanceLike {
  children?: readonly (TextInstanceLike | string)[];
}

export function textContentOf(
  instance: TextInstanceLike | string | null | undefined,
): string {
  if (instance == null) {
    return "";
  }

  if (typeof instance === "string") {
    return instance;
  }

  return (instance.children ?? []).map(textContentOf).join("");
}

/** RNTL's own default normalizer: trim, then collapse internal whitespace
 * runs to a single space — the same pass `toHaveTextContent`'s default
 * (`exact: true`) comparison applies to both sides before `===`. */
export function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}
