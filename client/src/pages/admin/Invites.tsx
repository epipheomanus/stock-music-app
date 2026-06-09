import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, Copy, Check, Loader2, Link2, Clock, User, Shield, Mail, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export default function AdminInvites() {
  const utils = trpc.useUtils();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [inviteEmail, setInviteEmail] = useState("");

  const invitesQuery = trpc.invites.list.useQuery();
  const invites = invitesQuery.data ?? [];

  const createMutation = trpc.invites.create.useMutation({
    onSuccess: (data) => {
      utils.invites.list.invalidate();
      if (data.emailSent) {
        toast.success(`Invite email sent to ${inviteEmail}!`);
        setInviteEmail("");
      } else {
        copyToClipboard(data.url, -1);
        toast.success(`${data.role === "admin" ? "Admin" : "User"} invite link created and copied to clipboard!`);
      }
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to create invite"),
  });

  function handleCreate() {
    const email = inviteEmail.trim() || undefined;
    createMutation.mutate({ origin: window.location.origin, role: newRole, email });
  }

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
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Invites</h1>
          <p className="text-sm text-muted-foreground">Invite employees or freelancers to join Epipheo Music. Each invite link is one-time use and expires in 7 days.</p>
        </div>

        {/* Create invite panel */}
        <div className="rounded-xl border border-border/50 bg-card/50 p-6 mb-8">
          <h2 className="text-sm font-semibold mb-4">Create New Invite</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Email input */}
            <div className="flex-1 relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                type="email"
                placeholder="Enter email to send invite directly (optional)"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                className="pl-9"
                onKeyDown={e => e.key === "Enter" && handleCreate()}
              />
            </div>

            {/* Role selector */}
            <div className="flex rounded-lg border border-border overflow-hidden text-sm shrink-0">
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
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="gap-2 shrink-0"
            >
              {createMutation.isPending
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : inviteEmail.trim()
                  ? <Send className="h-4 w-4" />
                  : <Plus className="h-4 w-4" />}
              {inviteEmail.trim() ? "Send Invite" : "Generate Link"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {inviteEmail.trim()
              ? "An invitation email will be sent directly to this address."
              : "Leave email blank to generate a link you can copy and share manually."}
          </p>
        </div>

        {invitesQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No invites yet. Create your first invite above.</p>
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
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Claimed ({usedInvites.length})</h2>
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
  const utils = trpc.useUtils();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const inviteUrl = `${window.location.origin}/register?token=${invite.token}`;
  const statusColors = {
    active: "bg-green-500/15 text-green-400 border-green-500/30",
    used: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    expired: "bg-red-500/15 text-red-400 border-red-500/30",
  };
  const statusLabels = { active: "Active", used: "Claimed", expired: "Expired" };
  const isAdmin = invite.role === "admin";

  const resendMutation = trpc.invites.resendEmail.useMutation({
    onSuccess: () => {
      toast.success(`Invite email resent to ${invite.email}!`);
      utils.invites.list.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to resend invite email"),
  });

  const deleteMutation = trpc.invites.delete.useMutation({
    onSuccess: () => {
      toast.success("Invite deleted.");
      utils.invites.list.invalidate();
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to delete invite"),
  });

  return (
    <>
      <div className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <code className="text-xs font-mono text-muted-foreground truncate max-w-xs">{invite.token}</code>
            <Badge className={`text-[10px] ${statusColors[status]}`}>{statusLabels[status]}</Badge>
            {isAdmin && (
              <Badge className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 gap-1">
                <Shield className="h-2.5 w-2.5" />
                Admin
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
            {invite.email && (
              <span className="flex items-center gap-1 font-medium text-foreground/70">
                <Mail className="h-3 w-3" />
                {invite.email}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Expires {formatDate(invite.expiresAt)}
            </span>
            {invite.usedById && (
              <span className="flex items-center gap-1 font-medium text-foreground/70">
                <User className="h-3 w-3" />
                Claimed by {invite.claimedByUsername ?? invite.claimedByName ?? invite.claimedByEmail ?? `User #${invite.usedById}`}
                {invite.usedAt && <span className="font-normal text-muted-foreground">· {formatDate(invite.usedAt)}</span>}
              </span>
            )}
            <span>Created {formatDate(invite.createdAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {status === "active" && (
            <>
              {invite.email && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  disabled={resendMutation.isPending}
                  onClick={() => resendMutation.mutate({ inviteId: invite.id, origin: window.location.origin })}
                >
                  {resendMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Send className="h-3.5 w-3.5" />}
                  Resend
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onCopy(inviteUrl, invite.id)}
              >
                {copiedId === invite.id ? <><Check className="h-3.5 w-3.5 text-green-400" />Copied!</> : <><Copy className="h-3.5 w-3.5" />Copy Link</>}
              </Button>
            </>
          )}
          {/* Delete button — available on active and expired invites (not used ones) */}
          {status !== "used" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
              disabled={deleteMutation.isPending}
              onClick={() => setConfirmDeleteOpen(true)}
            >
              {deleteMutation.isPending
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Trash2 className="h-3.5 w-3.5" />}
              Delete
            </Button>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this invite?</AlertDialogTitle>
            <AlertDialogDescription>
              {invite.email
                ? `The invite sent to ${invite.email} will be permanently deleted. The link will no longer work.`
                : "This invite link will be permanently deleted and can no longer be used to register."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMutation.mutate({ id: invite.id })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
