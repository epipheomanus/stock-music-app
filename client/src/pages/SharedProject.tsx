import { trpc } from "@/lib/trpc";
import TopNav from "@/components/TopNav";
import { Button } from "@/components/ui/button";
import { Loader2, Music, Play, ListMusic } from "lucide-react";
import { Link } from "wouter";
import { usePlayer, GlobalTrack } from "@/contexts/PlayerContext";

interface SharedProjectProps {
  params: { token: string };
}

export default function SharedProject({ params }: SharedProjectProps) {
  const { setActiveTrack, setQueue } = usePlayer();

  const projectQuery = trpc.projects.getByShareToken.useQuery(
    { token: params.token },
    { retry: false }
  );
  const project = projectQuery.data?.project;
  const playlists = projectQuery.data?.playlists ?? [];

  function playAll(tracks: any[]) {
    if (!tracks.length) return;
    const queue: GlobalTrack[] = tracks.map(t => ({
      id: t.id, title: t.title, composerName: t.composerName ?? null,
      durationSeconds: t.durationSeconds ?? null, coverArtUrl: t.coverArtUrl ?? null,
      watermarkedMp3Url: t.watermarkedMp3Url ?? null, wavUrl: t.wavUrl ?? null,
      hasStems: t.hasStems ?? false, watermarkStatus: t.watermarkStatus ?? "pending",
      tags: t.tags ?? { genres: [], moods: [], attributes: [] },
    }));
    setQueue(queue, 0);
  }

  if (projectQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="min-h-screen flex flex-col">
        <TopNav />
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-4">
          <ListMusic className="h-12 w-12 text-muted-foreground/30" />
          <h2 className="text-xl font-semibold">Project Not Found</h2>
          <p className="text-muted-foreground text-sm">This share link may have expired or the project was deleted.</p>
          <Link href="/browse"><Button variant="outline">Browse Music</Button></Link>
        </div>
      </div>
    );
  }

  const totalTracks = playlists.reduce((sum: number, pl: any) => sum + (pl.tracks?.length ?? 0), 0);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <TopNav />
      <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-10">
        {/* Header */}
        <div className="mb-8">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-2.5 py-1 rounded-full mb-4">
            <ListMusic className="h-3 w-3" /> Shared Music Project
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.description && <p className="text-muted-foreground mt-1 text-sm">{project.description}</p>}
          <p className="text-xs text-muted-foreground/60 mt-1">{playlists.length} playlist{playlists.length !== 1 ? "s" : ""} · {totalTracks} track{totalTracks !== 1 ? "s" : ""}</p>
        </div>

        {playlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center border border-dashed border-border rounded-2xl">
            <ListMusic className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No playlists in this project yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {playlists.map((playlist: any) => (
              <div key={playlist.id} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border/40">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{playlist.name}</h3>
                    <span className="text-xs text-muted-foreground">{playlist.tracks?.length ?? 0} track{(playlist.tracks?.length ?? 0) !== 1 ? "s" : ""}</span>
                  </div>
                  {(playlist.tracks?.length ?? 0) > 0 && (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => playAll(playlist.tracks)}>
                      <Play className="h-3.5 w-3.5" /> Play All
                    </Button>
                  )}
                </div>
                {(playlist.tracks?.length ?? 0) === 0 ? (
                  <div className="px-5 py-8 text-center text-sm text-muted-foreground/60">No tracks in this playlist.</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {playlist.tracks.map((track: any, idx: number) => (
                      <div key={`${playlist.id}-${track.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors group">
                        <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{idx + 1}</span>
                        <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {track.coverArtUrl ? <img src={track.coverArtUrl} alt={track.title} className="w-full h-full object-cover" /> : <Music className="h-3.5 w-3.5 text-muted-foreground/40" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{track.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{track.composerName ?? "Unknown"}</p>
                        </div>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Play track"
                          onClick={() => setActiveTrack({
                            id: track.id, title: track.title, composerName: track.composerName ?? null,
                            durationSeconds: track.durationSeconds ?? null, coverArtUrl: track.coverArtUrl ?? null,
                            watermarkedMp3Url: track.watermarkedMp3Url ?? null, wavUrl: track.wavUrl ?? null,
                            hasStems: track.hasStems ?? false, watermarkStatus: track.watermarkStatus ?? "pending",
                            tags: track.tags ?? { genres: [], moods: [], attributes: [] },
                          })}
                        >
                          <Play className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
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
