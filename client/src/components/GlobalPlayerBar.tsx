import { useEffect, useRef, useCallback } from "react";
import { Play, Pause, X, ShoppingCart, Download, Music, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GlobalPlayerBar() {
  const {
    activeTrack,
    isPlaying,
    currentTime,
    duration,
    isLoading,
    initWaveSurfer,
    togglePlayPause,
    clearActiveTrack,
  } = usePlayer();

  const { isAuthenticated } = useAuth();
  const { openCart } = useCart();
  const utils = trpc.useUtils();
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize WaveSurfer once the container div is mounted
  const containerCallback = useCallback((node: HTMLDivElement | null) => {
    if (node) {
      (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
      initWaveSurfer(node);
    }
  }, [initWaveSurfer]);

  const addToCartMutation = trpc.cart.add.useMutation({
    onSuccess: () => {
      utils.cart.list.invalidate();
      toast.success("Added to cart");
    },
    onError: (err) => toast.error(err.message),
  });

  const watermarkedDownloadMutation = trpc.downloads.downloadWatermarked.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${data.title}_preview.mp3`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Downloading preview…");
    },
    onError: (err) => toast.error(err.message),
  });

  const isVisible = !!activeTrack;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "translate-y-full"
      }`}
    >
      <div className="bg-background/95 backdrop-blur-md border-t border-border shadow-2xl">
        <div className="container py-3">
          <div className="flex items-center gap-4">
            {/* Cover art + track info */}
            <div className="flex items-center gap-3 w-56 shrink-0 min-w-0">
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                {activeTrack?.coverArtUrl ? (
                  <img
                    src={activeTrack.coverArtUrl}
                    alt={activeTrack.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Music className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">
                  {activeTrack?.title ?? ""}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {activeTrack?.composerName ?? "Unknown Composer"}
                </p>
              </div>
            </div>

            {/* Play/Pause */}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={togglePlayPause}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 ml-0.5" />
              )}
            </Button>

            {/* Time + Waveform */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-xs text-muted-foreground tabular-nums w-9 text-right shrink-0">
                {formatTime(currentTime)}
              </span>
              {/* WaveSurfer renders into this div */}
              <div
                ref={containerCallback}
                className="flex-1 min-w-0 cursor-pointer"
                style={{ height: 40 }}
              />
              <span className="text-xs text-muted-foreground tabular-nums w-9 shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1.5 text-xs px-2 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  activeTrack && watermarkedDownloadMutation.mutate({ trackId: activeTrack.id })
                }
                disabled={!activeTrack?.watermarkedMp3Url || watermarkedDownloadMutation.isPending}
                title={
                  activeTrack?.watermarkedMp3Url
                    ? "Download watermarked preview (MP3)"
                    : "Preview not available yet"
                }
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Preview</span>
              </Button>

              {isAuthenticated ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs px-2 text-muted-foreground hover:text-primary"
                  onClick={() =>
                    activeTrack && addToCartMutation.mutate({ trackId: activeTrack.id })
                  }
                  disabled={addToCartMutation.isPending}
                  title="Add to cart"
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add to Cart</span>
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs px-2 text-muted-foreground/40"
                  title="Sign in to add to cart"
                  onClick={() => toast.info("Sign in to add tracks to your cart")}
                >
                  <ShoppingCart className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Add to Cart</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground ml-1"
                onClick={clearActiveTrack}
                title="Close player"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
