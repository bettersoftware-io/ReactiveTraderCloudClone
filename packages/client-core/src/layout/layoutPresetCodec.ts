/**
 * Layout-preset codec v1 — one tab's whole LAYOUTS-menu list, stored as a
 * SINGLE opaque string per tab behind `LayoutPresetStore` (the raw-string
 * port, `@rtc/core-api`'s `LayoutPresetStore`). `serializeLayoutPresetList`
 * is a plain `JSON.stringify` over an array of readable records / raw
 * unreadable values; `parseLayoutPresetList` is the hand-rolled structural
 * walk, mirroring `workspaceLayoutPersistence.ts`'s shape but PER ELEMENT
 * rather than whole-payload: one bad record only sidelines that one row
 * (`readable: false`), never the rest of the tab's saved layouts.
 *
 * A preset's `layout` field is validated by reusing the EXISTING
 * `serializeWorkspaceLayout` / `parseWorkspaceLayout` walk rather than a
 * second tree validator: the candidate is wrapped as a one-tab
 * `WorkspaceLayoutV1`, round-tripped through that pair, and the PARSED
 * result — not the raw candidate — is what a readable entry stores. This
 * matters because `JSON.stringify` turns an `undefined` array element (an
 * unset `initialPx`/`fixedPx` hole) into `null`; only the parsed value
 * reconstructs that hole, so only it round-trips a real default tree
 * exactly (see that module's own header comment). A preset's `layout` is
 * always layer 2 WITHOUT docked Jarvis panels (ruling P2), so a candidate
 * whose parsed `docked` is non-empty is rejected too.
 *
 * An unreadable element keeps its raw JSON value (`raw`) so a later rewrite
 * of the list (another save/delete) preserves it verbatim instead of
 * silently discarding a row the user can still see and delete — dropping it
 * would be exactly the "absence reported as a clean reading" failure class.
 * Duplicate ids are resolved first-wins: a later element whose id already
 * appears earlier in the list is downgraded to unreadable with a fresh
 * `unreadable-<index>` id — uniquified against every id already claimed
 * (readable OR unreadable), not assumed free, since a hostile/hand-edited
 * payload can carry a stored id that already collides with that generated
 * form — so the UI can never render two rows sharing one React key.
 *
 * The whole-list sentinel (`id === UNREADABLE_LIST_ID`, produced when the
 * stored string itself isn't a JSON array) can never come back out of
 * `serializeLayoutPresetList`: that function drops it structurally, because
 * its `raw` is `null` and re-emitting `null` in place of the sentinel would
 * silently destroy the user's actual unreadable stored string. A caller
 * that wants to discard an unreadable-as-a-whole list clears the store key
 * instead.
 */

import type {
  LayoutPresetNameProblem,
  LayoutPresetSummary,
} from "@rtc/core-api";

import type { WorkspaceTab } from "./defaultLayoutPort";
import type {
  PersistedTabLayout,
  WorkspaceLayoutV1,
} from "./workspaceLayoutPersistence";
import {
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
} from "./workspaceLayoutPersistence";

export const LAYOUT_PRESET_VERSION = 1;
export const MAX_LAYOUT_PRESETS = 10;
export const MAX_LAYOUT_PRESET_NAME_LENGTH = 40;
export const DEFAULT_LAYOUT_PRESET_NAME = "Default";
export const UNREADABLE_LIST_ID = "unreadable-list";

/** A readable, version-1 record. `layout` is layer 2 WITHOUT docked Jarvis
 * panels (ruling P2 — `docked` is always []); `blob` is the Dockview
 * engine's `snapshotLayout()` string. */
export interface StoredLayoutPreset {
  readonly v: typeof LAYOUT_PRESET_VERSION;
  readonly id: string;
  readonly name: string;
  readonly savedAt: string;
  readonly layout: PersistedTabLayout;
  readonly blob: string;
}

/** One list element after parsing. An unreadable element keeps its raw JSON
 * value so a rewrite of the list (another save/delete) preserves it verbatim
 * instead of silently dropping it. */
export type LayoutPresetEntry =
  | { readonly readable: true; readonly preset: StoredLayoutPreset }
  | {
      readonly readable: false;
      readonly id: string;
      readonly name: string;
      readonly raw: unknown;
    };

export interface ParsedLayoutPresetList {
  /** true when the stored string itself was not a JSON array (P6). */
  readonly wholeListUnreadable: boolean;
  readonly entries: readonly LayoutPresetEntry[];
}

export type ValidateLayoutPresetNameResult =
  | { readonly ok: true; readonly name: string }
  | { readonly ok: false; readonly problem: LayoutPresetNameProblem };

export function parseLayoutPresetList(
  tab: WorkspaceTab,
  raw: string | null,
): ParsedLayoutPresetList {
  if (raw === null) {
    return { wholeListUnreadable: false, entries: [] };
  }

  const array = parseJsonArray(raw);

  if (array === null) {
    return { wholeListUnreadable: true, entries: [wholeListUnreadableEntry()] };
  }

  const seenIds = new Set<string>();
  const entries = array.map((elementRaw, index) => {
    return toEntry(tab, elementRaw, index, seenIds);
  });

  return { wholeListUnreadable: false, entries };
}

