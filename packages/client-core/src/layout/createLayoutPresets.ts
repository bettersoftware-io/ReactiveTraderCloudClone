/**
 * The saved-layouts controller (Phase 6b) — every rule of the View menu's
 * LAYOUTS section in ONE framework-free place: save / load / delete, the
 * built-in per-tab Default (`resetTab`), and the registry a live Dockview
 * engine hands its `snapshotLayout()` to. Backs `Presenters.layoutPresets`.
 *
 * It owns no state of its own beyond three caches — the per-tab summary
 * subjects, the per-tab snapshot sources, and the id counter. The list itself
 * lives in `LayoutPresetStore` as one serialized string per tab, is re-read
 * (never mirrored) on every operation, and is re-summarized from the store
 * AFTER each write rather than from the entries just written: unreadable
 * elements are keyed `unreadable-<index>`, so a value re-emitted from memory
 * would hand the UI ids that no longer match what the next `remove`/`load`
 * will find in the store.
 *
 * TWO RULES THAT ARE NOT NEGOTIABLE HERE.
 *
 * 1. A LAYOUT OPERATION REARRANGES; IT NEVER CREATES OR DESTROYS CONTENT
 *    (ruling P2). Jarvis-docked panels are therefore NOT part of a preset:
 *    `save` strips their leaves (so a stored record's `docked` is always []),
 *    and `load`/`resetTab` re-insert whatever is docked into that tab RIGHT
 *    NOW. Chart instances are the opposite case and ARE recorded — they are
 *    ordinary layer-2 state with no owner outside the layout machine.
 *    The stripping reuses the REDUCER (`withoutDockedLeaves` below) rather
 *    than re-deriving its rules: `removePanel` already collapses an emptied
 *    dock column back to the pre-dock tree and drops `maximized`/`collapsed`
 *    entries naming the removed id.
 *
 * 2. THE BLOB WRITE AND THE REBUILD BUMP ARE ONE SYNCHRONOUS BATCH. Task 1
 *    measured this on the real engine: the outgoing Dockview engine has an
 *    ARMED FINAL SAVE, so anything that runs between `dockLayoutStore.save`
 *    and `rebuildLiveEngine()` lets that save overwrite the blob, and the
 *    fresh engine then re-seeds from the PRE-load layout — the load silently
 *    does nothing. Nothing in `load` or `resetTab` may await, defer, debounce
 *    or schedule; both are straight-line synchronous by design.
 */

import { BehaviorSubject } from "rxjs";

import type {
  DockLayoutStore,
  LayoutIntents,
  LayoutPresetStore,
  LayoutPresetSummary,
  LayoutPresetsPresenter,
  LayoutState,
  Machine,
  SaveLayoutPresetOptions,
  SaveLayoutPresetResult,
  Stream,
} from "@rtc/core-api";

import type { WorkspaceTab } from "#/layout/defaultLayoutPort";
import { createDefaultLayoutPort } from "#/layout/defaultLayoutPort";
import type {
  LayoutPresetEntry,
  ParsedLayoutPresetList,
  StoredLayoutPreset,
} from "#/layout/layoutPresetCodec";
import {
  LAYOUT_PRESET_VERSION,
  MAX_LAYOUT_PRESETS,
  parseLayoutPresetList,
  serializeLayoutPresetList,
  summarizeLayoutPresets,
  UNREADABLE_LIST_ID,
  validateLayoutPresetName,
} from "#/layout/layoutPresetCodec";
import { createLayoutMachine } from "#/presenters/LayoutMachine";

export interface LayoutPresetsDeps {
  readonly store: LayoutPresetStore;
  readonly dockLayoutStore: DockLayoutStore;
  readonly layoutFor: (
    tab: WorkspaceTab,
  ) => Machine<LayoutState, LayoutIntents>;
  /** The tab's CURRENT layer-2 state (composition: `latestLayoutStates`, else
   * the machine's replayed value). */
  readonly layoutStateNow: (tab: WorkspaceTab) => LayoutState;
  /** Jarvis panels docked into `tab` right now (ruling P2). */
  readonly dockedPanelIdsNow: (tab: WorkspaceTab) => readonly string[];
  /** Rebuild the mounted Dockview engine from the store (P4: bumps
   * `workspaceLayoutResets$`). */
  readonly rebuildLiveEngine: () => void;
  /** The `savedAt` clock — injected so a test pins it. */
  readonly now?: () => string;
}

