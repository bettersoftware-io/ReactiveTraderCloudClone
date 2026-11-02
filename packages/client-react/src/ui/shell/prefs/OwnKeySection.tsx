import { type ChangeEvent, type ReactElement, useState } from "react";

import type { JarvisState, OwnKeyInput, SavedOwnKey } from "@rtc/core-api";
import {
  describeOwnKeyStatus,
  formatUsd,
  OWN_KEY_EXPLANATION,
  OWN_KEY_LIMIT_NOTE,
} from "@rtc/core-logic";
import {
  isJarvisProvider,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_OWN_CAP_DEFAULT_USD,
  JARVIS_OWN_CAP_MAX_USD,
  JARVIS_OWN_PROVIDERS,
  JARVIS_PROVIDER_NAMES,
  type JarvisOwnKeyStatus,
  type JarvisProvider,
} from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import styles from "./PreferencesContent.module.css";

/**
 * The JARVIS "Your key" section of Preferences: what happens to a person's own
 * model key, then the form to give one or the masked readout of the one given.
 * Renders nothing while Jarvis is unavailable or in the scripted demo, which
 * has no server to hold a key.
 *
 * The raw key lives only in the form's local state: it is handed to `save` as
 * an `OwnKeyInput` and emptied there, and the form unmounts (taking the state
 * with it) the moment a key is saved, the section is replaced into, or the
 * section hides. What the rest of the page reads back is the masked form.
 */
export function OwnKeySection(): ReactElement | null {
  const { useJarvis, useJarvisOwnKey } = useViewModel();
  const { state } = useJarvis();
  const { saved, save, remove } = useJarvisOwnKey();
  const [replacing, setReplacing] = useState(false);

  if (!state.available || state.demo) {
    return null;
  }

  function startReplacing(): void {
    setReplacing(true);
  }

  function stopReplacing(): void {
    setReplacing(false);
  }

  function removeKey(): void {
    setReplacing(false);
    remove();
  }

  return (
    <div className={styles.keyBlock} data-testid="jarvis-key-section">
      <div className={styles.rowLabel}>Your key</div>
      <p className={styles.keyExplain}>{OWN_KEY_EXPLANATION}</p>
      {saved !== null && !replacing ? (
        <SavedKeyReadout
          saved={saved}
          ownKey={state.ownKey}
          onReplace={startReplacing}
          onRemove={removeKey}
        />
      ) : (
        <KeyForm
          replacing={saved !== null}
          save={save}
          remove={remove}
          onSaved={stopReplacing}
        />
      )}
    </div>
  );
}

/** The statuses that say the key is not working, drawn in the aware colour. */
const TROUBLED_STATUSES: ReadonlySet<JarvisOwnKeyStatus> = new Set([
  "refused",
  "unreachable",
  "limited",
]);

interface SavedKeyReadoutProps {
  saved: SavedOwnKey;
  ownKey: JarvisState["ownKey"];
  onReplace: () => void;
  onRemove: () => void;
}

function SavedKeyReadout({
  saved,
  ownKey,
  onReplace,
  onRemove,
}: SavedKeyReadoutProps): ReactElement {
  const status = describeOwnKeyStatus(ownKey, saved.provider);
  const trouble = ownKey !== null && TROUBLED_STATUSES.has(ownKey.status);

  return (
    <div className={styles.keyReadout}>
      <span className={styles.keyMasked} data-testid="jarvis-key-masked">
        {saved.masked}
      </span>
      <span
        className={styles.keyStatus}
        data-testid="jarvis-key-status"
        data-tone={trouble ? "warn" : "calm"}
      >
        {status}
      </span>
      <span className={styles.keyStatus} data-testid="jarvis-key-limit">
        {saved.capUsd === null
          ? "No limit"
          : `${formatUsd(saved.capUsd)} a day`}
      </span>
      <span className={styles.keyNote}>{OWN_KEY_LIMIT_NOTE}</span>
      <div className={styles.keyActions}>
        <button
          type="button"
          className={styles.actionButton}
          data-testid="jarvis-key-replace"
          onClick={onReplace}
        >
          REPLACE
        </button>
        <button
          type="button"
          className={styles.actionButton}
          data-testid="jarvis-key-remove"
          onClick={onRemove}
        >
          REMOVE
        </button>
      </div>
    </div>
  );
}

