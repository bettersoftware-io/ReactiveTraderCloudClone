export interface PositionsPanelPO {
  waitVisible(timeoutMs: number): Promise<void>;
  isVisible(): Promise<boolean>;

  /** Number of visible net-exposure bubbles in the cluster. */
  bubbleCount(): Promise<number>;
  /** `data-sign` ("pos" | "neg") of the first bubble, or null if none rendered. */
  firstBubbleSign(): Promise<string | null>;
  /** innerText of the first bubble (currency + signed amount, e.g. "EUR+3.2M"). */
  firstBubbleText(): Promise<string>;

  /** Number of visible exposure ladder rows. */
  rowCount(): Promise<number>;
  /** `data-sign` ("pos" | "neg") of the first ladder row's amount, or null if none rendered. */
  firstRowSign(): Promise<string | null>;
  /** innerText of the first ladder row (currency + signed amount). */
  firstRowText(): Promise<string>;
}
