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
 * node, a docked spec that fails `parsePanelSpec` — discards the WHOLE
 * payload as `null`. No partial application: a caller that gets back
 * anything other than `null` can trust every tab in it is fully valid.
 *
 * `LayoutNode`'s `fixedPx`/`initialPx` arrays are typed `(number |
 * undefined)[]` in memory, but `JSON.stringify` turns an `undefined` array
 * ELEMENT (not an object property) into `null` — so the walk below accepts
 * `null` in those array slots as the wire encoding of "this child has no
 * fixed/initial px" and reconstructs `undefined` there, which is what makes
 * the round trip exact for the real default trees (FX/equities/credit all
 * carry an `initialPx` hole).
 */

import type { PanelSpecV1 } from "@rtc/shared";
import { parsePanelSpec } from "@rtc/shared";

import type { WorkspaceTab } from "./defaultLayoutPort";
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

const WORKSPACE_TABS: readonly WorkspaceTab[] = [
  "fx",
  "credit",
  "admin",
  "equities",
];

const SPLIT_DIRS: readonly SplitDir[] = ["row", "column"];

/** `sizes` must sum to 1 within this tolerance — floating-point splits
 * accumulate rounding error over several children. */
const SIZE_SUM_TOLERANCE = 1e-6;

export function serializeWorkspaceLayout(payload: WorkspaceLayoutV1): string {
  return JSON.stringify(payload);
}

export function parseWorkspaceLayout(
  raw: string | null,
): WorkspaceLayoutV1 | null {
  if (raw === null) {
    return null;
  }

  let input: unknown;

  try {
    input = JSON.parse(raw);
  } catch {
    return null;
  }

  return validatePayload(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isWorkspaceTab(value: string): value is WorkspaceTab {
  return (WORKSPACE_TABS as readonly string[]).includes(value);
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

function validateLayoutNode(value: unknown): LayoutNode | null {
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
    const child = validateLayoutNode(childRaw);

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

  const root = validateLayoutNode(value.root);

  if (root === null) {
    return null;
  }

  const maximized = value.maximized;

  if (typeof maximized !== "string" && maximized !== null) {
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

    collapsed.push(entry);
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

function validatePersistedTabLayout(value: unknown): PersistedTabLayout | null {
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

  for (const key of Object.keys(tabsRaw)) {
    if (!isWorkspaceTab(key)) {
      return null;
    }

    const tabLayout = validatePersistedTabLayout(tabsRaw[key]);

    if (tabLayout === null) {
      return null;
    }

    tabs[key] = tabLayout;
  }

  return { v: 1, tabs };
}
