import AdminLayout from "@/components/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Plus, Trash2, Pencil, Upload, Music2, Video, ExternalLink,
  ChevronUp, ChevronDown, Loader2, X
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";

type ItemType = "audio" | "video";
type GenreType = "audio" | "video";

// ─── Upload helpers ────────────────────────────────────────────────────────────
function normalizeContentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    mp3: "audio/mpeg", wav: "audio/wav",
    mp4: "video/mp4", mov: "video/quicktime",
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  };
  return (ext && map[ext]) ?? "application/octet-stream";
}

async function uploadFileToPresignedUrl(
  url: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  // Ensure url is a plain string (some environments wrap it in an object)
  const urlStr = typeof url === "string" ? url : (url as unknown as { url?: string; href?: string })?.url ?? (url as unknown as { href?: string })?.href ?? String(url);
  const contentType = normalizeContentType(file);

  // Use fetch (no progress) as the reliable fallback; XHR for progress tracking
  if (!onProgress) {
    const res = await fetch(urlStr, { method: "PUT", body: file, headers: { "Content-Type": contentType } });
    if (!res.ok) throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
    return;
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    try {
      xhr.open("PUT", urlStr);
    } catch {
      // XHR open failed (env restriction) — fall back to fetch without progress
      fetch(urlStr, { method: "PUT", body: file, headers: { "Content-Type": contentType } })
        .then(res => { if (!res.ok) throw new Error(`Upload failed: ${res.status}`); })
        .then(resolve)
        .catch(reject);
      return;
    }
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.timeout = 0;
    xhr.send(file);
  });
}

