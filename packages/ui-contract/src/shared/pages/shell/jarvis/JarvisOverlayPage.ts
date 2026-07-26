import { within } from "@testing-library/dom";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { MountedComponent } from "@ui-contract/harness/component";

import type { JarvisEvent } from "@rtc/client-core";
import type { JarvisSkin } from "@rtc/domain";

/** One rendered `jarvis-entry` row, as read off its `data-role`/`data-done`
 * attributes plus its visible text. */
export interface JarvisEntryView {
  readonly role: string;
  readonly text: string;
  readonly done: boolean;
}

/**
 * Page object for the cinematic J.A.R.V.I.S overlay (`JarvisOverlay`, Task 8).
 * Hook-driven: reads/drives `useJarvis()` off the REAL JarvisMachine (Task 9,
 * built by `viewModelFromWorld` over `world.jarvis`). The overlay renders
 * nothing while `state.open` is false, so {@link pressHotkey} (the global
 * ⌘/Ctrl+J shortcut `JarvisOverlay` binds unconditionally) is the page's own
 * way to open it — no co-mounted orb required, though scenarios that need the
 * orb's `data-jarvis-state`/badge instead mount both on one shared World (see
 * `JarvisOrbPage`) and open via a click there.
 */
export class JarvisOverlayPage extends MountedComponent<Record<string, never>> {
  private readonly user: UserEvent = userEvent.setup();

  private overlay(): HTMLElement | null {
    return within(this.root).queryByTestId("jarvis-overlay");
  }

  private requireOverlay(): HTMLElement {
    const el = this.overlay();

    if (!el) {
      throw new Error("JarvisOverlay is not open");
    }

    return el;
  }

  /** True while the overlay is rendered (`state.open`). */
  isOpen(): boolean {
    return this.overlay() !== null;
  }

  /** The active skin, read off the dialog's `data-skin` (the outer overlay
   * element's first child) — reflects the REAL machine's `state.skin`. */
  dialogSkin(): string {
    const dialog = this.requireOverlay().firstElementChild;
    return dialog?.getAttribute("data-skin") ?? "";
  }

  /** Every rendered message entry, in order. */
  entries(): JarvisEntryView[] {
    const overlay = this.overlay();

    if (!overlay) {
      return [];
    }

    return within(overlay)
      .queryAllByTestId("jarvis-entry")
      .map((el): JarvisEntryView => {
        return {
          role: el.getAttribute("data-role") ?? "",
          text: el.textContent ?? "",
          done: el.getAttribute("data-done") === "true",
        };
      });
  }

  /** The most recently rendered entry, or null when there are none. */
  lastEntry(): JarvisEntryView | null {
    const all = this.entries();
    return all.length > 0 ? (all[all.length - 1] ?? null) : null;
  }

  /** The streaming tool chip's `data-status` ("running" | "done"), or null
   * when no entry currently carries one. */
  toolChipStatus(): string | null {
    const overlay = this.overlay();
    const chip = overlay
      ? within(overlay).queryByTestId("jarvis-tool-chip")
      : null;
    return chip?.getAttribute("data-status") ?? null;
  }

  /** True while the pending-confirmation card is rendered. */
  hasConfirmCard(): boolean {
    const overlay = this.overlay();
    return (
      !!overlay && within(overlay).queryByTestId("jarvis-confirm-card") !== null
    );
  }

  /** True when the confirm card's SVG countdown ring is present — the ring's
   * per-second fraction is machine-owned (JARVIS_CONFIRM_TIMEOUT_MS ticking
   * is a presenter-unit concern, not asserted here); presence is enough. */
  hasCountdownRing(): boolean {
    const card = within(this.requireOverlay()).queryByTestId(
      "jarvis-confirm-card",
    );
    return !!card && card.querySelector("svg") !== null;
  }

  private confirmCardSpans(): HTMLElement[] {
    const card = within(this.requireOverlay()).getByTestId(
      "jarvis-confirm-card",
    );
    return [...card.querySelectorAll("span")];
  }

  /** The confirm card's direction badge ("buy" | "sell"), read off `data-dir`. */
  confirmDirection(): string {
    const card = within(this.requireOverlay()).getByTestId(
      "jarvis-confirm-card",
    );
    return card.querySelector("[data-dir]")?.getAttribute("data-dir") ?? "";
  }

  /** The confirm card's instrument symbol. */
  confirmSymbol(): string {
    return this.confirmCardSpans()[1]?.textContent?.trim() ?? "";
  }

  /** The confirm card's formatted notional value. */
  confirmNotional(): string {
    return this.confirmCardSpans()[3]?.textContent?.trim() ?? "";
  }

  /** The confirm card's formatted quoted price. */
  confirmPrice(): string {
    return this.confirmCardSpans()[5]?.textContent?.trim() ?? "";
  }

  /** Click APPROVE on the confirm card. */
  async approveConfirm(): Promise<void> {
    await this.user.click(
      within(this.requireOverlay()).getByTestId("jarvis-confirm-approve"),
    );
  }

