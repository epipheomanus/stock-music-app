import { Link, useLocation } from "wouter";
import { ShoppingCart, LogOut, Settings, Menu, X, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";
import { useState } from "react";

export default function TopNav() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { toggleCart } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.href = "/";
    },
  });

  const cartQuery = trpc.cart.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const cartCount = cartQuery.data?.length ?? 0;

  return (
    <header className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="container">
        <div className="flex items-center justify-between h-16">
          {/* Epipheo Logo */}
          <Link href="/" className="flex items-center shrink-0">
            <img
              src="/manus-storage/epipheo-logo-black-transparent_5380d099.png"
              alt="Epipheo"
              className="h-8 w-auto object-contain dark:hidden"
            />
            <img
              src="/manus-storage/epipheo-logo-white-transparent_1da09ee5.png"
              alt="Epipheo"
              className="h-8 w-auto object-contain hidden dark:block"
            />
          </Link>

          {/* Center nav links */}
          <nav className="hidden md:flex items-center gap-1">
            <Link href="/browse">
              <Button
                variant="ghost"
                size="sm"
                className={`font-display text-xs tracking-widest uppercase ${location === "/browse" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                Browse Music
              </Button>
            </Link>
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {isAuthenticated ? (
              <>
                {/* Cart button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="relative text-muted-foreground hover:text-foreground"
                  onClick={toggleCart}
                  aria-label="Open cart"
                >
                  <ShoppingCart className="h-5 w-5" />
                  {cartCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                      {cartCount > 9 ? "9+" : cartCount}
                    </span>
                  )}
                </Button>

                {/* User menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-semibold font-display">
                        {(user?.firstName?.[0] ?? user?.name?.[0] ?? "U").toUpperCase()}
                      </div>
                      <span className="hidden sm:inline text-sm font-display tracking-wide">
                        {user?.firstName ?? user?.name ?? "Account"}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium font-display">{user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                    </div>
                    <DropdownMenuSeparator />
                    {user?.role === "admin" && (
                      <>
                        <DropdownMenuItem onClick={() => navigate("/admin")}>
                          <Settings className="h-4 w-4 mr-2" />
                          Admin Dashboard
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    <DropdownMenuItem onClick={() => navigate("/projects")}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      My Projects
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => logoutMutation.mutate()}
                      className="text-destructive focus:text-destructive"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <>
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="font-display text-xs tracking-widest uppercase text-muted-foreground hover:text-foreground">
                    Sign in
                  </Button>
                </Link>
              </>
            )}

            {/* Mobile menu toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden text-muted-foreground"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border/50 py-3 space-y-1">
            <Link href="/projects" onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start font-display text-xs tracking-widest uppercase text-muted-foreground">
                My Projects
              </Button>
            </Link>
            <Link href="/browse" onClick={() => setMobileOpen(false)}>
              <Button variant="ghost" size="sm" className="w-full justify-start font-display text-xs tracking-widest uppercase text-muted-foreground">
                Browse Music
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
