import { useState } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useLocation } from "wouter";
import { X, ShoppingCart, Trash2, Download, FileArchive, Loader2, Music, CheckCircle2, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";

const LEGAL_DISCLAIMER = `1. These audio files are provided for official company use only and may not be redistributed, sublicensed, or made publicly available without prior written authorization.

2. You are responsible for ensuring that your use of these tracks complies with all applicable laws and any agreements in place with your organization.

3. Unauthorized distribution or commercial exploitation of these files is strictly prohibited.

4. All tracks remain the intellectual property of Epipheo.

Please confirm that you have read and understood these terms before proceeding with your download.`;

export default function CartDrawer() {
  const { isOpen, closeCart } = useCart();
  const [, navigate] = useLocation();
  const [projectName, setProjectName] = useState("");
  const [showCheckout, setShowCheckout] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const { activeTrackId, isCollapsed: playerCollapsed } = usePlayer();
  const playerPb = activeTrackId ? (playerCollapsed ? 56 : 96) : 0;
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);
  const [downloadedCount, setDownloadedCount] = useState(0);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<{ projectName: string } | null>(null);

  const utils = trpc.useUtils();
  const cartQuery = trpc.cart.list.useQuery();
  const removeMutation = trpc.cart.remove.useMutation({
    onSuccess: () => utils.cart.list.invalidate(),
  });
  const checkoutMutation = trpc.downloads.checkout.useMutation({
    onSuccess: async (data) => {
      setShowDisclaimer(false);
      setShowCheckout(false);
      setProjectName("");
      utils.cart.list.invalidate();

      // Download tracks one at a time — browsers block simultaneous programmatic downloads
      const total = data.files.length;
      for (let i = 0; i < total; i++) {
        const file = data.files[i];
        const url = file.hasStems && file.stemsZipUrl ? file.stemsZipUrl : file.wavUrl;
        const filename = file.hasStems && file.stemsZipUrl
          ? `${file.title}_with_stems.zip`
          : `${file.title}.wav`;
        setDownloadProgress({ current: i + 1, total, title: file.title });
        await triggerDownload(url, filename);
        // Small gap between downloads so the browser registers each as a separate save
        if (i < total - 1) await new Promise(r => setTimeout(r, 800));
      }

      setDownloadProgress(null);
      setIsDownloading(false);
      setDownloadedCount(total);
      setDownloadComplete(true);
      toast.success(`Downloaded ${total} track${total > 1 ? "s" : ""}`);
    },
    onError: (err) => {
      setIsDownloading(false);
      setDownloadProgress(null);
      toast.error(err.message);
    },
  });

  const items = cartQuery.data ?? [];

  async function triggerDownload(url: string, filename: string): Promise<void> {
    try {
      // Fetch as blob first — this forces the browser to show a "Save As" dialog
      // instead of navigating to the URL and opening it in the media player.
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Revoke after a short delay to ensure the download has started
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
    } catch {
      // Fallback: direct link (may open in browser tab for some URL types)
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  }

  function handleCheckoutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectName.trim()) return;
    setPendingCheckout({ projectName: projectName.trim() });
    setShowCheckout(false);
    setShowDisclaimer(true);
  }

  function handleDisclaimerConfirm() {
    if (!pendingCheckout) return;
    setIsDownloading(true);
    checkoutMutation.mutate({
      projectName: pendingCheckout.projectName,
      trackIds: items.map(i => i!.trackId),
    });
  }

  function handleClose() {
    setDownloadComplete(false);
    setDownloadedCount(0);
    closeCart();
  }

  function handleGoToBrowse() {
    handleClose();
    navigate("/browse");
  }

  function handleGoToHome() {
    handleClose();
    navigate("/");
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-lg">Cart</h2>
            {!downloadComplete && items.length > 0 && (
              <span className="text-xs bg-primary/20 text-primary rounded-full px-2 py-0.5 font-medium">
                {items.length}
              </span>
            )}
          </div>
          <Button variant="ghost" size="icon" onClick={handleClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Download Complete State */}
        {downloadComplete ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold mb-1">Download Started!</h3>
              <p className="text-sm text-muted-foreground">
                {downloadedCount} track{downloadedCount !== 1 ? "s are" : " is"} downloading to your device.
              </p>
            </div>
            <div className="w-full space-y-3">
              <Button
                className="w-full gap-2 font-semibold"
                onClick={handleGoToBrowse}
                size="lg"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Music Browsing
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={handleGoToHome}
                size="lg"
              >
                <Home className="h-4 w-4" />
                Back to Home Page
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Items */}
            <ScrollArea className="flex-1 px-6 py-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Music className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-muted-foreground text-sm">Your cart is empty.</p>
                  <p className="text-muted-foreground/60 text-xs mt-1">Add tracks from the browse page.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => {
                    if (!item) return null;
                    const track = item.track;
                    return (
                      <div key={item.trackId} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
                        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                          {track.coverArtUrl ? (
                            <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover rounded-md" />
                          ) : (
                            <Music className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{track.composerName ?? "Unknown"}</p>
                          {track.hasStems && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-primary/80 mt-0.5">
                              <FileArchive className="h-3 w-3" />
                              Stems included
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0 h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => removeMutation.mutate({ trackId: item.trackId })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

            {/* Footer */}
            {items.length > 0 && (
              <div className="px-6 py-4 border-t border-border" style={{ paddingBottom: `${16 + playerPb}px` }}>
                <Button
                  className="w-full gap-2 font-semibold"
                  onClick={() => setShowCheckout(true)}
                >
                  <Download className="h-4 w-4" />
                  Download {items.length} Track{items.length > 1 ? "s" : ""}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Checkout modal */}
      <Dialog open={showCheckout} onOpenChange={setShowCheckout}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download Tracks</DialogTitle>
            <DialogDescription>
              Enter your project name to proceed with the download.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCheckoutSubmit} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name *</Label>
              <Input
                id="projectName"
                placeholder="e.g. Brand Campaign Q1 2025"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="rounded-lg bg-muted/50 border border-border p-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Downloading {items.length} track{items.length > 1 ? "s" : ""}:</p>
              {items.slice(0, 5).map(i => i && (
                <p key={i.trackId} className="truncate">• {i.track.title}{i.track.hasStems ? " (with stems)" : ""}</p>
              ))}
              {items.length > 5 && <p className="text-muted-foreground">…and {items.length - 5} more</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCheckout(false)}>Cancel</Button>
              <Button type="submit" disabled={!projectName.trim()}>Continue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Legal disclaimer modal */}
      <Dialog open={showDisclaimer} onOpenChange={(open) => !isDownloading && setShowDisclaimer(open)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Terms of Use</DialogTitle>
            <DialogDescription>
              Please read and confirm the following before downloading.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <ScrollArea className="h-48 rounded-lg border border-border bg-muted/30 p-4">
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {LEGAL_DISCLAIMER}
              </pre>
            </ScrollArea>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowDisclaimer(false)}
              disabled={isDownloading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDisclaimerConfirm}
              disabled={isDownloading}
              className="gap-2"
            >
              {isDownloading ? (
                downloadProgress
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Downloading {downloadProgress.current}/{downloadProgress.total}…</>
                  : <><Loader2 className="h-4 w-4 animate-spin" /> Preparing…</>
              ) : (
                <><Download className="h-4 w-4" /> I Agree & Download</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
