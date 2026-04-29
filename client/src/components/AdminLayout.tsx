import { Link, useLocation } from "wouter";
import { Music2, LayoutDashboard, Music, BarChart3, Mic2, LogOut, ChevronLeft, UserCog, Link2, Tags } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/tracks", label: "Tracks", icon: Music },
  { href: "/admin/users", label: "Users", icon: UserCog },
  { href: "/admin/invites", label: "Invites", icon: Link2 },
  { href: "/admin/analytics", label: "Downloads", icon: BarChart3 },
  { href: "/admin/watermark", label: "Watermark", icon: Mic2 },
  { href: "/admin/taxonomy", label: "Taxonomy", icon: Tags },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (!isAuthenticated) navigate("/login");
      else if (user?.role !== "admin") navigate("/browse");
    }
  }, [isAuthenticated, loading, user, navigate]);

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => { window.location.href = "/"; },
  });

  if (loading || !isAuthenticated || user?.role !== "admin") return null;

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border/50 bg-card/30 flex flex-col">
        {/* Logo */}
        <div className="px-4 py-5 border-b border-border/50">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <Music2 className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm tracking-tight">
              Epipheo<span className="text-primary"> Music</span>
            </span>
          </Link>
          <div className="mt-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Admin</div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive = location === href || (href !== "/admin" && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <button className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border/50 space-y-1">
          <Link href="/browse">
            <button className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
              <ChevronLeft className="h-4 w-4" />
              Back to site
            </button>
          </Link>
          <button
            className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {children}
      </main>
    </div>
  );
}
