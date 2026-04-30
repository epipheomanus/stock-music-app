import { useState, useRef, useCallback, useMemo } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Music, Upload, Loader2, X, Check, FolderOpen, FileAudio, RefreshCw, Filter, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
// Tag lists now come from the live DB via trpc.tracks.filterOptions
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type TagType = "genre" | "mood" | "attribute" | "hidden";

interface TrackFormData {
  title: string;
  composerName: string;
  description: string;
  bpm: string;
  keySignature: string;
  genres: string[];
  moods: string[];
  attributes: string[];
  hiddenTags: string[];
  isPublished: boolean;
}

const DEFAULT_FORM: TrackFormData = {
  title: "", composerName: "", description: "", bpm: "", keySignature: "",
  genres: [], moods: [], attributes: [], hiddenTags: [], isPublished: true,
};

// ─── Drag-and-drop file zone ───────────────────────────────────────────────
function DropZone({
  label, hint, accept, multiple, file, files, onFile, onFiles, icon: Icon,
}: {
  label: string; hint?: string; accept: string; multiple?: boolean;
  file?: File | null; files?: File[]; onFile?: (f: File | null) => void;
  onFiles?: (f: File[]) => void; icon: React.ElementType;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (multiple && onFiles) onFiles(dropped);
    else if (!multiple && onFile) onFile(dropped[0] ?? null);
  }, [multiple, onFile, onFiles]);

  const hasContent = multiple ? (files?.length ?? 0) > 0 : !!file;

  return (
    <div className="space-y-1.5">
      <Label>{label}{hint && <span className="text-muted-foreground text-xs ml-1">{hint}</span>}</Label>
      <div
        className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all select-none
          ${dragging ? "border-primary bg-primary/8 scale-[1.01]" : hasContent ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef} type="file" accept={accept} multiple={multiple} className="hidden"
          onChange={e => {
            const picked = Array.from(e.target.files ?? []);
            if (multiple && onFiles) onFiles(picked);
            else if (!multiple && onFile) onFile(picked[0] ?? null);
          }}
        />
        {hasContent ? (
          <div className="flex items-center gap-2 justify-center">
            <Icon className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-medium text-primary truncate max-w-[160px]">
              {multiple ? `${files?.length} file${(files?.length ?? 0) > 1 ? "s" : ""} selected` : file?.name}
            </span>
            <button type="button" className="ml-1 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); multiple ? onFiles?.([]) : onFile?.(null); }}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-muted-foreground">
            <Icon className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
            <p className="text-xs font-medium">Drag & drop or click to select</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Tag field with history ────────────────────────────────────────────────
function TagField({
  type, label, selected, allOptions, onAdd, onRemove, onDeleteGlobal,
}: {
  type: TagType; label: string; selected: string[]; allOptions: string[];
  onAdd: (v: string) => void; onRemove: (v: string) => void;
  onDeleteGlobal: (v: string) => void;
}) {
  const [input, setInput] = useState("");
  const colorMap: Record<TagType, { pill: string; ghost: string }> = {
    genre: { pill: "bg-blue-100 text-blue-700 border-blue-200", ghost: "bg-blue-50/60 text-blue-500 border-blue-200/60" },
    mood: { pill: "bg-purple-100 text-purple-700 border-purple-200", ghost: "bg-purple-50/60 text-purple-500 border-purple-200/60" },
    attribute: { pill: "bg-amber-100 text-amber-700 border-amber-200", ghost: "bg-amber-50/60 text-amber-500 border-amber-200/60" },
    hidden: { pill: "bg-slate-100 text-slate-600 border-slate-200", ghost: "bg-slate-50/60 text-slate-500 border-slate-200/60" },
  };
  const c = colorMap[type];

  const add = (v: string) => {
    const val = v.trim();
    if (!val || selected.includes(val)) return;
    onAdd(val);
    setInput("");
  };

  // suggestions: all saved options not already selected
  const suggestions = allOptions.filter(o => !selected.includes(o) && o.toLowerCase().includes(input.toLowerCase()));

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {/* Selected pills */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1">
          {selected.map(v => (
            <span key={v} className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border font-medium ${c.pill}`}>
              {v}
              <button type="button" onClick={() => onRemove(v)} className="opacity-60 hover:opacity-100 ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {/* Input */}
      <div className="flex gap-2">
        <Input
          placeholder={`Add ${label.toLowerCase()}…`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          className="flex-1 h-8 text-sm"
        />
        <Button type="button" variant="outline" size="sm" className="h-8 px-3" onClick={() => add(input)}>Add</Button>
      </div>
      {/* Saved suggestions */}
      {allOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {allOptions.map(v => {
            const isSelected = selected.includes(v);
            return (
              <span key={v} className={`relative group inline-flex items-center text-xs px-2.5 py-0.5 rounded-full border cursor-pointer transition-opacity ${isSelected ? "opacity-30 cursor-default" : c.ghost + " hover:opacity-80"}`}
                onClick={() => { if (!isSelected) add(v); }}
              >
                {v}
                {/* Delete global tag button */}
                <button
                  type="button"
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10"
                  onClick={e => { e.stopPropagation(); onDeleteGlobal(v); }}
                  title={`Remove "${v}" from all tracks`}
                >
                  <X className="h-2 w-2" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────
export default function AdminTracks() {
  const utils = trpc.useUtils();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingTrack, setEditingTrack] = useState<number | null>(null);
  const [form, setForm] = useState<TrackFormData>(DEFAULT_FORM);
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [stemsFiles, setStemsFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  // Sort & filter state
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "az" | "za">("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [filterComposer, setFilterComposer] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStems, setFilterStems] = useState<"all" | "has" | "none">("all");
  const [filterWatermark, setFilterWatermark] = useState<"all" | "done" | "pending" | "error" | "processing">("all");
  const [filterBpmMin, setFilterBpmMin] = useState("");
  const [filterBpmMax, setFilterBpmMax] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [filterCoverArt, setFilterCoverArt] = useState<"all" | "has" | "missing">("all");
  // Duplicate name alert
  const [duplicateAlertMsg, setDuplicateAlertMsg] = useState<string | null>(null);

  const tracksQuery = trpc.tracks.adminList.useQuery();
  const tracks = tracksQuery.data ?? [];

  const filterOptionsQuery = trpc.tracks.filterOptions.useQuery();
  const filterOptions = filterOptionsQuery.data ?? { genres: [], moods: [], attributes: [] };

  const deleteMutation = trpc.tracks.delete.useMutation({
    onSuccess: () => { utils.tracks.adminList.invalidate(); toast.success("Track deleted"); },
    onError: (err: { message?: string }) => toast.error(err.message || "Delete failed"),
  });

  const updateMutation = trpc.tracks.update.useMutation({
    onSuccess: () => {
      utils.tracks.adminList.invalidate();
      utils.tracks.filterOptions.invalidate();
      setEditingTrack(null);
      toast.success("Track updated");
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Update failed"),
  });

  const retryWatermarkMutation = trpc.tracks.generateWatermark.useMutation({
    onSuccess: () => { utils.tracks.adminList.invalidate(); toast.success("Watermark generation started — refresh in a moment"); },
    onError: (err: { message?: string }) => toast.error(err.message || "Retry failed"),
  });

  const retryAllStuckMutation = trpc.tracks.retryAllStuck.useMutation({
    onSuccess: (data) => {
      utils.tracks.adminList.invalidate();
      if (data.count === 0) toast.info("No stuck tracks found");
      else toast.success(`Queued watermark generation for ${data.count} track${data.count !== 1 ? "s" : ""} — refresh in a moment`);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Bulk retry failed"),
  });

  const stuckCount = tracks.filter((t: any) => t.watermarkStatus === "error" || t.watermarkStatus === "pending").length;

  // Filtered + sorted tracks
  const displayedTracks = useMemo(() => {
    let result = [...tracks] as any[];
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(t => t.title?.toLowerCase().includes(q) || t.composerName?.toLowerCase().includes(q));
    }
    if (filterComposer) {
      const q = filterComposer.toLowerCase();
      result = result.filter(t => t.composerName?.toLowerCase().includes(q));
    }
    if (filterDateFrom) result = result.filter(t => new Date(t.createdAt) >= new Date(filterDateFrom));
    if (filterDateTo) result = result.filter(t => new Date(t.createdAt) <= new Date(filterDateTo + "T23:59:59"));
    if (filterStems === "has") result = result.filter(t => t.hasStems);
    if (filterStems === "none") result = result.filter(t => !t.hasStems);
    if (filterWatermark !== "all") result = result.filter(t => t.watermarkStatus === filterWatermark);
    if (filterBpmMin) result = result.filter(t => t.bpm != null && t.bpm >= Number(filterBpmMin));
    if (filterBpmMax) result = result.filter(t => t.bpm != null && t.bpm <= Number(filterBpmMax));
    if (filterTag) {
      const q = filterTag.toLowerCase();
      result = result.filter(t => [
        ...(t.tags?.genres ?? []), ...(t.tags?.moods ?? []), ...(t.tags?.attributes ?? []),
      ].some((v: string) => v.toLowerCase().includes(q)));
    }
    if (filterCoverArt === "has") result = result.filter(t => !!t.coverArtUrl);
    if (filterCoverArt === "missing") result = result.filter(t => !t.coverArtUrl);
    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "az") return a.title.localeCompare(b.title);
      if (sortBy === "za") return b.title.localeCompare(a.title);
      return 0;
    });
    return result;
  }, [tracks, search, sortBy, filterComposer, filterDateFrom, filterDateTo, filterStems, filterWatermark, filterBpmMin, filterBpmMax, filterTag, filterCoverArt]);

  const deleteGlobalTagMutation = trpc.tracks.deleteGlobalTag.useMutation({
    onSuccess: () => {
      utils.tracks.filterOptions.invalidate();
      utils.tracks.adminList.invalidate();
      toast.success("Tag removed from all tracks");
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Failed to remove tag"),
  });

  // Auto-populate title when WAV file is selected
  function handleWavFile(f: File | null) {
    setWavFile(f);
    if (f && !form.title) {
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").trim();
      setForm(p => ({ ...p, title: name }));
    }
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!wavFile) { toast.error("Please select a WAV file"); return; }
    if (!form.title.trim()) { toast.error("Title is required"); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", form.title);
      fd.append("composerName", form.composerName);
      fd.append("description", form.description);
      fd.append("bpm", form.bpm);
      fd.append("keySignature", form.keySignature);
      fd.append("isPublished", String(form.isPublished));
      fd.append("tags", JSON.stringify([
        ...form.genres.map(v => ({ type: "genre", value: v })),
        ...form.moods.map(v => ({ type: "mood", value: v })),
        ...form.attributes.map(v => ({ type: "attribute", value: v })),
        ...form.hiddenTags.map(v => ({ type: "hidden", value: v })),
      ]));
      fd.append("wav", wavFile);
      if (coverFile) fd.append("cover", coverFile);
      stemsFiles.forEach(f => fd.append("stems", f));

      const res = await fetch("/api/admin/upload-track", {
        method: "POST", body: fd, credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      await utils.tracks.adminList.invalidate();
      await utils.tracks.filterOptions.invalidate();
      toast.success("Track uploaded! Watermark is being generated in the background.");
      setShowUploadDialog(false);
      setForm(DEFAULT_FORM);
      setWavFile(null); setStemsFiles([]); setCoverFile(null);
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        setDuplicateAlertMsg(err.message);
      } else {
        toast.error(err.message || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  function openEdit(track: any) {
    setEditingTrack(track.id);
    setForm({
      title: track.title,
      composerName: track.composerName ?? "",
      description: track.description ?? "",
      bpm: track.bpm ? String(track.bpm) : "",
      keySignature: track.keySignature ?? "",
      genres: track.tags?.genres ?? [],
      moods: track.tags?.moods ?? [],
      attributes: track.tags?.attributes ?? [],
      hiddenTags: track.tags?.hidden ?? [],
      isPublished: track.isPublished,
    });
  }

  function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTrack) return;
    updateMutation.mutate({
      id: editingTrack,
      title: form.title,
      composerName: form.composerName || undefined,
      description: form.description || undefined,
      bpm: form.bpm ? Number(form.bpm) : undefined,
      isPublished: form.isPublished,
      genres: form.genres,
      moods: form.moods,
      attributes: form.attributes,
      hiddenTags: form.hiddenTags,
    });
  }

  const tagStatusColor: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    processing: "bg-blue-100 text-blue-700 border-blue-200",
    done: "bg-green-100 text-green-700 border-green-200",
    error: "bg-red-100 text-red-700 border-red-200",
  };

  // Shared tag form section used in both upload and edit dialogs
  function TagSection() {
    return (
      <div className="space-y-4 border border-border rounded-xl p-4 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Tags</p>
        <TagField
          type="genre" label="Genre"
          selected={form.genres}
          allOptions={filterOptions.genres}
          onAdd={v => setForm(p => ({ ...p, genres: [...p.genres, v] }))}
          onRemove={v => setForm(p => ({ ...p, genres: p.genres.filter(x => x !== v) }))}
          onDeleteGlobal={() => {}}
        />
        <TagField
          type="mood" label="Mood"
          selected={form.moods}
          allOptions={filterOptions.moods}
          onAdd={v => setForm(p => ({ ...p, moods: [...p.moods, v] }))}
          onRemove={v => setForm(p => ({ ...p, moods: p.moods.filter(x => x !== v) }))}
          onDeleteGlobal={() => {}}
        />
        <TagField
          type="attribute" label="Attributes"
          selected={form.attributes}
          allOptions={filterOptions.attributes}
          onAdd={v => setForm(p => ({ ...p, attributes: [...p.attributes, v] }))}
          onRemove={v => setForm(p => ({ ...p, attributes: p.attributes.filter(x => x !== v) }))}
          onDeleteGlobal={() => {}}
        />
        {/* Hidden tags — not shown publicly, only matched in search */}
        <div className="border-t border-border/50 pt-4">
          <p className="text-xs text-muted-foreground mb-2">
            <span className="font-semibold text-foreground">Hidden Tags</span>
            {" "}— searchable by users but not displayed on the browse page
          </p>
          <TagField
            type="hidden" label="Hidden Tags"
            selected={form.hiddenTags}
            allOptions={[]}
            onAdd={v => setForm(p => ({ ...p, hiddenTags: [...p.hiddenTags, v] }))}
            onRemove={v => setForm(p => ({ ...p, hiddenTags: p.hiddenTags.filter(x => x !== v) }))}
            onDeleteGlobal={() => {}}
          />
        </div>
      </div>
    );
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Tracks</h1>
            <p className="text-sm text-muted-foreground">{displayedTracks.length} of {tracks.length} track{tracks.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {stuckCount > 0 && (
              <Button
                variant="outline"
                className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800"
                onClick={() => retryAllStuckMutation.mutate()}
                disabled={retryAllStuckMutation.isPending}
              >
                {retryAllStuckMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Retry All Stuck ({stuckCount})
              </Button>
            )}
            <Button onClick={() => { setForm(DEFAULT_FORM); setWavFile(null); setStemsFiles([]); setCoverFile(null); setShowUploadDialog(true); }} className="gap-2">
              <Plus className="h-4 w-4" /> Add Track
            </Button>
          </div>
        </div>

        {/* Search + Sort + Filter bar */}
        <div className="flex flex-wrap gap-2 mb-4">
          <Input
            placeholder="Search by title or composer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[200px] max-w-sm h-9"
          />
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest First</SelectItem>
              <SelectItem value="oldest">Oldest First</SelectItem>
              <SelectItem value="az">A → Z</SelectItem>
              <SelectItem value="za">Z → A</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => setShowFilters(f => !f)}>
            <Filter className="h-3.5 w-3.5" /> Filters <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </Button>
        </div>
        {/* Collapsible filter panel */}
        {showFilters && (
          <div className="mb-5 p-4 rounded-xl border border-border/60 bg-muted/20 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Composer</Label>
              <Input placeholder="Filter by composer" value={filterComposer} onChange={e => setFilterComposer(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Added From</Label>
              <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Added To</Label>
              <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Stems</Label>
              <Select value={filterStems} onValueChange={(v) => setFilterStems(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has Stems</SelectItem>
                  <SelectItem value="none">No Stems</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Watermark Status</Label>
              <Select value={filterWatermark} onValueChange={(v) => setFilterWatermark(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="done">Ready</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BPM Min</Label>
              <Input type="number" placeholder="e.g. 80" value={filterBpmMin} onChange={e => setFilterBpmMin(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">BPM Max</Label>
              <Input type="number" placeholder="e.g. 140" value={filterBpmMax} onChange={e => setFilterBpmMax(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tag</Label>
              <Input placeholder="Genre, mood, attribute" value={filterTag} onChange={e => setFilterTag(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cover Art</Label>
              <Select value={filterCoverArt} onValueChange={(v) => setFilterCoverArt(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="has">Has Cover Art</SelectItem>
                  <SelectItem value="missing">Missing Cover Art</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                setFilterComposer(""); setFilterDateFrom(""); setFilterDateTo("");
                setFilterStems("all"); setFilterWatermark("all"); setFilterBpmMin("");
                setFilterBpmMax(""); setFilterTag(""); setFilterCoverArt("all");
              }}>Clear Filters</Button>
            </div>
          </div>
        )}
        {/* Track list */}
        {tracksQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Music className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No tracks yet. Add your first track.</p>
          </div>
        ) : displayedTracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Filter className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No tracks match the current filters.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {displayedTracks.map((track: any) => (
              <div key={track.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card hover:border-border transition-colors">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {track.coverArtUrl ? <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" /> : <Music className="h-4 w-4 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-sm">{track.title}</h3>
                    {!track.isPublished && <Badge variant="secondary" className="text-[10px]">Draft</Badge>}
                    {track.hasStems && <Badge variant="outline" className="text-[10px]">Stems</Badge>}
                    {track.watermarkStatus && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${tagStatusColor[track.watermarkStatus] ?? ""}`}>
                        {track.watermarkStatus === "done" ? "✓ Ready" : track.watermarkStatus === "error" ? "⚠ WM Error" : track.watermarkStatus === "processing" ? "⟳ Processing…" : "⏳ Pending"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{track.composerName ?? "Unknown"}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {[
                      ...(track.tags?.genres ?? []).map((v: string) => ({ type: "genre" as TagType, v })),
                      ...(track.tags?.moods ?? []).map((v: string) => ({ type: "mood" as TagType, v })),
                      ...(track.tags?.attributes ?? []).map((v: string) => ({ type: "attribute" as TagType, v })),
                    ].slice(0, 6).map((tag) => {
                      const clrMap: Record<TagType, string> = { genre: "bg-blue-100 text-blue-700", mood: "bg-purple-100 text-purple-700", attribute: "bg-amber-100 text-amber-700", hidden: "bg-slate-100 text-slate-600" };
                      const clr = clrMap[tag.type as TagType] ?? "";
                      return <span key={`${tag.type}-${tag.v}`} className={`text-[10px] px-1.5 py-0.5 rounded-full ${clr}`}>{tag.v}</span>;
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {(track.watermarkStatus === "error" || track.watermarkStatus === "pending") && (
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-amber-500 hover:text-amber-700"
                      title="Retry watermark generation"
                      onClick={() => retryWatermarkMutation.mutate({ id: track.id })}
                      disabled={retryWatermarkMutation.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(track)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { if (confirm(`Delete "${track.title}"?`)) deleteMutation.mutate({ id: track.id }); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Upload dialog ── */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Track</DialogTitle>
            <DialogDescription>Upload a WAV mixdown and optional stems, then fill in the metadata.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-5 mt-2">
            {/* File uploads */}
            <div className="grid grid-cols-2 gap-4">
              <DropZone label="WAV Mixdown" hint="*" accept=".wav,audio/wav" icon={FileAudio}
                file={wavFile} onFile={handleWavFile} />
              <DropZone label="Stems Folder" hint="(optional)" accept="audio/*" multiple icon={FolderOpen}
                files={stemsFiles} onFiles={setStemsFiles} />
            </div>

            {/* Cover art */}
            <DropZone label="Cover Art" hint="(optional, JPG/PNG)" accept="image/*" icon={Upload}
              file={coverFile} onFile={setCoverFile} />

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="composer">Composer</Label>
                <Input id="composer" value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bpm">BPM</Label>
                <Input id="bpm" type="number" min="1" max="300" value={form.bpm} onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="key">Key Signature</Label>
                <Input id="key" placeholder="e.g. C Major" value={form.keySignature} onChange={e => setForm(p => ({ ...p, keySignature: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <TagSection />

            {/* Published toggle */}
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.isPublished ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isPublished ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))}>
                {form.isPublished ? "Published (visible to users)" : "Draft (hidden)"}
              </Label>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowUploadDialog(false)} disabled={uploading}>Cancel</Button>
              <Button type="submit" disabled={uploading || !wavFile} className="gap-2">
                {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4" />Upload Track</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={editingTrack !== null} onOpenChange={(open) => !open && setEditingTrack(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Track</DialogTitle>
            <DialogDescription>Update the track metadata and tags.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Composer</Label>
                <Input value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>BPM</Label>
                <Input type="number" min="1" max="300" value={form.bpm} onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Key Signature</Label>
                <Input placeholder="e.g. C Major" value={form.keySignature} onChange={e => setForm(p => ({ ...p, keySignature: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>

            <TagSection />

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.isPublished ? "bg-primary" : "bg-muted"}`}>
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.isPublished ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
              <Label className="cursor-pointer" onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))}>
                {form.isPublished ? "Published" : "Draft"}
              </Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingTrack(null)}>Cancel</Button>
              <Button type="submit" disabled={updateMutation.isPending} className="gap-2">
                {updateMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Saving…</> : <><Check className="h-4 w-4" />Save Changes</>}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Duplicate name alert */}
      <AlertDialog open={duplicateAlertMsg !== null} onOpenChange={(open) => { if (!open) setDuplicateAlertMsg(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Duplicate Track Name</AlertDialogTitle>
            <AlertDialogDescription>{duplicateAlertMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setDuplicateAlertMsg(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
