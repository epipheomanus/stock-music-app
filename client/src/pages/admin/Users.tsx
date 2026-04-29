import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Loader2, Lock, Unlock, User, Search, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";

export default function AdminUsers() {
  const utils = trpc.useUtils();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const usersQuery = trpc.admin.users.useQuery();
  const users = usersQuery.data ?? [];

  const lockMutation = trpc.admin.lockUser.useMutation({
    onSuccess: (_, vars) => {
      utils.admin.users.invalidate();
      toast.success(vars.locked ? "Account locked" : "Account unlocked");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.admin.deleteUser.useMutation({
    onSuccess: () => {
      utils.admin.users.invalidate();
      setConfirmDeleteId(null);
      toast.success("User removed");
    },
    onError: (err) => {
      setConfirmDeleteId(null);
      toast.error(err.message || "Failed to remove user");
    },
  });

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.username?.toLowerCase().includes(q) ||
      u.firstName?.toLowerCase().includes(q) ||
      u.lastName?.toLowerCase().includes(q) ||
      u.company?.toLowerCase().includes(q)
    );
  });

  // Sort: newest first
  const sorted = [...filtered].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  function formatDate(d: string | Date) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function openDeleteConfirm(user: any) {
    const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.username || "this user";
    setConfirmDeleteName(displayName);
    setConfirmDeleteId(user.id);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Users</h1>
            <p className="text-sm text-muted-foreground">{users.length} registered account{users.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, username…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {usersQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <User className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No users found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sorted.map((user: any) => {
              const displayName = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.name || user.username || "Unknown";
              const isAdmin = user.role === "admin";
              const isLocked = user.isLocked;
              const isSelf = currentUser?.id === user.id;

              return (
                <div
                  key={user.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${isLocked ? "border-destructive/30 bg-destructive/5" : "border-border/60 bg-card hover:border-border"}`}
                >
                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold ${isLocked ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                    {displayName.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{displayName}</span>
                      {isAdmin && (
                        <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">Admin</Badge>
                      )}
                      {isSelf && (
                        <Badge variant="outline" className="text-[10px]">You</Badge>
                      )}
                      {isLocked && (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <Lock className="h-2.5 w-2.5" /> Locked
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {user.email && <span className="text-xs text-muted-foreground">{user.email}</span>}
                      {user.username && <span className="text-xs text-muted-foreground">@{user.username}</span>}
                      {user.company && <span className="text-xs text-muted-foreground">{user.company}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-muted-foreground/60">
                        Joined {formatDate(user.createdAt)}
                      </span>
                      {user.lastSignedIn && (
                        <span className="text-[11px] text-muted-foreground/60">
                          · Last seen {formatDate(user.lastSignedIn)}
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/60 capitalize">
                        · via {user.loginMethod ?? "unknown"}
                      </span>
                    </div>
                  </div>

                  {/* Actions — only for non-admin, non-self accounts */}
                  {!isAdmin && !isSelf && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant={isLocked ? "outline" : "ghost"}
                        size="sm"
                        className={`gap-1.5 text-xs ${isLocked ? "border-green-300 text-green-700 hover:bg-green-50" : "text-muted-foreground hover:text-destructive"}`}
                        onClick={() => lockMutation.mutate({ userId: user.id, locked: !isLocked })}
                        disabled={lockMutation.isPending}
                      >
                        {lockMutation.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : isLocked ? (
                          <><ShieldCheck className="h-3.5 w-3.5" /> Unlock</>
                        ) : (
                          <><ShieldAlert className="h-3.5 w-3.5" /> Lock</>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Remove user"
                        onClick={() => openDeleteConfirm(user)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm delete dialog */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={(open) => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove User</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently remove <strong>{confirmDeleteName}</strong>? This will delete their account, cart, and download history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={deleteMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirmDeleteId !== null) deleteMutation.mutate({ userId: confirmDeleteId }); }}
              disabled={deleteMutation.isPending}
              className="gap-2"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
