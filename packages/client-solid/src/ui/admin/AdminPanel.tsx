import type { Accessor, JSX } from "solid-js";
import { Show } from "solid-js";

import type { ThroughputView } from "@rtc/client-core";
import { useViewModel } from "@rtc/solid-bindings";

import styles from "./AdminPanel.module.css";

export function AdminPanel(): JSX.Element {
  const { useThroughput } = useViewModel();
  const { value, loading, message, setValue } = useThroughput();

  let numberInputRef!: HTMLInputElement;

  // React's onChange fires per keystroke (native `input` event); Solid's
  // onChange maps to native `change` only (fires on blur) — both wired here
  // so real typing (`input`) and a programmatic `change` dispatch both drive
  // this live (mirrors TileNotional's/NumberFilter's identical comment).
  function handleSliderInput(e: SliderInputEvent): void {
    setValue(Number(e.currentTarget.value));
  }

  function handleNumberInput(e: NumberInputEvent): void {
    const n = Number(e.currentTarget.value);

    if (Number.isFinite(n) && n >= 0 && n <= 1000) {
      setValue(n);
    } else {
      // React's controlled <input> silently restores the DOM value to the
      // last-valid tracked prop after every change event, even when that
      // prop didn't change (react-dom's restoreControlledState) — Solid has
      // no such implicit mechanism, so an out-of-range keystroke must be
      // reset back to the last accepted value explicitly here to match the
      // same visible "rejects an out-of-range entry" behaviour.
      numberInputRef.value = String(value());
    }
  }

  return (
    <Show
      when={!loading()}
      fallback={<div class={styles.loading}>Loading throughput...</div>}
    >
      <div class={styles.panel}>
        <h2 class={styles.heading}>Throughput Control</h2>

        <div class={styles.row}>
          <input
            type="range"
            min={0}
            max={1000}
            step={10}
            value={value()}
            onInput={handleSliderInput}
            onChange={handleSliderInput}
            class={styles.slider}
          />

          <div class={styles.inputGroup}>
            <input
              ref={numberInputRef}
              type="number"
              min={0}
              max={1000}
              step={10}
              value={value()}
              onInput={handleNumberInput}
              onChange={handleNumberInput}
              class={styles.numberInput}
            />
            <span class={styles.unit}>Updates/sec</span>
          </div>
        </div>

        <Show when={message()}>
          {(msg: Accessor<ThroughputMessage>) => {
            return (
              <div
                data-error={msg().isError ? "true" : "false"}
                class={styles.message}
              >
                {msg().text}
              </div>
            );
          }}
        </Show>
      </div>
    </Show>
  );
}

type SliderInputEvent = Event & { currentTarget: HTMLInputElement };
type NumberInputEvent = Event & { currentTarget: HTMLInputElement };
type ThroughputMessage = NonNullable<ThroughputView["message"]>;
