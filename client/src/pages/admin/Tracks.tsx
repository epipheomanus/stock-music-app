import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Music, Upload, Loader2, X, Check, FolderOpen, FileAudio, RefreshCw, Filter, ChevronDown, FileArchive, CheckCircle2, AlertCircle, SkipForward } from "lucide-react";
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
  // Sort & filter state — persisted to localStorage
  const LS_KEY = "admin-tracks-filters";
  function loadFilters() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as {
        search: string; sortBy: string; showFilters: boolean;
        filterComposer: string; filterDateFrom: string; filterDateTo: string;
        filterStems: string; filterWatermark: string;
        filterBpmMin: string; filterBpmMax: string;
        filterTag: string; filterCoverArt: string; filterPublished: string;
      };
    } catch { return null; }
  }
  const saved = loadFilters();
  const [search, setSearch] = useState(saved?.search ?? "");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "az" | "za" | "most_dl" | "least_dl">((saved?.sortBy as any) ?? "newest");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [showFilters, setShowFilters] = useState(saved?.showFilters ?? false);
  const [filterComposer, setFilterComposer] = useState(saved?.filterComposer ?? "");
  const [filterDateFrom, setFilterDateFrom] = useState(saved?.filterDateFrom ?? "");
  const [filterDateTo, setFilterDateTo] = useState(saved?.filterDateTo ?? "");
  const [filterStems, setFilterStems] = useState<"all" | "has" | "none">((saved?.filterStems as any) ?? "all");
  const [filterWatermark, setFilterWatermark] = useState<"all" | "done" | "pending" | "error" | "processing">((saved?.filterWatermark as any) ?? "all");
  const [filterBpmMin, setFilterBpmMin] = useState(saved?.filterBpmMin ?? "");
  const [filterBpmMax, setFilterBpmMax] = useState(saved?.filterBpmMax ?? "");
  const [filterTag, setFilterTag] = useState(saved?.filterTag ?? "");
  const [filterCoverArt, setFilterCoverArt] = useState<"all" | "has" | "missing">((saved?.filterCoverArt as any) ?? "all");
  const [filterPublished, setFilterPublished] = useState<"all" | "published" | "unpublished">((saved?.filterPublished as any) ?? "all");
  // Persist to localStorage whenever filter state changes
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({
      search, sortBy, showFilters, filterComposer, filterDateFrom, filterDateTo,
      filterStems, filterWatermark, filterBpmMin, filterBpmMax, filterTag, filterCoverArt, filterPublished,
    }));
  }, [search, sortBy, showFilters, filterComposer, filterDateFrom, filterDateTo,
      filterStems, filterWatermark, filterBpmMin, filterBpmMax, filterTag, filterCoverArt, filterPublished]);
  // Duplicate name alert
  const [duplicateAlertMsg, setDuplicateAlertMsg] = useState<string | null>(null);

  // Bulk import state
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [bulkZipFile, setBulkZipFile] = useState<File | null>(null);
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    total: number; ok: number; skipped: number; errors: number;
    results: { title: string; status: "ok"|"skipped"|"error"; error?: string; trackId?: number }[];
  } | null>(null);

  async function handleBulkImport() {
    if (!bulkZipFile) { toast.error("Please select a ZIP file"); return; }
    setBulkImporting(true);
    setBulkResults(null);
    try {
      const fd = new FormData();
      fd.append("zip", bulkZipFile);
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST", body: fd, credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setBulkResults(data);
      await utils.tracks.adminList.invalidate();
      await utils.tracks.filterOptions.invalidate();
      toast.success(`Imported ${data.ok} track${data.ok !== 1 ? "s" : ""}${data.errors > 0 ? `, ${data.errors} failed` : ""}`);
    } catch (err: any) {
      toast.error(err.message || "Bulk import failed");
    } finally {
      setBulkImporting(false);
    }
  }

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

  const regenerateAllPeaksMutation = trpc.tracks.regenerateAllPeaks.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Peak regeneration failed"),
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
    if (filterPublished === "published") result = result.filter(t => !!t.isPublished);
    if (filterPublished === "unpublished") result = result.filter(t => !t.isPublished);
    result.sort((a, b) => {
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "az") return a.title.localeCompare(b.title);
      if (sortBy === "za") return b.title.localeCompare(a.title);
      if (sortBy === "most_dl") return (b.downloadCount ?? 0) - (a.downloadCount ?? 0);
      if (sortBy === "least_dl") return (a.downloadCount ?? 0) - (b.downloadCount ?? 0);
      return 0;
    });
    return result;
  }, [tracks, search, sortBy, filterComposer, filterDateFrom, filterDateTo, filterStems, filterWatermark, filterBpmMin, filterBpmMax, filterTag, filterCoverArt, filterPublished]);
  const totalAdminPages = Math.max(1, Math.ceil(displayedTracks.length / perPage));
  const pagedAdminTracks = useMemo(() => displayedTracks.slice((page - 1) * perPage, page * perPage), [displayedTracks, page, perPage]);
  // Reset to page 1 when search or filters change
  useEffect(() => { setPage(1); }, [search, sortBy, filterComposer, filterDateFrom, filterDateTo, filterStems, filterWatermark, filterBpmMin, filterBpmMax, filterTag, filterCoverArt, filterPublished]);

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

  const presignUploadMutation = trpc.tracks.presignUpload.useMutation();
  const confirmUploadMutation = trpc.tracks.confirmUpload.useMutation();
  const generateWatermarkForTrack = trpc.tracks.generateWatermark.useMutation();

  function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!wavFile) { toast.error("Please select a WAV file"); return; }
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.composerName.trim()) { toast.error("Composer is required"); return; }

    // Capture values before closing the modal
    const trackTitle = form.title.trim();
    const capturedWav = wavFile;
    const capturedCover = coverFile;
    const capturedStems = [...stemsFiles];
    const capturedForm = { ...form };

    // Close the modal immediately so the admin can start the next track
    setShowUploadDialog(false);
    setForm(DEFAULT_FORM);
    setWavFile(null); setStemsFiles([]); setCoverFile(null);

    const toastId = toast.loading(`Uploading "${trackTitle}"…`);

    // Helper: upload a file directly to S3 via presigned URL
    async function uploadFileDirect(trackId: number, file: File, fileType: "wav" | "stems" | "cover") {
      const { uploadUrl, key, publicUrl } = await presignUploadMutation.mutateAsync({
        trackId,
        fileType,
        mimeType: file.type || "application/octet-stream",
        fileName: file.name,
      });
      const res = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`S3 upload failed (${res.status})`);
      return { key, publicUrl };
    }

    (async () => {
      try {
        // Step 1: create track metadata
        const { id: trackId } = await utils.client.tracks.create.mutate({
          title: capturedForm.title,
          composerName: capturedForm.composerName,
          description: capturedForm.description,
          bpm: capturedForm.bpm ? Number(capturedForm.bpm) : undefined,
          genres: capturedForm.genres,
          moods: capturedForm.moods,
          attributes: capturedForm.attributes,
          hiddenTags: capturedForm.hiddenTags,
        });

        // Step 2: upload WAV directly to S3
        toast.loading(`Uploading WAV for "${trackTitle}"…`, { id: toastId });
        const { key: wavKey, publicUrl: wavUrl } = await uploadFileDirect(trackId, capturedWav, "wav");
        await confirmUploadMutation.mutateAsync({ trackId, fileType: "wav", key: wavKey, publicUrl: wavUrl });

        // Step 3: upload cover art if provided
        if (capturedCover) {
          toast.loading(`Uploading cover art…`, { id: toastId });
          const { key: coverKey, publicUrl: coverUrl } = await uploadFileDirect(trackId, capturedCover, "cover");
          await confirmUploadMutation.mutateAsync({ trackId, fileType: "cover", key: coverKey, publicUrl: coverUrl });
        }

        // Step 4: upload stems if provided
        if (capturedStems.length > 0) {
          toast.loading(`Uploading stems…`, { id: toastId });
          // Combine multiple stems files into one upload (use first file if multiple)
          const stemsFile = capturedStems[0];
          const { key: stemsKey, publicUrl: stemsUrl } = await uploadFileDirect(trackId, stemsFile, "stems");
          await confirmUploadMutation.mutateAsync({ trackId, fileType: "stems", key: stemsKey, publicUrl: stemsUrl });
        }

        // Step 5: trigger watermark generation
        toast.loading(`Generating watermark for "${trackTitle}"…`, { id: toastId });
        await generateWatermarkForTrack.mutateAsync({ id: trackId });

        // Update published status if needed
        if (!capturedForm.isPublished) {
          await utils.client.tracks.update.mutate({ id: trackId, isPublished: false });
        }

        await utils.tracks.adminList.invalidate();
        await utils.tracks.filterOptions.invalidate();
        toast.success(`"${trackTitle}" uploaded! Watermark generating in background.`, { id: toastId });
      } catch (err: any) {
        if (err.message?.includes("already exists")) {
          toast.error(err.message, { id: toastId });
          setDuplicateAlertMsg(err.message);
        } else {
          toast.error(`Upload failed: ${err.message || "Unknown error"}`, { id: toastId });
        }
      }
    })();
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
            <Button
              variant="outline"
              className="gap-2 border-blue-300 text-blue-700 hover:bg-blue-50 hover:text-blue-800"
              onClick={() => regenerateAllPeaksMutation.mutate()}
              disabled={regenerateAllPeaksMutation.isPending}
              title="Regenerate waveform peaks for all tracks using RMS algorithm"
            >
              {regenerateAllPeaksMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Regen Peaks
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => { setBulkZipFile(null); setBulkResults(null); setShowBulkImport(true); }}
            >
              <FileArchive className="h-4 w-4" /> Bulk Import
            </Button>
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
              <SelectItem value="most_dl">Most Downloaded</SelectItem>
              <SelectItem value="least_dl">Least Downloaded</SelectItem>
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
            <div className="space-y-1">
              <Label className="text-xs">Published Status</Label>
              <Select value={filterPublished} onValueChange={(v) => setFilterPublished(v as any)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tracks</SelectItem>
                  <SelectItem value="published">Published Only</SelectItem>
                  <SelectItem value="unpublished">Unpublished Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-full flex justify-end">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => {
                setFilterComposer(""); setFilterDateFrom(""); setFilterDateTo("");
                setFilterStems("all"); setFilterWatermark("all"); setFilterBpmMin("");
                setFilterBpmMax(""); setFilterTag(""); setFilterCoverArt("all"); setFilterPublished("all");
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
            {pagedAdminTracks.map((track: any) => (
              <div key={track.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/60 bg-card hover:border-border transition-colors">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {track.coverArtUrl ? <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" /> : <Music className="h-4 w-4 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-sm">{track.title}</h3>
                    {!track.isPublished && <Badge variant="secondary" className="text-[10px]">Draft</Badge>}
                    {track.hasStems && <Badge variant="outline" className="text-[10px]">Stems</Badge>}
                    {(track.downloadCount ?? 0) > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium" title="Clean WAV downloads">
                        ↓ {track.downloadCount}
                      </span>
                    )}
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
        {displayedTracks.length > 0 && totalAdminPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Previous</Button>
            {Array.from({ length: totalAdminPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalAdminPages || Math.abs(p - page) <= 2)
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
            <Button variant="outline" size="sm" className="h-8 text-xs" disabled={page === totalAdminPages} onClick={() => setPage(p => Math.min(totalAdminPages, p + 1))}>Next</Button>
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
                <Label htmlFor="composer">Composer *</Label>
                <Input id="composer" value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} required />
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
              <Button type="button" variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={!wavFile} className="gap-2">
                <Upload className="h-4 w-4" />Upload Track
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
                <Label>Composer *</Label>
                <Input value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} required />
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
      {/* ── Bulk Import dialog ── */}
      <Dialog open={showBulkImport} onOpenChange={(open) => { if (!open) { setShowBulkImport(false); } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Import Tracks</DialogTitle>
            <DialogDescription>
              Upload a ZIP file containing a CSV metadata file and WAV audio files.
            </DialogDescription>
          </DialogHeader>

          {/* Instructions */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-4 text-xs space-y-2">
            <p className="font-semibold text-foreground">ZIP file structure:</p>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>One <code className="bg-muted px-1 rounded">tracks.csv</code> file with track metadata</li>
              <li>WAV audio files (named to match the CSV <code className="bg-muted px-1 rounded">File</code> column)</li>
            </ul>
            <p className="font-semibold text-foreground mt-2">CSV columns:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
              <span><code className="bg-muted px-1 rounded">Title</code> <span className="text-destructive">*</span></span>
              <span><code className="bg-muted px-1 rounded">File</code> (WAV filename)</span>
              <span><code className="bg-muted px-1 rounded">Composer</code></span>
              <span><code className="bg-muted px-1 rounded">Description</code></span>
              <span><code className="bg-muted px-1 rounded">BPM</code></span>
              <span><code className="bg-muted px-1 rounded">Key</code></span>
              <span><code className="bg-muted px-1 rounded">Genre</code></span>
              <span><code className="bg-muted px-1 rounded">Mood/Attributes</code></span>
              <span><code className="bg-muted px-1 rounded">Published</code> (true/false)</span>
            </div>
            <p className="text-muted-foreground mt-1">
              <span className="font-medium text-foreground">Mood/Attributes</span> values are auto-classified:
              moods (Chill, Happy…), attributes (Corporate, Cinematic…), or genres (Pop, Rock…).
              Unrecognized values become hidden tags.
            </p>
          </div>

          {/* ZIP file picker */}
          {!bulkResults && (
            <div className="space-y-4">
              <DropZone
                label="ZIP File" hint="* required" accept=".zip,application/zip"
                icon={FileArchive} file={bulkZipFile} onFile={setBulkZipFile}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkImport(false)} disabled={bulkImporting}>Cancel</Button>
                <Button onClick={handleBulkImport} disabled={bulkImporting || !bulkZipFile} className="gap-2">
                  {bulkImporting ? <><Loader2 className="h-4 w-4 animate-spin" />Importing…</> : <><Upload className="h-4 w-4" />Start Import</>}
                </Button>
              </DialogFooter>
            </div>
          )}

          {/* Results */}
          {bulkResults && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{bulkResults.ok}</p>
                  <p className="text-xs text-green-600">Imported</p>
                </div>
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{bulkResults.skipped}</p>
                  <p className="text-xs text-yellow-600">Skipped</p>
                </div>
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{bulkResults.errors}</p>
                  <p className="text-xs text-red-600">Errors</p>
                </div>
              </div>
              {/* Per-track list */}
              <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-border/60 p-2">
                {bulkResults.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-1 px-2 rounded hover:bg-muted/30">
                    {r.status === "ok" && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                    {r.status === "skipped" && <SkipForward className="h-3.5 w-3.5 text-yellow-500 shrink-0" />}
                    {r.status === "error" && <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                    <span className="flex-1 truncate font-medium">{r.title}</span>
                    {r.error && <span className="text-muted-foreground truncate max-w-[180px]" title={r.error}>{r.error}</span>}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setBulkZipFile(null); setBulkResults(null); }}>Import Another</Button>
                <Button onClick={() => setShowBulkImport(false)}>Done</Button>
              </DialogFooter>
            </div>
          )}
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
