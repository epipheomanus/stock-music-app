import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, Copy, Check, Loader2, Link2, Clock, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function AdminInvites() {
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"user" | "admin">("user");

  const invitesQuery = trpc.invites.list.useQuery();
  const invites = invitesQuery.data ?? [];

  const createMutation = trpc.invites.create.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate();
      copyToClipboard(data.url, -1);
      toast.success(`${data.role === "admin" ? "Admin" : "User"} invite link created and copied to clipboard!`);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to create invite"),
  });

  function copyToClipboard(url: string, id: number) {
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  const activeInvites = invites.filter(i => !i.usedById && new Date(i.expiresAt) > new Date());
  const usedInvites = invites.filter(i => i.usedById);
  const expiredInvites = invites.filter(i => !i.usedById && new Date(i.expiresAt) <= new Date());

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Invites</h1>
            <p className="text-sm text-muted-foreground">Manage invite links for new user registration. Each link is one-time use only.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Role selector */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm">
              <button
                onClick={() => setNewRole("user")}
                className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${newRole === "user" ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <User className="h-3.5 w-3.5" />
                User
              </button>
              <button
                onClick={() => setNewRole("admin")}
                className={`flex items-center gap-1.5 px-3 py-2 transition-colors ${newRole === "admin" ? "bg-amber-500 text-white" : "bg-card text-muted-foreground hover:bg-muted"}`}
              >
                <Shield className="h-3.5 w-3.5" />
                Admin
              </button>
            </div>
            <Button
              onClick={() => createMutation.mutate({ origin: window.location.origin, role: newRole })}
              disabled={createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Generate Invite Link
            </Button>
          </div>
        </div>

        {invitesQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No invites yet. Generate your first invite link.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {activeInvites.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Active ({activeInvites.length})</h2>
                <div className="space-y-2">
                  {activeInvites.map(invite => (
                    <InviteRow key={invite.id} invite={invite} copiedId={copiedId} onCopy={copyToClipboard} formatDate={formatDate} status="active" />
                  ))}
                </div>
              </div>
            )}
            {usedInvites.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Used ({usedInvites.length})</h2>
                <div className="space-y-2">
                  {usedInvites.map(invite => (
                    <InviteRow key={invite.id} invite={invite} copiedId={copiedId} onCopy={copyToClipboard} formatDate={formatDate} status="used" />
                  ))}
                </div>
              </div>
            )}
            {expiredInvites.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Expired ({expiredInvites.length})</h2>
                <div className="space-y-2">
                  {expiredInvites.map(invite => (
                    <InviteRow key={invite.id} invite={invite} copiedId={copiedId} onCopy={copyToClipboard} formatDate={formatDate} status="expired" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

function InviteRow({ invite, copiedId, onCopy, formatDate, status }: {
  invite: any; copiedId: number | null;
  onCopy: (url: string, id: number) => void;
  formatDate: (d: Date | string) => string;
  status: "active" | "used" | "expired";
}) {
  const inviteUrl = `${window.location.origin}/register?token=${invite.token}`;
  const statusColors = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    used: "bg-muted text-muted-foreground",
    expired: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const isAdmin = invite.role === "admin";

  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <code className="text-xs font-mono text-muted-foreground truncate max-w-xs">{invite.token}</code>
          <Badge className={`text-[10px] ${statusColors[status]}`}>{status}</Badge>
          {isAdmin && (
            <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
              <Shield className="h-2.5 w-2.5" />
              Admin
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Expires {formatDate(invite.expiresAt)}
          </span>
          {invite.usedById && (
            <span className="flex items-center gap-1">
              <User className="h-3 w-3" />
              Used {formatDate(invite.usedAt ?? invite.createdAt)}
            </span>
          )}
          <span>Created {formatDate(invite.createdAt)}</span>
        </div>
      </div>
      {status === "active" && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => onCopy(inviteUrl, invite.id)}
        >
          {copiedId === invite.id ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Link</>}
        </Button>
      )}
    </div>
  );
}
