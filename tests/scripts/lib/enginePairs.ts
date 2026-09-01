/**
 * Pairs each Dockview-engine golden with its in-house twin. The visual matrix
 * names the two engines' shots of one workspace state `X` and `X-dockview`
 * (scenarios.ts — `app/fx` / `app/fx-dockview`, `app/fx-maximized` /
 * `app/fx-maximized-dockview`, …), so the pairing is the file name alone:
 * strip the `-dockview` suffix and look the sibling up in the same skin
 * folder. A Dockview golden with no in-house sibling (`shell-layout-dockview`,
 * whose in-house counterpart is the differently-named `layout-fx-default`
 * over different stubs) is not a pair and is left out.
 */
export interface EnginePair {
  /** `<skin>-<mode>/<scenario>.png`, relative to the golden set root. */
  readonly inhouse: string;
  /** The `-dockview` twin, same skin folder. */
  readonly dockview: string;
  /** The skin folder, e.g. `holo3d-light`. */
  readonly skin: string;
  /** The in-house scenario's file stem, e.g. `app-fx-maximized`. */
  readonly scenario: string;
}

const DOCKVIEW_SUFFIX = "-dockview.png";

export function pairEngineGoldens(keys: readonly string[]): EnginePair[] {
  const present = new Set(keys);
  const pairs: EnginePair[] = [];

  for (const dockview of [...keys].sort()) {
    if (!dockview.endsWith(DOCKVIEW_SUFFIX)) {
      continue;
    }

    const inhouse = `${dockview.slice(0, -DOCKVIEW_SUFFIX.length)}.png`;

    if (!present.has(inhouse)) {
      continue;
    }

    const slash = inhouse.lastIndexOf("/");
    pairs.push({
      inhouse,
      dockview,
      skin: slash === -1 ? "" : inhouse.slice(0, slash),
      scenario: inhouse.slice(slash + 1, -".png".length),
    });
  }

  return pairs;
}
