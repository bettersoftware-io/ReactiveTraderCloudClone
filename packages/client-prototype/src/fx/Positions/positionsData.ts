export interface Exposure {
  ccy: string;
  val: number;
  positive: boolean;
  size: number;
  large: boolean;
  amt: string;
}

// PROTO 1299 `bubData`: [ccy, net exposure (millions), positive].
const EXPOSURE_SEED: Array<[string, number, boolean]> = [
  ["EUR", 15.2, true],
  ["USD", -22.8, false],
  ["JPY", 8.4, true],
  ["GBP", -6.1, false],
  ["AUD", 4.7, true],
  ["CAD", -3.2, false],
  ["NZD", 2.1, true],
];

// PROTO 1299: bubble diameter grows with sqrt(|exposure|); bubbles over 62px
// get the larger 15px label. Amount label is signed with an M suffix.
export const EXPOSURE: Exposure[] = EXPOSURE_SEED.map(
  ([ccy, val, positive]) => {
    const size = Math.round(40 + Math.sqrt(Math.abs(val)) * 11);
    return {
      ccy,
      val,
      positive,
      size,
      large: size > 62,
      amt: `${val > 0 ? "+" : ""}${val}M`,
    };
  },
);
