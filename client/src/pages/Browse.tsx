import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Search, X, Download, ShoppingCart, Music, ChevronDown, Loader2, ArrowUpDown, FolderPlus, Plus, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

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

  const activeProjectsQuery = trpc.projects.listActive.useQuery(undefined, { enabled: isAuthenticated });
  const activeProjects = activeProjectsQuery.data ?? [];
  const addTrackToPlaylistMutation = trpc.projects.addTrack.useMutation({
    onSuccess: () => { toast.success("Added to playlist"); activeProjectsQuery.refetch(); },
    onError: (err) => toast.error(err.message || "Failed to add to playlist"),
  });
  const createPlaylistMutation = trpc.projects.createPlaylist.useMutation({
    onSuccess: () => activeProjectsQuery.refetch(),
    onError: (err) => toast.error(err.message || "Failed to create playlist"),
  });
  const handleCreatePlaylistAndAdd = useCallback(async (projectId: number, name: string, trackId: number) => {
    try {
      const { id: playlistId } = await createPlaylistMutation.mutateAsync({ projectId, name });
      await addTrackToPlaylistMutation.mutateAsync({ playlistId, trackId });
    } catch { /* errors handled by individual mutations */ }
  }, [createPlaylistMutation, addTrackToPlaylistMutation]);

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

  function clearFilters() { setFilters({ genres: [], moods: [], attributes: [] }); setSearch(""); setPage(1); }
  const activeFilterCount = filters.genres.length + filters.moods.length + filters.attributes.length;
  const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
  const pagedTracks = useMemo(() => tracks.slice((page - 1) * perPage, page * perPage), [tracks, page, perPage]);
  // Reset to page 1 when search or filters change
  useEffect(() => { setPage(1); }, [search, filters]);

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
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-xs text-muted-foreground">Show:</span>
                {([10, 25, 50] as const).map(n => (
                  <button key={n} onClick={() => { setPerPage(n); setPage(1); }}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      perPage === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}>{n}</button>
                ))}
              </div>
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
              <Badge key={`genre:${v}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("genres", v)}>
                Genre: {v} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filters.moods.map(v => (
              <Badge key={`mood:${v}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("moods", v)}>
                Mood: {v} <X className="h-3 w-3" />
              </Badge>
            ))}
            {filters.attributes.map(v => (
              <Badge key={`attr:${v}`} variant="secondary" className="gap-1 cursor-pointer" onClick={() => toggleFilter("attributes", v)}>
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
              {pagedTracks.map((track) => (
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
                  activeProjects={activeProjects}
                  onAddToPlaylist={(playlistId) => addTrackToPlaylistMutation.mutate({ playlistId, trackId: track.id })}
                  onCreatePlaylistAndAdd={handleCreatePlaylistAndAdd}
                />
              ))}
            </div>
          )}
          {tracks.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) => p === "..." ? (
                  <span key={`ellipsis-${i}`} className="text-xs text-muted-foreground px-1">…</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className={`h-8 w-8 text-xs rounded border transition-colors ${
                      page === p ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                    }`}>{p}</button>
                ))}
              <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Next</Button>
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
  waveformPeaks?: string | null;
  tags: { genres: string[]; moods: string[]; attributes: string[] };
};

function TrackRow({ track, isPlaying, onPlay, isAuthenticated, onAddToCart, onDownloadWatermarked, activeProjects, onAddToPlaylist, onCreatePlaylistAndAdd }: {
  track: TrackData; isPlaying: boolean; onPlay: (track: TrackData) => void;
  isAuthenticated: boolean; onAddToCart: () => void; onDownloadWatermarked: () => void;
  activeProjects: any[]; onAddToPlaylist: (playlistId: number) => void;
  onCreatePlaylistAndAdd: (projectId: number, name: string, trackId: number) => void;
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
                  <>
                    <AddToProjectPopover
                      trackId={track.id}
                      activeProjects={activeProjects}
                      onAddToPlaylist={onAddToPlaylist}
                      onCreatePlaylistAndAdd={onCreatePlaylistAndAdd}
                    />
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
                  </>
                ) : null}
              </div>
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {allTags.slice(0, 8).map((tag, i) => (
                  <span key={`${i}:${tag}`} className="text-xs bg-muted/60 text-muted-foreground px-2 py-0.5 rounded-full capitalize">
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
            <WaveformPlayer audioUrl={audioUrl} trackId={track.id} waveformPeaks={track.waveformPeaks} durationSeconds={track.durationSeconds} isGloballyPlaying={isPlaying} onPlay={() => onPlay(track)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add-to-Project Popover ────────────────────────────────────────────────────
// Self-contained popover that handles both selecting an existing playlist and
// creating a new one inline, so users never have to leave the Browse page.
function AddToProjectPopover({
  trackId, activeProjects, onAddToPlaylist, onCreatePlaylistAndAdd,
}: {
  trackId: number;
  activeProjects: any[];
  onAddToPlaylist: (playlistId: number) => void;
  onCreatePlaylistAndAdd: (projectId: number, name: string, trackId: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [creatingFor, setCreatingFor] = useState<number | null>(null);
  const [newName, setNewName] = useState("");

  function handleAdd(playlistId: number) {
    onAddToPlaylist(playlistId);
    setOpen(false);
  }

  function handleCreate(projectId: number) {
    if (!newName.trim()) return;
    onCreatePlaylistAndAdd(projectId, newName.trim(), trackId);
    setNewName("");
    setCreatingFor(null);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setCreatingFor(null); setNewName(""); } }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground" title="Add to project">
          <FolderPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Project</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        {activeProjects.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            No active projects.{" "}
            <a href="/projects" className="underline text-primary">Create one</a>.
          </p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground px-2 pb-1 pt-0.5">Add to playlist</p>
            {activeProjects.map((proj: any) => (
              <div key={proj.id}>
                {/* Existing playlists */}
                {proj.playlists?.map((pl: any) => (
                  <button
                    key={pl.id}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5"
                    onClick={() => handleAdd(pl.id)}
                  >
                    <Check className="h-3 w-3 text-transparent group-hover:text-primary shrink-0" />
                    <span className="text-muted-foreground">{proj.name} /</span>
                    <span className="truncate">{pl.name}</span>
                  </button>
                ))}

                {/* Inline new-playlist creator */}
                {creatingFor === proj.id ? (
                  <div className="flex items-center gap-1 px-2 py-1">
                    <input
                      autoFocus
                      className="flex-1 text-xs bg-muted rounded px-2 py-1 outline-none border border-border/60 focus:border-primary"
                      placeholder="Playlist name…"
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") handleCreate(proj.id);
                        if (e.key === "Escape") { setCreatingFor(null); setNewName(""); }
                      }}
                    />
                    <button
                      className="p-1 rounded text-primary hover:bg-primary/10 disabled:opacity-40"
                      disabled={!newName.trim()}
                      onClick={() => handleCreate(proj.id)}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    className="w-full text-left text-xs px-2 py-1.5 rounded-md hover:bg-muted transition-colors flex items-center gap-1.5 text-muted-foreground/70"
                    onClick={() => { setCreatingFor(proj.id); setNewName(""); }}
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span className="italic">New playlist in {proj.name}</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