  /** Click REJECT on the confirm card. */
  async rejectConfirm(): Promise<void> {
    await this.user.click(
      within(this.requireOverlay()).getByTestId("jarvis-confirm-reject"),
    );
  }

  /** Type `text` into the input and click SEND — the only way to drive the
   * REAL machine's `send()` intent (no direct World access to it). */
  async send(text: string): Promise<void> {
    await this.typeInput(text);
    await this.clickSend();
  }

  /** Type `text` into the input WITHOUT submitting. */
  async typeInput(text: string): Promise<void> {
    const input = within(this.requireOverlay()).getByTestId("jarvis-input");
    await this.user.type(input, text);
  }

  /** Click SEND with whatever the input currently holds — exercises
   * `submit()`'s empty/whitespace-only guard when the input is blank. */
  async clickSend(): Promise<void> {
    await this.user.click(
      within(this.requireOverlay()).getByTestId("jarvis-send"),
    );
  }

  /** Type `text` into the input and press Enter — the alternate way to
   * submit (`handleInputKeyDown`'s Enter branch), not just clicking SEND. */
  async sendViaEnter(text: string): Promise<void> {
    const input = within(this.requireOverlay()).getByTestId("jarvis-input");
    await this.user.type(input, `${text}{Enter}`);
  }

  /** Click a suggestion chip by its exact label — sends its text immediately. */
  async clickSuggestion(text: string): Promise<void> {
    const chip = within(this.requireOverlay())
      .getAllByTestId("jarvis-suggestion")
      .find((el) => {
        return el.textContent?.trim() === text;
      });

    if (!chip) {
      throw new Error(`no suggestion chip labelled "${text}"`);
    }

    await this.user.click(chip);
  }

  /** Every suggestion chip's label, in render order. */
  suggestions(): string[] {
    return within(this.requireOverlay())
      .getAllByTestId("jarvis-suggestion")
      .map((el) => {
        return el.textContent?.trim() ?? "";
      });
  }

  /** Select a skin through the real seam (writes through to the World's
   * preference subject via the machine's `setSkin` intent). */
  async selectSkin(skin: JarvisSkin): Promise<void> {
    const switcher = within(this.requireOverlay()).getByTestId(
      "jarvis-skin-switch",
    );

    const button = within(switcher).getByRole("button", {
      name: SKIN_LABEL[skin],
    });
    await this.user.click(button);
  }

  /** True when the given skin is the active one in the skin-switch row. */
  isSkinActive(skin: JarvisSkin): boolean {
    const switcher = within(this.requireOverlay()).queryByTestId(
      "jarvis-skin-switch",
    );
    const button = switcher?.querySelector(`[data-skin="${skin}"]`);
    return (button?.getAttribute("data-active") ?? "false") === "true";
  }

  /** Click the ✕ close control. */
  async close(): Promise<void> {
    await this.user.click(
      within(this.requireOverlay()).getByTestId("jarvis-close"),
    );
  }

  /** Press Escape at document scope — JarvisOverlay's own scoped listener
   * (active only while open) closes it. */
  async pressEscape(): Promise<void> {
    await this.user.keyboard("{Escape}");
  }

  /** Press ⌘J at document scope — the global hotkey JarvisOverlay binds
   * unconditionally (open or closed); toggles the shared machine's `open`. */
  async pressHotkey(): Promise<void> {
    await this.user.keyboard("{Meta>}j{/Meta}");
  }

  /** True while the input is disabled (machine `phase === "speaking"`). */
  isInputDisabled(): boolean {
    const input = within(this.requireOverlay()).getByTestId(
      "jarvis-input",
    ) as HTMLInputElement;
    return input.disabled;
  }

  /** True while SEND is disabled (machine `phase === "speaking"`). */
  isSendDisabled(): boolean {
    const button = within(this.requireOverlay()).getByTestId(
      "jarvis-send",
    ) as HTMLButtonElement;
    return button.disabled;
  }

  /** True while every suggestion chip is disabled (machine
   * `phase === "speaking"`) — mirrors isInputDisabled/isSendDisabled. A turn
   * in flight must not let a chip fire a second `send()` underneath it. */
  areSuggestionsDisabled(): boolean {
    const chips = within(this.requireOverlay()).getAllByTestId(
      "jarvis-suggestion",
    ) as HTMLButtonElement[];
    return (
      chips.length > 0 &&
      chips.every((chip) => {
        return chip.disabled;
      })
    );
  }

  /** Push reply events onto the Jarvis fake's in-flight `ask()` turn — see
   * {@link MountedComponent.emitJarvis}. */
  emitEvents(events: readonly JarvisEvent[]): void {
    this.emitJarvis(events);
  }
}

const SKIN_LABEL: Record<JarvisSkin, string> = {
  singularity: "Singularity",
  reactor: "Reactor",
};
