import type { MouseEvent } from "react";

/** A pointer press on one of the account forms' buttons and links keeps the
 * focus where it is. Otherwise the press blurs the field, the field's error
 * appears, the centred panel moves the control away before the release, and
 * the click is lost. The click itself still fires; Tab still leaves a field
 * and reveals its error. Never attached to an input: clicking another field
 * must still move the focus. */
export function keepFieldFocus(event: MouseEvent<HTMLElement>): void {
  event.preventDefault();
}
