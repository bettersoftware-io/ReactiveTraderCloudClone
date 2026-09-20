import type { Accessor, JSX } from "solid-js";
import { createSignal, For, Show, untrack } from "solid-js";

import type {
  LayoutPresetNameProblem,
  LayoutPresetSummary,
  SaveLayoutPresetResult,
  WorkspaceTab,
} from "@rtc/client-core";
import {
  DEFAULT_LAYOUT_PRESET_NAME,
  MAX_LAYOUT_PRESET_NAME_LENGTH,
  MAX_LAYOUT_PRESETS,
} from "@rtc/client-core";
import type { LayoutEngine } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./LayoutPresetsSection.module.css";

/** The View menu's LAYOUTS section (Phase 6b saved layouts): the built-in
 * per-tab `Default`, one row per saved preset, and an in-menu "Save current
 * as…" name field. Solid twin of `client-react`'s component of the same name.
 *
 * EVERY RULE LIVES IN `Presenters.layoutPresets`, NOT HERE. This section
 * counts nothing and validates nothing: the save opener is offered even at the
 * cap (the controller answers `full`), the name field carries no `maxLength`
 * (the controller answers `too-long`), and `Default` is refused as a name by
 * the controller rather than withheld by the field. One rule, one place — so
 * the two web clients cannot drift apart on the rules, only on the pixels.
 * `save` is called bare on purpose: its result union covers every refusal it
 * KNOWS about, and the one case it throws for (a layout machine that emits
 * nothing synchronously) must reach the console rather than be swallowed into
 * a message that claims a layout was stored when none was.
 *
 * Under the in-house engine only the head and `Default` render: a preset
 * carries a Dockview blob, so there is nothing for that engine to load.
 *
 * Every row handler below (load/arm/delete) is a plain function closing over
 * the row's own `preset`, never a condition picking between two handlers —
 * the ternary-in-a-prop shape that leaked a computation per click in
 * `DockviewLayoutEngine` (#792) never arises here because there is nothing
 * conditional to hoist: an unreadable row keeps its (always-defined) load
 * handler and is merely `disabled`, exactly like `client-react`.
 *
 * Reading `props.tab` once at setup (via `untrack`, ViewMenu's own pattern)
 * is intentional: ViewMenu mounts this section fresh per open, itself under a
 * keyed `<Show>` that remounts on a tab switch, so `tab` is exactly as static
 * here as it is for `useLayout`. */
