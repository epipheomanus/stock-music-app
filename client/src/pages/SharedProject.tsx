import { useState } from "react";
import { trpc } from "@/lib/trpc";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Loader2, Music, Play, Pause, ListMusic, ShoppingCart, Download } from "lucide-react";
import { Link } from "wouter";
import { usePlayer, GlobalTrack } from "@/contexts/PlayerContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import { WatermarkConfirmDialog } from "@/components/WatermarkConfirmDialog";

interface SharedProjectProps {
  params: { token: string };
}

export default function SharedProject({ params }: SharedProjectProps) {
  const { setActiveTrack, setQueue, activeTrack, isPlaying, togglePlayPause } = usePlayer();
  const { user } = useAuth();
  const { openCart } = useCart();
  const utils = trpc.useUtils();

  // ─── Watermark download state ─────────────────────────────────────────────
  const [wmConfirmOpen, setWmConfirmOpen] = useState(false);
  const [pendingWatermarkTrackId, setPendingWatermarkTrackId] = useState<number | null>(null);

  const watermarkedDownloadMutation = trpc.downloads.downloadWatermarked.useMutation({
    onSuccess: async (data) => {
      try {
        const res = await fetch(data.url);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `${data.title}-Preview.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        toast.success("Downloading preview...");
      } catch {
        const a = document.createElement("a");
        a.href = data.url;
        a.download = `${data.title}-Preview.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        toast.success("Downloading preview...");
      }
    },
    onError: (err: any) => toast.error(err.message || "Download failed"),
  });

  function handleDownloadWatermarked(trackId: number) {
    // Logged-in users who have opted out of the confirmation skip it
    if (user?.skipWatermarkConfirm) {
      watermarkedDownloadMutation.mutate({ trackId });
      return;
    }
    // Guests + users who haven't opted out always see the dialog
    setPendingWatermarkTrackId(trackId);
    setWmConfirmOpen(true);
  }

  const addToCartMutation = trpc.cart.add.useMutation({
    onSuccess: () => { utils.cart.list.invalidate(); openCart(); },
    onError: (err: any) => toast.error(err.message || "Failed to add to cart"),
  });

  const projectQuery = trpc.projects.getByShareToken.useQuery(
    { token: params.token },
    { retry: false }
  );
  const project = projectQuery.data?.project;
  const playlists = projectQuery.data?.playlists ?? [];

  // Normalise a row from getPlaylistTracks — the DB join returns { ...playlist_tracks, track: Track }
  function toGlobalTrack(row: any): GlobalTrack {
    const t = row.track ?? row;
    return {
      id: t.id,
      title: t.title,
      composerName: t.composerName ?? null,
      durationSeconds: t.durationSeconds ?? null,
      coverArtUrl: t.coverArtUrl ?? null,
      watermarkedMp3Url: t.watermarkedMp3Url ?? null,
      wavUrl: t.wavUrl ?? null,
      mp3PreviewUrl: t.mp3PreviewUrl ?? null,
      waveformPeaks: t.waveformPeaks ?? null,
      hasStems: t.hasStems ?? false,
      watermarkStatus: t.watermarkStatus ?? "pending",
      tags: t.tags ?? { genres: [], moods: [], attributes: [] },
    };
  }

  function playAll(tracks: any[]) {
    if (!tracks.length) return;
    setQueue(tracks.map(toGlobalTrack), 0);
  }

  function handlePlayRow(row: any, allRows: any[]) {
    const gt = toGlobalTrack(row);
    if (activeTrack?.id === gt.id) {
      togglePlayPause();
    } else {
      const queue = allRows.map(toGlobalTrack);
      const idx = queue.findIndex(q => q.id === gt.id);
      setQueue(queue, idx >= 0 ? idx : 0);
    }
  }

  if (projectQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <ListMusic className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="text-xl font-semibold">Project Not Found</h2>
          <p className="text-muted-foreground text-sm">This share link may have expired or the project was deleted.</p>
          <Link href="/browse"><Button variant="outline">Browse Music</Button></Link>
        </div>
      </div>
    );
  }

  const totalTracks = playlists.reduce((sum: number, pl: any) => sum + (pl.tracks?.length ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10 pb-32">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full mb-4">
            <ListMusic className="h-3 w-3" /> Shared Music Project
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.description && <p className="text-muted-foreground mt-1 text-sm">{project.description}</p>}
          <p className="text-xs text-muted-foreground/60 mt-1">
            {playlists.length} playlist{playlists.length !== 1 ? "s" : ""} · {totalTracks} track{totalTracks !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Instruction notice */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border/50 rounded-lg px-3.5 py-2.5 mb-6">
          <Play className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span>Click any track or <strong>Play All</strong> to listen in the player below.</span>
        </div>

        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-border rounded-2xl">
            <ListMusic className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No playlists in this project yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {playlists.map((playlist: any) => (
              <div key={playlist.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                {/* Playlist header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{playlist.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {playlist.tracks?.length ?? 0} track{(playlist.tracks?.length ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {(playlist.tracks?.length ?? 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={() => playAll(playlist.tracks)}
                    >
                      <Play className="h-3.5 w-3.5" /> Play All
                    </Button>
                  )}
                </div>

                {/* Track list */}
                {(playlist.tracks?.length ?? 0) === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground/60">No tracks in this playlist.</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {playlist.tracks.map((row: any, idx: number) => {
                      const t = row.track ?? row;
                      const isActive = activeTrack?.id === t.id;
                      const canPlay = !!t.watermarkedMp3Url;
                      return (
                        <div
                          key={`${playlist.id}-${t.id}`}
                          className={`flex items-center gap-3 px-5 py-3 transition-colors select-none
                            ${canPlay ? "cursor-pointer" : "cursor-default"}
                            ${isActive ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-muted/30"}`}
                          onClick={() => canPlay && handlePlayRow(row, playlist.tracks)}
                        >
                          {/* Index / playing indicator */}
                          <div className="w-5 shrink-0 flex items-center justify-center">
                            {isActive && isPlaying ? (
                              <Pause className="h-3.5 w-3.5 text-primary" />
                            ) : isActive ? (
                              <Play className="h-3.5 w-3.5 text-primary" />
                            ) : (
                              <span className="text-xs text-muted-foreground/50">{idx + 1}</span>
                            )}
                          </div>

                          {/* Cover art */}
                          <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                            {t.coverArtUrl
                              ? <img src={t.coverArtUrl} alt={t.title} className="w-full h-full object-cover" />
                              : <Music className="h-3.5 w-3.5 text-muted-foreground/40" />
                            }
                          </div>

                          {/* Title + composer */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{t.title}</p>
                            <p className="text-xs text-muted-foreground truncate">{t.composerName ?? "Unknown"}</p>
                          </div>

                          {/* Download preview button — available to everyone */}
                          {!!t.watermarkedMp3Url && (
                            <button
                              className="p-1.5 rounded-md bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                              title="Download watermarked preview"
                              onClick={e => { e.stopPropagation(); handleDownloadWatermarked(t.id); }}
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Cart button — only for logged-in users */}
                          {user && (
                            <button
                              className="p-1.5 rounded-md bg-muted/50 hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors shrink-0"
                              title="Add to cart"
                              onClick={e => { e.stopPropagation(); addToCartMutation.mutate({ trackId: t.id }); }}
                            >
                              <ShoppingCart className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {/* Always-visible play/pause button */}
                          <button
                            className={`p-2 rounded-full transition-colors shrink-0
                              ${!canPlay
                                ? "opacity-25 cursor-not-allowed bg-muted text-muted-foreground"
                                : isActive
                                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                  : "bg-muted hover:bg-primary hover:text-primary-foreground text-muted-foreground"
                              }`}
                            title={canPlay ? (isActive && isPlaying ? "Pause" : "Play preview") : "Preview not available yet"}
                            disabled={!canPlay}
                            onClick={e => { e.stopPropagation(); canPlay && handlePlayRow(row, playlist.tracks); }}
                          >
                            {isActive && isPlaying
                              ? <Pause className="h-3.5 w-3.5" />
                              : <Play className="h-3.5 w-3.5" />
                            }
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Watermark confirmation dialog */}
      <WatermarkConfirmDialog
        open={wmConfirmOpen}
        showDoNotShow={!!user}
        onConfirm={() => {
          setWmConfirmOpen(false);
          if (pendingWatermarkTrackId !== null) {
            watermarkedDownloadMutation.mutate({ trackId: pendingWatermarkTrackId });
            setPendingWatermarkTrackId(null);
          }
        }}
        onCancel={() => {
          setWmConfirmOpen(false);
          setPendingWatermarkTrackId(null);
        }}
      />
    </div>
  );
}
