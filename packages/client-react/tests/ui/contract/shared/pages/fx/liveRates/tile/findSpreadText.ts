/**
 * The rendered spread text, between the two price boxes. SpreadDisplay
 * renders a childless <div> whose text is the bare numeric spread; the pip
 * digits live in <span>s, so filtering to childless numeric <div>s
 * disambiguates it from the price text. Shared by TilePage and TilePricePage
 * so the heuristic can't drift between the two.
 */
export function findSpreadText(root: HTMLElement): string | null {
  const candidate = [...root.querySelectorAll("div")].find((d) => {
    return (
      d.children.length === 0 &&
      /^\d+(\.\d+)?$/.test(d.textContent?.trim() ?? "")
    );
  });
  return candidate?.textContent?.trim() ?? null;
}
