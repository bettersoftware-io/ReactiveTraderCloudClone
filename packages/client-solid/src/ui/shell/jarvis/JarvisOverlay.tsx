import type { Accessor, JSX } from "solid-js";
import { createEffect, createSignal, For, onCleanup, Show } from "solid-js";

import type { JarvisConfirmation, JarvisEntry } from "@rtc/client-core";
import { JARVIS_SKINS, type JarvisSkin } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

import { JarvisConfirmCard } from "./JarvisConfirmCard";
import { useJarvisHotkey } from "./useJarvisHotkey";

import styles from "./JarvisOverlay.module.css";

/**
 * Full-screen cinematic J.A.R.V.I.S overlay — the PreferencesModal fixed-
 * overlay pattern (scrim, `<Show>`-gated body, no backdrop-filter). Owns the
 * global ⌘/Ctrl+J hotkey (`useJarvisHotkey`) so it's wired regardless of
 * open state, plus a scoped Escape listener and message-list auto-scroll —
 * ALL effects are set up unconditionally, above the `<Show when={state().open}>`
 * that gates the body, since Solid has no early-return-null-on-reactive-state
 * escape hatch (it would freeze the overlay at whatever it looked like on
 * first mount).
 */
export function JarvisOverlay(): JSX.Element {
  const { useJarvis } = useViewModel();
  const {
    state,
    close,
    toggle,
    send,
    approveConfirmation,
    declineConfirmation,
    setSkin,
  } = useJarvis();
  const [inputValue, setInputValue] = createSignal("");
  let listRef: HTMLDivElement | undefined;

  useJarvisHotkey(toggle);

  createEffect(() => {
    if (!state().open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    onCleanup(() => {
      document.removeEventListener("keydown", handleKeyDown);
    });
  });

  // Auto-scroll to the newest entry — a DOM view-effect (ADR-005-sanctioned),
  // reacting to both `open` (so it fires again as soon as the message list
  // mounts) and `entries.length` (so it fires only when the list grows).
  createEffect(() => {
    const open = state().open;
    const count = state().entries.length;

    if (!open || !listRef || count === 0) {
      return;
    }

    listRef.scrollTop = listRef.scrollHeight;
  });

  function submit(text: string): void {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    send(trimmed);
  }

  function handleSendClick(): void {
    submit(inputValue());
    setInputValue("");
  }

  function handleInputChange(event: InputChangeEvent): void {
    setInputValue(event.currentTarget.value);
  }

  function handleInputKeyDown(event: InputKeyDownEvent): void {
    if (event.key === "Enter") {
      handleSendClick();
    }
  }

  return (
    <Show when={state().open}>
      <div data-testid="jarvis-overlay" class={styles.overlay}>
        <div class={styles.dialog} data-skin={state().skin}>
          <header class={styles.head}>
            <span class={styles.wordmark}>JARVIS</span>

            <div data-testid="jarvis-skin-switch" class={styles.skinSwitch}>
              <For each={JARVIS_SKINS}>
                {(skin: JarvisSkin) => {
                  function active(): boolean {
                    return skin === state().skin;
                  }

                  return (
                    <button
                      type="button"
                      aria-pressed={active()}
                      data-skin={skin}
                      data-active={active() ? "true" : "false"}
                      class={styles.skinButton}
                      onClick={() => {
                        setSkin(skin);
                      }}
                    >
                      {SKIN_LABEL[skin]}
                    </button>
                  );
                }}
              </For>
            </div>

            <button
              type="button"
              data-testid="jarvis-close"
              aria-label="Close J.A.R.V.I.S"
              class={styles.closeButton}
              onClick={close}
            >
              ✕
            </button>
          </header>

          <div
            class={styles.core}
            data-skin={state().skin}
            data-phase={state().phase}
            aria-hidden="true"
          >
            <span class={styles.coreHalo} />
            <span class={styles.coreRing} />
            <span class={styles.coreCenter} />
            <Show when={state().phase === "speaking"}>
              <div class={styles.waveform}>
                <span class={styles.bar} />
                <span class={styles.bar} />
                <span class={styles.bar} />
                <span class={styles.bar} />
                <span class={styles.bar} />
              </div>
            </Show>
          </div>

          <div ref={listRef} class={styles.messages}>
            <For each={state().entries}>
              {(entry: JarvisEntry) => {
                return (
                  <div
                    data-testid="jarvis-entry"
                    data-role={entry.role}
                    data-done={entry.done ? "true" : "false"}
                    class={styles.entry}
                  >
                    <Show when={entry.tool}>
                      {(tool: Accessor<NonNullable<JarvisEntry["tool"]>>) => {
                        return (
                          <span
                            data-testid="jarvis-tool-chip"
                            data-status={tool().status}
                            class={styles.toolChip}
                          >
                            ⟢ {tool().name}
                          </span>
                        );
                      }}
                    </Show>
                    <span class={styles.entryText}>
                      {entry.text}
                      <Show when={entry.role === "jarvis" && !entry.done}>
                        <span class={styles.caret} aria-hidden="true" />
                      </Show>
                    </span>
                  </div>
                );
              }}
            </For>
          </div>

          <Show when={state().pendingConfirmation}>
            {(confirmation: Accessor<JarvisConfirmation>) => {
              return (
                <JarvisConfirmCard
                  confirmation={confirmation()}
                  onApprove={approveConfirmation}
                  onReject={declineConfirmation}
                />
              );
            }}
          </Show>

          <div class={styles.suggestions}>
            <For each={SUGGESTIONS}>
              {(text: string) => {
                return (
                  <button
                    type="button"
                    data-testid="jarvis-suggestion"
                    class={styles.suggestion}
                    onClick={() => {
                      submit(text);
                    }}
                  >
                    {text}
                  </button>
                );
              }}
            </For>
          </div>

          <div class={styles.inputRow}>
            <input
              type="text"
              data-testid="jarvis-input"
              class={styles.input}
              placeholder="Ask J.A.R.V.I.S…"
              value={inputValue()}
              disabled={state().phase === "speaking"}
              onInput={handleInputChange}
              onChange={handleInputChange}
              onKeyDown={handleInputKeyDown}
            />
            <button
              type="button"
              data-testid="jarvis-send"
              class={styles.sendButton}
              disabled={state().phase === "speaking"}
              onClick={handleSendClick}
            >
              SEND
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
type InputKeyDownEvent = KeyboardEvent & { currentTarget: HTMLInputElement };

const SKIN_LABEL: Record<JarvisSkin, string> = {
  singularity: "Singularity",
  reactor: "Reactor",
};

// Static UI copy — one suggestion row, exact strings pinned by Task 9's
// contract/e2e specs.
const SUGGESTIONS: readonly string[] = [
  "Where is EURUSD?",
  "What's moving?",
  "How am I doing?",
  "Buy 5M EURUSD",
];
