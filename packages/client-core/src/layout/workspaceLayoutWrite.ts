/**
 * The workspace-layout write — the one place that turns live layout/panel
 * state back into the `workspaceLayoutV1` preference string. Synchronous and
 * rxjs-free (pluggable-core slice 7): every application core debounces its
 * own kicks and then calls `writeWorkspaceLayout`; the RxJS shell is
 * `workspacePersistenceWriter.ts`.
 *
 * Extracted from `composition.ts` rather than inlined there for two reasons:
 * composition has no debounced-writer precedent to mirror (every other
 * preference is written imperatively from a presenter setter), and the
 * payload assembly below has real rules worth testing directly — with an
 * injected `scheduler` a unit test drives the debounce in virtual time
 * instead of waiting half a second per assertion.
 *
 * Assembly is READ-MODIFY-WRITE, and deliberately so: `createdLayouts()`
 * only reports tabs whose layout machine has actually been created this
 * session (`layoutFor` is lazy — see its doc in `composition.ts`), so a tab
 * the user never opened keeps whatever the stored payload already had for
 * it. A blind whole-payload rewrite would erase three tabs' saved layouts
 * the first time the fourth one changed.
 *
 * Everything written here must survive `parseWorkspaceLayout`, which is
 * fail-closed on the WHOLE payload: one inconsistent tab discards every
 * tab's layout at the next boot. Two live-state divergences can produce such
 * an inconsistency, and both are reconciled here rather than left to the
 * parser to reject:
 * - an ORPHAN leaf — a docked panel dismissed while docked (`dismissPanel`
 *   works on docked panels, and a driven `dismissPanel` command reaches the
 *   panels machine without touching any layout tree) leaves its leaf behind
 *   in the tab's tree with no spec to persist. The leaf is pruned from the
 *   written copy of the tree (`removeDockedLeaf`, the same pure helper the
 *   machine's own `removePanel` uses), along with any `maximized`/
 *   `collapsed` reference to it;
 * - a GHOST placement — a docked panel whose tab tree has no matching leaf.
 *   It is simply not written.
 * Neither reconciliation touches live state: this module only ever shapes
 * the payload it is about to serialize.
 */

import type { PanelSpecV1 } from "@rtc/shared";

import type { WorkspaceTab } from "./defaultLayoutPort";
import { createDefaultLayoutPort } from "./defaultLayoutPort";
import { dockedLeafIds, removeDockedLeaf } from "./dockColumn";
import type { LayoutState } from "./layoutPort";
import type {
  DockedPanelEntry,
  PersistedTabLayout,
  WorkspaceLayoutV1,
} from "./workspaceLayoutPersistence";
import {
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
} from "./workspaceLayoutPersistence";

/** One docked panel plus the tab it belongs to. The tab is the one that was
 * ACTIVE at the moment the panel was docked — a docked panel stays with that
 * tab for as long as it is docked, no matter where the user navigates
 * afterwards (composition owns that mapping; see its `dockedPanelTabs`). */
export interface DockedPanelPlacement {
  readonly panelId: string;
  readonly spec: PanelSpecV1;
  readonly tab: WorkspaceTab;
}

export interface WorkspaceLayoutWriteDeps {
  /** The raw stored preference value, read fresh at every write — this is
   * the "read" half of read-modify-write. */
  readonly readStoredLayout: () => string | null;
  readonly writeStoredLayout: (value: string) => void;
  /** Current `LayoutState` of every tab whose layout machine has been
   * CREATED. Tabs absent from the map are never rewritten. */
  readonly createdLayouts: () => ReadonlyMap<WorkspaceTab, LayoutState>;
  /** Every currently docked panel, with the tab it was docked into. */
  readonly dockedPanels: () => readonly DockedPanelPlacement[];
}

/** Prune every docked leaf in `layout` that no placement accounts for, and
 * drop every placement the tree has no leaf for — see the module doc's
 * orphan/ghost paragraph. */
