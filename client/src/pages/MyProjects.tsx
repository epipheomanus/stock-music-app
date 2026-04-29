import { useState } from "react";
import { trpc } from "@/lib/trpc";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, FolderOpen, Archive, Loader2, Trash2, Share2, ExternalLink } from "lucide-react";
import { Link, useLocation } from "wouter";

export default function MyProjects() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [confirmArchiveId, setConfirmArchiveId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteName, setConfirmDeleteName] = useState("");

  const projectsQuery = trpc.projects.list.useQuery();
  const projects = projectsQuery.data ?? [];

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: (data) => {
      utils.projects.list.invalidate();
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      toast.success("Project created");
      navigate(`/projects/${data.id}`);
    },
    onError: (err) => toast.error(err.message || "Failed to create project"),
  });

  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      setConfirmArchiveId(null);
      toast.success("Project updated");
    },
    onError: (err) => toast.error(err.message || "Failed to update project"),
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      setConfirmDeleteId(null);
      toast.success("Project deleted");
    },
    onError: (err) => toast.error(err.message || "Failed to delete project"),
  });

  const active = projects.filter((p: any) => p.status === "active");
  const archived = projects.filter((p: any) => p.status === "archived");

  function copyShareLink(shareToken: string) {
    const url = `${window.location.origin}/shared/${shareToken}`;
    navigator.clipboard.writeText(url);
    toast.success("Share link copied to clipboard");
  }

  function formatDate(ts: number | string | Date) {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-display font-semibold tracking-tight mb-1">My Projects</h1>
            <p className="text-sm text-muted-foreground">Organize track ideas into shareable project playlists.</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>

        {projectsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center border-2 border-dashed border-border rounded-2xl">
            <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="font-medium mb-1">No projects yet</p>
            <p className="text-sm text-muted-foreground mb-4">Create a project to start curating track ideas for your video projects.</p>
            <Button onClick={() => setShowCreate(true)} size="sm" className="gap-2">
              <Plus className="h-4 w-4" /> Create your first project
            </Button>
          </div>
        ) : (
          <>
            {/* Active projects */}
            {active.length > 0 && (
              <section className="mb-10">
                <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">Active ({active.length})</h2>
                <div className="space-y-3">
                  {active.map((p: any) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onOpen={() => navigate(`/projects/${p.id}`)}
                      onShare={() => copyShareLink(p.shareToken)}
                      onArchive={() => setConfirmArchiveId(p.id)}
                      onDelete={() => { setConfirmDeleteId(p.id); setConfirmDeleteName(p.name); }}
                      formatDate={formatDate}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Archived projects */}
            {archived.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">Archived ({archived.length})</h2>
                <div className="space-y-3">
                  {archived.map((p: any) => (
                    <ProjectCard
                      key={p.id}
                      project={p}
                      onOpen={() => navigate(`/projects/${p.id}`)}
                      onShare={() => copyShareLink(p.shareToken)}
                      onRestore={() => updateMutation.mutate({ id: p.id, status: "active" })}
                      onDelete={() => { setConfirmDeleteId(p.id); setConfirmDeleteName(p.name); }}
                      formatDate={formatDate}
                      archived
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Give your project a name. You can add playlists and tracks after creating it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                placeholder="e.g. Brand Film Q3 2026"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && newName.trim()) createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined }); }}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-muted-foreground">Description (optional)</label>
              <Input
                placeholder="Brief description of this project…"
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={createMutation.isPending}>Cancel</Button>
            <Button
              onClick={() => { if (newName.trim()) createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined }); }}
              disabled={!newName.trim() || createMutation.isPending}
              className="gap-2"
            >
              {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive confirm */}
      <Dialog open={confirmArchiveId !== null} onOpenChange={open => { if (!open) setConfirmArchiveId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Archive Project</DialogTitle>
            <DialogDescription>This project will be moved to your archive. You can restore it at any time.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmArchiveId(null)}>Cancel</Button>
            <Button
              onClick={() => { if (confirmArchiveId !== null) updateMutation.mutate({ id: confirmArchiveId, status: "archived" }); }}
              disabled={updateMutation.isPending}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={confirmDeleteId !== null} onOpenChange={open => { if (!open) setConfirmDeleteId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Permanently delete <strong>{confirmDeleteName}</strong>? All playlists and track associations will be removed. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { if (confirmDeleteId !== null) deleteMutation.mutate({ id: confirmDeleteId }); }}
              disabled={deleteMutation.isPending}
              className="gap-2"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project, onOpen, onShare, onArchive, onRestore, onDelete, formatDate, archived = false,
}: {
  project: any;
  onOpen: () => void;
  onShare: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete: () => void;
  formatDate: (d: any) => string;
  archived?: boolean;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors cursor-pointer ${archived ? "border-border/40 bg-muted/30 opacity-70" : "border-border/60 bg-card hover:border-border"}`}>
      <div
        className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${archived ? "bg-muted" : "bg-primary/10"}`}
        onClick={onOpen}
      >
        {archived ? <Archive className="h-5 w-5 text-muted-foreground" /> : <FolderOpen className="h-5 w-5 text-primary" />}
      </div>
      <div className="flex-1 min-w-0 cursor-pointer" onClick={onOpen}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{project.name}</span>
          {archived && <Badge variant="secondary" className="text-[10px]">Archived</Badge>}
        </div>
        {project.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</p>}
        <p className="text-[11px] text-muted-foreground/60 mt-0.5">Created {formatDate(project.createdAt)}</p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Copy share link" onClick={onShare}>
          <Share2 className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Open project" onClick={onOpen}>
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
        {!archived && onArchive && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Archive project" onClick={onArchive}>
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {archived && onRestore && (
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-foreground" onClick={onRestore}>
            Restore
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete project" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
