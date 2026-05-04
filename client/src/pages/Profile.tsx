import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User,
  Building2,
  AtSign,
  Mail,
  Download,
  Bell,
  BellOff,
  ChevronLeft,
  Loader2,
  Music,
  Calendar,
  FolderOpen,
  RefreshCw,
  Save,
} from "lucide-react";
import TopNav from "@/components/TopNav";

export default function Profile() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  // ─── Profile form state ───────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [username, setUsername] = useState("");
  const [formDirty, setFormDirty] = useState(false);

  // Populate form when user loads
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setCompany(user.company ?? "");
      setUsername(user.username ?? "");
      setFormDirty(false);
    }
  }, [user]);

  // ─── tRPC mutations ───────────────────────────────────────────────────────
  const updateProfileMutation = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      setFormDirty(false);
      toast.success("Profile updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update profile"),
  });

  const updatePrefMutation = trpc.auth.updatePreference.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Download preference reset — you'll see the confirmation dialog again");
    },
    onError: () => toast.error("Failed to update preference"),
  });

  // ─── Download history ─────────────────────────────────────────────────────
  const downloadsQuery = trpc.auth.myDownloads.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // ─── Redirect if not authenticated ───────────────────────────────────────
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) return null;

  const cleanDownloads = (downloadsQuery.data ?? []).filter(d => d.fileType === "clean_wav");

  function handleSave() {
    updateProfileMutation.mutate({ firstName, lastName, company, username });
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-10">

        {/* Page header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground -ml-2"
            onClick={() => navigate("/browse")}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Browse
          </Button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">My Profile</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          </div>
        </div>

        {/* ── Personal Information ─────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold font-display tracking-wide uppercase text-xs text-muted-foreground">
              Personal Information
            </h2>
          </div>
          <Separator />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={e => { setFirstName(e.target.value); setFormDirty(true); }}
                placeholder="First name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={e => { setLastName(e.target.value); setFormDirty(true); }}
                placeholder="Last name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="company" className="flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                Company
              </Label>
              <Input
                id="company"
                value={company}
                onChange={e => { setCompany(e.target.value); setFormDirty(true); }}
                placeholder="Company (optional)"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username" className="flex items-center gap-1.5">
                <AtSign className="h-3.5 w-3.5 text-muted-foreground" />
                Username
              </Label>
              <Input
                id="username"
                value={username}
                onChange={e => { setUsername(e.target.value); setFormDirty(true); }}
                placeholder="username"
              />
              <p className="text-xs text-muted-foreground">Letters, numbers, and underscores only.</p>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                Email
              </Label>
              <Input value={user.email ?? ""} disabled className="bg-muted/40 text-muted-foreground cursor-not-allowed" />
              <p className="text-xs text-muted-foreground">Email address cannot be changed here.</p>
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={!formDirty || updateProfileMutation.isPending}
              className="gap-2"
            >
              {updateProfileMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        </section>

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold font-display tracking-wide uppercase text-xs text-muted-foreground">
              Preferences
            </h2>
          </div>
          <Separator />

          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Watermarked preview confirmation</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                When you download a watermarked preview, a confirmation dialog reminds you that
                the file is for review purposes only. You previously chose to skip this dialog.
              </p>
            </div>
            <div className="shrink-0">
              {user.skipWatermarkConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 whitespace-nowrap"
                  onClick={() => updatePrefMutation.mutate({ skipWatermarkConfirm: false })}
                  disabled={updatePrefMutation.isPending}
                >
                  {updatePrefMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Re-enable prompt
                </Button>
              ) : (
                <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                  <Bell className="h-3 w-3" />
                  Prompt active
                </Badge>
              )}
            </div>
          </div>
        </section>

        {/* ── Download History ─────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold font-display tracking-wide uppercase text-xs text-muted-foreground">
              Download History
            </h2>
            {cleanDownloads.length > 0 && (
              <Badge variant="secondary" className="ml-auto text-xs">
                {cleanDownloads.length} download{cleanDownloads.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <Separator />

          {downloadsQuery.isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : cleanDownloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Music className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-sm text-muted-foreground">No clean downloads yet.</p>
              <Button
                variant="link"
                size="sm"
                className="mt-1 text-primary"
                onClick={() => navigate("/browse")}
              >
                Browse tracks
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {cleanDownloads.map((dl) => (
                <div
                  key={dl.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-card p-3 hover:bg-muted/30 transition-colors"
                >
                  {/* Cover art thumbnail */}
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                    {dl.coverArtUrl ? (
                      <img src={dl.coverArtUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music className="h-4 w-4 text-muted-foreground/50" />
                    )}
                  </div>

                  {/* Track info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{dl.trackTitle}</p>
                    {dl.composerName && (
                      <p className="text-xs text-muted-foreground truncate">{dl.composerName}</p>
                    )}
                  </div>

                  {/* Project + date */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <div className="flex items-center gap-1 justify-end text-xs text-muted-foreground">
                      <FolderOpen className="h-3 w-3" />
                      <span className="truncate max-w-[120px]">{dl.projectName}</span>
                    </div>
                    <div className="flex items-center gap-1 justify-end text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{new Date(dl.downloadedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  );
}