export function createLayoutPresets(
  deps: LayoutPresetsDeps,
): LayoutPresetsPresenter {
  const summariesByTab = new Map<
    WorkspaceTab,
    BehaviorSubject<readonly LayoutPresetSummary[]>
  >();
  const snapshotSources = new Map<WorkspaceTab, () => string>();
  const readSavedAt = deps.now ?? currentIsoTimestamp;
  /** Bumped per minted id so two saves inside one millisecond differ; the
   * uniqueness LOOP in `freshPresetId` is what actually guarantees it. */
  let idSeq = 0;

  function presetsFor(
    tab: WorkspaceTab,
  ): Stream<readonly LayoutPresetSummary[]> {
    return summariesSubjectFor(tab).asObservable();
  }

  function saveLayoutPreset(
    tab: WorkspaceTab,
    name: string,
    options?: SaveLayoutPresetOptions,
  ): SaveLayoutPresetResult {
    const source = snapshotSources.get(tab);

    if (source === undefined) {
      return { status: "unavailable" };
    }

    const validated = validateLayoutPresetName(name);

    if (!validated.ok) {
      return { status: "invalid", problem: validated.problem };
    }

    const parsed = parsedListFor(tab);

    if (parsed.wholeListUnreadable) {
      return { status: "store-unreadable" };
    }

    const match = entryNamed(parsed, validated.name);

    if (match !== undefined && options?.replace !== true) {
      return { status: "exists", id: idOfEntry(match) };
    }

    if (match === undefined && parsed.entries.length >= MAX_LAYOUT_PRESETS) {
      return { status: "full" };
    }

    // A replace keeps the existing id AND its list position; a new record
    // appends with a fresh id. A replace over an UNREADABLE row is the third
    // case: its id may be one the CODEC minted from the row's list position
    // (`unreadable-<index>`), so adopting it would make a real preset's id
    // depend on where it happens to sit — and collide with the next downgrade
    // at that same index. Such a replacement takes a fresh id and keeps only
    // the position, which is the part the user can see.
    const id = match?.readable
      ? match.preset.id
      : freshPresetId(parsed.entries);

    const preset: StoredLayoutPreset = {
      v: LAYOUT_PRESET_VERSION,
      id,
      name: validated.name,
      savedAt: readSavedAt(),
      layout: {
        layout: withoutDockedLeaves(
          tab,
          deps.layoutStateNow(tab),
          deps.dockedPanelIdsNow(tab),
        ),
        docked: [],
      },
      blob: source(),
    };

    const entries = withEntry(parsed.entries, match, {
      readable: true,
      preset,
    });

    // The ONE place a refusal is decided by evidence rather than by a rule:
    // everything above knows it is refusing before it writes, while this one
    // is only knowable AFTER the store has been asked (see `writeList`).
    if (!writeList(tab, entries)) {
      return { status: "storage-failed" };
    }

    return { status: "saved", id };
  }

  /** Task 1's measured order, and the reason this function has no `await` in
   * it — see rule 2 in the module doc. */
  function loadLayoutPreset(tab: WorkspaceTab, id: string): boolean {
    const entry = parsedListFor(tab).entries.find((candidate) => {
      return idOfEntry(candidate) === id;
    });

    if (entry === undefined || !entry.readable) {
      return false;
    }

    deps.dockLayoutStore.save(tab, entry.preset.blob);
    const docked = deps.dockedPanelIdsNow(tab);
    const layout = deps.layoutFor(tab);
    layout.intents.replaceLayout(entry.preset.layout.layout);

    for (const panelId of docked) {
      layout.intents.insertPanel(panelId);
    }

    deps.rebuildLiveEngine();
    return true;
  }

  function removeLayoutPreset(tab: WorkspaceTab, id: string): void {
    if (id === UNREADABLE_LIST_ID) {
      deps.store.clear(tab);
      publishStoredList(tab);
      return;
    }

    const parsed = parsedListFor(tab);

    if (parsed.wholeListUnreadable) {
      // The whole-list sentinel above is the ONLY removable row of a stored
      // string that isn't a JSON array: serializing these entries back out
      // would write the sentinel as `[null]` (see `layoutPresetCodec`'s
      // module doc), inventing a row nobody stored.
      publishStoredList(tab);
      return;
    }

    const remaining = parsed.entries.filter((entry) => {
      return idOfEntry(entry) !== id;
    });

    // Nothing to delete: an id no row carries (a list another tab has already
    // rewritten, say) must not spend a storage write, and must not re-normalize
    // the stored bytes through the codec for a no-op. It STILL republishes:
    // the summaries subject is the only thing the UI reads (`presetsFor` hands
    // it out, and nothing re-reads the store when the menu opens), so skipping
    // the publish would leave the already-deleted row listed forever, with the
    // bin doing nothing and saying nothing — and `writeList`'s doc makes a
    // SURVIVING row mean "the delete did not happen", so the two would be
    // indistinguishable. Republishing from the store heals the stale row here
    // rather than by the side effect of a write nobody needed.
    if (remaining.length === parsed.entries.length) {
      publishStoredList(tab);
      return;
    }

    // The write result is deliberately dropped here — see `writeList`'s doc:
    // a delete the store swallowed leaves the row visible, which IS the
    // feedback, so `remove` stays void rather than growing a result union.
    writeList(tab, remaining);
  }

  /** The built-in per-tab Default. Same one-batch discipline as
   * `loadLayoutPreset`, and deliberately narrower than
   * `resetWorkspaceLayout`: one tab, and no preset store is touched.
   *
   * This stays void and does not report a swallowed write — see `writeList`'s
   * doc: a swallowed reset leaves the dock blob in place and so the layout
   * visibly does not change, which is its own feedback. */
  function resetTabLayout(tab: WorkspaceTab): void {
    deps.dockLayoutStore.clear(tab);
    const docked = deps.dockedPanelIdsNow(tab);
    const layout = deps.layoutFor(tab);
    layout.intents.reset();

    for (const panelId of docked) {
      layout.intents.insertPanel(panelId);
    }

    deps.rebuildLiveEngine();
  }

  function registerSnapshotSource(
    tab: WorkspaceTab,
    source: (() => string) | null,
  ): void {
    if (source === null) {
      snapshotSources.delete(tab);
      return;
    }

    snapshotSources.set(tab, source);
  }

  /** Writes the list and republishes the summaries FROM THE STORE — and
   * returns whether the write actually landed.
   *
   * WHY A RETURN VALUE AND NOT A PORT CHANGE. `LayoutPresetStore.save` returns
   * nothing (ruling P1: the port is a dumb raw-string store, one shape for
   * three adapters) and both localStorage adapters deliberately swallow a
   * throwing `setItem` — "best-effort persistence" — so with storage blocked
   * or full the store ACCEPTS the call and keeps nothing. The re-read this
   * function already performs to re-summarize is therefore the only evidence
   * available: a swallowed write hands the PREVIOUS string back. `save`
   * converts a false here into `storage-failed`, rather than telling the user
   * a layout was stored when none was — the repo's "absence reported as a
   * clean reading" class, one layer out in the product.
   *
   * `remove` and `resetTab` deliberately DON'T report it. A swallowed delete
   * leaves the row on screen and a swallowed `resetTab` leaves the dock blob
   * in place, so both already give the user the true answer in the only place
   * they were looking; a save is the one operation whose failure is otherwise
   * INVISIBLE, because the thing that should have appeared simply doesn't. */
  function writeList(
    tab: WorkspaceTab,
    entries: readonly LayoutPresetEntry[],
  ): boolean {
    const serialized = serializeLayoutPresetList(entries);
    deps.store.save(tab, serialized);
    const stored = deps.store.load(tab);
    publishStoredList(tab);
    return stored === serialized;
  }

  function publishStoredList(tab: WorkspaceTab): void {
    summariesSubjectFor(tab).next(summarizeLayoutPresets(parsedListFor(tab)));
  }

  function summariesSubjectFor(
    tab: WorkspaceTab,
  ): BehaviorSubject<readonly LayoutPresetSummary[]> {
    const existing = summariesByTab.get(tab);

    if (existing) {
      return existing;
    }

    const subject = new BehaviorSubject<readonly LayoutPresetSummary[]>(
      summarizeLayoutPresets(parsedListFor(tab)),
    );
    summariesByTab.set(tab, subject);
    return subject;
  }

  function parsedListFor(tab: WorkspaceTab): ParsedLayoutPresetList {
    return parseLayoutPresetList(tab, deps.store.load(tab));
  }

  function freshPresetId(entries: readonly LayoutPresetEntry[]): string {
    const taken = new Set(
      entries.map((entry) => {
        return idOfEntry(entry);
      }),
    );
    // No `crypto`: this module runs under React Native too.
    let candidate = `p${Date.now().toString(36)}${idSeq}`;
    idSeq += 1;

    while (taken.has(candidate)) {
      candidate = `p${Date.now().toString(36)}${idSeq}`;
      idSeq += 1;
    }

    return candidate;
  }

  return {
    presetsFor,
    save: saveLayoutPreset,
    load: loadLayoutPreset,
    remove: removeLayoutPreset,
    resetTab: resetTabLayout,
    registerSnapshotSource,
  };
}