// ─── Add Item Dialog ───────────────────────────────────────────────────────────
function AddItemDialog({
  genreId,
  type,
  onClose,
  onAdded,
}: {
  genreId: number;
  type: ItemType;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [mediaDragging, setMediaDragging] = useState(false);
  const [thumbDragging, setThumbDragging] = useState(false);
  const mediaRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);

  function handleMediaDrop(e: React.DragEvent) {
    e.preventDefault();
    setMediaDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const isAudio = type === "audio" && (file.type.startsWith("audio/") || /\.(mp3|wav)$/i.test(file.name));
    const isVideo = type === "video" && (file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name));
    if (isAudio || isVideo) setMediaFile(file);
    else toast.error(`Please drop a ${type === "audio" ? "MP3 or WAV" : "MP4 or MOV"} file`);
  }

  function handleThumbDrop(e: React.DragEvent) {
    e.preventDefault();
    setThumbDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (file.type.startsWith("image/")) setThumbFile(file);
    else toast.error("Please drop an image file (JPG, PNG, WebP)");
  }

  const getUploadUrl = trpc.portfolio.getUploadUrl.useMutation();
  const addItem = trpc.portfolio.addItem.useMutation();
  const utils = trpc.useUtils();

  const acceptMedia = type === "audio" ? ".mp3,.wav,audio/*" : ".mp4,.mov,video/*";

  async function handleSubmit() {
    if (!mediaFile) { toast.error("Please select a file to upload"); return; }
    setUploading(true);
    try {
      // 1. Get presigned URL for media file
      const mediaUpload = await getUploadUrl.mutateAsync({
        filename: mediaFile.name,
        contentType: mediaFile.type,
        type,
      });
      // 2. Upload media to S3
      const mediaUploadTyped = mediaUpload as unknown as { uploadUrl: string; key: string; publicUrl: string };
      await uploadFileToPresignedUrl(mediaUploadTyped.uploadUrl, mediaFile, setUploadProgress);
      const fileUrl = mediaUploadTyped.publicUrl || `/manus-storage/${mediaUpload.key}`;

      // 3. Optionally upload thumbnail
      let thumbnailKey: string | undefined;
      let thumbnailUrl: string | undefined;
      if (thumbFile) {
        const thumbUpload = await getUploadUrl.mutateAsync({
          filename: thumbFile.name,
          contentType: thumbFile.type,
          type: "thumbnail",
        });
        const thumbUploadTyped = thumbUpload as unknown as { uploadUrl: string; key: string; publicUrl: string };
        await uploadFileToPresignedUrl(thumbUploadTyped.uploadUrl, thumbFile);
        thumbnailKey = thumbUpload.key;
        thumbnailUrl = thumbUploadTyped.publicUrl || `/manus-storage/${thumbUpload.key}`;
      }

      // 4. Save item record (server generates waveform peaks for audio)
      await addItem.mutateAsync({
        genreId,
        type,
        title: title || undefined,
        description: description || undefined,
        fileKey: mediaUpload.key,
        fileUrl,
        thumbnailKey,
        thumbnailUrl,
      });

      toast.success(`${type === "audio" ? "Audio" : "Video"} item added`);
      utils.portfolio.getAll.invalidate();
      onAdded();
      onClose();
    } catch (err: unknown) {
      toast.error(`Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add {type === "audio" ? "Audio" : "Video"} Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Media file */}
          <div className="space-y-1.5">
            <Label>{type === "audio" ? "Audio File" : "Video File"} <span className="text-destructive">*</span></Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                mediaDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onClick={() => mediaRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setMediaDragging(true); }}
              onDragLeave={() => setMediaDragging(false)}
              onDrop={handleMediaDrop}
            >
              {mediaFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  {type === "audio" ? <Music2 className="h-4 w-4 text-primary" /> : <Video className="h-4 w-4 text-primary" />}
                  <span className="font-medium truncate max-w-xs">{mediaFile.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setMediaFile(null); }} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  {mediaDragging ? "Drop file here" : `Drag & drop or click to select ${type === "audio" ? "MP3 or WAV" : "MP4 or MOV"}`}
                </div>
              )}
            </div>
            <input ref={mediaRef} type="file" accept={acceptMedia} className="hidden"
              onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Thumbnail (video always shown, audio optional) */}
          <div className="space-y-1.5">
            <Label>Thumbnail Image {type === "video" ? <span className="text-muted-foreground text-xs">(recommended)</span> : <span className="text-muted-foreground text-xs">(optional)</span>}</Label>
            <div
              className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                thumbDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
              onClick={() => thumbRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setThumbDragging(true); }}
              onDragLeave={() => setThumbDragging(false)}
              onDrop={handleThumbDrop}
            >
              {thumbFile ? (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <img src={URL.createObjectURL(thumbFile)} alt="" className="h-10 w-16 object-cover rounded" />
                  <span className="font-medium truncate max-w-xs">{thumbFile.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); setThumbFile(null); }} className="text-muted-foreground hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  <Upload className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  {thumbDragging ? "Drop image here" : "Drag & drop or click to select image (JPG, PNG, WebP)"}
                </div>
              )}
            </div>
            <input ref={thumbRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => setThumbFile(e.target.files?.[0] ?? null)} />
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Title <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Corporate Upbeat" />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description shown on the portfolio page" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={uploading}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={uploading || !mediaFile}>
            {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{uploadProgress > 0 && uploadProgress < 100 ? `Uploading ${uploadProgress}%…` : "Uploading…"}</> : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Genre Card ────────────────────────────────────────────────────────────────
function GenreCard({
  genre,
  items,
  onRefresh,
}: {
  genre: { id: number; name: string; type: string };
  items: Array<{
    id: number; title: string | null; description: string | null;
    fileUrl: string; thumbnailUrl: string | null; type: string; sortOrder: number;
  }>;
  onRefresh: () => void;
}) {
  const [addingItem, setAddingItem] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState(genre.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const utils = trpc.useUtils();
  const updateGenre = trpc.portfolio.updateGenre.useMutation({
    onSuccess: () => { utils.portfolio.getAll.invalidate(); setEditingName(false); },
  });
  const deleteGenre = trpc.portfolio.deleteGenre.useMutation({
    onSuccess: () => { utils.portfolio.getAll.invalidate(); toast.success("Genre deleted"); },
  });
  const deleteItem = trpc.portfolio.deleteItem.useMutation({
    onSuccess: () => { utils.portfolio.getAll.invalidate(); toast.success("Item removed"); },
  });
  const reorderItems = trpc.portfolio.reorderItems.useMutation({
    onSuccess: () => utils.portfolio.getAll.invalidate(),
  });

  function moveItem(itemId: number, direction: "up" | "down") {
    const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((i) => i.id === itemId);
    if (direction === "up" && idx === 0) return;
    if (direction === "down" && idx === sorted.length - 1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    const newOrder = sorted.map((item, i) => {
      if (i === idx) return { id: item.id, sortOrder: sorted[swapIdx].sortOrder };
      if (i === swapIdx) return { id: item.id, sortOrder: sorted[idx].sortOrder };
      return { id: item.id, sortOrder: item.sortOrder };
    });
    reorderItems.mutate({ items: newOrder });
  }

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder);
  const isAudio = genre.type === "audio";

  return (
    <Card className="border border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Badge variant={isAudio ? "default" : "secondary"} className="shrink-0 text-xs">
              {isAudio ? <Music2 className="h-3 w-3 mr-1" /> : <Video className="h-3 w-3 mr-1" />}
              {isAudio ? "Audio" : "Video"}
            </Badge>
            {editingName ? (
              <div className="flex items-center gap-1.5 flex-1">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="h-7 text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateGenre.mutate({ id: genre.id, name: newName });
                    if (e.key === "Escape") { setEditingName(false); setNewName(genre.name); }
                  }}
                />
                <Button size="sm" className="h-7 px-2" onClick={() => updateGenre.mutate({ id: genre.id, name: newName })}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setEditingName(false); setNewName(genre.name); }}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <CardTitle className="text-base truncate">{genre.name}</CardTitle>
            )}
          </div>
          {!confirmDelete && (
            <div className="flex items-center gap-1 shrink-0">
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingName(true)} title="Rename genre">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive" onClick={() => setConfirmDelete(true)} title="Delete genre">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {confirmDelete && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-destructive">Delete genre + all items?</span>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="destructive" className="h-6 px-2 text-xs"
                onClick={() => deleteGenre.mutate({ id: genre.id })}>Yes</Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs"
                onClick={() => setConfirmDelete(false)}>No</Button>
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        {sortedItems.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-3">No items yet. Add one below.</p>
        )}

        {sortedItems.map((item, idx) => (
          <div key={item.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 border border-border/30 group">
            {/* Thumbnail / icon */}
            {item.thumbnailUrl ? (
              <img src={item.thumbnailUrl} alt="" className="h-10 w-16 object-cover rounded shrink-0" />
            ) : (
              <div className="h-10 w-16 rounded bg-muted flex items-center justify-center shrink-0">
                {isAudio ? <Music2 className="h-4 w-4 text-muted-foreground" /> : <Video className="h-4 w-4 text-muted-foreground" />}
              </div>
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{item.title || <span className="text-muted-foreground italic">Untitled</span>}</p>
              {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <a href={item.fileUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Preview file">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </a>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === 0}
                onClick={() => moveItem(item.id, "up")} title="Move up">
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={idx === sortedItems.length - 1}
                onClick={() => moveItem(item.id, "down")} title="Move down">
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-destructive"
                onClick={() => deleteItem.mutate({ id: item.id })} title="Remove item">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}

        <Button
          size="sm"
          variant="outline"
          className="w-full mt-1 border-dashed"
          onClick={() => setAddingItem(true)}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add {isAudio ? "Audio" : "Video"} Item
        </Button>
      </CardContent>

      {addingItem && (
        <AddItemDialog
          genreId={genre.id}
          type={genre.type as ItemType}
          onClose={() => setAddingItem(false)}
          onAdded={onRefresh}
        />
      )}
    </Card>
  );
}

// ─── Create Genre Dialog ───────────────────────────────────────────────────────
function CreateGenreDialog({
  type,
  onClose,
}: {
  type: GenreType;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const utils = trpc.useUtils();
  const createGenre = trpc.portfolio.createGenre.useMutation({
    onSuccess: () => {
      utils.portfolio.getAll.invalidate();
      toast.success(`${type === "audio" ? "Audio" : "Video"} genre created`);
      onClose();
    },
    onError: (err) => toast.error(`Failed to create genre: ${err.message}`),
  });

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { toast.error("Please enter a genre name"); return; }
    createGenre.mutate({ name: trimmed, type });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New {type === "audio" ? "Audio" : "Video"} Genre</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label className="mb-1.5 block">Genre Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Corporate, Cinematic, Upbeat…"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || createGenre.isPending}
          >
            {createGenre.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminPortfolio() {
  const [creatingGenre, setCreatingGenre] = useState<GenreType | null>(null);
  const { data, isLoading, refetch } = trpc.portfolio.getAll.useQuery();

  const audioGenres = (data?.genres ?? []).filter((g) => g.type === "audio").sort((a, b) => a.sortOrder - b.sortOrder);
  const videoGenres = (data?.genres ?? []).filter((g) => g.type === "video").sort((a, b) => a.sortOrder - b.sortOrder);
  type PortfolioItem = NonNullable<typeof data>["items"][number];
  const itemsByGenre = (data?.items ?? []).reduce<Record<number, PortfolioItem[]>>((acc, item) => {
    if (!acc[item.genreId]) acc[item.genreId] = [];
    acc[item.genreId].push(item);
    return acc;
  }, {});

  return (
    <AdminLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-10">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold font-display">Portfolio</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage audio and video examples shown on the public portfolio page.
            </p>
            <a
              href="/portfolio"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline mt-2"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View portfolio page
            </a>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Audio Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Music2 className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold font-display">Audio Genres</h2>
              <Badge variant="outline" className="text-xs">{audioGenres.length}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreatingGenre("audio")}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Audio Genre
            </Button>
          </div>
          {audioGenres.length === 0 && !isLoading && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
              <Music2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No audio genres yet. Create one to get started.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {audioGenres.map((genre) => (
              <GenreCard
                key={genre.id}
                genre={genre}
                items={itemsByGenre[genre.id] ?? []}
                onRefresh={refetch}
              />
            ))}
          </div>
        </section>

        {/* Video Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Video className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold font-display">Video Genres</h2>
              <Badge variant="outline" className="text-xs">{videoGenres.length}</Badge>
            </div>
            <Button size="sm" variant="outline" onClick={() => setCreatingGenre("video")}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              New Video Genre
            </Button>
          </div>
          {videoGenres.length === 0 && !isLoading && (
            <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-muted-foreground">
              <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No video genres yet. Create one to get started.</p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {videoGenres.map((genre) => (
              <GenreCard
                key={genre.id}
                genre={genre}
                items={itemsByGenre[genre.id] ?? []}
                onRefresh={refetch}
              />
            ))}
          </div>
        </section>
      </div>

      {creatingGenre && (
        <CreateGenreDialog
          type={creatingGenre}
          onClose={() => setCreatingGenre(null)}
        />
      )}
    </AdminLayout>
  );
}
