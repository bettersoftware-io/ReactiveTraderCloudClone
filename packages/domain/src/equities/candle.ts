export interface Candle {
  readonly time: number;
  readonly open: number;
  readonly high: number;
  readonly low: number;
  readonly close: number;
  /** Traded shares in the bucket. Simulator-generated deterministically;
   * price-independent (survives the series' live-price anchoring rescale). */
  readonly volume: number;
}