export function LayoutPresetsSection(
  props: LayoutPresetsSectionProps,
): JSX.Element {
  const { useLayoutPresets } = useViewModel();
  const tab = untrack((): WorkspaceTab => {
    return props.tab;
  });
  const { presets, save, load, remove, resetTab } = useLayoutPresets(tab);
  // Ephemeral VIEW state, the same kind as ViewMenu's own open/closed signal:
  // the draft name, whether the field is showing, which row's bin is armed,
  // and the last refusal. None of it outlives the dropdown — closing the menu
  // unmounts this section, which is exactly the reset a re-open should get.
  const [draft, setDraft] = createSignal("");
  const [naming, setNaming] = createSignal(false);
  const [replaceable, setReplaceable] = createSignal(false);
  const [armedDeleteId, setArmedDeleteId] = createSignal<string | null>(null);
  const [message, setMessage] = createSignal<string | null>(null);

  function resetTabLayout(): void {
    resetTab();
    props.onDone();
  }

  function loadLayoutPreset(id: string): void {
    if (!load(id)) {
      setMessage(MISSING_LAYOUT_MESSAGE);
      return;
    }

    props.onDone();
  }

  function openNameField(): void {
    setNaming(true);
    setReplaceable(false);
    setMessage(null);
  }

  function closeNameField(): void {
    setNaming(false);
    setDraft("");
    setReplaceable(false);
    setMessage(null);
  }

  function editDraftName(event: InputChangeEvent): void {
    setDraft(event.currentTarget.value);
    // A different name is a different question: any pending replace confirm or
    // refusal was about the name the user has just stopped typing.
    setReplaceable(false);
    setMessage(null);
  }

  function saveCurrentLayout(): void {
    applySaveResult(save(draft()));
  }

  function replaceSavedLayout(): void {
    applySaveResult(save(draft(), { replace: true }));
  }

  function saveOrAbandonDraftName(event: InputKeyDownEvent): void {
    if (event.key === "Enter") {
      saveCurrentLayout();
      return;
    }

    if (event.key === "Escape") {
      closeNameField();
    }
  }

  function applySaveResult(result: SaveLayoutPresetResult): void {
    if (result.status === "saved") {
      closeNameField();
      return;
    }

    // `exists` is a question, not a refusal: the row the user would overwrite
    // is already visible above, so the confirm needs no message of its own.
    if (result.status === "exists") {
      setReplaceable(true);
      setMessage(null);
      return;
    }

    // Narrowed past the two outcomes above, so the key is always a refusal —
    // `problem` for an invalid name, the status itself otherwise.
    setReplaceable(false);
    setMessage(
      REFUSAL_MESSAGES[
        result.status === "invalid" ? result.problem : result.status
      ],
    );
  }

  /** Ref callback on the name field: unlike react's commit-phase ref, Solid
   * assigns `ref=` synchronously DURING element creation, while the node is
   * still detached (see `createChartGestures`'s own note on that ordering), and
   * `focus()` on a detached node does nothing. Insertion happens later in the
   * same synchronous batch, so one microtask is enough to land after it — no
   * timer, no rAF. The field opens on a CLICK, so without this the keyboard
   * stays on the opener button and Enter/Escape — bound only on the field —
   * would do nothing until the user tabbed. */
  function focusLayoutNameField(field: HTMLInputElement): void {
    queueMicrotask((): void => {
      field.focus();
    });
  }

  function armLayoutDelete(id: string): void {
    setArmedDeleteId(id);
  }

  function disarmLayoutDelete(): void {
    setArmedDeleteId(null);
  }

  function deleteLayoutPreset(id: string): void {
    remove(id);
    setArmedDeleteId(null);
  }

  return (
    <fieldset
      data-testid="view-menu-layouts"
      aria-label="Layouts"
      class={styles.section}
    >
      <div class={styles.sectionHead}>
        <span class={styles.sectionTitle}>LAYOUTS</span>
      </div>
      <ul class={styles.list}>
        <li>
          <button
            type="button"
            data-testid="view-menu-layout-default"
            role="menuitem"
            class={styles.row}
            onClick={resetTabLayout}
          >
            <span>{DEFAULT_LAYOUT_PRESET_NAME}</span>
          </button>
        </li>
        <Show when={props.engine() === "dockview"}>
          <For each={presets()}>
            {(preset: LayoutPresetSummary): JSX.Element => {
              function isThisRowArmed(): boolean {
                return armedDeleteId() === preset.id;
              }

              function loadThisPreset(): void {
                loadLayoutPreset(preset.id);
              }

              function armThisDelete(): void {
                armLayoutDelete(preset.id);
              }

              function deleteThisPreset(): void {
                deleteLayoutPreset(preset.id);
              }

              return (
                <li class={styles.presetRow}>
                  <button
                    type="button"
                    data-testid={`view-menu-layout-${preset.id}`}
                    role="menuitem"
                    aria-disabled={!preset.readable}
                    disabled={!preset.readable}
                    class={styles.row}
                    onClick={loadThisPreset}
                  >
                    <span>{preset.name}</span>
                  </button>
                  <Show
                    when={isThisRowArmed()}
                    fallback={
                      <button
                        type="button"
                        data-testid={`view-menu-layout-delete-${preset.id}`}
                        aria-label={`Delete ${preset.name}…`}
                        class={styles.binButton}
                        onClick={armThisDelete}
                      >
                        🗑
                      </button>
                    }
                  >
                    <span class={styles.rowActions}>
                      <button
                        type="button"
                        data-testid={`view-menu-layout-delete-confirm-${preset.id}`}
                        aria-label={`Confirm deleting ${preset.name}`}
                        class={styles.confirmButton}
                        onClick={deleteThisPreset}
                      >
                        ✓
                      </button>
                      <button
                        type="button"
                        data-testid={`view-menu-layout-delete-cancel-${preset.id}`}
                        aria-label={`Keep ${preset.name}`}
                        class={styles.cancelButton}
                        onClick={disarmLayoutDelete}
                      >
                        ✕
                      </button>
                    </span>
                  </Show>
                </li>
              );
            }}
          </For>
          <li>
            <button
              type="button"
              data-testid="view-menu-layout-save"
              role="menuitem"
              class={styles.row}
              onClick={openNameField}
            >
              <span>Save current as…</span>
            </button>
          </li>
        </Show>
        <Show when={naming()}>
          <li class={styles.nameRow}>
            <input
              ref={focusLayoutNameField}
              type="text"
              data-testid="view-menu-layout-name"
              aria-label="Layout name"
              class={styles.nameField}
              value={draft()}
              onInput={editDraftName}
              onKeyDown={saveOrAbandonDraftName}
            />
            <button
              type="button"
              data-testid="view-menu-layout-save-confirm"
              class={styles.nameButton}
              onClick={saveCurrentLayout}
            >
              Save
            </button>
            <button
              type="button"
              data-testid="view-menu-layout-save-cancel"
              class={styles.nameButton}
              onClick={closeNameField}
            >
              Cancel
            </button>
          </li>
        </Show>
        <Show when={replaceable()}>
          <li>
            <button
              type="button"
              data-testid="view-menu-layout-replace-confirm"
              class={styles.confirmRow}
              onClick={replaceSavedLayout}
            >
              Replace “{draft().trim()}”
            </button>
          </li>
        </Show>
      </ul>
      <Show when={message() !== null}>
        <p
          data-testid="view-menu-layout-message"
          role="status"
          class={styles.message}
        >
          {message()}
        </p>
      </Show>
    </fieldset>
  );
}