interface KeyFormProps {
  /** A key is saved already: Save removes it first, so the new one is checked
   * afresh (a refused key stays refused on its connection otherwise). */
  replacing: boolean;
  save: (input: OwnKeyInput) => void;
  remove: () => void;
  onSaved: () => void;
}

function KeyForm({
  replacing,
  save,
  remove,
  onSaved,
}: KeyFormProps): ReactElement {
  const [provider, setProvider] = useState<JarvisProvider>(
    JARVIS_OWN_PROVIDERS[0] ?? "anthropic",
  );
  const [draft, setDraft] = useState("");
  const [remember, setRemember] = useState(false);
  const [capText, setCapText] = useState(String(JARVIS_OWN_CAP_DEFAULT_USD));
  const [noLimit, setNoLimit] = useState(false);

  const key = draft.trim();
  const cap = Number(capText);
  const capValid =
    capText.trim() !== "" &&
    Number.isFinite(cap) &&
    cap > 0 &&
    cap <= JARVIS_OWN_CAP_MAX_USD;
  const canSave = key !== "" && (noLimit || capValid);

  function chooseProvider(event: ChangeEvent<HTMLSelectElement>): void {
    if (isJarvisProvider(event.target.value)) {
      setProvider(event.target.value);
    }
  }

  function changeDraft(event: ChangeEvent<HTMLInputElement>): void {
    setDraft(event.target.value);
  }

  function toggleRemember(): void {
    setRemember((on) => {
      return !on;
    });
  }

  function changeCap(event: ChangeEvent<HTMLInputElement>): void {
    setCapText(event.target.value);
  }

  function toggleNoLimit(): void {
    setNoLimit((on) => {
      return !on;
    });
  }

  function saveKey(): void {
    if (!canSave) {
      return;
    }

    const input: OwnKeyInput = {
      provider,
      key,
      capUsd: noLimit ? null : cap,
      remember,
    };

    setDraft("");

    if (replacing) {
      remove();
    }

    save(input);
    onSaved();
  }

  return (
    <div className={styles.keyForm}>
      <div className={styles.keyLine}>
        <select
          className={styles.keyField}
          aria-label="Provider"
          value={provider}
          onChange={chooseProvider}
          data-testid="jarvis-key-provider"
        >
          {JARVIS_OWN_PROVIDERS.map((option) => {
            return (
              <option key={option} value={option}>
                {JARVIS_PROVIDER_NAMES[option]}
              </option>
            );
          })}
        </select>
        <input
          className={`${styles.keyField} ${styles.keySecret}`}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={JARVIS_KEY_MAX_CHARS}
          aria-label="API key"
          placeholder="Paste your API key"
          value={draft}
          onChange={changeDraft}
          data-testid="jarvis-key-input"
        />
      </div>
      <label className={styles.keyCheck}>
        <input
          type="checkbox"
          checked={remember}
          onChange={toggleRemember}
          data-testid="jarvis-key-remember"
        />
        Remember on this device
      </label>
      <div className={styles.keyLine}>
        <label className={styles.keyCheck}>
          Daily limit ($)
          <input
            className={`${styles.keyField} ${styles.keyAmount}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={noLimit}
            value={capText}
            onChange={changeCap}
            data-testid="jarvis-key-cap"
          />
        </label>
        <label className={styles.keyCheck}>
          <input
            type="checkbox"
            checked={noLimit}
            onChange={toggleNoLimit}
            data-testid="jarvis-key-no-limit"
          />
          No limit
        </label>
      </div>
      <span className={styles.keyNote}>{OWN_KEY_LIMIT_NOTE}</span>
      <div className={styles.keyActions}>
        <button
          type="button"
          className={styles.actionButton}
          disabled={!canSave}
          data-testid="jarvis-key-save"
          onClick={saveKey}
        >
          SAVE
        </button>
      </div>
    </div>
  );
}
