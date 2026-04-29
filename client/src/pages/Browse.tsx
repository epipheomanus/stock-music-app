import { useState, useMemo, useRef, useEffect } from "react";
import { Search, X, Download, ShoppingCart, Music, ChevronDown, Loader2, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import TopNav from "@/components/TopNav";
import CartDrawer from "@/components/CartDrawer";
import WaveformPlayer from "@/components/WaveformPlayer";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useCart } from "@/contexts/CartContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { toast } from "sonner";

// ─── Fixed taxonomy ────────────────────────────────────────────────────────────
const TAXONOMY = {
  Genre: ["Ambient","Country","Dance","Disco","Electronic","Folk","Funk","Hip Hop","Indie","Jazz","Jingle","Oldies","Orchestral","Pop","Religious","Rock","Techno","World"],
  Mood: ["Angry","Carefree","Chill","Eerie","Emotional","Happy","Heartwarming","Hopeful","Love","Peaceful","Sad","Serious","Silly","Somber","Uplifting"],
  Attributes: ["Adventurous","Aggressive","Badass","Bubbly","Calming","Cinematic","Comedic","Corporate","Cute","Dark","Digital","Energetic","Epic","Fast","Fun","Funky","Inspirational","Intense","Motivational","Nerdy","Professional","Retro","Sexy","Technology","Whimsical"],
} as const;

