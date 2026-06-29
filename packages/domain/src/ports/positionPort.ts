import type { Observable } from "rxjs";

import type { EquityPosition } from "../equities/position.js";

export interface PositionPort {
  positions(): Observable<readonly EquityPosition[]>;
}
