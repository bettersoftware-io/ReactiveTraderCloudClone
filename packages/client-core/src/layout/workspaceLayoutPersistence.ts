/**
 * Workspace-layout persistence v1 — serializes/parses the per-tab layout
 * trees plus docked panel specs that GenUI L3 pins into the workspace, so a
 * reload can rehydrate them. `serializeWorkspaceLayout` is a plain
 * `JSON.stringify` (a `WorkspaceLayoutV1` is inert JSON — no functions, no
 * symbols — so stringify is a lossless serializer, same reasoning as
 * `PanelSpecV1`'s own doc). `parseWorkspaceLayout` is a hand-rolled
 * structural walk (no schema library), mirroring `parsePanelSpec` and
 * `parseDriveBatch` in `@rtc/shared/jarvis`: any failure anywhere in the
 * payload — bad JSON, wrong version, an unknown tab, a malformed layout
 * node, a docked spec that fails `parsePanelSpec`, a tree/docked mismatch —
 * discards the WHOLE payload as `null`. No partial application: a caller
 * that gets back anything other than `null` can trust every tab in it is
 * fully valid.
 *
 * `LayoutNode`'s `fixedPx`/`initialPx` arrays are typed `(number |
 * undefined)[]` in memory, but `JSON.stringify` turns an `undefined` array
 * ELEMENT (not an object property) into `null` — so the walk below accepts
 * `null` in those array slots as the wire encoding of "this child has no
 * fixed/initial px" and reconstructs `undefined` there, which is what makes
 * the round trip exact for the real default trees (FX/equities/credit all
 * carry an `initialPx` hole).
 *
 * Every step of `parseWorkspaceLayout` — including the recursive tree walk
 * — runs inside one `try`, so a value that is syntactically fine JSON but
 * pathologically deep (thousands of nested single-child splits, which would
 * otherwise blow the call stack of the recursive walk and throw a
 * `RangeError` straight out of a function called synchronously at boot) is
 * fail-closed to `null` like any other malformed payload, never an
 * uncaught throw. `MAX_LAYOUT_NODE_DEPTH` below additionally makes that a
 * deterministic, fast rejection rather than one that depends on how deep
 * the host's stack happens to allow.
 */

import type { PanelSpecV1 } from "@rtc/shared";
import { parsePanelSpec } from "@rtc/shared";

import type { WorkspaceTab } from "./defaultLayoutPort";
import { createDefaultLayoutPort } from "./defaultLayoutPort";
import { dockedLeafIds } from "./dockColumn";
import type { LayoutNode, LayoutState, SplitDir } from "./layoutPort";

interface DockedPanelEntry {
  readonly panelId: string;
  readonly spec: PanelSpecV1;
}

export interface PersistedTabLayout {
  readonly layout: LayoutState;
  readonly docked: readonly DockedPanelEntry[];
}

export interface WorkspaceLayoutV1 {
  readonly v: 1;
  readonly tabs: Partial<Record<WorkspaceTab, PersistedTabLayout>>;
}

/** Every `WorkspaceTab` union member, marked as a record key rather than
 * copied into a plain array — `Record<WorkspaceTab, true>` requires every
 * union member to appear as a key, so a future fifth tab that isn't added
 * here fails `tsc`, not a silent runtime membership gap (a hand-maintained
 * array copy could add the new tab to the union without anyone remembering
 * to update the parser, which would then reject every payload containing
 * that tab — killing persistence for it forever, undetected). */
const WORKSPACE_TAB_MARKERS: Readonly<Record<WorkspaceTab, true>> = {
  fx: true,
  credit: true,
  admin: true,
  equities: true,
};

const SPLIT_DIRS: readonly SplitDir[] = ["row", "column"];

/** `sizes` must sum to 1 within this tolerance — floating-point splits
 * accumulate rounding error over several children. */
const SIZE_SUM_TOLERANCE = 1e-6;

/** Generous upper bound on split-node nesting — every real default tree is
 * 2-3 levels deep, so this only ever fires on a pathological/adversarial
 * payload (see the module doc's fail-closed-depth paragraph). */
const MAX_LAYOUT_NODE_DEPTH = 64;