interface LayoutPresetsSectionProps {
  tab: WorkspaceTab;
  /** The live engine preference — the section's preset half is Dockview-only.
   * An accessor (not a plain value) so a mid-dropdown engine change (unlikely
   * mid-session, but the type shouldn't lie) re-renders reactively rather
   * than freezing whatever the section saw at first mount. */
  engine: Accessor<LayoutEngine>;
  /** Slot: the menu decides what "finished" means (it closes itself). */
  onDone: () => void;
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };

type InputKeyDownEvent = KeyboardEvent & { currentTarget: HTMLInputElement };

/** Keyed by the save result's own discriminant (its `problem` for an invalid
 * name), so a new refusal status is a TYPE error here rather than a silently
 * blank status line. */
const REFUSAL_MESSAGES: Readonly<Record<RefusalKey, string>> = {
  empty: "Enter a name",
  "too-long": `${MAX_LAYOUT_PRESET_NAME_LENGTH} characters at most`,
  reserved: `“${DEFAULT_LAYOUT_PRESET_NAME}” is reserved`,
  full: `${MAX_LAYOUT_PRESETS} layouts at most — delete one first`,
  // NOT "switch to the Dockview engine": the save opener only renders under
  // Dockview, so everyone who can reach this message is already on it. The
  // real cause is that no live engine has registered a snapshot source yet
  // (mid-mount, or mid-rebuild), which the next attempt usually fixes.
  unavailable: "No live layout to save yet — try again in a moment",
  "store-unreadable": "Delete the unreadable entry first",
  "storage-failed": "Couldn’t save — this browser is blocking storage",
};

/** Shown when a row's `load` answers false: the listed record is gone from the
 * store, which another browser tab deleting it is the way to reach — this
 * client's own delete republishes the list. The menu STAYS OPEN, because a
 * menu that closed on a load that did nothing would report the failure as
 * success. */
const MISSING_LAYOUT_MESSAGE = "That layout is no longer there";

/** Every way a save can be REFUSED, as one key space: an invalid name's own
 * `problem`, plus every status that is neither of the two outcomes with a
 * follow-up (`saved` closes the field, `exists` offers the replace confirm). */
type RefusalKey =
  | LayoutPresetNameProblem
  | Exclude<SaveLayoutPresetResult["status"], SettledSaveStatus | "invalid">;

type SettledSaveStatus = "saved" | "exists";
