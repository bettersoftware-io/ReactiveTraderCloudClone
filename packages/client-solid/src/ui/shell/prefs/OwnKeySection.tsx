import {
  type Accessor,
  createSignal,
  For,
  type JSX,
  onMount,
  Show,
  untrack,
} from "solid-js";

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
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./PreferencesContent.module.css";

/**
 * The JARVIS "Your key" section of Preferences: what happens to a person's own
 * model key, then the form to give one or the masked readout of the one given.
 * Renders nothing while Jarvis is unavailable or in the scripted demo, which
 * has no server to hold a key.
 *
 * The raw key lives only in the form's key field, an input with no bound
 * `value` (the same shape as the React client, where a controlled value would
 * be mirrored into the markup). The form reads it once, on Save, and empties
 * the field; it is disposed when a key is saved, so nothing outlives it. What
 * the rest of the page reads back is the masked form.
 *
 * Save, Replace and Remove each remove the button that was focused, so focus is
 * handed on explicitly (`FocusNext`) rather than dropped to the page.
 */
export function OwnKeySection(): JSX.Element {
  const { useJarvis, useJarvisOwnKey } = useViewModel();
  const { state } = useJarvis();
  const { saved, save, setCap, remove } = useJarvisOwnKey();
  const [replacing, setReplacing] = createSignal(false);
  const [focusNext, setFocusNext] = createSignal<FocusNext>(null);

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
          fallback={
            <KeyForm
              seed={saved()}
              save={save}
              remove={remove}
              focusOnMount={focusNext() === "input"}
              onSaved={stopReplacing}
              onCancel={stopReplacing}
            />
          }
        >
          {(key: Accessor<SavedOwnKey>) => {
            return (
              <SavedKeyReadout
                saved={key()}
                ownKey={state().ownKey}
                setCap={setCap}
                focusOnMount={focusNext() === "replace"}
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

/** Which control takes focus when the one the person pressed goes away. */
type FocusNext = "input" | "replace" | null;

type FieldInput = InputEvent & { currentTarget: HTMLInputElement };
type FieldKey = KeyboardEvent & { currentTarget: HTMLInputElement };
type SelectChange = Event & { currentTarget: HTMLSelectElement };

interface SavedKeyReadoutProps {
  saved: SavedOwnKey;
  ownKey: JarvisState["ownKey"];
  setCap: (capUsd: number | null) => void;
  focusOnMount: boolean;
  onReplace: () => void;
  onRemove: () => void;
}

function SavedKeyReadout(props: SavedKeyReadoutProps): JSX.Element {
  // What the person has typed into the limit and not yet committed, or `null`.
  const [draftCap, setDraftCap] = createSignal<string | null>(null);
  // The last amount the limit had, so clearing "No limit" restores it.
  const [lastCap, setLastCap] = createSignal(
    untrack(() => {
      return props.saved.capUsd ?? JARVIS_OWN_CAP_DEFAULT_USD;
    }),
  );
  let replaceRef: HTMLButtonElement | undefined;

  onMount(() => {
    if (props.focusOnMount) {
      replaceRef?.focus();
    }
  });

  function noLimit(): boolean {
    return props.saved.capUsd === null;
  }

  function shownCap(): string {
    return draftCap() ?? String(props.saved.capUsd ?? lastCap());
  }

  function changeCap(event: FieldInput): void {
    setDraftCap(event.currentTarget.value);
  }

  function commitCap(): void {
    const text = draftCap();

    if (text === null) {
      return;
    }

    const amount = parseOwnKeyCap(text);
    setDraftCap(null);

    if (amount !== null && amount !== props.saved.capUsd) {
      setLastCap(amount);
      props.setCap(amount);
    }
  }

  function commitCapOnEnter(event: FieldKey): void {
    if (event.key === "Enter") {
      commitCap();
    }
  }

  function toggleNoLimit(): void {
    setDraftCap(null);
    const current = props.saved.capUsd;

    if (current === null) {
      props.setCap(lastCap());
      return;
    }

    setLastCap(current);
    props.setCap(null);
  }

  function requestReplace(): void {
    props.onReplace();
  }

  function requestRemove(): void {
    props.onRemove();
  }

  return (
    <div class={styles.keyReadout}>
      <span class={styles.keyMasked} data-testid="jarvis-key-masked">
        {props.saved.masked}
      </span>
      <span
        class={styles.keyStatus}
        role="status"
        data-testid="jarvis-key-status"
        data-tone={isOwnKeyTroubled(props.ownKey) ? "warn" : "calm"}
      >
        {describeOwnKeyStatus(props.ownKey, props.saved.provider)}
      </span>
      <div class={styles.keyLine}>
        <label class={styles.keyCheck}>
          Daily limit ($)
          <input
            class={`${styles.keyField} ${styles.keyAmount}`}
            type="text"
            inputmode="decimal"
            autocomplete="off"
            disabled={noLimit()}
            value={shownCap()}
            onInput={changeCap}
            onBlur={commitCap}
            onKeyDown={commitCapOnEnter}
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
          ref={replaceRef}
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

function KeyForm(props: KeyFormProps): JSX.Element {
  // The form is seeded once, when it is created.
  const seed = untrack(() => {
    return props.seed;
  });

  const [provider, setProvider] = createSignal<JarvisProvider>(
    seed?.provider ?? JARVIS_OWN_PROVIDERS[0] ?? "anthropic",
  );
  // Only whether a key was typed is state; the key itself stays in the field.
  const [hasKey, setHasKey] = createSignal(false);
  const [remember, setRemember] = createSignal(seed?.remember ?? false);
  const [capText, setCapText] = createSignal(
    String(seed?.capUsd ?? JARVIS_OWN_CAP_DEFAULT_USD),
  );

  const [noLimit, setNoLimit] = createSignal(
    seed !== null && seed.capUsd === null,
  );
  let keyRef: HTMLInputElement | undefined;

  onMount(() => {
    if (props.focusOnMount) {
      keyRef?.focus();
    }
  });

  function canSave(): boolean {
    return hasKey() && (noLimit() || parseOwnKeyCap(capText()) !== null);
  }

  function chooseProvider(event: SelectChange): void {
    const value = event.currentTarget.value;

    if (isJarvisProvider(value)) {
      setProvider(value);
    }
  }

  function noteKeyTyped(): void {
    setHasKey((keyRef?.value.trim() ?? "") !== "");
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
    const key = keyRef?.value.trim() ?? "";

    if (keyRef === undefined || key === "" || !canSave()) {
      return;
    }

    const input: OwnKeyInput = {
      provider: provider(),
      key,
      capUsd: noLimit() ? null : parseOwnKeyCap(capText()),
      remember: remember(),
    };

    keyRef.value = "";
    setHasKey(false);

    if (props.seed !== null) {
      props.remove();
    }

    props.save(input);
    props.onSaved();
  }

  function cancelReplacing(): void {
    props.onCancel();
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
          ref={keyRef}
          class={`${styles.keyField} ${styles.keySecret}`}
          type="password"
          autocomplete="off"
          autocapitalize="off"
          spellcheck={false}
          maxLength={JARVIS_KEY_MAX_CHARS}
          aria-label="API key"
          placeholder="Paste your API key"
          onInput={noteKeyTyped}
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
        <Show when={seed !== null}>
          <button
            type="button"
            class={styles.actionButton}
            data-testid="jarvis-key-cancel"
            onClick={cancelReplacing}
          >
            CANCEL
          </button>
        </Show>
      </div>
    </div>
  );
}
