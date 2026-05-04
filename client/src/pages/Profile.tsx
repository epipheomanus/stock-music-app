import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  User,
  Building2,
  Mail,
  Download,
  ShieldCheck,
  ChevronLeft,
  Loader2,
  Music,
  Calendar,
  FolderOpen,
  Save,
  KeyRound,
  Eye,
  EyeOff,
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
  const [formDirty, setFormDirty] = useState(false);

  // Populate form when user loads
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? "");
      setLastName(user.lastName ?? "");
      setCompany(user.company ?? "");
      setFormDirty(false);
    }
  }, [user]);

  // ─── Change password state ────────────────────────────────────────────────
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

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
    onSuccess: () => utils.auth.me.invalidate(),
    onError: () => toast.error("Failed to update preference"),
  });

  const changePasswordMutation = trpc.auth.changePassword.useMutation({
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully");
    },
    onError: (err) => toast.error(err.message || "Failed to change password"),
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
    updateProfileMutation.mutate({ firstName, lastName, company });
  }

  function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters");
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  }

  const passwordFormFilled = currentPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

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
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Personal Information</span>
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
              <Label className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                Role
              </Label>
              <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/40">
                <Badge
                  variant={user.role === "admin" ? "default" : "secondary"}
                  className="text-xs capitalize"
                >
                  {user.role}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">Your access level. Contact an admin to change.</p>
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

        {/* ── Change Password ───────────────────────────────────────────────── */}
        {user.passwordHash && (
          <section className="space-y-5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Change Password</span>
            </div>
            <Separator />

            <div className="grid grid-cols-1 gap-4 max-w-sm">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Current Password</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={e => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowCurrent(v => !v)}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">New Password</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowNew(v => !v)}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowConfirm(v => !v)}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-start">
              <Button
                onClick={handleChangePassword}
                disabled={!passwordFormFilled || changePasswordMutation.isPending}
                variant="outline"
                className="gap-2"
              >
                {changePasswordMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Update Password
              </Button>
            </div>
          </section>
        )}

        {/* ── Preferences ──────────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Preferences</span>
          </div>
          <Separator />

          <div className="flex items-center justify-between gap-6 rounded-lg border border-border p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">Watermark preview confirmation</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Toggles the watermark preview download confirmation message to appear / not appear.
              </p>
            </div>
            <Switch
              checked={!user.skipWatermarkConfirm}
              disabled={updatePrefMutation.isPending}
              onCheckedChange={(checked) => {
                updatePrefMutation.mutate({ skipWatermarkConfirm: !checked });
              }}
            />
          </div>
        </section>

        {/* ── Download History ─────────────────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-widest uppercase text-muted-foreground">Download History</span>
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
