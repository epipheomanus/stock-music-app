import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface CartContextType {
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  toggleCart: () => void;
  itemCount: number;
  setItemCount: (n: number) => void;
}

const CartContext = createContext<CartContextType>({
  isOpen: false,
  openCart: () => {},
  closeCart: () => {},
  toggleCart: () => {},
  itemCount: 0,
  setItemCount: () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [itemCount, setItemCount] = useState(0);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen(v => !v), []);

  return (
    <CartContext.Provider value={{ isOpen, openCart, closeCart, toggleCart, itemCount, setItemCount }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
