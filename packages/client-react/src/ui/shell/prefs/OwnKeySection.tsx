import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";

import type { JarvisState, OwnKeyInput, SavedOwnKey } from "@rtc/core-api";
import {
  describeOwnKeyStatus,
  isOwnKeyTroubled,
  OWN_KEY_EXPLANATION,
  OWN_KEY_LIMIT_NOTE,
  parseOwnKeyCap,
} from "@rtc/core-logic";
import {
  isJarvisProvider,
  JARVIS_KEY_MAX_CHARS,
  JARVIS_OWN_CAP_DEFAULT_USD,
  JARVIS_OWN_PROVIDERS,
  JARVIS_PROVIDER_NAMES,
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
 * The raw key lives only in the form's key field, an UNCONTROLLED input: a
 * controlled `value` is mirrored into the `value` attribute by React, which
 * would put the key in the serialised markup (and any devtools inspector) from
 * the first keystroke. The form reads it once, on Save, and empties the field;
 * it unmounts when a key is saved, so nothing outlives it. What the rest of the
 * page reads back is the masked form.
 *
 * Save, Replace and Remove each remove the button that was focused, so focus is
 * handed on explicitly (`FocusNext`) rather than dropped to the page.
 */
export function OwnKeySection(): ReactElement | null {
  const { useJarvis, useJarvisOwnKey } = useViewModel();
  const { state } = useJarvis();
  const { saved, save, setCap, remove } = useJarvisOwnKey();
  const [replacing, setReplacing] = useState(false);
  const [focusNext, setFocusNext] = useState<FocusNext>(null);

  if (!state.available || state.demo) {
    return null;
  }

  function startReplacing(): void {
    setFocusNext("input");
    setReplacing(true);
  }

  function stopReplacing(): void {
    setFocusNext("replace");
    setReplacing(false);
  }

  function removeKey(): void {
    setFocusNext("input");
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
          setCap={setCap}
          focusOnMount={focusNext === "replace"}
          onReplace={startReplacing}
          onRemove={removeKey}
        />
      ) : (
        <KeyForm
          seed={saved}
          save={save}
          remove={remove}
          focusOnMount={focusNext === "input"}
          onSaved={stopReplacing}
          onCancel={stopReplacing}
        />
      )}
    </div>
  );
}

/** Which control takes focus when the one the person pressed goes away. */
type FocusNext = "input" | "replace" | null;

interface SavedKeyReadoutProps {
  saved: SavedOwnKey;
  ownKey: JarvisState["ownKey"];
  setCap: (capUsd: number | null) => void;
  focusOnMount: boolean;
  onReplace: () => void;
  onRemove: () => void;
}

function SavedKeyReadout({
  saved,
  ownKey,
  setCap,
  focusOnMount,
  onReplace,
  onRemove,
}: SavedKeyReadoutProps): ReactElement {
  // What the person has typed into the limit and not yet committed, or `null`.
  const [draftCap, setDraftCap] = useState<string | null>(null);
  // The last amount the limit had, so clearing "No limit" restores it.
  const [lastCap, setLastCap] = useState(
    saved.capUsd ?? JARVIS_OWN_CAP_DEFAULT_USD,
  );
  const replaceRef = useRef<HTMLButtonElement>(null);
  const noLimit = saved.capUsd === null;
  const shownCap = draftCap ?? String(saved.capUsd ?? lastCap);

  useEffect(() => {
    if (focusOnMount) {
      replaceRef.current?.focus();
    }
  }, [focusOnMount]);

  function changeCap(event: ChangeEvent<HTMLInputElement>): void {
    setDraftCap(event.target.value);
  }

  function commitCap(): void {
    if (draftCap === null) {
      return;
    }

    const amount = parseOwnKeyCap(draftCap);
    setDraftCap(null);

    if (amount !== null && amount !== saved.capUsd) {
      setLastCap(amount);
      setCap(amount);
    }
  }

  function commitCapOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      commitCap();
    }
  }

  function toggleNoLimit(): void {
    setDraftCap(null);

    if (saved.capUsd === null) {
      setCap(lastCap);
      return;
    }

    setLastCap(saved.capUsd);
    setCap(null);
  }

  return (
    <div className={styles.keyReadout}>
      <span className={styles.keyMasked} data-testid="jarvis-key-masked">
        {saved.masked}
      </span>
      <span
        className={styles.keyStatus}
        role="status"
        data-testid="jarvis-key-status"
        data-tone={isOwnKeyTroubled(ownKey) ? "warn" : "calm"}
      >
        {describeOwnKeyStatus(ownKey, saved.provider)}
      </span>
      <div className={styles.keyLine}>
        <label className={styles.keyCheck}>
          Daily limit ($)
          <input
            className={`${styles.keyField} ${styles.keyAmount}`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={noLimit}
            value={shownCap}
            onChange={changeCap}
            onBlur={commitCap}
            onKeyDown={commitCapOnEnter}
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
          ref={replaceRef}
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
  /** The key being replaced, or `null` for a first key. Its provider, limit and
   * Remember seed the form (they are the person's, not the key's), Save removes
   * it first so the new one is checked afresh (a refused key stays refused on
   * its connection otherwise), and Cancel goes back to it. */
  seed: SavedOwnKey | null;
  save: (input: OwnKeyInput) => void;
  remove: () => void;
  focusOnMount: boolean;
  onSaved: () => void;
  onCancel: () => void;
}

function KeyForm({
  seed,
  save,
  remove,
  focusOnMount,
  onSaved,
  onCancel,
}: KeyFormProps): ReactElement {
  const [provider, setProvider] = useState<JarvisProvider>(
    seed?.provider ?? JARVIS_OWN_PROVIDERS[0] ?? "anthropic",
  );
  // Only whether a key was typed is state; the key itself stays in the field.
  const [hasKey, setHasKey] = useState(false);
  const [remember, setRemember] = useState(seed?.remember ?? false);
  const [capText, setCapText] = useState(
    String(seed?.capUsd ?? JARVIS_OWN_CAP_DEFAULT_USD),
  );
  const [noLimit, setNoLimit] = useState(seed !== null && seed.capUsd === null);
  const keyRef = useRef<HTMLInputElement>(null);

  const cap = parseOwnKeyCap(capText);
  const canSave = hasKey && (noLimit || cap !== null);

  useEffect(() => {
    if (focusOnMount) {
      keyRef.current?.focus();
    }
  }, [focusOnMount]);

  function chooseProvider(event: ChangeEvent<HTMLSelectElement>): void {
    if (isJarvisProvider(event.target.value)) {
      setProvider(event.target.value);
    }
  }

  function noteKeyTyped(): void {
    setHasKey((keyRef.current?.value.trim() ?? "") !== "");
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
    const field = keyRef.current;
    const key = field?.value.trim() ?? "";

    if (field === null || key === "" || !(noLimit || cap !== null)) {
      return;
    }

    const input: OwnKeyInput = {
      provider,
      key,
      capUsd: noLimit ? null : cap,
      remember,
    };

    field.value = "";
    setHasKey(false);

    if (seed !== null) {
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
          ref={keyRef}
          className={`${styles.keyField} ${styles.keySecret}`}
          type="password"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          maxLength={JARVIS_KEY_MAX_CHARS}
          aria-label="API key"
          placeholder="Paste your API key"
          onInput={noteKeyTyped}
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
        {seed !== null ? (
          <button
            type="button"
            className={styles.actionButton}
            data-testid="jarvis-key-cancel"
            onClick={onCancel}
          >
            CANCEL
          </button>
        ) : null}
      </div>
    </div>
  );
}
