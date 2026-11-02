import { createSignal, For, type JSX, Show } from "solid-js";

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
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./PreferencesContent.module.css";

/**
 * The JARVIS "Your key" section of Preferences: what happens to a person's own
 * model key, then the form to give one or the masked readout of the one given.
 * Renders nothing while Jarvis is unavailable or in the scripted demo, which
 * has no server to hold a key.
 *
 * The raw key lives only in the form's local state: it is handed to `save` as
 * an `OwnKeyInput` and emptied there, and the form is disposed (taking the
 * state with it) the moment a key is saved, the section is replaced into, or
 * the section hides. What the rest of the page reads back is the masked form.
 */
export function OwnKeySection(): JSX.Element {
  const { useJarvis, useJarvisOwnKey } = useViewModel();
  const { state } = useJarvis();
  const { saved, save, remove } = useJarvisOwnKey();
  const [replacing, setReplacing] = createSignal(false);

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

  function readoutKey(): SavedOwnKey | null {
    return replacing() ? null : saved();
  }

  return (
    <Show when={state().available && !state().demo}>
      <div class={styles.keyBlock} data-testid="jarvis-key-section">
        <div class={styles.rowLabel}>Your key</div>
        <p class={styles.keyExplain}>{OWN_KEY_EXPLANATION}</p>
        <Show
          when={readoutKey()}
          keyed
          fallback={
            <KeyForm
              replacing={saved() !== null}
              save={save}
              remove={remove}
              onSaved={stopReplacing}
            />
          }
        >
          {(key: SavedOwnKey) => {
            return (
              <SavedKeyReadout
                saved={key}
                ownKey={state().ownKey}
                onReplace={startReplacing}
                onRemove={removeKey}
              />
            );
          }}
        </Show>
      </div>
    </Show>
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

function SavedKeyReadout(props: SavedKeyReadoutProps): JSX.Element {
  function trouble(): boolean {
    const ownKey = props.ownKey;
    return ownKey !== null && TROUBLED_STATUSES.has(ownKey.status);
  }

  function requestReplace(): void {
    props.onReplace();
  }

  function requestRemove(): void {
    props.onRemove();
  }

  function limit(): string {
    const capUsd = props.saved.capUsd;
    return capUsd === null ? "No limit" : `${formatUsd(capUsd)} a day`;
  }

  return (
    <div class={styles.keyReadout}>
      <span class={styles.keyMasked} data-testid="jarvis-key-masked">
        {props.saved.masked}
      </span>
      <span
        class={styles.keyStatus}
        data-testid="jarvis-key-status"
        data-tone={trouble() ? "warn" : "calm"}
      >
        {describeOwnKeyStatus(props.ownKey, props.saved.provider)}
      </span>
      <span class={styles.keyStatus} data-testid="jarvis-key-limit">
        {limit()}
      </span>
      <span class={styles.keyNote}>{OWN_KEY_LIMIT_NOTE}</span>
      <div class={styles.keyActions}>
        <button
          type="button"
          class={styles.actionButton}
          data-testid="jarvis-key-replace"
          onClick={requestReplace}
        >
          REPLACE
        </button>
        <button
          type="button"
          class={styles.actionButton}
          data-testid="jarvis-key-remove"
          onClick={requestRemove}
        >
          REMOVE
        </button>
      </div>
    </div>
  );
}

type SelectChange = Event & { currentTarget: HTMLSelectElement };
type FieldInput = InputEvent & { currentTarget: HTMLInputElement };

interface KeyFormProps {
  /** A key is saved already: Save removes it first, so the new one is checked
   * afresh (a refused key stays refused on its connection otherwise). */
  replacing: boolean;
  save: (input: OwnKeyInput) => void;
  remove: () => void;
  onSaved: () => void;
}

function KeyForm(props: KeyFormProps): JSX.Element {
  const [provider, setProvider] = createSignal<JarvisProvider>(
    JARVIS_OWN_PROVIDERS[0] ?? "anthropic",
  );
  const [draft, setDraft] = createSignal("");
  const [remember, setRemember] = createSignal(false);
  const [capText, setCapText] = createSignal(
    String(JARVIS_OWN_CAP_DEFAULT_USD),
  );
  const [noLimit, setNoLimit] = createSignal(false);

  function key(): string {
    return draft().trim();
  }

  function capValid(): boolean {
    const cap = Number(capText());
    return (
      capText().trim() !== "" &&
      Number.isFinite(cap) &&
      cap > 0 &&
      cap <= JARVIS_OWN_CAP_MAX_USD
    );
  }

  function canSave(): boolean {
    return key() !== "" && (noLimit() || capValid());
  }

  function chooseProvider(event: SelectChange): void {
    const value = event.currentTarget.value;

    if (isJarvisProvider(value)) {
      setProvider(value);
    }
  }

  function changeDraft(event: FieldInput): void {
    setDraft(event.currentTarget.value);
  }

  function toggleRemember(): void {
    setRemember((on) => {
      return !on;
    });
  }

  function changeCap(event: FieldInput): void {
    setCapText(event.currentTarget.value);
  }

  function toggleNoLimit(): void {
    setNoLimit((on) => {
      return !on;
    });
  }

  function saveKey(): void {
    if (!canSave()) {
      return;
    }

    const input: OwnKeyInput = {
      provider: provider(),
      key: key(),
      capUsd: noLimit() ? null : Number(capText()),
      remember: remember(),
    };

    setDraft("");

    if (props.replacing) {
      props.remove();
    }

    props.save(input);
    props.onSaved();
  }

  return (
    <div class={styles.keyForm}>
      <div class={styles.keyLine}>
        <select
          class={styles.keyField}
          aria-label="Provider"
          onChange={chooseProvider}
          data-testid="jarvis-key-provider"
        >
          <For each={JARVIS_OWN_PROVIDERS}>
            {(option: JarvisProvider) => {
              return (
                <option value={option} selected={option === provider()}>
                  {JARVIS_PROVIDER_NAMES[option]}
                </option>
              );
            }}
          </For>
        </select>
        <input
          class={`${styles.keyField} ${styles.keySecret}`}
          type="password"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          maxLength={JARVIS_KEY_MAX_CHARS}
          aria-label="API key"
          placeholder="Paste your API key"
          value={draft()}
          onInput={changeDraft}
          data-testid="jarvis-key-input"
        />
      </div>
      <label class={styles.keyCheck}>
        <input
          type="checkbox"
          checked={remember()}
          onChange={toggleRemember}
          data-testid="jarvis-key-remember"
        />
        Remember on this device
      </label>
      <div class={styles.keyLine}>
        <label class={styles.keyCheck}>
          Daily limit ($)
          <input
            class={`${styles.keyField} ${styles.keyAmount}`}
            type="text"
            inputmode="decimal"
            autocomplete="off"
            disabled={noLimit()}
            value={capText()}
            onInput={changeCap}
            data-testid="jarvis-key-cap"
          />
        </label>
        <label class={styles.keyCheck}>
          <input
            type="checkbox"
            checked={noLimit()}
            onChange={toggleNoLimit}
            data-testid="jarvis-key-no-limit"
          />
          No limit
        </label>
      </div>
      <span class={styles.keyNote}>{OWN_KEY_LIMIT_NOTE}</span>
      <div class={styles.keyActions}>
        <button
          type="button"
          class={styles.actionButton}
          disabled={!canSave()}
          data-testid="jarvis-key-save"
          onClick={saveKey}
        >
          SAVE
        </button>
      </div>
    </div>
  );
}
