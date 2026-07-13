import type { JSX } from "solid-js";

import styles from "./QuickFilter.module.css";

export function QuickFilter(props: QuickFilterProps): JSX.Element {
  // React's onChange fires on every keystroke (native `input` event);
  // Solid's onChange maps to the native `change` event only (fires on
  // blur/commit) — both wired to this handler so real typing (`input`) and
  // a programmatic `change` dispatch both narrow live.
  //
  // This is a FULLY controlled input with no local signal — `value` is
  // whatever the caller passes as `props.value`. React re-forces the DOM
  // node's value to match a controlled `value` prop on EVERY render, even
  // when the prop string is unchanged from before, which is what makes a
  // caller that ignores onChange (never updates its own state) see the
  // input snap back to the old value after each keystroke. Solid's
  // fine-grained `value={props.value}` binding only re-touches the DOM when
  // the underlying signal actually changes — so a caller that doesn't write
  // back never gets the snap-back "for free". The explicit reset below
  // reproduces it: real callers (FxBlotterHead passes `onChange=
  // {setQuickFilter}`, which the same tick's `props.value` already reflects)
  // are unaffected — the reset is a no-op there.
  function handleEdit(e: InputChangeEvent): void {
    props.onChange(e.currentTarget.value);
    e.currentTarget.value = props.value;
  }

  return (
    <input
      data-testid="quick-filter"
      type="text"
      value={props.value}
      onInput={handleEdit}
      onChange={handleEdit}
      placeholder="Quick filter..."
      class={styles.input}
    />
  );
}

interface QuickFilterProps {
  value: string;
  onChange: (value: string) => void;
}

type InputChangeEvent = Event & { currentTarget: HTMLInputElement };