type TaxonomyKey = keyof typeof TAXONOMY;
type FilterState = { genres: string[]; moods: string[]; attributes: string[] };

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Taxonomy Dropdown ─────────────────────────────────────────────────────────
function TaxonomyDropdown({ label, items, selected, onToggle }: {
  label: TaxonomyKey;
  items: readonly string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeCount = selected.length;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-medium transition-colors select-none ${
          activeCount > 0
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-card border-border text-foreground hover:bg-muted"
        }`}
      >
        {label}
        {activeCount > 0 && (
          <span className="bg-primary-foreground/20 text-primary-foreground rounded-full text-xs px-1.5 py-0.5 leading-none">
            {activeCount}
          </span>
        )}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-card border border-border rounded-xl shadow-lg p-3 min-w-[200px] max-h-72 overflow-y-auto">
          <div className="grid grid-cols-2 gap-1">
            {items.map(item => {
              const isSelected = selected.includes(item);
              return (
                <button
                  key={item}
                  onClick={() => onToggle(item)}
                  className={`text-left text-xs px-2.5 py-1.5 rounded-md transition-colors ${
                    isSelected
                      ? "bg-primary/15 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Browse Page ───────────────────────────────────────────────────────────────
export default function Browse() {
  const { isAuthenticated } = useAuth();
  const { openCart } = useCart();
  const { activeTrackId, setActiveTrack, setQueue } = usePlayer();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({ genres: [], moods: [], attributes: [] });
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "az" | "za">("newest");

  const utils = trpc.useUtils();

  const tracksQuery = trpc.tracks.list.useQuery({
    search: search || undefined,
    genres: filters.genres.length ? filters.genres : undefined,
    moods: filters.moods.length ? filters.moods : undefined,
    attributes: filters.attributes.length ? filters.attributes : undefined,
  });

  const rawTracks = tracksQuery.data ?? [];
  const tracks = useMemo(() => {
    const arr = [...rawTracks];
    if (sortOrder === "oldest") arr.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    else if (sortOrder === "az") arr.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortOrder === "za") arr.sort((a, b) => b.title.localeCompare(a.title));
    else arr.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return arr;
  }, [rawTracks, sortOrder]);

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
    <div className="min-h-screen bg-background text-foreground pb-28">
      <TopNav />
      <CartDrawer />
      <div className="container py-8">
        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold mb-1">Browse Music</h1>
              <p className="text-sm text-muted-foreground">
                {tracks.length} track{tracks.length !== 1 ? "s" : ""} available
                {activeFilterCount > 0 && " matching your filters"}
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="shrink-0 gap-1.5 text-xs h-8">
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {sortOrder === "newest" ? "Newest first" : sortOrder === "oldest" ? "Oldest first" : sortOrder === "az" ? "A → Z" : "Z → A"}
                  <ChevronDown className="h-3 w-3 ml-0.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-36">
                <DropdownMenuItem onClick={() => setSortOrder("newest")} className={sortOrder === "newest" ? "font-medium text-primary" : ""}>
                  Newest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("oldest")} className={sortOrder === "oldest" ? "font-medium text-primary" : ""}>
                  Oldest first
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("az")} className={sortOrder === "az" ? "font-medium text-primary" : ""}>
                  A → Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortOrder("za")} className={sortOrder === "za" ? "font-medium text-primary" : ""}>
                  Z → A
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Search bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by title, composer, or tags — separate multiple tags with commas (e.g. Orchestral, Romantic, Soft)…"
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

        {/* Taxonomy tag bar */}
        <div className="flex flex-wrap items-center gap-2 mb-5 pb-4 border-b border-border/50">
          <TaxonomyDropdown
            label="Genre"
            items={TAXONOMY.Genre}
            selected={filters.genres}
            onToggle={v => toggleFilter("genres", v)}
          />
          <TaxonomyDropdown
            label="Mood"
            items={TAXONOMY.Mood}
            selected={filters.moods}
            onToggle={v => toggleFilter("moods", v)}
          />
          <TaxonomyDropdown
            label="Attributes"
            items={TAXONOMY.Attributes}
            selected={filters.attributes}
            onToggle={v => toggleFilter("attributes", v)}
          />
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground ml-1" onClick={clearFilters}>
              <X className="h-3 w-3 mr-1" /> Clear all
            </Button>
          )}
        </div>

        {/* Active filter badges */}
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
          </div>
        )}

        {/* Track list */}
        <div className="flex-1 min-w-0">
          {tracksQuery.isLoading ? (
            <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-center">
              <Music className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">No tracks found.</p>
              {(activeFilterCount > 0 || search) && (
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={clearFilters}>Clear filters</Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {tracks.map((track) => (
                <TrackRow
                  key={track.id}
                  track={track}
                  isPlaying={activeTrackId === track.id}
                  onPlay={(track) => {
                    setQueue(tracks, tracks.findIndex(t => t.id === track.id));
                  }}
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
  );
}

type TrackData = {
  id: number; title: string; composerName: string | null; durationSeconds: number | null;
  coverArtUrl: string | null; watermarkedMp3Url: string | null; wavUrl: string | null;
  hasStems: boolean; watermarkStatus: string; createdAt: Date;
  tags: { genres: string[]; moods: string[]; attributes: string[] };
};

function TrackRow({ track, isPlaying, onPlay, isAuthenticated, onAddToCart, onDownloadWatermarked }: {
  track: TrackData; isPlaying: boolean; onPlay: (track: TrackData) => void;
  isAuthenticated: boolean; onAddToCart: () => void; onDownloadWatermarked: () => void;
}) {
  const allTags = [...track.tags.genres, ...track.tags.moods, ...track.tags.attributes];
  // Use clean WAV for in-browser playback; watermarkedMp3Url is only for the Download Preview button
  const audioUrl = track.wavUrl ?? "";

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
                {track.watermarkStatus === "done" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onDownloadWatermarked}
                    title="Download watermarked preview"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-muted-foreground/40 cursor-not-allowed"
                    disabled
                    title={track.watermarkStatus === "processing" ? "Watermark is being generated…" : track.watermarkStatus === "error" ? "Watermark generation failed — admin can retry" : "Watermark not yet generated"}
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Preview</span>
                  </Button>
                )}
                {isAuthenticated ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={onAddToCart}
                    title="Add to cart"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Add</span>
                  </Button>
                ) : null}
              </div>
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {allTags.slice(0, 8).map(tag => (
                  <span key={tag} className="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full capitalize">
                    {tag}
                  </span>
                ))}
                {allTags.length > 8 && (
                  <span className="text-xs text-muted-foreground/60">+{allTags.length - 8}</span>
                )}
              </div>
            )}
          </div>
        </div>
        {audioUrl && (
          <div className="mt-3">
            <WaveformPlayer audioUrl={audioUrl} trackId={track.id} isGloballyPlaying={isPlaying} onPlay={() => onPlay(track)} />
          </div>
        )}
      </div>
    </div>
  );
}
