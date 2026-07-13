import type { Accessor, JSX } from "solid-js";
import { createMemo, Show } from "solid-js";

import type { NotionalIntents, NotionalView } from "@rtc/client-core";

import styles from "./TileNotional.module.css";

export function TileNotional(props: TileNotionalProps): JSX.Element {
  let inputRef!: HTMLInputElement;

  function handleChange(e: InputChangeEvent): void {
    props.notional.change(e.currentTarget.value);
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
          onChange={handleChange}
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
