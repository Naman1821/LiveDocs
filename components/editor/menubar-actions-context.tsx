"use client";

import { createContext, useContext, type ReactNode } from "react";

export type MenubarActionsValue = {
  focusTitleForRename: () => void;
  triggerImageUpload: () => void;
};

const MenubarActionsContext = createContext<MenubarActionsValue | null>(null);

export function MenubarActionsProvider({
  value,
  children,
}: {
  value: MenubarActionsValue;
  children: ReactNode;
}) {
  return (
    <MenubarActionsContext.Provider value={value}>
      {children}
    </MenubarActionsContext.Provider>
  );
}

export function useMenubarActions(): MenubarActionsValue {
  const ctx = useContext(MenubarActionsContext);
  if (!ctx) {
    throw new Error("MenubarActionsProvider is missing");
  }
  return ctx;
}
