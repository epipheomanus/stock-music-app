import { useState, useMemo } from "react";
import { Search, X, Download, ShoppingCart, Music, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import TopNav from "@/components/TopNav";
import CartDrawer from "@/components/CartDrawer";
import WaveformPlayer from "@/components/WaveformPlayer";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { toast } from "sonner";

type FilterState = { genres: string[]; moods: string[]; attributes: string[] };

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function Browse() {
  const { isAuthenticated } = useAuth();
  const { openCart } = useCart();
  const { activeTrackId, setActiveTrack } = usePlayer();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({ genres: [], moods: [], attributes: [] });
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    genre: true, mood: true, attribute: true,
  });

  const utils = trpc.useUtils();
  const filterOptionsQuery = trpc.tracks.filterOptions.useQuery();
  const filterOptions = filterOptionsQuery.data ?? { genres: [], moods: [], attributes: [] };

  const genres = useMemo(() => [...(filterOptions.genres as string[] ?? [])].sort(), [filterOptions.genres]);
  const moods = useMemo(() => [...(filterOptions.moods as string[] ?? [])].sort(), [filterOptions.moods]);
  const attributes = useMemo(() => [...(filterOptions.attributes as string[] ?? [])].sort(), [filterOptions.attributes]);

  const tracksQuery = trpc.tracks.list.useQuery({
    search: search || undefined,
    genres: filters.genres.length ? filters.genres : undefined,
    moods: filters.moods.length ? filters.moods : undefined,
    attributes: filters.attributes.length ? filters.attributes : undefined,
  });
  const tracks = tracksQuery.data ?? [];

  const addToCartMutation = trpc.cart.add.useMutation({
    onSuccess: () => { utils.cart.list.invalidate(); toast.success("Added to cart"); },
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
      toast.success("Downloading preview...");
    },
    onError: (err) => toast.error(err.message),
  });

  function toggleFilter(type: keyof FilterState, value: string) {
    setFilters(prev => {
      const arr = prev[type];
      return { ...prev, [type]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  }

  function clearFilters() { setFilters({ genres: [], moods: [], attributes: [] }); setSearch(""); }
  const activeFilterCount = filters.genres.length + filters.moods.length + filters.attributes.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <CartDrawer />
      <div className="container py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold mb-1">Browse Music</h1>
          <p className="text-sm text-muted-foreground">
            {tracks.length} track{tracks.length !== 1 ? "s" : ""} available
            {activeFilterCount > 0 && " matching your filters"}
          </p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, composer, genre, mood…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 bg-card border-border h-11"
          />
          {search && (
            <Button variant="ghost" size="icon" className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setSearch("")}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.genres.map(v => (
              <Badge key={v} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("genres", v)}>
                Genre: {v} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filters.moods.map(v => (
              <Badge key={v} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("moods", v)}>
                Mood: {v} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filters.attributes.map(v => (
              <Badge key={v} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("attributes", v)}>
                {v} <X className="h-3 w-3" />
              </Badge>
            ))}
            <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground" onClick={clearFilters}>Clear all</Button>
          </div>
        )}

        <div className="flex gap-6">
          {/* Filter sidebar */}
          <aside className="hidden lg:block w-52 shrink-0">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold">Filters</span>
                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground p-0" onClick={clearFilters}>Clear</Button>
                )}
              </div>
              <FilterSection title="Genre" values={genres} selected={filters.genres} onToggle={v => toggleFilter("genres", v)} expanded={expandedSections.genre} onToggleExpand={() => setExpandedSections(p => ({ ...p, genre: !p.genre }))} />
              <Separator className="my-3" />
              <FilterSection title="Mood" values={moods} selected={filters.moods} onToggle={v => toggleFilter("moods", v)} expanded={expandedSections.mood} onToggleExpand={() => setExpandedSections(p => ({ ...p, mood: !p.mood }))} />
              <Separator className="my-3" />
              <FilterSection title="Attributes" values={attributes} selected={filters.attributes} onToggle={v => toggleFilter("attributes", v)} expanded={expandedSections.attribute} onToggleExpand={() => setExpandedSections(p => ({ ...p, attribute: !p.attribute }))} />
            </div>
          </aside>

          {/* Track list */}
          <div className="flex-1 min-w-0">
            {tracksQuery.isLoading ? (
              <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : tracks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-center">
                <Music className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">No tracks found.</p>
                {activeFilterCount > 0 && <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={clearFilters}>Clear filters</Button>}
              </div>
            ) : (
              <div className="space-y-2">
                {tracks.map((track) => (
                  <TrackRow
                    key={track.id}
                    track={track}
                    isPlaying={activeTrackId === track.id}
                    onPlay={setActiveTrack}
                    isAuthenticated={isAuthenticated}
                    onAddToCart={() => addToCartMutation.mutate({ trackId: track.id })}
                    onDownloadWatermarked={() => watermarkedDownloadMutation.mutate({ trackId: track.id })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, values, selected, onToggle, expanded, onToggleExpand }: {
  title: string; values: string[]; selected: string[]; onToggle: (v: string) => void;
  expanded: boolean; onToggleExpand: () => void;
}) {
  if (values.length === 0) return null;
  return (
    <div>
      <button className="flex items-center justify-between w-full text-sm font-medium mb-2 hover:text-primary transition-colors" onClick={onToggleExpand}>
        {title}
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {expanded && (
        <div className="space-y-1">
          {values.map(v => (
            <button key={v} onClick={() => onToggle(v)} className={`flex items-center gap-2 w-full text-left text-sm px-2 py-1 rounded-md transition-colors ${selected.includes(v) ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}>
              <span className={`w-3 h-3 rounded-sm border flex items-center justify-center shrink-0 ${selected.includes(v) ? "bg-primary border-primary" : "border-muted-foreground/40"}`}>
                {selected.includes(v) && (
                  <svg viewBox="0 0 8 8" className="w-2 h-2 fill-primary-foreground">
                    <path d="M1 4l2 2 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type TrackData = {
  id: number; title: string; composerName: string | null; durationSeconds: number | null;
  coverArtUrl: string | null; watermarkedMp3Url: string | null; wavUrl: string | null;
  hasStems: boolean; watermarkStatus: string;
  tags: { genres: string[]; moods: string[]; attributes: string[] };
};

function TrackRow({ track, isPlaying, onPlay, isAuthenticated, onAddToCart, onDownloadWatermarked }: {
  track: TrackData; isPlaying: boolean; onPlay: (id: number) => void;
  isAuthenticated: boolean; onAddToCart: () => void; onDownloadWatermarked: () => void;
}) {
  const allTags = [...track.tags.genres, ...track.tags.moods, ...track.tags.attributes];
  const audioUrl = track.watermarkedMp3Url ?? track.wavUrl ?? "";

  return (
    <div className={`group rounded-xl border transition-all ${isPlaying ? "border-primary/40 bg-primary/5" : "border-border/50 bg-card/50 hover:border-border hover:bg-card"}`}>
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
            {track.coverArtUrl ? (
              <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Music className="h-5 w-5 text-muted-foreground/40" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="min-w-0">
                <h3 className="font-semibold text-sm truncate">{track.title}</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {track.composerName ?? "Unknown Composer"}
                  {track.durationSeconds ? ` · ${formatDuration(track.durationSeconds)}` : ""}
                  {track.hasStems && " · Stems available"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1.5 text-xs px-2 text-muted-foreground hover:text-foreground"
                  onClick={onDownloadWatermarked}
                  disabled={!track.watermarkedMp3Url}
                  title={track.watermarkedMp3Url ? "Download watermarked preview (MP3)" : track.watermarkStatus === "processing" ? "Watermark generating…" : "Preview not available"}
                >
                  <Download className="h-3.5 w-3.5" />
                  Preview
                </Button>
                {isAuthenticated ? (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={onAddToCart} title="Add to cart">
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground/40" title="Sign in to add to cart" onClick={() => toast.info("Sign in to add tracks to your cart")}>
                    <ShoppingCart className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            {audioUrl ? (
              <WaveformPlayer audioUrl={audioUrl} trackId={track.id} isGloballyPlaying={isPlaying} onPlay={onPlay} />
            ) : (
              <div className="h-12 flex items-center text-xs text-muted-foreground/40">Audio not available</div>
            )}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {allTags.slice(0, 6).map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{tag}</span>
                ))}
                {allTags.length > 6 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">+{allTags.length - 6}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
