/**
 * GlobalPlayerBar — persistent bottom playback bar.
 * Owns the WaveSurfer container div and calls initWaveSurfer() after mount.
 * Features: play/pause, prev/next, volume slider, collapsible, add to cart, preview download.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { WatermarkConfirmDialog } from "@/components/WatermarkConfirmDialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ShoppingCart, Download, X, ChevronDown, ChevronUp, Loader2, Music,
} from "lucide-react";

function formatTime(secs: number): string {
  if (!secs || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function GlobalPlayerBar() {
  const {
    activeTrack, isPlaying, currentTime, duration, isLoading,
    volume, isCollapsed,
    initWaveSurfer, togglePlayPause, seek,
    setVolume, playNext, playPrev, clearActiveTrack, toggleCollapsed,
  } = usePlayer();

  const { openCart } = useCart();
  const addToCartMutation = trpc.cart.add.useMutation({
    onSuccess: () => { openCart(); },
    onError: (err) => toast.error(err.message),
  });
  const { isAuthenticated, user } = useAuth();
  const waveContainerRef = useRef<HTMLDivElement | null>(null);
  const [prevVolume, setPrevVolume] = useState(1);
  const [wmConfirmOpen, setWmConfirmOpen] = useState(false);

  // Initialize WaveSurfer once the container div is mounted
  const setWaveContainerRef = useCallback((el: HTMLDivElement | null) => {
    if (el && !waveContainerRef.current) {
      waveContainerRef.current = el;
      initWaveSurfer(el);
    }
  }, [initWaveSurfer]);

  const watermarkedDownloadMutation = trpc.downloads.downloadWatermarked.useMutation({
    onSuccess: (data) => {
      const a = document.createElement("a");
      a.href = data.url;
      a.download = `${data.title}_preview.mp3`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success("Downloading preview...");
    },
    onError: (err) => toast.error(err.message),
  });

  function handleAddToCart() {
    if (!activeTrack) return;
    if (!isAuthenticated) { toast.info("Sign in to add tracks to your cart"); return; }
    addToCartMutation.mutate({ trackId: activeTrack.id });
    toast.success(`"${activeTrack.title}" added to cart`);
  }

  function handlePreviewDownload() {
    if (!activeTrack) return;
    if (!activeTrack.watermarkedMp3Url) {
      toast.info("Preview not available yet — watermark is still processing");
      return;
    }
    // Skip confirmation if user has opted out
    if (user?.skipWatermarkConfirm) {
      watermarkedDownloadMutation.mutate({ trackId: activeTrack.id });
      return;
    }
    setWmConfirmOpen(true);
  }

  function handleSeekClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seek(ratio * duration);
  }

  function toggleMute() {
    if (volume > 0) {
      setPrevVolume(volume);
      setVolume(0);
    } else {
      setVolume(prevVolume || 1);
    }
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!activeTrack) return null;

  return (
    <>
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(0,0,0,0.08)] transition-all duration-300 ${
        isCollapsed ? "h-14" : "h-24"
      }`}
    >
      {/* Collapsed mini-bar */}
      {isCollapsed ? (
        <div className="flex items-center h-full px-4 gap-3">
          {/* Cover art */}
          <div className="w-8 h-8 rounded bg-muted flex-shrink-0 overflow-hidden">
            {activeTrack.coverArtUrl ? (
              <img src={activeTrack.coverArtUrl} alt={activeTrack.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Music className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
          {/* Track info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{activeTrack.title}</p>
          </div>
          {/* Play/pause */}
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 rounded-full"
            onClick={togglePlayPause}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
              isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          {/* Expand */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={toggleCollapsed}>
            <ChevronUp className="w-4 h-4" />
          </Button>
          {/* Close */}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={clearActiveTrack}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      ) : (
        /* Full bar */
        <div className="flex flex-col h-full px-4 pt-2 pb-1 gap-1">
          {/* Progress bar (clickable) */}
          <div
            className="relative w-full h-1.5 bg-muted rounded-full cursor-pointer group"
            onClick={handleSeekClick}
          >
            <div
              className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 6px)` }}
            />
          </div>

          {/* Main controls row */}
          <div className="flex items-center gap-3 flex-1">
            {/* Cover art */}
            <div className="w-10 h-10 rounded bg-muted flex-shrink-0 overflow-hidden">
              {activeTrack.coverArtUrl ? (
                <img src={activeTrack.coverArtUrl} alt={activeTrack.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-5 h-5 text-muted-foreground" />
                </div>
              )}
            </div>

            {/* Track info */}
            <div className="w-40 flex-shrink-0 min-w-0">
              <p className="text-sm font-semibold truncate leading-tight">{activeTrack.title}</p>
              {activeTrack.composerName && (
                <p className="text-xs text-muted-foreground truncate">{activeTrack.composerName}</p>
              )}
            </div>

            {/* Transport controls */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={playPrev} title="Previous track">
                <SkipBack className="w-4 h-4" />
              </Button>
              <Button
                variant="default" size="icon"
                className="h-9 w-9 rounded-full"
                onClick={togglePlayPause}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                  isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={playNext} title="Next track">
                <SkipForward className="w-4 h-4" />
              </Button>
            </div>

            {/* Waveform */}
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-9 text-right flex-shrink-0">
                {formatTime(currentTime)}
              </span>
              <div
                ref={setWaveContainerRef}
                className="flex-1 cursor-pointer"
                style={{ height: 40 }}
              />
              <span className="text-xs text-muted-foreground w-9 flex-shrink-0">
                {formatTime(duration)}
              </span>
            </div>

            {/* Volume control */}
            <div className="flex items-center gap-1.5 flex-shrink-0 w-28">
              <Button variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0" onClick={toggleMute}>
                {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
              <Slider
                value={[volume]}
                min={0} max={1} step={0.01}
                onValueChange={([v]) => setVolume(v)}
                className="flex-1"
              />
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1 flex-shrink-0">
              <Button
                variant="outline" size="sm"
                className="h-7 text-xs gap-1 px-2"
                onClick={handlePreviewDownload}
                disabled={!activeTrack.watermarkedMp3Url}
                title={activeTrack.watermarkedMp3Url ? "Download preview (watermarked)" : "Preview not ready yet"}
              >
                <Download className="w-3 h-3" />
                Preview
              </Button>
              <Button
                variant="outline" size="sm"
                className="h-7 text-xs gap-1 px-2"
                onClick={handleAddToCart}
              >
                <ShoppingCart className="w-3 h-3" />
                Cart
              </Button>
            </div>

            {/* Collapse + Close */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleCollapsed} title="Minimize player">
                <ChevronDown className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={clearActiveTrack} title="Close player">
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
    {/* Watermark preview confirmation dialog */}
    <WatermarkConfirmDialog
      open={wmConfirmOpen}
      onConfirm={() => {
        setWmConfirmOpen(false);
        if (activeTrack) watermarkedDownloadMutation.mutate({ trackId: activeTrack.id });
      }}
      onCancel={() => setWmConfirmOpen(false)}
    />
    </>
  );
}