/** `state` with every currently-docked Jarvis leaf removed — ruling P2.
 *
 * Runs the removals through a SCRATCH `createLayoutMachine` seeded with
 * `state` rather than re-deriving the tree surgery: `removePanel`'s reducer
 * already collapses an emptied dock column back to exactly the pre-dock tree
 * and drops `maximized`/`collapsed` entries that named the removed id. The
 * scratch machine is disposed on every exit, and the LIVE machine for the
 * tab is never touched — a save must not alter what the user is looking at.
 */
function withoutDockedLeaves(
  tab: WorkspaceTab,
  state: LayoutState,
  dockedPanelIds: readonly string[],
): LayoutState {
  if (dockedPanelIds.length === 0) {
    return state;
  }

  const scratch = createLayoutMachine(createDefaultLayoutPort(tab), {
    seedState: state,
  });

  try {
    for (const panelId of dockedPanelIds) {
      scratch.intents.removePanel(panelId);
    }

    return latestStateOf(scratch);
  } finally {
    // `finally`, not a trailing call: `latestStateOf` throws for a machine that
    // emitted nothing synchronously (deliberately — see its doc), and a scratch
    // machine left undisposed on that path leaks a warm subscription and its
    // Subjects.
    scratch.dispose();
  }
}

/** Synchronous peek at a machine's current state. `state$` is a defaulted
 * state observable kept warm by `createLayoutMachine`, so the value lands
 * before `subscribe` returns; collecting into an array (rather than seeding a
 * variable with the pre-removal state) keeps a non-emitting stream LOUD
 * instead of silently returning the unstripped input. */
