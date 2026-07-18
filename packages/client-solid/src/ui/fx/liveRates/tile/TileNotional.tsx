import type { Accessor, JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import type { NotionalIntents, NotionalView } from "@rtc/client-core";

import styles from "./TileNotional.module.css";

export function TileNotional(props: TileNotionalProps): JSX.Element {
  let inputRef!: HTMLInputElement;

  // React's onChange fires on every keystroke via the native `input` event
  // (real typing) but its synthetic event system also normalizes a plain
  // native `change` event to the same handler (the contract spec's
  // `changeInput` helper fires `change` directly, not `input`, to drive this
  // deterministically) — Solid has no such normalization, so both native
  // events are wired to the same handler here to cover real typing AND the
  // test double's programmatic `change` dispatch.
  //
  // Wiring both is idempotent ONLY because of the guard below. A real
  // browser (Playwright's `locator.fill()`, unlike jsdom/RTL's single
  // `fireEvent`) dispatches BOTH a native `input` and a trailing `change` for
  // one fill. The `input` event applies the raw typed value and — since this
  // is a controlled input — synchronously re-renders `value` to the machine's
  // reformatted `displayValue` (e.g. "10000000" -> "10,000,000"). By the time
  // the trailing native `change` fires, `e.currentTarget.value` already reads
  // that comma-formatted string back (React's own input-value-tracking
  // dedupes this case for free; Solid has no equivalent). Re-feeding it to
  // `parseNotional` — which rejects commas — would stomp the just-applied
  // valid state with a spurious "Invalid input" error. Skip re-processing
  // when the incoming value already matches what's currently displayed.
  function handleInput(e: InputChangeEvent): void {
    const raw = e.currentTarget.value;

    if (raw === props.notional.state().displayValue) {
      return;
    }

    props.notional.change(raw);
  }

  function handleKeyDown(e: InputKeyDownEvent): void {
    if (e.key === "Enter") {
      inputRef.blur();
    }
  }

  function handleFocus(): void {
    inputRef.select();
  }

  const hasError = createMemo((): boolean => {
    return !!props.notional.state().error;
  });

  return (
    <div class={styles.wrapper}>
      <span class={styles.currencyLabel}>{props.baseCurrency}</span>
      <div class={styles.inputArea}>
        <input
          ref={inputRef}
          value={props.notional.state().displayValue}
          onInput={handleInput}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          disabled={props.disabled}
          data-error={hasError() ? "true" : "false"}
          class={styles.input}
        />
        <Show when={!props.notional.state().isDefault}>
          <button
            type="button"
            onClick={() => {
              props.notional.reset();
            }}
            title="Reset to default"
            class={styles.resetButton}
          >
            {"↺"}
          </button>
        </Show>
      </div>
      <Show when={hasError()}>
        <span class={styles.maxTag}>MAX</span>
      </Show>
      <Show when={hasError()}>
        <span data-testid="notional-error" class={styles.errorMessage}>
          {props.notional.state().error}
        </span>
      </Show>
    </div>
  );
}

interface TileNotionalProps {
  notional: NotionalMachine;
  baseCurrency: string;
  disabled?: boolean;
}

type NotionalMachine = { state: Accessor<NotionalView> } & NotionalIntents;
type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
type InputKeyDownEvent = KeyboardEvent & { currentTarget: HTMLInputElement };
