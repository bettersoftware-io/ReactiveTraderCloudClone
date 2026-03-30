import type { MarkerEvent } from "../protocol/sow.js";

export interface DealerDto {
  readonly id: number;
  readonly name: string;
}

export type DealerEvent = MarkerEvent<DealerDto>;
