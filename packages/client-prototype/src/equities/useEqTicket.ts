import { useCallback, useEffect, useRef, useState } from "react";

import { EQ_SEQ_START, ORDER_CAP } from "#/equities/equitiesData";
import type {
  EqOrder,
  EqSym,
  EqTicket,
  OrderSide,
  OrderType,
} from "#/equities/types";

const FLASH_MS = 2400;

const EMPTY_TICKET: EqTicket = {
  side: "Buy",
  type: "Market",
  qty: "100",
  limit: "",
};

export interface EqTicketApi {
  ticket: EqTicket;
  orders: EqOrder[];
  newOrderId: number | null;
  flashMsg: string | null;
  setSide(side: OrderSide): void;
  setType(type: OrderType): void;
  setQty(qty: string): void;
  stepQty(delta: number): void;
  setLimit(limit: string): void;
  submit(): void;
}

function hhmm(): string {
  return new Date().toTimeString().slice(0, 8);
}

export function useEqTicket(
  sel: EqSym,
  rates: Record<EqSym, number>,
): EqTicketApi {
  const [ticket, setTicket] = useState<EqTicket>(EMPTY_TICKET);
  const [orders, setOrders] = useState<EqOrder[]>([]);
  const [newOrderId, setNewOrderId] = useState<number | null>(null);
  const [flashMsg, setFlashMsg] = useState<string | null>(null);

  const seqRef = useRef(EQ_SEQ_START);
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // Refs so the stable `submit` callback reads the live symbol/rate/ticket.
  const selRef = useRef(sel);
  selRef.current = sel;
  const ratesRef = useRef(rates);
  ratesRef.current = rates;
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;

  useEffect(() => {
    const timers = timersRef.current;

    return () => {
      for (const id of timers) {
        clearTimeout(id);
      }

      timers.clear();
    };
  }, []);

  const setSide = useCallback((side: OrderSide) => {
    setTicket((prev) => {
      return { ...prev, side };
    });
  }, []);

  const setType = useCallback((type: OrderType) => {
    setTicket((prev) => {
      return { ...prev, type };
    });
  }, []);

  const setQty = useCallback((qty: string) => {
    setTicket((prev) => {
      return { ...prev, qty: qty.replace(/[^0-9]/g, "") };
    });
  }, []);

  const stepQty = useCallback((delta: number) => {
    setTicket((prev) => {
      const n = Math.max(0, (Number.parseInt(prev.qty, 10) || 0) + delta);
      return { ...prev, qty: String(n) };
    });
  }, []);

  const setLimit = useCallback((limit: string) => {
    setTicket((prev) => {
      return { ...prev, limit };
    });
  }, []);

  // PROTO L1181 submitOrder: Market fills at the live price, Limit records a
  // Working order at the limit (defaulting to the live price when blank).
  const submit = useCallback(() => {
    const tk = ticketRef.current;
    const sym = selRef.current;
    const qty = Number.parseInt(tk.qty, 10) || 0;

    if (qty <= 0) {
      return;
    }

    const last = ratesRef.current[sym];
    const filled = tk.type === "Market";
    const price = filled ? last : Number.parseFloat(tk.limit) || last;
    const id = seqRef.current;
    seqRef.current += 1;

    const order: EqOrder = {
      id,
      time: hhmm(),
      sym,
      side: tk.side,
      type: tk.type,
      qty,
      price,
      status: filled ? "Filled" : "Working",
    };
    const msg = `${filled ? "Filled" : "Working"} ${tk.side} ${qty} ${sym} @ $${price.toFixed(2)}`;

    setOrders((prev) => {
      return [order, ...prev].slice(0, ORDER_CAP);
    });
    setNewOrderId(id);
    setFlashMsg(msg);

    const timeoutId = setTimeout(() => {
      timersRef.current.delete(timeoutId);
      setFlashMsg(null);
    }, FLASH_MS);
    timersRef.current.add(timeoutId);
  }, []);

  return {
    ticket,
    orders,
    newOrderId,
    flashMsg,
    setSide,
    setType,
    setQty,
    stepQty,
    setLimit,
    submit,
  };
}
