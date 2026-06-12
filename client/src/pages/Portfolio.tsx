/**
 * Portfolio — public-facing page at /portfolio
 *
 * Shows Epipheo's best audio and video work organized by genre cards.
 * No login required. Not linked from the main site nav — share the URL directly.
 *
 * Audio section: waveform players grouped by genre (same style as the browser page).
 * Video section: thumbnail grid grouped by genre, click to open a modal player.
 */
import { trpc } from "@/lib/trpc";
import { usePlayer } from "@/contexts/PlayerContext";
import type { GlobalTrack } from "@/contexts/PlayerContext";
import WaveformPlayer from "@/components/WaveformPlayer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Music2, Video, Play, Loader2, PlayCircle } from "lucide-react";
import { useState } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
type PortfolioItem = {
  id: number;
  genreId: number;
  type: string;
  title: string | null;
  description: string | null;
  fileUrl: string;
  mp3Url: string | null;
  thumbnailUrl: string | null;
  waveformPeaks: string | null;
  durationSeconds: number | null;
  sortOrder: number;
};

function toGlobalTrack(item: PortfolioItem): GlobalTrack {
  return {
    id: item.id,
    title: item.title ?? "Untitled",
    composerName: null,
    durationSeconds: item.durationSeconds ?? null,
    coverArtUrl: item.thumbnailUrl ?? null,
    watermarkedMp3Url: null,
    wavUrl: null,
    mp3PreviewUrl: item.mp3Url ?? item.fileUrl,
    waveformPeaks: item.waveformPeaks ?? null,
    hasStems: false,
    watermarkStatus: "none",
    tags: { genres: [], moods: [], attributes: [] },
  };
}

