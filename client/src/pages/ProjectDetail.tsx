import { useState } from "react";
import { trpc } from "@/lib/trpc";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Share2, Music, ChevronLeft, Pencil, X, ListMusic, Archive,
} from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { usePlayer } from "@/contexts/PlayerContext";
import { Badge } from "@/components/ui/badge";

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = parseInt(id, 10);
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();

  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeletePlaylistId, setConfirmDeletePlaylistId] = useState<number | null>(null);
  const [confirmDeleteTrackInfo, setConfirmDeleteTrackInfo] = useState<{ playlistId: number; trackId: number; title: string } | null>(null);

  const projectsQuery = trpc.projects.list.useQuery();
  const project = (projectsQuery.data ?? []).find((p: any) => p.id === projectId);

  const playlistsQuery = trpc.projects.getPlaylists.useQuery(
    { projectId },
    { enabled: !isNaN(projectId) }
  );
  const playlists = playlistsQuery.data ?? [];

  const createPlaylistMutation = trpc.projects.createPlaylist.useMutation({
    onSuccess: () => {
      utils.projects.getPlaylists.invalidate({ projectId });
      setShowNewPlaylist(false);
      setNewPlaylistName("");
      toast.success("Playlist created");
    },
    onError: (err) => toast.error(err.message || "Failed to create playlist"),
  });

  const renamePlaylistMutation = trpc.projects.renamePlaylist.useMutation({
    onSuccess: () => {
      utils.projects.getPlaylists.invalidate({ projectId });
      setRenamingId(null);
      toast.success("Playlist renamed");
    },
    onError: (err) => toast.error(err.message || "Failed to rename"),
  });

  const deletePlaylistMutation = trpc.projects.deletePlaylist.useMutation({
    onSuccess: () => {
      utils.projects.getPlaylists.invalidate({ projectId });
      setConfirmDeletePlaylistId(null);
      toast.success("Playlist deleted");
    },
    onError: (err) => toast.error(err.message || "Failed to delete playlist"),
  });

  const removeTrackMutation = trpc.projects.removeTrack.useMutation({
    onSuccess: () => {
      utils.projects.getPlaylists.invalidate({ projectId });
      setConfirmDeleteTrackInfo(null);
      toast.success("Track removed from playlist");
    },
    onError: (err) => toast.error(err.message || "Failed to remove track"),
  });

  const updateProjectMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      toast.success("Project archived");
      navigate("/projects");
    },
    onError: (err) => toast.error(err.message || "Failed to archive project"),
  });

  const { setActiveTrack } = usePlayer();

  function copyShareLink() {
    if (!project) return;
    const url = `${window.location.origin}/shared/${project.shareToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  }

  if (projectsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 py-10 text-center">
          <p className="text-muted-foreground">Project not found.</p>
          <Link href="/projects">
            <Button variant="link" className="mt-2">Back to My Projects</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Back + header */}
        <div className="mb-8">
          <Link href="/projects">
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground mb-4 -ml-2">
              <ChevronLeft className="h-4 w-4" /> My Projects
            </Button>
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-3xl font-display font-semibold tracking-tight">{project.name}</h1>
                {project.status === "archived" && <Badge variant="secondary">Archived</Badge>}
              </div>
              {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={copyShareLink}>
                <Share2 className="h-3.5 w-3.5" /> Share
              </Button>
              {project.status === "active" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-muted-foreground"
                  onClick={() => updateProjectMutation.mutate({ id: projectId, status: "archived" })}
                >
                  <Archive className="h-3.5 w-3.5" /> Archive
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Playlists */}
        {playlistsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {playlists.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-center border-2 border-dashed border-border rounded-2xl mb-6">
                <ListMusic className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="font-medium mb-1">No playlists yet</p>
                <p className="text-sm text-muted-foreground mb-4">Create a playlist to start adding track ideas.</p>
                <Button size="sm" className="gap-2" onClick={() => setShowNewPlaylist(true)}>
                  <Plus className="h-4 w-4" /> Create playlist
                </Button>
              </div>
            ) : (
              <div className="space-y-6 mb-6">
                {playlists.map((pl: any) => (
                  <div key={pl.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                    {/* Playlist header */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/30">
                      <ListMusic className="h-4 w-4 text-muted-foreground shrink-0" />
                      {renamingId === pl.id ? (
                        <form
                          className="flex items-center gap-2 flex-1"
                          onSubmit={e => { e.preventDefault(); if (renameValue.trim()) renamePlaylistMutation.mutate({ playlistId: pl.id, name: renameValue.trim() }); }}
                        >
                          <Input
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            className="h-7 text-sm flex-1"
                            autoFocus
                          />
                          <Button type="submit" size="sm" className="h-7 px-2" disabled={renamePlaylistMutation.isPending}>Save</Button>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setRenamingId(null)}><X className="h-3.5 w-3.5" /></Button>
                        </form>
                      ) : (
                        <>
                          <span className="font-medium text-sm flex-1">{pl.name}</span>
                          <span className="text-xs text-muted-foreground">{pl.tracks?.length ?? 0} track{(pl.tracks?.length ?? 0) !== 1 ? "s" : ""}</span>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => { setRenamingId(pl.id); setRenameValue(pl.name); }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setConfirmDeletePlaylistId(pl.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </>
                      )}
                    </div>
                    {/* Track list */}
                    {(pl.tracks ?? []).length === 0 ? (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No tracks yet — add them from the <Link href="/browse" className="text-primary hover:underline">Browse</Link> page.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/30">
                        {(pl.tracks ?? []).map((pt: any, idx: number) => {
                          const track = pt.track;
                          return (
                            <div key={pt.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group">
                              <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{idx + 1}</span>
                              <div
                                className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden cursor-pointer"
                                onClick={() => track.wavUrl && setActiveTrack({ id: track.id, title: track.title, composerName: track.composerName, coverArtUrl: track.coverArtUrl, watermarkedMp3Url: track.watermarkedMp3Url ?? null, wavUrl: track.wavUrl, durationSeconds: track.durationSeconds, hasStems: track.hasStems ?? false, watermarkStatus: track.watermarkStatus ?? "done", tags: track.tags ?? { genres: [], moods: [], attributes: [] } })}
                              >
                                {track.coverArtUrl ? (
                                  <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" />
                                ) : (
                                  <Music className="h-3.5 w-3.5 text-muted-foreground/40" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{track.title}</p>
                                <p className="text-xs text-muted-foreground truncate">{track.composerName ?? "Unknown"}</p>
                              </div>
                              {track.durationSeconds && (
                                <span className="text-xs text-muted-foreground shrink-0">
                                  {Math.floor(track.durationSeconds / 60)}:{String(track.durationSeconds % 60).padStart(2, "0")}
                                </span>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                title="Remove from playlist"
                                onClick={() => setConfirmDeleteTrackInfo({ playlistId: pl.id, trackId: track.id, title: track.title })}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {playlists.length > 0 && (
              <Button variant="outline" className="gap-2" onClick={() => setShowNewPlaylist(true)}>
                <Plus className="h-4 w-4" /> Add Playlist
              </Button>
            )}
          </>
        )}
      </div>

      {/* New playlist dialog */}
      <Dialog open={showNewPlaylist} onOpenChange={setShowNewPlaylist}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Playlist</DialogTitle>
            <DialogDescription>Name this playlist — you can add tracks from the Browse page.</DialogDescription>
          </DialogHeader>
          <Input
            placeholder="e.g. Upbeat Options, Emotional Underscore…"
            value={newPlaylistName}
            onChange={e => setNewPlaylistName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newPlaylistName.trim()) createPlaylistMutation.mutate({ projectId, name: newPlaylistName.trim() }); }}
            autoFocus
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowNewPlaylist(false)}>Cancel</Button>
            <Button
              onClick={() => { if (newPlaylistName.trim()) createPlaylistMutation.mutate({ projectId, name: newPlaylistName.trim() }); }}
              disabled={!newPlaylistName.trim() || createPlaylistMutation.isPending}
              className="gap-2"
            >
              {createPlaylistMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete playlist confirm */}
      <Dialog open={confirmDeletePlaylistId !== null} onOpenChange={open => { if (!open) setConfirmDeletePlaylistId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Playlist</DialogTitle>
            <DialogDescription>This will remove the playlist and all its track associations. Tracks themselves are not deleted.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeletePlaylistId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirmDeletePlaylistId !== null) deletePlaylistMutation.mutate({ playlistId: confirmDeletePlaylistId }); }}
              disabled={deletePlaylistMutation.isPending}
              className="gap-2"
            >
              {deletePlaylistMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove track confirm */}
      <Dialog open={confirmDeleteTrackInfo !== null} onOpenChange={open => { if (!open) setConfirmDeleteTrackInfo(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove Track</DialogTitle>
            <DialogDescription>Remove <strong>{confirmDeleteTrackInfo?.title}</strong> from this playlist?</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteTrackInfo(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirmDeleteTrackInfo) removeTrackMutation.mutate({ playlistId: confirmDeleteTrackInfo.playlistId, trackId: confirmDeleteTrackInfo.trackId }); }}
              disabled={removeTrackMutation.isPending}
              className="gap-2"
            >
              {removeTrackMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