/** Mirrors `MAX_DOCKED_PANELS` in
 * `packages/client-core/src/presenters/JarvisPanelsMachine.ts` — a GLOBAL
 * cap on docked entries across the WHOLE payload (one live-panels array for
 * the entire session), not per tab. It is re-declared as a literal here
 * rather than imported: `presenters` already imports FROM `layout`
 * (`JarvisDriverMachine.ts` imports `WorkspaceTab`/`LayoutState`), so the
 * reverse import would invert that established dependency direction. Keep
 * the two literals in sync by hand if either changes. */
const MAX_DOCKED_PANELS = 4;

export function serializeWorkspaceLayout(payload: WorkspaceLayoutV1): string {
  return JSON.stringify(payload);
}

export function parseWorkspaceLayout(
  raw: string | null,
): WorkspaceLayoutV1 | null {
  if (raw === null) {
    return null;
  }

  try {
    const input: unknown = JSON.parse(raw);
    return validatePayload(input);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWorkspaceTab(value: string): value is WorkspaceTab {
  return Object.hasOwn(WORKSPACE_TAB_MARKERS, value);
}

/** Validates an optional `fixedPx`/`initialPx` field: absent stays absent
 * (`undefined`, meaning the field itself was never set), a present array
 * must match `length` and hold only finite numbers or `null` (the wire hole
 * — see the module doc), anything else is a whole-payload failure signalled
 * by the `INVALID` sentinel so the caller can tell "absent" and "malformed"
 * apart. */
const INVALID = Symbol("invalid");

function validatePxArray(
  value: unknown,
  length: number,
): readonly (number | undefined)[] | undefined | typeof INVALID {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value) || value.length !== length) {
    return INVALID;
  }

  const result: (number | undefined)[] = [];

  for (const entry of value) {
    if (entry === null) {
      result.push(undefined);
    } else if (isFiniteNumber(entry)) {
      result.push(entry);
    } else {
      return INVALID;
    }
  }

  return result;
}

/** `depth` counts split-node nesting from the tree root; see
 * `MAX_LAYOUT_NODE_DEPTH`'s doc. */
function validateLayoutNode(value: unknown, depth: number): LayoutNode | null {
  if (depth > MAX_LAYOUT_NODE_DEPTH) {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  if (value.kind === "panel") {
    const panelId = value.panelId;

    if (typeof panelId !== "string") {
      return null;
    }

    return { kind: "panel", panelId };
  }

  if (value.kind !== "split") {
    return null;
  }

  const dir = value.dir;

  if (
    typeof dir !== "string" ||
    !(SPLIT_DIRS as readonly string[]).includes(dir)
  ) {
    return null;
  }

  const childrenRaw = value.children;

  if (!Array.isArray(childrenRaw)) {
    return null;
  }

  const children: LayoutNode[] = [];

  for (const childRaw of childrenRaw) {
    const child = validateLayoutNode(childRaw, depth + 1);

    if (child === null) {
      return null;
    }

    children.push(child);
  }

  const sizesRaw = value.sizes;

  if (!Array.isArray(sizesRaw) || sizesRaw.length !== children.length) {
    return null;
  }

  const sizes: number[] = [];
  let sum = 0;

  for (const sizeRaw of sizesRaw) {
    if (!isFiniteNumber(sizeRaw) || sizeRaw <= 0 || sizeRaw > 1) {
      return null;
    }

    sizes.push(sizeRaw);
    sum += sizeRaw;
  }

  if (Math.abs(sum - 1) > SIZE_SUM_TOLERANCE) {
    return null;
  }

  const fixedPx = validatePxArray(value.fixedPx, children.length);

  if (fixedPx === INVALID) {
    return null;
  }

  const initialPx = validatePxArray(value.initialPx, children.length);

  if (initialPx === INVALID) {
    return null;
  }

  return {
    kind: "split",
    dir: dir as SplitDir,
    children,
    sizes,
    ...(fixedPx !== undefined ? { fixedPx } : {}),
    ...(initialPx !== undefined ? { initialPx } : {}),
  };
}

function validateLayoutState(value: unknown): LayoutState | null {
  if (!isRecord(value)) {
    return null;
  }

  const root = validateLayoutNode(value.root, 0);

  if (root === null) {
    return null;
  }

  const leafIds = new Set(dockedLeafIds(root, []));

  const maximized = value.maximized;

  if (
    maximized !== null &&
    (typeof maximized !== "string" || !leafIds.has(maximized))
  ) {
    return null;
  }

  const collapsedRaw = value.collapsed;

  if (!Array.isArray(collapsedRaw)) {
    return null;
  }

  const collapsed: string[] = [];

  for (const entry of collapsedRaw) {
    if (typeof entry !== "string") {
      return null;
    }

    // A dangling `collapsed` id matches no panel and is harmless — the
    // engine simply never finds it. Unlike `maximized` (rejected above),
    // whose dangling case strips EVERY panel in the tab to a 32px bar on
    // every boot, there is no failure mode worth discarding the whole
    // payload over here, so the ghost id is filtered rather than rejected.
    if (leafIds.has(entry)) {
      collapsed.push(entry);
    }
  }

  return { root, maximized, collapsed };
}

function validateDockedEntry(value: unknown): DockedPanelEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const panelId = value.panelId;

  if (typeof panelId !== "string" || panelId.length === 0) {
    return null;
  }

  const specResult = parsePanelSpec(value.spec, []);

  if (!specResult.ok) {
    return null;
  }

  return { panelId, spec: specResult.spec };
}

