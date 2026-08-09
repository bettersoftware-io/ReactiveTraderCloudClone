import type {
  ChangeEvent,
  ReactElement,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { JARVIS_GUIDE_CATALOG, sampleGuideChips } from "@rtc/client-core";
import { JARVIS_SKINS, type JarvisSkin } from "@rtc/domain";
import { useViewModel } from "@rtc/react-bindings";

import { JarvisConfirmCard } from "./JarvisConfirmCard";
import { useJarvisHotkey } from "./useJarvisHotkey";

import styles from "./JarvisOverlay.module.css";

/**
 * Full-screen cinematic J.A.R.V.I.S overlay — a port of the v5 prototype's
 * overlay (docs/design/web/v5): the desk stays visible behind a heavy dim,
 * and a single centred column carries the holographic core, the wordmark,
 * the status line, the voice waveform, the transcript, the suggestion chips
 * and the input rail. It is deliberately NOT a bordered modal card.
 *
 * The prototype's `backdrop-filter: blur(9px)` is banned here
 * (docs/performance.md T6), so the separation comes from a stronger dim plus
 * layered static gradients — a vignette, an accent bloom behind the core and
 * a scanline weave (all in the .module.css, all paint-once).
 *
 * Owns the global ⌘/Ctrl+J hotkey (`useJarvisHotkey`) so it is wired
 * regardless of open state, plus a scoped Escape listener and message-list
 * auto-scroll — ALL hooks are called unconditionally, above the `!state.open`
 * early return, per the dumb-UI hooks rule.
 */
export function JarvisOverlay(): ReactElement | null {
  const { useJarvis, useJarvisDemo } = useViewModel();
  const {
    state,
    close,
    toggle,
    send,
    approveConfirmation,
    declineConfirmation,
    setSkin,
  } = useJarvis();
  const { state: demoState, startDemo, stopDemo } = useJarvisDemo();
  const [inputValue, setInputValue] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useJarvisHotkey(toggle, state.available);

  // Halts a running hands-free demo before honouring the user's own close —
  // otherwise the demo machine's next step would reopen the overlay the user
  // just dismissed (JarvisDemoMachine's `closesOverlay` reopen tail). A plain
  // function declaration rather than a shared helper the effect below also
  // calls: this component reads hooks off the ViewModel seam (`useJarvis`/
  // `useJarvisDemo`), which bails the React Compiler out of memoizing it, so
  // it gets a fresh identity every render — fine as a JSX click prop
  // (identity doesn't matter there) but wrong as an effect dependency (see
  // the effect below, which inlines the same guard over its own primitive
  // deps instead).
  function closeAndStopDemo(): void {
    if (demoState.running) {
      stopDemo();
    }

    close();
  }

  useEffect(() => {
    if (!state.open) {
      return undefined;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      if (demoState.running) {
        stopDemo();
      }

      close();
    }

    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [state.open, demoState.running, stopDemo, close]);

  // Auto-scroll to the newest entry — a DOM view-effect (ADR-005-sanctioned),
  // keyed on entries.length so it fires only when the list actually grows.
  // ALSO keyed on state.open: while closed this component renders `null`, so
  // `listRef.current` is null and every entries.length change over that span
  // no-ops here — including the whole backlog a hands-free demo step appends
  // between its own `jarvis.close()` and its later `jarvis.open()`
  // (JarvisDemoMachine's `closesOverlay`/reopen tail). Without `state.open`
  // in the deps, the reopen's render sees the SAME entries.length as the
  // last (no-op) run and React skips re-invoking the effect entirely, so the
  // freshly mounted `.messages` div is left at its default scrollTop (top)
  // instead of the newest entry.
  useLayoutEffect(() => {
    const el = listRef.current;

    if (!state.open || !el || state.entries.length === 0) {
      return;
    }

    el.scrollTop = el.scrollHeight;
  }, [state.entries.length, state.open]);

  if (!state.open) {
    return null;
  }

  const speaking = state.phase === "speaking";
  const awaiting = state.pendingConfirmation !== null;
  const status = awaiting
    ? "◇ AWAITING AUTHORISATION"
    : speaking
      ? "● SPEAKING"
      : "◈ LISTENING";

  const chips = sampleGuideChips(JARVIS_GUIDE_CATALOG, state.openCount);

  function toggleGuide(): void {
    setGuideOpen((open) => {
      return !open;
    });
  }

  function submit(text: string): void {
    const trimmed = text.trim();

    if (trimmed.length === 0) {
      return;
    }

    if (demoState.running) {
      stopDemo();
    }

    send(trimmed);
  }

  function sendDraft(): void {
    submit(inputValue);
    setInputValue("");
  }

  function sendDraftOnEnter(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      sendDraft();
    }
  }

  return (
    <div data-testid="jarvis-overlay" className={styles.overlay}>
      {/* The stage MUST stay the overlay's first element child — the shared
          UI contract reads the active skin off it (JarvisOverlayPage). */}
      <div
        className={styles.stage}
        data-skin={state.skin}
        data-phase={state.phase}
      >
        <button
          type="button"
          data-testid="jarvis-close"
          aria-label="Close J.A.R.V.I.S"
          className={styles.closeButton}
          onClick={closeAndStopDemo}
        >
          ✕
        </button>

        <button
          type="button"
          data-testid="jarvis-guide-toggle"
          aria-label="Demo guide"
          aria-pressed={guideOpen}
          className={styles.guideToggle}
          onClick={toggleGuide}
        >
          ⓘ
        </button>

        {/* Holographic core — layered radial glows under counter-rotating
            rings. The two skins are genuinely different objects: MK-I is a
            smooth singularity inside three thin dashed orbits, MK-II is an
            arc reactor (thick segmented coil, hard inner rim, index mark). */}
        <div className={styles.core} aria-hidden="true">
          <span className={styles.coreBloom} />
          <span className={styles.coreSphere} />

          {state.skin === "reactor" ? (
            <>
              <span className={styles.ringA}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="52"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="9"
                    strokeDasharray="24 8"
                    opacity="0.5"
                  />
                </svg>
              </span>
              <span className={styles.ringB}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="61"
                    fill="none"
                    stroke="var(--accent-2)"
                    strokeWidth="1.6"
                    strokeDasharray="3 9"
                    opacity="0.7"
                  />
                  <path
                    d="M66 22 L74 36 L58 36 Z"
                    fill="var(--accent-primary)"
                    opacity="0.8"
                  />
                </svg>
              </span>
              <span className={styles.ringC}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="36"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="1.2"
                    opacity="0.9"
                  />
                </svg>
              </span>
            </>
          ) : (
            <>
              <span className={styles.ringA}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="60"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="1"
                    strokeDasharray="6 10"
                    opacity="0.7"
                  />
                  <circle cx="66" cy="6" r="2.6" fill="var(--accent-2)" />
                </svg>
              </span>
              <span className={styles.ringB}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="48"
                    fill="none"
                    stroke="var(--accent-2)"
                    strokeWidth="1"
                    strokeDasharray="2 6"
                    opacity="0.8"
                  />
                  <circle cx="114" cy="66" r="2" fill="var(--accent-primary)" />
                </svg>
              </span>
              <span className={styles.ringC}>
                <svg
                  viewBox="0 0 132 132"
                  className={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="38"
                    fill="none"
                    stroke="var(--accent-primary)"
                    strokeWidth="1"
                    strokeDasharray="20 9"
                    opacity="0.5"
                  />
                </svg>
              </span>
            </>
          )}
        </div>

        <div className={styles.wordmark}>J.A.R.V.I.S</div>
        <div className={styles.status}>{status}</div>

        {/* Voice waveform — 26 bars, `transform: scaleY()` only, each with its
            own literal duration/delay pair in the stylesheet (never a var()
            inside the animated transform, T4). Flat and still while idle. */}
        <div
          className={styles.waveform}
          data-speaking={speaking ? "true" : "false"}
          aria-hidden="true"
        >
          {WAVE_BARS.map((bar) => {
            return <span key={bar} className={styles.waveBar} />;
          })}
        </div>

        <div ref={listRef} className={styles.messages}>
          {state.entries.map((entry) => {
            return (
              <div
                key={entry.id}
                data-testid="jarvis-entry"
                data-role={entry.role}
                data-done={entry.done ? "true" : "false"}
                data-origin={entry.origin}
                className={styles.entry}
              >
                {entry.origin === "narrator" ? (
                  <span
                    data-testid="jarvis-narrator-badge"
                    className={styles.narratorBadge}
                  >
                    ◈ JARVIS INITIATED
                  </span>
                ) : null}
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

        {guideOpen ? (
          <aside
            data-testid="jarvis-guide-panel"
            className={styles.guidePanel}
            aria-label="Demo guide"
          >
            <div className={styles.guideHead}>
              <span>DEMO GUIDE</span>
              <button
                type="button"
                aria-label="Close demo guide"
                className={styles.guideClose}
                onClick={toggleGuide}
              >
                ✕
              </button>
            </div>
            <div className={styles.guideBody}>
              <button
                type="button"
                data-testid="jarvis-guide-run"
                className={styles.guideRun}
                disabled={demoState.running}
                onClick={startDemo}
              >
                ▶ RUN FULL DEMO · HANDS-FREE
              </button>
              <p className={styles.guideExplainer}>
                Every line below is a live command — click one to send it to
                J.A.R.V.I.S.
              </p>
              {JARVIS_GUIDE_CATALOG.map((section) => {
                return (
                  <div key={section.title} className={styles.guideSection}>
                    <div className={styles.guideSectionTitle}>
                      {section.title}
                    </div>
                    {section.items.map((item) => {
                      return (
                        <button
                          key={item.command}
                          type="button"
                          data-testid="jarvis-guide-row"
                          className={styles.guideRow}
                          disabled={speaking}
                          onClick={() => {
                            submit(item.command);
                          }}
                        >
                          {item.command}
                          {item.liveOnly ? (
                            <span
                              data-testid="jarvis-guide-live-badge"
                              className={styles.guideLiveBadge}
                            >
                              live brain
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
              <div className={styles.guideTips}>
                <p>⌘J summons J.A.R.V.I.S from anywhere; ESC dismisses.</p>
                <p>
                  ▶ RUN FULL DEMO plays the desk hands-free; ■ STOP or any
                  message halts it.
                </p>
                <p>Generated panels stay live after the conversation ends.</p>
              </div>
            </div>
          </aside>
        ) : null}

        {state.pendingConfirmation ? (
          <JarvisConfirmCard
            confirmation={state.pendingConfirmation}
            onApprove={approveConfirmation}
            onReject={declineConfirmation}
          />
        ) : null}

        <div className={styles.suggestions}>
          {chips.map((text) => {
            return (
              <button
                key={text}
                type="button"
                data-testid="jarvis-suggestion"
                className={styles.suggestion}
                disabled={speaking}
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
          <span className={styles.inputGlyph} aria-hidden="true">
            ◈
          </span>
          <input
            type="text"
            data-testid="jarvis-input"
            className={styles.input}
            placeholder="Ask J.A.R.V.I.S — markets · trades · execution…"
            value={inputValue}
            disabled={speaking}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setInputValue(event.target.value);
            }}
            onKeyDown={sendDraftOnEnter}
          />
          <button
            type="button"
            data-testid="jarvis-send"
            className={styles.sendButton}
            disabled={speaking}
            onClick={sendDraft}
          >
            SEND
          </button>
        </div>

        <div className={styles.footer}>
          <span className={styles.hint}>ESC · CLOSE</span>
          <span className={styles.hint}>⌘J · TOGGLE</span>

          {demoState.running ? (
            <>
              <span
                data-testid="jarvis-demo-progress"
                className={styles.demoProgress}
              >
                STEP {demoState.stepIndex}/{demoState.stepCount} ·{" "}
                {demoState.label}
              </span>
              <button
                type="button"
                data-testid="jarvis-demo-stop"
                className={styles.demoStop}
                onClick={stopDemo}
              >
                ■ STOP
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="jarvis-demo-run"
              className={styles.demoRun}
              onClick={startDemo}
            >
              ▶ RUN FULL DEMO
            </button>
          )}

          <div data-testid="jarvis-skin-switch" className={styles.skinSwitch}>
            <span className={styles.hint}>CORE</span>
            {JARVIS_SKINS.map((skin) => {
              const active = skin === state.skin;
              return (
                <button
                  key={skin}
                  type="button"
                  aria-pressed={active}
                  aria-label={SKIN_LABEL[skin]}
                  data-skin={skin}
                  data-active={active ? "true" : "false"}
                  className={styles.skinButton}
                  onClick={() => {
                    setSkin(skin);
                  }}
                >
                  {SKIN_MARK[skin]}
                </button>
              );
            })}
          </div>

          <button type="button" className={styles.hint} onClick={toggleGuide}>
            ⓘ DEMO GUIDE
          </button>
        </div>
      </div>
    </div>
  );
}

/** The accessible name of each skin control — the shared UI contract selects
 * them by role+name, so these strings are load-bearing. */
const SKIN_LABEL: Record<JarvisSkin, string> = {
  singularity: "Singularity",
  reactor: "Reactor",
};

/** The visible, cinematic label. PROTO renders the active core as
 * "CORE MK-I SINGULARITY ▸ SWITCH"; the port shows both marks side by side. */
const SKIN_MARK: Record<JarvisSkin, string> = {
  singularity: "MK-I SINGULARITY",
  reactor: "MK-II REACTOR",
};

/** PROTO renders 26 waveform bars; each one's duration/delay pair lives in
 * the stylesheet as an `:nth-child` rule (no inline style, no var() inside an
 * animated transform). */
const WAVE_BARS: readonly number[] = Array.from({ length: 26 }, (_, i) => {
  return i;
});
