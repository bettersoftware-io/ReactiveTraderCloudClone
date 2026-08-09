import type { Accessor, JSX } from "solid-js";
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";

import {
  JARVIS_GUIDE_CATALOG,
  type JarvisConfirmation,
  type JarvisEntry,
  type JarvisGuideItem,
  type JarvisGuideSection,
  sampleGuideChips,
} from "@rtc/client-core";
import { JARVIS_SKINS, type JarvisSkin } from "@rtc/domain";
import { useViewModel } from "@rtc/solid-bindings";

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
 * auto-scroll — ALL effects are set up unconditionally, above the
 * `<Show when={state().open}>` that gates the body, since Solid has no
 * early-return-null-on-reactive-state escape hatch (it would freeze the
 * overlay at whatever it looked like on first mount).
 */
export function JarvisOverlay(): JSX.Element {
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
  const [inputValue, setInputValue] = createSignal("");
  const [guideOpen, setGuideOpen] = createSignal(false);
  let listRef: HTMLDivElement | undefined;

  useJarvisHotkey(toggle, () => {
    return state().available;
  });

  // Halts a running hands-free demo before honouring the user's own close —
  // otherwise the demo machine's next step would reopen the overlay the user
  // just dismissed (JarvisDemoMachine's `closesOverlay` reopen tail). Unlike
  // the React port, this is a plain closure with no memoization concern:
  // Solid components run their setup body once, so `closeAndStopDemo` keeps
  // one stable identity for the component's whole lifetime — it reads
  // `demoState.state()` fresh at call time regardless.
  function closeAndStopDemo(): void {
    if (demoState().running) {
      stopDemo();
    }

    close();
  }

  createEffect(() => {
    if (!state().open) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }

      if (demoState().running) {
        stopDemo();
      }

      close();
    }

    document.addEventListener("keydown", closeOnEscape);

    onCleanup(() => {
      document.removeEventListener("keydown", closeOnEscape);
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

  // The chip sampler rotates deterministically off `state().openCount` — a
  // `createMemo`, not an inline call in JSX, so the dead-arm branch trap the
  // gate round hit (an expression re-evaluated per read instead of tracked
  // once) can't recur here.
  const chips = createMemo((): readonly string[] => {
    return sampleGuideChips(JARVIS_GUIDE_CATALOG, state().openCount);
  });

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

    if (demoState().running) {
      stopDemo();
    }

    send(trimmed);
  }

  function sendDraft(): void {
    submit(inputValue());
    setInputValue("");
  }

  function updateDraft(event: InputChangeEvent): void {
    setInputValue(event.currentTarget.value);
  }

  function sendDraftOnEnter(event: InputKeyDownEvent): void {
    if (event.key === "Enter") {
      sendDraft();
    }
  }

  function status(): string {
    if (state().pendingConfirmation !== null) {
      return "◇ AWAITING AUTHORISATION";
    }

    return state().phase === "speaking" ? "● SPEAKING" : "◈ LISTENING";
  }

  function speaking(): boolean {
    return state().phase === "speaking";
  }

  return (
    <Show when={state().open}>
      <div data-testid="jarvis-overlay" class={styles.overlay}>
        {/* The stage MUST stay the overlay's first element child — the shared
            UI contract reads the active skin off it (JarvisOverlayPage). */}
        <div
          class={styles.stage}
          data-skin={state().skin}
          data-phase={state().phase}
        >
          <button
            type="button"
            data-testid="jarvis-close"
            aria-label="Close J.A.R.V.I.S"
            class={styles.closeButton}
            onClick={closeAndStopDemo}
          >
            ✕
          </button>

          <button
            type="button"
            data-testid="jarvis-guide-toggle"
            aria-label="Demo guide"
            aria-pressed={guideOpen()}
            class={styles.guideToggle}
            onClick={toggleGuide}
          >
            ⓘ
          </button>

          {/* Holographic core — layered radial glows under counter-rotating
              rings. The two skins are genuinely different objects: MK-I is a
              smooth singularity inside three thin dashed orbits, MK-II is an
              arc reactor (thick segmented coil, hard inner rim, index mark). */}
          <div class={styles.core} aria-hidden="true">
            <span class={styles.coreBloom} />
            <span class={styles.coreSphere} />

            <Show
              when={state().skin === "reactor"}
              fallback={
                <>
                  <span class={styles.ringA}>
                    <svg
                      viewBox="0 0 132 132"
                      class={styles.ringSvg}
                      aria-hidden="true"
                    >
                      <circle
                        cx="66"
                        cy="66"
                        r="60"
                        fill="none"
                        stroke="var(--accent-primary)"
                        stroke-width="1"
                        stroke-dasharray="6 10"
                        opacity="0.7"
                      />
                      <circle cx="66" cy="6" r="2.6" fill="var(--accent-2)" />
                    </svg>
                  </span>
                  <span class={styles.ringB}>
                    <svg
                      viewBox="0 0 132 132"
                      class={styles.ringSvg}
                      aria-hidden="true"
                    >
                      <circle
                        cx="66"
                        cy="66"
                        r="48"
                        fill="none"
                        stroke="var(--accent-2)"
                        stroke-width="1"
                        stroke-dasharray="2 6"
                        opacity="0.8"
                      />
                      <circle
                        cx="114"
                        cy="66"
                        r="2"
                        fill="var(--accent-primary)"
                      />
                    </svg>
                  </span>
                  <span class={styles.ringC}>
                    <svg
                      viewBox="0 0 132 132"
                      class={styles.ringSvg}
                      aria-hidden="true"
                    >
                      <circle
                        cx="66"
                        cy="66"
                        r="38"
                        fill="none"
                        stroke="var(--accent-primary)"
                        stroke-width="1"
                        stroke-dasharray="20 9"
                        opacity="0.5"
                      />
                    </svg>
                  </span>
                </>
              }
            >
              <span class={styles.ringA}>
                <svg
                  viewBox="0 0 132 132"
                  class={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="52"
                    fill="none"
                    stroke="var(--accent-primary)"
                    stroke-width="9"
                    stroke-dasharray="24 8"
                    opacity="0.5"
                  />
                </svg>
              </span>
              <span class={styles.ringB}>
                <svg
                  viewBox="0 0 132 132"
                  class={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="61"
                    fill="none"
                    stroke="var(--accent-2)"
                    stroke-width="1.6"
                    stroke-dasharray="3 9"
                    opacity="0.7"
                  />
                  <path
                    d="M66 22 L74 36 L58 36 Z"
                    fill="var(--accent-primary)"
                    opacity="0.8"
                  />
                </svg>
              </span>
              <span class={styles.ringC}>
                <svg
                  viewBox="0 0 132 132"
                  class={styles.ringSvg}
                  aria-hidden="true"
                >
                  <circle
                    cx="66"
                    cy="66"
                    r="36"
                    fill="none"
                    stroke="var(--accent-primary)"
                    stroke-width="1.2"
                    opacity="0.9"
                  />
                </svg>
              </span>
            </Show>
          </div>

          <div class={styles.wordmark}>J.A.R.V.I.S</div>
          <div class={styles.status}>{status()}</div>

          {/* Voice waveform — 26 bars, `transform: scaleY()` only, each with
              its own literal duration/delay pair in the stylesheet (never a
              var() inside the animated transform, T4). Flat and still while
              idle. */}
          <div
            class={styles.waveform}
            data-speaking={speaking() ? "true" : "false"}
            aria-hidden="true"
          >
            <For each={WAVE_BARS}>
              {() => {
                return <span class={styles.waveBar} />;
              }}
            </For>
          </div>

          <div ref={listRef} class={styles.messages}>
            <For each={state().entries}>
              {(entry: JarvisEntry) => {
                return (
                  <div
                    data-testid="jarvis-entry"
                    data-role={entry.role}
                    data-done={entry.done ? "true" : "false"}
                    data-origin={entry.origin}
                    class={styles.entry}
                  >
                    <Show when={entry.origin === "narrator"}>
                      <span
                        data-testid="jarvis-narrator-badge"
                        class={styles.narratorBadge}
                      >
                        ◈ JARVIS INITIATED
                      </span>
                    </Show>
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

          <Show when={guideOpen()}>
            <aside
              data-testid="jarvis-guide-panel"
              class={styles.guidePanel}
              aria-label="Demo guide"
            >
              <div class={styles.guideHead}>
                <span>DEMO GUIDE</span>
                <button
                  type="button"
                  aria-label="Close demo guide"
                  class={styles.guideClose}
                  onClick={toggleGuide}
                >
                  ✕
                </button>
              </div>
              <div class={styles.guideBody}>
                <button
                  type="button"
                  data-testid="jarvis-guide-run"
                  class={styles.guideRun}
                  disabled={demoState().running}
                  onClick={startDemo}
                >
                  ▶ RUN FULL DEMO · HANDS-FREE
                </button>
                <p class={styles.guideExplainer}>
                  Every line below is a live command — click one to send it to
                  J.A.R.V.I.S.
                </p>
                <For each={JARVIS_GUIDE_CATALOG}>
                  {(section: JarvisGuideSection) => {
                    return (
                      <div class={styles.guideSection}>
                        <div class={styles.guideSectionTitle}>
                          {section.title}
                        </div>
                        <For each={section.items}>
                          {(item: JarvisGuideItem) => {
                            return (
                              <button
                                type="button"
                                data-testid="jarvis-guide-row"
                                class={styles.guideRow}
                                disabled={speaking()}
                                onClick={() => {
                                  submit(item.command);
                                }}
                              >
                                {item.command}
                                <Show when={item.liveOnly}>
                                  <span
                                    data-testid="jarvis-guide-live-badge"
                                    class={styles.guideLiveBadge}
                                  >
                                    live brain
                                  </span>
                                </Show>
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    );
                  }}
                </For>
                <div class={styles.guideTips}>
                  <p>⌘J summons J.A.R.V.I.S from anywhere; ESC dismisses.</p>
                  <p>
                    ▶ RUN FULL DEMO plays the desk hands-free; ■ STOP or any
                    message halts it.
                  </p>
                  <p>Generated panels stay live after the conversation ends.</p>
                </div>
              </div>
            </aside>
          </Show>

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
            <For each={chips()}>
              {(text: string) => {
                return (
                  <button
                    type="button"
                    data-testid="jarvis-suggestion"
                    class={styles.suggestion}
                    disabled={speaking()}
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
            <span class={styles.inputGlyph} aria-hidden="true">
              ◈
            </span>
            <input
              type="text"
              data-testid="jarvis-input"
              class={styles.input}
              placeholder="Ask J.A.R.V.I.S — markets · trades · execution…"
              value={inputValue()}
              disabled={speaking()}
              onInput={updateDraft}
              onChange={updateDraft}
              onKeyDown={sendDraftOnEnter}
            />
            <button
              type="button"
              data-testid="jarvis-send"
              class={styles.sendButton}
              disabled={speaking()}
              onClick={sendDraft}
            >
              SEND
            </button>
          </div>

          <div class={styles.footer}>
            <span class={styles.hint}>ESC · CLOSE</span>
            <span class={styles.hint}>⌘J · TOGGLE</span>

            <Show
              when={demoState().running}
              fallback={
                <button
                  type="button"
                  data-testid="jarvis-demo-run"
                  class={styles.demoRun}
                  onClick={startDemo}
                >
                  ▶ RUN FULL DEMO
                </button>
              }
            >
              <span
                data-testid="jarvis-demo-progress"
                class={styles.demoProgress}
              >
                STEP {demoState().stepIndex}/{demoState().stepCount} ·{" "}
                {demoState().label}
              </span>
              <button
                type="button"
                data-testid="jarvis-demo-stop"
                class={styles.demoStop}
                onClick={stopDemo}
              >
                ■ STOP
              </button>
            </Show>

            <div data-testid="jarvis-skin-switch" class={styles.skinSwitch}>
              <span class={styles.hint}>CORE</span>
              <For each={JARVIS_SKINS}>
                {(skin: JarvisSkin) => {
                  function active(): boolean {
                    return skin === state().skin;
                  }

                  return (
                    <button
                      type="button"
                      aria-pressed={active()}
                      aria-label={SKIN_LABEL[skin]}
                      data-skin={skin}
                      data-active={active() ? "true" : "false"}
                      class={styles.skinButton}
                      onClick={() => {
                        setSkin(skin);
                      }}
                    >
                      {SKIN_MARK[skin]}
                    </button>
                  );
                }}
              </For>
            </div>

            <button type="button" class={styles.hint} onClick={toggleGuide}>
              ⓘ DEMO GUIDE
            </button>
          </div>
        </div>
      </div>
    </Show>
  );
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
type InputKeyDownEvent = KeyboardEvent & { currentTarget: HTMLInputElement };

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
