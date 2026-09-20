import type { ChangeEvent, KeyboardEvent, ReactElement } from "react";
import { useState } from "react";

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
import { useViewModel } from "@rtc/react-bindings";

import styles from "./LayoutPresetsSection.module.css";

/** The View menu's LAYOUTS section (Phase 6b saved layouts): the built-in
 * per-tab `Default`, one row per saved preset, and an in-menu "Save current
 * as…" name field.
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
 * carries a Dockview blob, so there is nothing for that engine to load. */
export function LayoutPresetsSection({
  tab,
  engine,
  onDone,
}: LayoutPresetsSectionProps): ReactElement {
  const { useLayoutPresets } = useViewModel();
  const { presets, save, load, remove, resetTab } = useLayoutPresets(tab);
  // Ephemeral VIEW state, the same kind as ViewMenu's own open/closed flag:
  // the draft name, whether the field is showing, which row's bin is armed,
  // and the last refusal. None of it outlives the dropdown — closing the menu
  // unmounts this section, which is exactly the reset a re-open should get.
  const [draft, setDraft] = useState("");
  const [naming, setNaming] = useState(false);
  const [replaceable, setReplaceable] = useState(false);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function resetTabLayout(): void {
    resetTab();
    onDone();
  }

  function loadLayoutPreset(id: string): void {
    load(id);
    onDone();
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

  function editDraftName(event: ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value);
    // A different name is a different question: any pending replace confirm or
    // refusal was about the name the user has just stopped typing.
    setReplaceable(false);
    setMessage(null);
  }

  function saveCurrentLayout(): void {
    applySaveResult(save(draft));
  }

  function replaceSavedLayout(): void {
    applySaveResult(save(draft, { replace: true }));
  }

  function saveOrAbandonDraftName(
    event: KeyboardEvent<HTMLInputElement>,
  ): void {
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
      className={styles.section}
    >
      <div className={styles.sectionHead}>
        <span className={styles.sectionTitle}>LAYOUTS</span>
      </div>
      <ul className={styles.list}>
        <li>
          <button
            type="button"
            data-testid="view-menu-layout-default"
            role="menuitem"
            className={styles.row}
            onClick={resetTabLayout}
          >
            <span>{DEFAULT_LAYOUT_PRESET_NAME}</span>
          </button>
        </li>
        {engine === "dockview" ? (
          <>
            {presets.map((preset) => {
              return (
                <LayoutPresetRow
                  key={preset.id}
                  preset={preset}
                  isArmed={armedDeleteId === preset.id}
                  onLoad={loadLayoutPreset}
                  onArmDelete={armLayoutDelete}
                  onDisarmDelete={disarmLayoutDelete}
                  onDelete={deleteLayoutPreset}
                />
              );
            })}
            <li>
              <button
                type="button"
                data-testid="view-menu-layout-save"
                role="menuitem"
                className={styles.row}
                onClick={openNameField}
              >
                <span>Save current as…</span>
              </button>
            </li>
          </>
        ) : null}
        {naming ? (
          <li className={styles.nameRow}>
            <input
              type="text"
              data-testid="view-menu-layout-name"
              aria-label="Layout name"
              className={styles.nameField}
              value={draft}
              onChange={editDraftName}
              onKeyDown={saveOrAbandonDraftName}
            />
            <button
              type="button"
              data-testid="view-menu-layout-save-confirm"
              className={styles.nameButton}
              onClick={saveCurrentLayout}
            >
              Save
            </button>
            <button
              type="button"
              data-testid="view-menu-layout-save-cancel"
              className={styles.nameButton}
              onClick={closeNameField}
            >
              Cancel
            </button>
          </li>
        ) : null}
        {replaceable ? (
          <li>
            <button
              type="button"
              data-testid="view-menu-layout-replace-confirm"
              className={styles.confirmRow}
              onClick={replaceSavedLayout}
            >
              Replace “{draft.trim()}”
            </button>
          </li>
        ) : null}
      </ul>
      {message === null ? null : (
        <p
          data-testid="view-menu-layout-message"
          role="status"
          className={styles.message}
        >
          {message}
        </p>
      )}
    </fieldset>
  );
}