export function serializeLayoutPresetList(
  entries: readonly LayoutPresetEntry[],
): string {
  return JSON.stringify(
    entries
      .filter((entry) => {
        // The whole-list sentinel's `raw` is `null` — never re-emit it, or a
        // rewrite would overwrite the user's real unreadable stored string
        // with the literal text "null". See the module doc.
        return entry.readable || entry.id !== UNREADABLE_LIST_ID;
      })
      .map((entry) => {
        return entry.readable ? entry.preset : entry.raw;
      }),
  );
}

export function summarizeLayoutPresets(
  parsed: ParsedLayoutPresetList,
): readonly LayoutPresetSummary[] {
  return parsed.entries.map((entry) => {
    return entry.readable
      ? {
          id: entry.preset.id,
          name: entry.preset.name,
          savedAt: entry.preset.savedAt,
          readable: true,
        }
      : { id: entry.id, name: entry.name, savedAt: null, readable: false };
  });
}

/** Trims, then: "" → empty; > 40 chars → too-long; "default" in any case →
 * reserved. Returns the trimmed name when valid. */
export function validateLayoutPresetName(
  name: string,
): ValidateLayoutPresetNameResult {
  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return { ok: false, problem: "empty" };
  }

  if (trimmed.length > MAX_LAYOUT_PRESET_NAME_LENGTH) {
    return { ok: false, problem: "too-long" };
  }

  if (trimmed.toLowerCase() === DEFAULT_LAYOUT_PRESET_NAME.toLowerCase()) {
    return { ok: false, problem: "reserved" };
  }

  return { ok: true, name: trimmed };
}

function parseJsonArray(raw: string): readonly unknown[] | null {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function wholeListUnreadableEntry(): LayoutPresetEntry {
  return {
    readable: false,
    id: UNREADABLE_LIST_ID,
    name: "Unreadable saved layouts",
    raw: null,
  };
}

function toEntry(
  tab: WorkspaceTab,
  value: unknown,
  index: number,
  seenIds: Set<string>,
): LayoutPresetEntry {
  const preset = readStoredPreset(tab, value);
  const candidateId = preset !== null ? preset.id : idFieldOf(value, index);
  const candidateName = preset !== null ? preset.name : nameFieldOf(value);

  if (preset !== null && !seenIds.has(candidateId)) {
    seenIds.add(candidateId);
    return { readable: true, preset };
  }

  const id = seenIds.has(candidateId)
    ? uniqueFallbackId(index, seenIds)
    : candidateId;
  seenIds.add(id);
  return { readable: false, id, name: candidateName, raw: value };
}

/** A fallback id guaranteed free in `seenIds`, starting from `unreadable-
 * <index>`. That base form is not assumed free: a hostile/hand-edited
 * payload can carry a stored id (readable or unreadable) that already
 * equals it — e.g. two elements both stored with `id: "unreadable-1"`, or
 * an unrelated element at another index whose own stored id happens to be
 * `unreadable-5` — so a collision on the base form is resolved by
 * appending an increasing numeric suffix until the id is actually unique,
 * never handed out unchecked. */
function uniqueFallbackId(index: number, seenIds: ReadonlySet<string>): string {
  const base = `unreadable-${index}`;

  if (!seenIds.has(base)) {
    return base;
  }

  let suffix = 2;

  while (seenIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
}

function readStoredPreset(
  tab: WorkspaceTab,
  value: unknown,
): StoredLayoutPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  if (value.v !== LAYOUT_PRESET_VERSION) {
    return null;
  }

  const { id, name, savedAt, blob, layout } = value;

  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof savedAt !== "string" ||
    typeof blob !== "string"
  ) {
    return null;
  }

  const parsedLayout = parsePersistedTabLayout(tab, layout);

  if (parsedLayout === null) {
    return null;
  }

  return {
    v: LAYOUT_PRESET_VERSION,
    id,
    name,
    savedAt,
    blob,
    layout: parsedLayout,
  };
}

/** Round-trips `candidate` through the existing workspace-persistence walk —
 * see the module doc — and uses the PARSED tab layout, not `candidate`
 * itself, so `initialPx`/`fixedPx` holes come back reconstructed. Rejects a
 * candidate whose parsed `docked` is non-empty (ruling P2). */
function parsePersistedTabLayout(
  tab: WorkspaceTab,
  candidate: unknown,
): PersistedTabLayout | null {
  const wrapped = { v: 1, tabs: { [tab]: candidate } } as WorkspaceLayoutV1;
  const roundTripped = parseWorkspaceLayout(serializeWorkspaceLayout(wrapped));

  if (roundTripped === null) {
    return null;
  }

  const parsedTabLayout = roundTripped.tabs[tab];

  if (parsedTabLayout === undefined || parsedTabLayout.docked.length !== 0) {
    return null;
  }

  return parsedTabLayout;
}

function idFieldOf(value: unknown, index: number): string {
  if (isRecord(value) && typeof value.id === "string") {
    return value.id;
  }

  return `unreadable-${index}`;
}

function nameFieldOf(value: unknown): string {
  if (isRecord(value) && typeof value.name === "string") {
    return value.name;
  }

  return "Unreadable layout";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