/** Cross-checks `docked` against the walked `root`'s own dock-column leaves
 * for `tab` — every leaf id foreign to `tab`'s static default-tree ids must
 * have EXACTLY one matching `docked` entry, in both directions:
 * - a tree leaf with no `docked` entry (an "orphan") would boot as a panel
 *   with no undock/close control (those come from the dynamic head
 *   registry, keyed by `docked` ids) — stuck there forever;
 * - a `docked` entry with no tree leaf (a "ghost") is invisible but still
 *   permanently occupies one of the global `MAX_DOCKED_PANELS` slots.
 * Both are single-field corruptions that the whole-payload-null rule must
 * still catch. Set-equality (not just size) also catches a duplicate
 * `panelId` within `docked` — a duplicate shrinks the `Set` below the
 * array length, which fails the very first check. */
function isReconciledWithTree(
  root: LayoutNode,
  docked: readonly DockedPanelEntry[],
  tab: WorkspaceTab,
): boolean {
  const dockedIds = docked.map((entry) => {
    return entry.panelId;
  });
  const dockedIdSet = new Set(dockedIds);

  if (dockedIdSet.size !== dockedIds.length) {
    return false;
  }

  const staticIds = dockedLeafIds(
    createDefaultLayoutPort(tab).initial.root,
    [],
  );
  const treeDockedIdSet = new Set(dockedLeafIds(root, staticIds));

  if (dockedIdSet.size !== treeDockedIdSet.size) {
    return false;
  }

  for (const id of dockedIdSet) {
    if (!treeDockedIdSet.has(id)) {
      return false;
    }
  }

  return true;
}

function validatePersistedTabLayout(
  value: unknown,
  tab: WorkspaceTab,
): PersistedTabLayout | null {
  if (!isRecord(value)) {
    return null;
  }

  const layout = validateLayoutState(value.layout);

  if (layout === null) {
    return null;
  }

  const dockedRaw = value.docked;

  if (!Array.isArray(dockedRaw)) {
    return null;
  }

  const docked: DockedPanelEntry[] = [];

  for (const entryRaw of dockedRaw) {
    const entry = validateDockedEntry(entryRaw);

    if (entry === null) {
      return null;
    }

    docked.push(entry);
  }

  if (!isReconciledWithTree(layout.root, docked, tab)) {
    return null;
  }

  return { layout, docked };
}

function validatePayload(value: unknown): WorkspaceLayoutV1 | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.v !== 1) {
    return null;
  }

  const tabsRaw = value.tabs;

  if (!isRecord(tabsRaw)) {
    return null;
  }

  const tabs: Partial<Record<WorkspaceTab, PersistedTabLayout>> = {};
  let totalDocked = 0;

  for (const key of Object.keys(tabsRaw)) {
    if (!isWorkspaceTab(key)) {
      return null;
    }

    const tabLayout = validatePersistedTabLayout(tabsRaw[key], key);

    if (tabLayout === null) {
      return null;
    }

    totalDocked += tabLayout.docked.length;
    tabs[key] = tabLayout;
  }

  // See MAX_DOCKED_PANELS's doc: a GLOBAL cap summed across every tab, not
  // a per-tab one — a payload with e.g. 2 docked entries in each of three
  // tabs could never have been legitimately written, and if accepted, boot
  // replay would cap the shared panels array at 4 and silently strand the
  // rest as orphan leaves in their trees (the exact defect `docked`/tree
  // reconciliation exists to prevent).
  if (totalDocked > MAX_DOCKED_PANELS) {
    return null;
  }

  return { v: 1, tabs };
}
