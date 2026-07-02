import { useCallback, useMemo, useState } from "react";

import { DEALERS, parseNotional } from "#/credit/creditData";
import type { Dir } from "#/credit/types";

export interface RfqFormValue {
  dir: Dir;
  instrumentId: number | null;
  qty: string;
  dealerIds: number[];
}

export interface CreditFormApi {
  value: RfqFormValue;
  showInstr: boolean;
  valid: boolean;
  allDealers: boolean;
  setDir(dir: Dir): void;
  selectInstrument(id: number): void;
  toggleInstr(): void;
  setQty(qty: string): void;
  toggleDealer(id: number): void;
  toggleAllDealers(): void;
  clear(): void;
}

const EMPTY: RfqFormValue = {
  dir: "Buy",
  instrumentId: null,
  qty: "",
  dealerIds: [],
};

export function useCreditForm(): CreditFormApi {
  const [value, setValue] = useState<RfqFormValue>(EMPTY);
  const [showInstr, setShowInstr] = useState(false);

  const setDir = useCallback((dir: Dir) => {
    setValue((prev) => {
      return { ...prev, dir };
    });
  }, []);

  const selectInstrument = useCallback((id: number) => {
    setValue((prev) => {
      return { ...prev, instrumentId: id };
    });
    setShowInstr(false);
  }, []);

  const toggleInstr = useCallback(() => {
    setShowInstr((prev) => {
      return !prev;
    });
  }, []);

  const setQty = useCallback((qty: string) => {
    setValue((prev) => {
      return { ...prev, qty };
    });
  }, []);

  const toggleDealer = useCallback((id: number) => {
    setValue((prev) => {
      const has = prev.dealerIds.includes(id);
      return {
        ...prev,
        dealerIds: has
          ? prev.dealerIds.filter((x) => {
              return x !== id;
            })
          : [...prev.dealerIds, id],
      };
    });
  }, []);

  const toggleAllDealers = useCallback(() => {
    setValue((prev) => {
      const all = prev.dealerIds.length === DEALERS.length;
      return {
        ...prev,
        dealerIds: all
          ? []
          : DEALERS.map((d) => {
              return d.id;
            }),
      };
    });
  }, []);

  const clear = useCallback(() => {
    setValue(EMPTY);
    setShowInstr(false);
  }, []);

  const valid: boolean =
    value.instrumentId != null &&
    parseNotional(value.qty) > 0 &&
    value.dealerIds.length > 0;
  const allDealers: boolean = value.dealerIds.length === DEALERS.length;

  return useMemo(() => {
    return {
      value,
      showInstr,
      valid,
      allDealers,
      setDir,
      selectInstrument,
      toggleInstr,
      setQty,
      toggleDealer,
      toggleAllDealers,
      clear,
    };
  }, [
    value,
    showInstr,
    valid,
    allDealers,
    setDir,
    selectInstrument,
    toggleInstr,
    setQty,
    toggleDealer,
    toggleAllDealers,
    clear,
  ]);
}