function reconcileTabEntry(
  tab: WorkspaceTab,
  layout: LayoutState,
  placements: readonly DockedPanelPlacement[],
): PersistedTabLayout {
  const staticIds = dockedLeafIds(
    createDefaultLayoutPort(tab).initial.root,
    [],
  );

  const placedIds = new Set(
    placements.map((p) => {
      return p.panelId;
    }),
  );

  let root = layout.root;
  let maximized = layout.maximized;
  let collapsed = layout.collapsed;
  let closed = layout.closed;

  for (const leafId of dockedLeafIds(root, staticIds)) {
    if (placedIds.has(leafId)) {
      continue;
    }

    root = removeDockedLeaf(root, leafId);

    if (maximized === leafId) {
      maximized = null;
    }

    collapsed = collapsed.filter((id) => {
      return id !== leafId;
    });

    // Same scrub as `collapsed`: an undocked leaf must not persist as closed.
    closed = closed.filter((id) => {
      return id !== leafId;
    });
  }

  const treeIds = new Set(dockedLeafIds(root, staticIds));
  const docked: readonly DockedPanelEntry[] = placements
    .filter((p) => {
      return treeIds.has(p.panelId);
    })
    .map((p): DockedPanelEntry => {
      return { panelId: p.panelId, spec: p.spec };
    });

  return {
    // `instances` (Phase 4 dynamic panel instances) is written straight
    // from live state. Unlike `docked`, an instance isn't a tree leaf — see
    // `LayoutPanelInstance`'s doc: only the dockview engine renders
    // instances, the tree in `root` never contains them — so there is no
    // orphan/ghost reconciliation to do here, and no leaf-existence check
    // to run against `root`. `parseWorkspaceLayout` re-validates shape,
    // dedups, and re-caps on read regardless
    // (`workspaceLayoutPersistence.ts`), so a divergence here is still
    // caught, not silently trusted.
    layout: { root, maximized, collapsed, closed, instances: layout.instances },
    docked,
  };
}

function buildPayload(deps: WorkspaceLayoutWriteDeps): WorkspaceLayoutV1 {
  const stored = parseWorkspaceLayout(deps.readStoredLayout());
  const tabs: Partial<Record<WorkspaceTab, PersistedTabLayout>> = {
    ...stored?.tabs,
  };
  const placements = deps.dockedPanels();

  for (const [tab, layout] of deps.createdLayouts()) {
    tabs[tab] = reconcileTabEntry(
      tab,
      layout,
      placements.filter((p) => {
        return p.tab === tab;
      }),
    );
  }

  return { v: 1, tabs };
}

/** Skipping a write is invisible from the outside — the app keeps running on
 * live state and only a LATER reload reveals that nothing was saved — so the
 * skip leaves a breadcrumb. Once per session, not once per kick: a divergence
 * that survives one debounce window survives all of them, and this writer
 * fires on every layout drag settle, so an unguarded log would flood the
 * console for the rest of the session. Plain `console` matches the only other
 * client-core logging precedent (`WsAdapter`'s connect/retry lines). */
let warnedAboutUnwritablePayload = false;

export function writeWorkspaceLayout(deps: WorkspaceLayoutWriteDeps): void {
  const raw = serializeWorkspaceLayout(buildPayload(deps));

  // Belt-and-braces: `reconcileTabEntry` makes every tab entry consistent by
  // construction, so this should never reject. If some future divergence
  // slips through anyway, keeping the last GOOD stored value is strictly
  // better than replacing it with a payload the next boot would discard
  // wholesale — including the tabs this session never touched.
  if (parseWorkspaceLayout(raw) === null) {
    if (!warnedAboutUnwritablePayload) {
      warnedAboutUnwritablePayload = true;
      console.warn(
        "[workspacePersistence] assembled a payload the parser rejects — keeping the last stored layout and skipping every further write this session",
      );
    }

    return;
  }

  deps.writeStoredLayout(raw);
}

/** Test-only: clears the once-per-session breadcrumb latch above so a spec
 * asserting the warning does not depend on which spec ran first. */
export function resetUnwritablePayloadWarning(): void {
  warnedAboutUnwritablePayload = false;
}