function latestStateOf(
  machine: Machine<LayoutState, LayoutIntents>,
): LayoutState {
  const seen: LayoutState[] = [];
  machine.state$
    .subscribe((state) => {
      seen.push(state);
    })
    .unsubscribe();
  const latest = seen.at(-1);

  if (latest === undefined) {
    throw new Error("layout machine state$ emitted nothing synchronously");
  }

  return latest;
}

/** Case-insensitive name match over READABLE AND UNREADABLE entries — a row
 * the user can see is a row whose name is taken. */
function entryNamed(
  parsed: ParsedLayoutPresetList,
  name: string,
): LayoutPresetEntry | undefined {
  const wanted = name.toLowerCase();
  return parsed.entries.find((entry) => {
    return nameOfEntry(entry).toLowerCase() === wanted;
  });
}

/** `entry` in `match`'s position when replacing, appended otherwise. */
function withEntry(
  entries: readonly LayoutPresetEntry[],
  match: LayoutPresetEntry | undefined,
  entry: LayoutPresetEntry,
): readonly LayoutPresetEntry[] {
  if (match === undefined) {
    return [...entries, entry];
  }

  return entries.map((existing) => {
    return existing === match ? entry : existing;
  });
}

function idOfEntry(entry: LayoutPresetEntry): string {
  return entry.readable ? entry.preset.id : entry.id;
}

function nameOfEntry(entry: LayoutPresetEntry): string {
  return entry.readable ? entry.preset.name : entry.name;
}

function currentIsoTimestamp(): string {
  return new Date().toISOString();
}
