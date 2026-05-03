import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, Music, Link2, Check, Pencil, ArrowLeft, Play, ListMusic, ShoppingCart, GripVertical } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { usePlayer, GlobalTrack } from "@/contexts/PlayerContext";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ProjectDetailProps {
  params: { id: string };
}

// ─── Sortable track row ────────────────────────────────────────────────────────
function SortableTrackRow({
  pt, idx, playlistId, user,
  onPlay, onAddToCart, onRemove,
}: {
  pt: any; idx: number; playlistId: number; user: any;
  onPlay: (track: any) => void;
  onAddToCart: (trackId: number) => void;
  onRemove: (playlistId: number, trackId: number) => void;
}) {
  const track = pt.track ?? pt;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pt.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group bg-card"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground transition-colors touch-none shrink-0"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{idx + 1}</span>
      <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
        {track.coverArtUrl
          ? <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
          : <Music className="h-3.5 w-3.5 text-muted-foreground/40" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{track.title}</p>
        <p className="text-xs text-muted-foreground truncate">{track.composerName ?? "Unknown Composer"}</p>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
        title="Play track"
        onClick={() => onPlay(track)}
      >
        <Play className="h-3.5 w-3.5" />
      </button>
      {user && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary"
          title="Add to cart"
          onClick={() => onAddToCart(track.id)}
        >
          <ShoppingCart className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive"
        title="Remove from playlist"
        onClick={() => onRemove(playlistId, track.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export default function ProjectDetail({ params }: ProjectDetailProps) {
  const projectId = parseInt(params.id, 10);
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const { setActiveTrack, setQueue } = usePlayer();

  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [editingPlaylistId, setEditingPlaylistId] = useState<number | null>(null);
  const [editingPlaylistName, setEditingPlaylistName] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  // Local optimistic track order per playlist: playlistId -> pt[]
  const [localOrders, setLocalOrders] = useState<Record<number, any[]>>({});
  const { openCart } = useCart();

  const addToCartMutation = trpc.cart.add.useMutation({
    onSuccess: () => { utils.cart.list.invalidate(); openCart(); },
    onError: (err) => toast.error(err.message || "Failed to add to cart"),
  });

  const projectQuery = trpc.projects.getById.useQuery(
    { id: projectId },
    { enabled: !!user && !isNaN(projectId) }
  );
  const project = projectQuery.data?.project;
  const playlists = projectQuery.data?.playlists ?? [];

  const createPlaylistMutation = trpc.projects.createPlaylist.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId });
      toast.success("Playlist created");
      setShowNewPlaylist(false);
      setNewPlaylistName("");
    },
    onError: (err) => toast.error(err.message || "Failed to create playlist"),
  });

  const renamePlaylistMutation = trpc.projects.renamePlaylist.useMutation({
    onSuccess: () => {
      utils.projects.getById.invalidate({ id: projectId });
      setEditingPlaylistId(null);
    },
    onError: (err) => toast.error(err.message || "Failed to rename"),
  });

  const deletePlaylistMutation = trpc.projects.deletePlaylist.useMutation({
    onSuccess: () => { utils.projects.getById.invalidate({ id: projectId }); toast.success("Playlist deleted"); },
    onError: (err) => toast.error(err.message || "Failed to delete playlist"),
  });

  const removeTrackMutation = trpc.projects.removeTrack.useMutation({
    onSuccess: () => utils.projects.getById.invalidate({ id: projectId }),
    onError: (err) => toast.error(err.message || "Failed to remove track"),
  });

  const reorderTracksMutation = trpc.projects.reorderTracks.useMutation({
    onError: (err) => { toast.error("Failed to save order"); utils.projects.getById.invalidate({ id: projectId }); },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function getPlaylistTracks(playlist: any): any[] {
    return localOrders[playlist.id] ?? playlist.tracks ?? [];
  }

  function handleDragEnd(event: DragEndEvent, playlistId: number, currentTracks: any[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = currentTracks.findIndex(pt => pt.id === active.id);
    const newIdx = currentTracks.findIndex(pt => pt.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const reordered = arrayMove(currentTracks, oldIdx, newIdx);
    setLocalOrders(prev => ({ ...prev, [playlistId]: reordered }));
    reorderTracksMutation.mutate({ playlistId, orderedIds: reordered.map(pt => pt.id) });
  }

  function copyShareLink() {
    if (!project) return;
    const url = `${window.location.origin}/shared/${project.shareToken}`;
    navigator.clipboard.writeText(url).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
      toast.success("Share link copied to clipboard");
    });
  }

  function playAll(playlistItems: any[]) {
    if (!playlistItems.length) return;
    const queue: GlobalTrack[] = playlistItems.map(pt => {
      const t = pt.track ?? pt;
      return {
        id: t.id, title: t.title, composerName: t.composerName ?? null,
        durationSeconds: t.durationSeconds ?? null, coverArtUrl: t.coverArtUrl ?? null,
        watermarkedMp3Url: t.watermarkedMp3Url ?? null, wavUrl: t.wavUrl ?? null,
        hasStems: t.hasStems ?? false, watermarkStatus: t.watermarkStatus ?? "pending",
        tags: t.tags ?? { genres: [], moods: [], attributes: [] },
      };
    });
    setQueue(queue, 0);
  }

  function handlePlay(track: any) {
    setActiveTrack({
      id: track.id, title: track.title, composerName: track.composerName ?? null,
      durationSeconds: track.durationSeconds ?? null, coverArtUrl: track.coverArtUrl ?? null,
      watermarkedMp3Url: track.watermarkedMp3Url ?? null, wavUrl: track.wavUrl ?? null,
      hasStems: track.hasStems ?? false, watermarkStatus: track.watermarkStatus ?? "pending",
      tags: track.tags ?? { genres: [], moods: [], attributes: [] },
    });
  }

  if (projectQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <p className="text-muted-foreground">Project not found.</p>
          <Link href="/projects"><Button variant="outline">Back to Projects</Button></Link>
        </div>
      </div>
    );
  }

  const totalTracks = playlists.reduce((sum: number, pl: any) => sum + (pl.tracks?.length ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
        {/* Back + Header */}
        <div className="mb-8">
          <Link href="/projects">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Back to Projects
            </button>
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                {project.status === "archived" && <Badge variant="secondary">Archived</Badge>}
              </div>
              {project.description && <p className="text-muted-foreground mt-1 text-sm">{project.description}</p>}
              <p className="text-xs text-muted-foreground/60 mt-1">{playlists.length} playlist{playlists.length !== 1 ? "s" : ""} · {totalTracks} track{totalTracks !== 1 ? "s" : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={copyShareLink}>
                {linkCopied ? <Check className="h-4 w-4 text-green-500" /> : <Link2 className="h-4 w-4" />}
                {linkCopied ? "Copied!" : "Share Link"}
              </Button>
              {project.status === "active" && (
                <Button size="sm" className="gap-2" onClick={() => setShowNewPlaylist(true)}>
                  <Plus className="h-4 w-4" /> New Playlist
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Playlists */}
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-border rounded-2xl">
            <ListMusic className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No playlists yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Create a playlist and add tracks from the Browse page.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {playlists.map((playlist: any) => {
              const tracks = getPlaylistTracks(playlist);
              return (
                <div key={playlist.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                  {/* Playlist header */}
                  <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/40">
                    {editingPlaylistId === playlist.id ? (
                      <form className="flex items-center gap-2 flex-1" onSubmit={e => { e.preventDefault(); renamePlaylistMutation.mutate({ playlistId: playlist.id, name: editingPlaylistName }); }}>
                        <Input value={editingPlaylistName} onChange={e => setEditingPlaylistName(e.target.value)} className="h-8 text-sm flex-1" autoFocus />
                        <Button type="submit" size="sm" className="h-8 gap-1"><Check className="h-3.5 w-3.5" />Save</Button>
                        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setEditingPlaylistId(null)}>Cancel</Button>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{playlist.name}</h3>
                        <span className="text-xs text-muted-foreground shrink-0">{tracks.length} track{tracks.length !== 1 ? "s" : ""}</span>
                      </div>
                    )}
                    {editingPlaylistId !== playlist.id && (
                      <div className="flex items-center gap-1 shrink-0">
                        {tracks.length > 0 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Play all" onClick={() => playAll(tracks)}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Rename playlist" onClick={() => { setEditingPlaylistId(playlist.id); setEditingPlaylistName(playlist.name); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete playlist" onClick={() => { if (confirm(`Delete playlist "${playlist.name}"?`)) deletePlaylistMutation.mutate({ playlistId: playlist.id }); }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {/* Track list */}
                  {tracks.length === 0 ? (
                    <div className="px-5 py-8 text-center text-sm text-muted-foreground/60">
                      No tracks yet — add tracks from the <Link href="/browse" className="underline underline-offset-2 hover:text-foreground">Browse page</Link>.
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleDragEnd(event, playlist.id, tracks)}
                    >
                      <SortableContext items={tracks.map((pt: any) => pt.id)} strategy={verticalListSortingStrategy}>
                        <div className="divide-y divide-border/30">
                          {tracks.map((pt: any, idx: number) => (
                            <SortableTrackRow
                              key={pt.id}
                              pt={pt}
                              idx={idx}
                              playlistId={playlist.id}
                              user={user}
                              onPlay={handlePlay}
                              onAddToCart={(trackId) => addToCartMutation.mutate({ trackId })}
                              onRemove={(plId, trackId) => removeTrackMutation.mutate({ playlistId: plId, trackId })}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* New playlist dialog */}
      <Dialog open={showNewPlaylist} onOpenChange={setShowNewPlaylist}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Playlist</DialogTitle>
            <DialogDescription>Name this playlist — e.g. "Option A", "Upbeat Tracks", "Final Picks".</DialogDescription>
          </DialogHeader>
          <form onSubmit={e => { e.preventDefault(); if (newPlaylistName.trim()) createPlaylistMutation.mutate({ projectId, name: newPlaylistName.trim() }); }} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Playlist Name *</Label>
              <Input value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)} placeholder="e.g. Option A" required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowNewPlaylist(false)}>Cancel</Button>
              <Button type="submit" disabled={!newPlaylistName.trim() || createPlaylistMutation.isPending} className="gap-2">
                {createPlaylistMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
