import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderOpen, Archive, Trash2, Loader2, FolderArchive } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function MyProjects() {
  const { user, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDeleteProject, setConfirmDeleteProject] = useState<{ id: number; name: string } | null>(null);

  const projectsQuery = trpc.projects.list.useQuery(undefined, { enabled: !!user });
  const projects = projectsQuery.data ?? [];
  const active = projects.filter((p: any) => p.status === "active");
  const archived = projects.filter((p: any) => p.status === "archived");

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: () => {
      utils.projects.list.invalidate();
      utils.projects.listActive.invalidate();
      toast.success("Project created");
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
    onError: (err) => toast.error(err.message || "Failed to create project"),
  });

  const archiveMutation = trpc.projects.update.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); utils.projects.listActive.invalidate(); },
    onError: (err) => toast.error(err.message || "Failed to update project"),
  });

  const deleteMutation = trpc.projects.delete.useMutation({
    onSuccess: () => { utils.projects.list.invalidate(); utils.projects.listActive.invalidate(); toast.success("Project deleted"); },
    onError: (err) => toast.error(err.message || "Failed to delete project"),
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <FolderOpen className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="text-xl font-semibold">Sign in to access My Projects</h2>
          <p className="text-muted-foreground text-sm max-w-sm">Create and manage your music project playlists to share track ideas with your team.</p>
          <a href={getLoginUrl()}><Button>Sign In</Button></a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">My Projects</h1>
            <p className="text-muted-foreground mt-1 text-sm">Organise track ideas into shareable playlists for your video projects.</p>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" /> New Project
          </Button>
        </div>

        {projectsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : active.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-border rounded-2xl">
            <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground font-medium">No active projects yet</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Click "New Project" to get started.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((project: any) => (
              <ProjectCard
                key={project.id}
                project={project}
                onArchive={() => archiveMutation.mutate({ id: project.id, status: "archived" })}
                onDelete={() => setConfirmDeleteProject({ id: project.id, name: project.name })}
              />
            ))}
          </div>
        )}

        {archived.length > 0 && (
          <div className="mt-10">
            <button
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-4"
              onClick={() => setShowArchived(v => !v)}
            >
              <FolderArchive className="h-4 w-4" />
              {showArchived ? "Hide" : "Show"} Archived Projects ({archived.length})
            </button>
            {showArchived && (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 opacity-70">
                {archived.map((project: any) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    isArchived
                    onRestore={() => archiveMutation.mutate({ id: project.id, status: "active" })}
                    onDelete={() => setConfirmDeleteProject({ id: project.id, name: project.name })}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete project confirmation */}
      <AlertDialog
        open={confirmDeleteProject !== null}
        onOpenChange={open => { if (!open) setConfirmDeleteProject(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete{" "}
              <strong>&ldquo;{confirmDeleteProject?.name}&rdquo;</strong>? This will permanently remove
              the project and all its playlists. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDeleteProject) {
                  deleteMutation.mutate({ id: confirmDeleteProject.id });
                  setConfirmDeleteProject(null);
                }
              }}
            >
              Delete Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Give your project a name. You can add playlists and tracks after creating it.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); if (newName.trim()) createMutation.mutate({ name: newName.trim(), description: newDesc.trim() || undefined }); }} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="proj-name">Project Name *</Label>
              <Input id="proj-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Explainer Video Q3" required autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="proj-desc">Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Input id="proj-desc" value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief notes about this project" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim() || createMutation.isPending} className="gap-2">
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create Project
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({
  project,
  isArchived = false,
  onArchive,
  onRestore,
  onDelete,
}: {
  project: any;
  isArchived?: boolean;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
}) {
  const playlistCount = project.playlistCount ?? 0;
  return (
    <div className="group relative flex flex-col gap-3 p-5 rounded-2xl border border-border/60 bg-card hover:border-primary/40 hover:shadow-sm transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate">{project.name}</h3>
          {project.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{project.description}</p>}
        </div>
        {isArchived && <Badge variant="secondary" className="text-[10px] shrink-0">Archived</Badge>}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{playlistCount} playlist{playlistCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{new Date(project.createdAt).toLocaleDateString()}</span>
      </div>
      <div className="flex items-center gap-2 mt-auto pt-1">
        <Link href={`/projects/${project.id}`} className="flex-1">
          <Button variant="outline" size="sm" className="w-full h-8 text-xs gap-1.5">
            <FolderOpen className="h-3.5 w-3.5" /> Open
          </Button>
        </Link>
        {!isArchived && onArchive && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Archive project" onClick={onArchive}>
            <Archive className="h-3.5 w-3.5" />
          </Button>
        )}
        {isArchived && onRestore && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" title="Restore project" onClick={onRestore}>
            <FolderOpen className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" title="Delete project" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
