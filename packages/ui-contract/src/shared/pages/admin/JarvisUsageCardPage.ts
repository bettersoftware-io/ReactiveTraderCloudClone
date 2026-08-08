import { within } from "@testing-library/dom";
import { MountedComponent } from "@ui-contract/harness/component";

/** One rendered per-brain usage row's text fields, in document order (mirrors
 * the component's span order: label, turns, in/out tokens, cost). */
export interface JarvisUsageRow {
  brainLabel: string;
  turnsText: string;
  tokensText: string;
  costText: string;
}

const WINDOW_TITLES = ["CURRENT WINDOW", "SINCE BOOT"] as const;
type WindowTitle = (typeof WINDOW_TITLES)[number];

/**
 * Page object for JarvisUsageCard (Task 10 of Phase 3). The component has no
 * per-row `data-testid`/`data-brain` — each `UsageSection` is its own wrapper
 * div found by its heading text, then rows are read positionally off that
 * wrapper's `<span>`s in groups of four (brain/turns/tokens/cost), the same
 * "find by content, then index" idiom ServiceHealthPage uses for its rows.
 */
export class JarvisUsageCardPage extends MountedComponent<
  Record<string, never>
> {
  /** True when the "NO USAGE DATA" placeholder is shown (usage === null). */
  isEmpty(): boolean {
    return within(this.root).queryByText(/NO USAGE DATA/i) !== null;
  }

  /** True when the "resets on server restart" caveat line is present
   * (only rendered alongside populated/empty-but-not-null usage). */
  hasCaveat(): boolean {
    return within(this.root).queryByText(/resets on server restart/i) !== null;
  }

  /** The budget-line's text (the spend/budget line, or "BUDGET OFF"), or
   * `null` when the line isn't rendered at all — a pre-round payload with
   * no budget-gate fields (`budgetUsd === undefined`). Includes the gate
   * badge's own text when one is rendered alongside (no separator between
   * the two — see {@link gateBadgeText} to read the badge in isolation). */
  budgetLineText(): string | null {
    const el = within(this.root).queryByTestId("admin-jarvis-budget-line");
    return el ? (el.textContent?.trim() ?? "") : null;
  }

  /** The gate badge's text ("SOFT GATE" / "HARD GATE"), or `null` when no
   * badge is rendered (no active gate, or the budget line itself absent). */
  gateBadgeText(): string | null {
    const el = within(this.root).queryByTestId("admin-jarvis-gate-badge");
    return el ? (el.textContent?.trim() ?? "") : null;
  }

  /** The "Window resets HH:MM:SS" (or "Window resets —") line's text. */
  resetLineText(): string {
    return (
      within(this.root)
        .getByText(/Window resets/i)
        .textContent?.trim() ?? ""
    );
  }

  /** True when the named window shows "No turns yet" (its rows are empty). */
  isWindowEmpty(title: WindowTitle): boolean {
    return within(this.sectionFor(title)).queryByText(/No turns yet/i) !== null;
  }

  /** Per-brain rows rendered in the named window, in document order. */
  rowsFor(title: WindowTitle): JarvisUsageRow[] {
    const spans = Array.from(this.sectionFor(title).querySelectorAll("span"));
    const rows: JarvisUsageRow[] = [];

    for (let i = 0; i < spans.length; i += 4) {
      rows.push({
        brainLabel: spans[i]?.textContent?.trim() ?? "",
        turnsText: spans[i + 1]?.textContent?.trim() ?? "",
        tokensText: spans[i + 2]?.textContent?.trim() ?? "",
        costText: spans[i + 3]?.textContent?.trim() ?? "",
      });
    }

    return rows;
  }

  /** The `.section` wrapper div for the named window, found by its
   * `.sectionTitle` heading text. */
  private sectionFor(title: WindowTitle): HTMLElement {
    const heading = within(this.root).getByText(title);
    const section = heading.parentElement;

    if (!section) {
      throw new Error(`no section wrapper found for "${title}"`);
    }

    return section;
  }
}