// ─── Video Modal ──────────────────────────────────────────────────────────────
function VideoModal({
  item,
  onClose,
}: {
  item: PortfolioItem;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black border-0">
        <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
          <video
            className="absolute inset-0 w-full h-full"
            src={item.fileUrl}
            controls
            autoPlay
            playsInline
          />
        </div>
        {(item.title || item.description) && (
          <div className="px-5 py-3 bg-black/90 text-white">
            {item.title && <p className="font-semibold text-sm">{item.title}</p>}
            {item.description && <p className="text-xs text-white/60 mt-0.5">{item.description}</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Audio Genre Card ─────────────────────────────────────────────────────────
function AudioGenreCard({
  genre,
  items,
}: {
  genre: { id: number; name: string };
  items: PortfolioItem[];
}) {
  const { activeTrack, isPlaying, setQueue, togglePlayPause } = usePlayer();
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  function handlePlay(item: PortfolioItem) {
    const gt = toGlobalTrack(item);
    if (activeTrack?.id === gt.id) {
      togglePlayPause();
    } else {
      const queue = sorted.map(toGlobalTrack);
      const idx = queue.findIndex((q) => q.id === gt.id);
      setQueue(queue, idx >= 0 ? idx : 0);
    }
  }

  function playAll() {
    if (!sorted.length) return;
    setQueue(sorted.map(toGlobalTrack), 0);
  }

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
      {/* Genre header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/40 bg-card/60">
        <h3 className="font-semibold font-display text-sm tracking-wide">{genre.name}</h3>
        {sorted.length > 1 && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={playAll}>
            <Play className="h-3 w-3 fill-current" />
            Play All
          </Button>
        )}
      </div>

      {/* Tracks */}
      <div className="divide-y divide-border/30">
        {sorted.map((item) => {
          const isActive = activeTrack?.id === item.id;
          return (
            <div
              key={item.id}
              className={`px-4 py-3 transition-colors ${isActive ? "bg-primary/5" : "hover:bg-muted/30"}`}
            >
              <div className="flex items-center gap-3">
                {/* Play button */}
                <Button
                  size="icon"
                  variant="ghost"
                  className={`h-8 w-8 shrink-0 rounded-full transition-colors ${
                    isActive ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => handlePlay(item)}
                >
                  {isActive && isPlaying ? (
                    <span className="flex gap-0.5 items-end h-3.5">
                      <span className="w-0.5 h-3 bg-primary animate-[bounce_0.6s_ease-in-out_infinite]" />
                      <span className="w-0.5 h-2 bg-primary animate-[bounce_0.6s_ease-in-out_0.1s_infinite]" />
                      <span className="w-0.5 h-3.5 bg-primary animate-[bounce_0.6s_ease-in-out_0.2s_infinite]" />
                    </span>
                  ) : (
                    <Play className="h-3.5 w-3.5 fill-current" />
                  )}
                </Button>

                {/* Info + waveform */}
                <div className="flex-1 min-w-0 space-y-1">
                  <p className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>
                    {item.title ?? <span className="text-muted-foreground italic">Untitled</span>}
                  </p>
                  {item.description && (
                    <p className="text-xs text-muted-foreground truncate">{item.description}</p>
                  )}
                  <div className="h-8">
                    <WaveformPlayer
                      peaks={item.waveformPeaks}
                      durationSeconds={item.durationSeconds}
                      trackId={item.id}
                      isGloballyPlaying={isActive && isPlaying}
                      onPlay={() => handlePlay(item)}
                      compact
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Video Genre Card ─────────────────────────────────────────────────────────
function VideoGenreCard({
  genre,
  items,
}: {
  genre: { id: number; name: string };
  items: PortfolioItem[];
}) {
  const [activeVideo, setActiveVideo] = useState<PortfolioItem | null>(null);
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 overflow-hidden">
      {/* Genre header */}
      <div className="px-5 py-3.5 border-b border-border/40 bg-card/60">
        <h3 className="font-semibold font-display text-sm tracking-wide">{genre.name}</h3>
      </div>

      {/* Thumbnail grid */}
      <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
        {sorted.map((item) => (
          <button
            key={item.id}
            className="group relative rounded-lg overflow-hidden bg-muted aspect-video focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={() => setActiveVideo(item)}
          >
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title ?? ""}
                className="w-full h-full object-cover transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Video className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
            {/* Play overlay */}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <PlayCircle className="h-10 w-10 text-white drop-shadow-lg" />
            </div>
            {/* Title overlay */}
            {item.title && (
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                <p className="text-white text-xs font-medium truncate">{item.title}</p>
              </div>
            )}
          </button>
        ))}
      </div>

      {activeVideo && (
        <VideoModal item={activeVideo} onClose={() => setActiveVideo(null)} />
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Portfolio() {
  const { data, isLoading } = trpc.portfolio.getAll.useQuery();

  const audioGenres = (data?.genres ?? [])
    .filter((g) => g.type === "audio")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const videoGenres = (data?.genres ?? [])
    .filter((g) => g.type === "video")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const itemsByGenre = (data?.items ?? []).reduce<Record<number, PortfolioItem[]>>((acc, item) => {
    if (!acc[item.genreId]) acc[item.genreId] = [];
    acc[item.genreId].push(item as PortfolioItem);
    return acc;
  }, {});

  const hasAudio = audioGenres.some((g) => (itemsByGenre[g.id] ?? []).length > 0);
  const hasVideo = videoGenres.some((g) => (itemsByGenre[g.id] ?? []).length > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/40 bg-card/30 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <img
            src="https://pub-cdb5b776f5474aeeb82bb9fe960adccf.r2.dev/assets/epipheo-logo-black-transparent.png"
            alt="Epipheo"
            className="h-7 w-auto object-contain dark:hidden"
          />
          <img
            src="https://pub-cdb5b776f5474aeeb82bb9fe960adccf.r2.dev/assets/epipheo-logo-white-transparent.png"
            alt="Epipheo"
            className="h-7 w-auto object-contain hidden dark:block"
          />
          <div className="text-xs text-muted-foreground font-display uppercase tracking-widest">
            Music Portfolio
          </div>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-12 pb-8">
        <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight">
          Our Work
        </h1>
        <p className="mt-2 text-muted-foreground max-w-xl">
          A selection of original music and video productions from the Epipheo team.
        </p>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-32 space-y-16">

          {/* Audio Section */}
          {hasAudio && (
            <section>
              <div className="flex items-center gap-2.5 mb-6">
                <Music2 className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold font-display">Audio</h2>
              </div>
              <div className="space-y-4">
                {audioGenres
                  .filter((g) => (itemsByGenre[g.id] ?? []).length > 0)
                  .map((genre) => (
                    <AudioGenreCard
                      key={genre.id}
                      genre={genre}
                      items={itemsByGenre[genre.id] ?? []}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Video Section */}
          {hasVideo && (
            <section>
              <div className="flex items-center gap-2.5 mb-6">
                <Video className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold font-display">Video</h2>
              </div>
              <div className="space-y-4">
                {videoGenres
                  .filter((g) => (itemsByGenre[g.id] ?? []).length > 0)
                  .map((genre) => (
                    <VideoGenreCard
                      key={genre.id}
                      genre={genre}
                      items={itemsByGenre[genre.id] ?? []}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Empty state */}
          {!hasAudio && !hasVideo && (
            <div className="text-center py-24 text-muted-foreground">
              <Music2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
              <p>Portfolio content coming soon.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
