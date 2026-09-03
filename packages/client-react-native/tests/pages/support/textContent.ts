// packages/client-react-native/tests/pages/support/textContent.ts
//
// Aggregates a rendered element's full text content across every descendant
// Text node — the same computation RNTL's own `toHaveTextContent` matcher
// does internally (`getTextContent` in its `helpers/text-content`, not part
// of its public API), replicated here so a page can expose a semantic
// `hasTextContent(testId, text)` boolean without a spec ever importing the
// matcher (or `expect`) itself.
interface TextInstanceLike {
  children?: readonly (TextInstanceLike | string)[];
}

export function textContentOf(instance: TextInstanceLike | string): string {
  if (typeof instance === "string") {
    return instance;
  }

  return (instance.children ?? []).map(textContentOf).join("");
}