interface LayoutPresetsSectionProps {
  tab: WorkspaceTab;
  /** The live engine preference — the section's preset half is Dockview-only. */
  engine: LayoutEngine;
  /** Slot: the menu decides what "finished" means (it closes itself). */
  onDone: () => void;
}

/** One stored preset: the load row plus its own two-click bin. An UNREADABLE
 * record (a stored shape this codec version cannot parse) still gets a row —
 * the user must be able to see and delete it — but the row refuses to load. */
function LayoutPresetRow({
  preset,
  isArmed,
  onLoad,
  onArmDelete,
  onDisarmDelete,
  onDelete,
}: LayoutPresetRowProps): ReactElement {
  function loadLayoutPreset(): void {
    onLoad(preset.id);
  }

  function armLayoutDelete(): void {
    onArmDelete(preset.id);
  }

  function deleteLayoutPreset(): void {
    onDelete(preset.id);
  }

  return (
    <li className={styles.presetRow}>
      <button
        type="button"
        data-testid={`view-menu-layout-${preset.id}`}
        role="menuitem"
        aria-disabled={!preset.readable}
        disabled={!preset.readable}
        className={styles.row}
        onClick={loadLayoutPreset}
      >
        <span>{preset.name}</span>
      </button>
      {isArmed ? (
        <span className={styles.rowActions}>
          <button
            type="button"
            data-testid={`view-menu-layout-delete-confirm-${preset.id}`}
            aria-label={`Confirm deleting ${preset.name}`}
            className={styles.confirmButton}
            onClick={deleteLayoutPreset}
          >
            ✓
          </button>
          <button
            type="button"
            data-testid={`view-menu-layout-delete-cancel-${preset.id}`}
            aria-label={`Keep ${preset.name}`}
            className={styles.cancelButton}
            onClick={onDisarmDelete}
          >
            ✕
          </button>
        </span>
      ) : (
        <button
          type="button"
          data-testid={`view-menu-layout-delete-${preset.id}`}
          aria-label={`Delete ${preset.name}…`}
          className={styles.binButton}
          onClick={armLayoutDelete}
        >
          🗑
        </button>
      )}
    </li>
  );
}

interface LayoutPresetRowProps {
  preset: LayoutPresetSummary;
  /** True while this row's bin has been pressed once — the confirm is showing. */
  isArmed: boolean;
  /** Slot: the section decides what loading a preset does. */
  onLoad: (id: string) => void;
  /** Slot: the section owns which row is armed. */
  onArmDelete: (id: string) => void;
  /** Slot: disarms whichever row is armed (this one, by construction). */
  onDisarmDelete: () => void;
  /** Slot: the section decides what deleting a preset does. */
  onDelete: (id: string) => void;
}

/** Keyed by the save result's own discriminant (its `problem` for an invalid
 * name), so a new refusal status is a TYPE error here rather than a silently
 * blank status line. */
const REFUSAL_MESSAGES: Readonly<Record<RefusalKey, string>> = {
  empty: "Enter a name",
  "too-long": `${MAX_LAYOUT_PRESET_NAME_LENGTH} characters at most`,
  reserved: `“${DEFAULT_LAYOUT_PRESET_NAME}” is reserved`,
  full: `${MAX_LAYOUT_PRESETS} layouts at most — delete one first`,
  unavailable: "Layouts need the Dockview engine",
  "store-unreadable": "Delete the unreadable entry first",
};

/** Every way a save can be REFUSED, as one key space: an invalid name's own
 * `problem`, plus every status that is neither of the two outcomes with a
 * follow-up (`saved` closes the field, `exists` offers the replace confirm). */
type RefusalKey =
  | LayoutPresetNameProblem
  | Exclude<SaveLayoutPresetResult["status"], SettledSaveStatus | "invalid">;

type SettledSaveStatus = "saved" | "exists";
