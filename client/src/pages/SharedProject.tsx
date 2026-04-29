import { trpc } from "@/lib/trpc";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Loader2, Music, ListMusic, FolderOpen } from "lucide-react";
import { useParams } from "wouter";
import { usePlayer } from "@/contexts/PlayerContext";

export default function SharedProject() {
  const { token } = useParams<{ token: string }>();
  const { setActiveTrack } = usePlayer();

  const query = trpc.projects.getByShareToken.useQuery(
    { token: token ?? "" },
    { enabled: !!token }
  );

  if (query.isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="min-h-screen bg-background">
        <TopNav />
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <FolderOpen className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
          <h1 className="text-2xl font-display font-semibold mb-2">Project not found</h1>
          <p className="text-muted-foreground">This link may have expired or the project may have been deleted.</p>
        </div>
      </div>
    );
  }

  const { project, playlists } = query.data;

  return (
    <div className="min-h-screen bg-background">
      <TopNav />
      <div className="max-w-4xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-2">Shared Project</p>
          <h1 className="text-3xl font-display font-semibold tracking-tight mb-1">{project.name}</h1>
          {project.description && <p className="text-sm text-muted-foreground">{project.description}</p>}
        </div>

        {/* Playlists */}
        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center border-2 border-dashed border-border rounded-2xl">
            <ListMusic className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No playlists in this project yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {playlists.map((pl: any) => (
              <div key={pl.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
                {/* Playlist header */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-muted/30">
                  <ListMusic className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm flex-1">{pl.name}</span>
                  <span className="text-xs text-muted-foreground">{pl.tracks?.length ?? 0} track{(pl.tracks?.length ?? 0) !== 1 ? "s" : ""}</span>
                </div>
                {/* Tracks */}
                {(pl.tracks ?? []).length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-muted-foreground">No tracks in this playlist.</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {(pl.tracks ?? []).map((pt: any, idx: number) => {
                      const track = pt.track;
                      return (
                        <div
                          key={pt.id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer"
                          onClick={() => track.wavUrl && setActiveTrack({
                            id: track.id,
                            title: track.title,
                            composerName: track.composerName,
                            coverArtUrl: track.coverArtUrl,
                            watermarkedMp3Url: track.watermarkedMp3Url ?? null,
                            wavUrl: track.wavUrl,
                            durationSeconds: track.durationSeconds,
                            hasStems: track.hasStems ?? false,
                            watermarkStatus: track.watermarkStatus ?? "done",
                            tags: track.tags ?? { genres: [], moods: [], attributes: [] },
                          })}
                        >
                          <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{idx + 1}</span>
                          <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0 overflow-hidden">
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
                          {/* Tag pills */}
                          <div className="hidden sm:flex gap-1 shrink-0">
                            {(track.tags?.genres ?? []).slice(0, 2).map((g: string) => (
                              <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">{g}</span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
