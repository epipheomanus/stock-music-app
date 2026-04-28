import { useState, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Plus, Pencil, Trash2, Music, Upload, Loader2, X, Check, FolderOpen, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type TagType = "genre" | "mood" | "attribute";

interface TrackFormData {
  title: string;
  composerName: string;
  description: string;
  bpm: string;
  keySignature: string;
  tags: { type: TagType; value: string }[];
  isPublished: boolean;
}

const DEFAULT_FORM: TrackFormData = {
  title: "", composerName: "", description: "", bpm: "", keySignature: "",
  tags: [], isPublished: true,
};

export default function AdminTracks() {
  const utils = trpc.useUtils();
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [editingTrack, setEditingTrack] = useState<number | null>(null);
  const [form, setForm] = useState<TrackFormData>(DEFAULT_FORM);
  const [newTag, setNewTag] = useState({ type: "genre" as TagType, value: "" });
  const [wavFile, setWavFile] = useState<File | null>(null);
  const [stemsFiles, setStemsFiles] = useState<File[]>([]);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const wavRef = useRef<HTMLInputElement>(null);
  const stemsRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  const tracksQuery = trpc.tracks.adminList.useQuery();
  const tracks = tracksQuery.data ?? [];

  const deleteMutation = trpc.tracks.delete.useMutation({
    onSuccess: () => { utils.tracks.adminList.invalidate(); toast.success("Track deleted"); },
    onError: (err: { message?: string }) => toast.error(err.message || "Delete failed"),
  });

  const updateMutation = trpc.tracks.update.useMutation({
    onSuccess: () => {
      utils.tracks.adminList.invalidate();
      setEditingTrack(null);
      toast.success("Track updated");
    },
    onError: (err: { message?: string }) => toast.error(err.message || "Update failed"),
  });

  function addTag() {
    if (!newTag.value.trim()) return;
    const tag = { type: newTag.type, value: newTag.value.trim() };
    if (!form.tags.find(t => t.type === tag.type && t.value === tag.value)) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setNewTag(prev => ({ ...prev, value: "" }));
  }

  function removeTag(idx: number) {
    setForm(prev => ({ ...prev, tags: prev.tags.filter((_, i) => i !== idx) }));
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
      fd.append("tags", JSON.stringify(form.tags));
      fd.append("wav", wavFile);
      if (coverFile) fd.append("cover", coverFile);
      stemsFiles.forEach(f => fd.append("stems", f));

      const res = await fetch("/api/admin/upload-track", {
        method: "POST",
        body: fd,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }

      await utils.tracks.adminList.invalidate();
      toast.success("Track uploaded! Watermark is being generated in the background.");
      setShowUploadDialog(false);
      setForm(DEFAULT_FORM);
      setWavFile(null);
      setStemsFiles([]);
      setCoverFile(null);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
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
      tags: track.tags.map((t: any) => ({ type: t.type, value: t.value })),
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
      genres: form.tags.filter(t => t.type === "genre").map(t => t.value),
      moods: form.tags.filter(t => t.type === "mood").map(t => t.value),
      attributes: form.tags.filter(t => t.type === "attribute").map(t => t.value),
    });
  }

  const tagColors: Record<TagType, string> = {
    genre: "bg-blue-500/15 text-blue-400",
    mood: "bg-purple-500/15 text-purple-400",
    attribute: "bg-amber-500/15 text-amber-400",
  };

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold mb-1">Tracks</h1>
            <p className="text-sm text-muted-foreground">{tracks.length} track{tracks.length !== 1 ? "s" : ""} in library</p>
          </div>
          <Button onClick={() => { setForm(DEFAULT_FORM); setWavFile(null); setStemsFiles([]); setCoverFile(null); setShowUploadDialog(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Track
          </Button>
        </div>

        {/* Track list */}
        {tracksQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : tracks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Music className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No tracks yet. Add your first track.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map((track: any) => (
              <div key={track.id} className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-card/50 hover:border-border transition-colors">
                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  {track.coverArtUrl ? <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" /> : <Music className="h-4 w-4 text-muted-foreground/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-sm truncate">{track.title}</h3>
                    {!track.isPublished && <Badge variant="secondary" className="text-[10px]">Draft</Badge>}
                    {track.hasStems && <Badge variant="outline" className="text-[10px]">Stems</Badge>}
                    {track.watermarkStatus === "pending" && <Badge className="text-[10px] bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Watermarking…</Badge>}
                    {track.watermarkStatus === "done" && <Badge className="text-[10px] bg-green-500/20 text-green-400 border-green-500/30">Ready</Badge>}
                    {track.watermarkStatus === "error" && <Badge className="text-[10px] bg-red-500/20 text-red-400 border-red-500/30">WM Error</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{track.composerName ?? "Unknown"}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {track.tags.slice(0, 5).map((tag: any) => (
                      <span key={`${tag.type}-${tag.value}`} className={`text-[10px] px-1.5 py-0.5 rounded-full ${tagColors[tag.type as TagType]}`}>{tag.value}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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

      {/* Upload dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Track</DialogTitle>
            <DialogDescription>Upload a WAV file and fill in the track metadata to add it to the library.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUpload} className="space-y-5 mt-2">
            {/* File uploads */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>WAV Mixdown *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${wavFile ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80"}`}
                  onClick={() => wavRef.current?.click()}
                >
                  <input ref={wavRef} type="file" accept=".wav,audio/wav" className="hidden" onChange={e => setWavFile(e.target.files?.[0] ?? null)} />
                  {wavFile ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FileAudio className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary truncate max-w-[120px]">{wavFile.name}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <Upload className="h-6 w-6 mx-auto mb-1 opacity-40" />
                      <p className="text-xs">Click to select WAV</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Stems Folder <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${stemsFiles.length > 0 ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80"}`}
                  onClick={() => stemsRef.current?.click()}
                >
                  <input ref={stemsRef} type="file" accept="audio/*" multiple className="hidden" onChange={e => setStemsFiles(Array.from(e.target.files ?? []))} />
                  {stemsFiles.length > 0 ? (
                    <div className="flex items-center gap-2 justify-center">
                      <FolderOpen className="h-4 w-4 text-primary" />
                      <span className="text-xs font-medium text-primary">{stemsFiles.length} file{stemsFiles.length > 1 ? "s" : ""}</span>
                    </div>
                  ) : (
                    <div className="text-muted-foreground">
                      <FolderOpen className="h-6 w-6 mx-auto mb-1 opacity-40" />
                      <p className="text-xs">Click to select stems</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cover art */}
            <div className="space-y-2">
              <Label>Cover Art <span className="text-muted-foreground text-xs">(optional, JPG/PNG)</span></Label>
              <div className="flex items-center gap-3">
                <div
                  className={`w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors overflow-hidden ${coverFile ? "border-primary/50" : "border-border hover:border-border/80"}`}
                  onClick={() => coverRef.current?.click()}
                >
                  <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={e => setCoverFile(e.target.files?.[0] ?? null)} />
                  {coverFile ? (
                    <img src={URL.createObjectURL(coverFile)} alt="Cover" className="w-full h-full object-cover" />
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground/40" />
                  )}
                </div>
                {coverFile && (
                  <div>
                    <p className="text-xs font-medium">{coverFile.name}</p>
                    <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-muted-foreground p-0 mt-0.5" onClick={() => setCoverFile(null)}>Remove</Button>
                  </div>
                )}
              </div>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input id="title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required className="bg-card border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="composer">Composer</Label>
                <Input id="composer" value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} className="bg-card border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bpm">BPM</Label>
                <Input id="bpm" type="number" min="1" max="300" value={form.bpm} onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))} className="bg-card border-border" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="key">Key Signature</Label>
                <Input id="key" placeholder="e.g. C Major" value={form.keySignature} onChange={e => setForm(p => ({ ...p, keySignature: e.target.value }))} className="bg-card border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input id="description" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="bg-card border-border" />
            </div>

            {/* Tags */}
            <div className="space-y-3">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <select
                  value={newTag.type}
                  onChange={e => setNewTag(p => ({ ...p, type: e.target.value as TagType }))}
                  className="text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground"
                >
                  <option value="genre">Genre</option>
                  <option value="mood">Mood</option>
                  <option value="attribute">Attribute</option>
                </select>
                <Input
                  placeholder="Tag value…"
                  value={newTag.value}
                  onChange={e => setNewTag(p => ({ ...p, value: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  className="bg-card border-border flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((tag, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tagColors[tag.type]}`}>
                      <span className="opacity-60 text-[10px]">{tag.type}:</span> {tag.value}
                      <button type="button" onClick={() => removeTag(i)} className="opacity-60 hover:opacity-100">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Published toggle */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))}
                className={`w-10 h-5 rounded-full transition-colors relative ${form.isPublished ? "bg-primary" : "bg-muted"}`}
              >
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

      {/* Edit dialog */}
      <Dialog open={editingTrack !== null} onOpenChange={(open) => !open && setEditingTrack(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Track</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdate} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} required className="bg-card border-border" />
              </div>
              <div className="space-y-2">
                <Label>Composer</Label>
                <Input value={form.composerName} onChange={e => setForm(p => ({ ...p, composerName: e.target.value }))} className="bg-card border-border" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>BPM</Label>
                <Input type="number" min="1" max="300" value={form.bpm} onChange={e => setForm(p => ({ ...p, bpm: e.target.value }))} className="bg-card border-border" />
              </div>
              <div className="space-y-2">
                <Label>Key Signature</Label>
                <Input placeholder="e.g. C Major" value={form.keySignature} onChange={e => setForm(p => ({ ...p, keySignature: e.target.value }))} className="bg-card border-border" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="bg-card border-border" />
            </div>
            <div className="space-y-3">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <select value={newTag.type} onChange={e => setNewTag(p => ({ ...p, type: e.target.value as TagType }))} className="text-sm bg-card border border-border rounded-md px-2 py-1.5 text-foreground">
                  <option value="genre">Genre</option>
                  <option value="mood">Mood</option>
                  <option value="attribute">Attribute</option>
                </select>
                <Input placeholder="Tag value…" value={newTag.value} onChange={e => setNewTag(p => ({ ...p, value: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} className="bg-card border-border flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addTag}>Add</Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.tags.map((tag, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${tagColors[tag.type]}`}>
                      <span className="opacity-60 text-[10px]">{tag.type}:</span> {tag.value}
                      <button type="button" onClick={() => removeTag(i)} className="opacity-60 hover:opacity-100"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setForm(p => ({ ...p, isPublished: !p.isPublished }))} className={`w-10 h-5 rounded-full transition-colors relative ${form.isPublished ? "bg-primary" : "bg-muted"}`}>
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
    </AdminLayout>
  );
}
