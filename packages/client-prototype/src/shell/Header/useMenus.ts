import { useCallback, useState } from "react";

export type Tab = "fx" | "credit" | "equities" | "admin";
type MenuName = "theme" | "notif" | "lang" | "user";

export interface MenusApi {
  open: MenuName | null;
  toggle(name: MenuName): void;
  close(): void;
}

export function useMenus(): MenusApi {
  const [open, setOpen] = useState<MenuName | null>(null);
  const toggle = useCallback((name: MenuName) => {
    setOpen((prev) => {
      return prev === name ? null : name;
    });
  }, []);

  const close = useCallback(() => {
    setOpen(null);
  }, []);
  return { open, toggle, close };
}
