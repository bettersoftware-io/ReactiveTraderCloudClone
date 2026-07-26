import type {
  ChangeEvent,
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { JARVIS_SKINS, type JarvisSkin } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { JarvisConfirmCard } from "./JarvisConfirmCard";
import { useJarvisHotkey } from "./useJarvisHotkey";

import styles from "./JarvisOverlay.module.css";

/**
 * Full-screen cinematic J.A.R.V.I.S overlay — the PreferencesModal fixed-
 * overlay pattern (scrim, early `return null`, no backdrop-filter). Owns the
 * global ⌘/Ctrl+J hotkey (`useJarvisHotkey`) so it's wired regardless of
 * open state, plus a scoped Escape listener and message-list auto-scroll —
 * ALL hooks are called unconditionally, above the `!state.open` early
 * return, per the dumb-UI hooks rule.
 */
export function JarvisOverlay(): ReactElement | null {
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
  const [inputValue, setInputValue] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useJarvisHotkey(toggle);

  useEffect(() => {
    if (!state.open) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [state.open, close]);

  // Auto-scroll to the newest entry — a DOM view-effect (ADR-005-sanctioned),
  // keyed on entries.length so it fires only when the list actually grows.
  useLayoutEffect(() => {
    const el = listRef.current;

    if (!el || state.entries.length === 0) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [state.entries.length]);

  if (!state.open) {
    return null;
  }

  const speaking = state.phase === "speaking";

  function submit(text: string): void {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    send(trimmed);
  }

  function handleSendClick(): void {
    submit(inputValue);
    setInputValue("");
  }

  function handleInputKeyDown(
    event: ReactKeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === "Enter") {
      handleSendClick();
    }
  }

  return (
    <div data-testid="jarvis-overlay" className={styles.overlay}>
      <div className={styles.dialog} data-skin={state.skin}>
        <header className={styles.head}>
          <span className={styles.wordmark}>JARVIS</span>

          <div data-testid="jarvis-skin-switch" className={styles.skinSwitch}>
            {JARVIS_SKINS.map((skin) => {
              const active = skin === state.skin;
              return (
                <button
                  key={skin}
                  type="button"
                  aria-pressed={active}
                  data-skin={skin}
                  data-active={active ? "true" : "false"}
                  className={styles.skinButton}
                  onClick={() => {
                    setSkin(skin);
                  }}
                >
                  {SKIN_LABEL[skin]}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            data-testid="jarvis-close"
            aria-label="Close J.A.R.V.I.S"
            className={styles.closeButton}
            onClick={close}
          >
            ✕
          </button>
        </header>

        <div
          className={styles.core}
          data-skin={state.skin}
          data-phase={state.phase}
          aria-hidden="true"
        >
          <span className={styles.coreHalo} />
          <span className={styles.coreRing} />
          <span className={styles.coreCenter} />
          {speaking ? (
            <div className={styles.waveform}>
              <span className={styles.bar} />
              <span className={styles.bar} />
              <span className={styles.bar} />
              <span className={styles.bar} />
              <span className={styles.bar} />
            </div>
          ) : null}
        </div>

        <div ref={listRef} className={styles.messages}>
          {state.entries.map((entry) => {
            return (
              <div
                key={entry.id}
                data-testid="jarvis-entry"
                data-role={entry.role}
                data-done={entry.done ? "true" : "false"}
                className={styles.entry}
              >
                {entry.tool ? (
                  <span
                    data-testid="jarvis-tool-chip"
                    data-status={entry.tool.status}
                    className={styles.toolChip}
                  >
                    ⟢ {entry.tool.name}
                  </span>
                ) : null}
                <span className={styles.entryText}>
                  {entry.text}
                  {entry.role === "jarvis" && !entry.done ? (
                    <span className={styles.caret} aria-hidden="true" />
                  ) : null}
                </span>
              </div>
            );
          })}
        </div>

        {state.pendingConfirmation ? (
          <JarvisConfirmCard
            confirmation={state.pendingConfirmation}
            onApprove={approveConfirmation}
            onReject={declineConfirmation}
          />
        ) : null}

        <div className={styles.suggestions}>
          {SUGGESTIONS.map((text) => {
            return (
              <button
                key={text}
                type="button"
                data-testid="jarvis-suggestion"
                className={styles.suggestion}
                onClick={() => {
                  submit(text);
                }}
              >
                {text}
              </button>
            );
          })}
        </div>

        <div className={styles.inputRow}>
          <input
            type="text"
            data-testid="jarvis-input"
            className={styles.input}
            placeholder="Ask J.A.R.V.I.S…"
            value={inputValue}
            disabled={speaking}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setInputValue(event.target.value);
            }}
            onKeyDown={handleInputKeyDown}
          />
          <button
            type="button"
            data-testid="jarvis-send"
            className={styles.sendButton}
            disabled={speaking}
            onClick={handleSendClick}
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}

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
