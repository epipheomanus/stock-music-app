import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, Music, User, Calendar, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function AdminAnalytics() {
  const [search, setSearch] = useState("");
  const downloadsQuery = trpc.downloads.adminList.useQuery();
  const downloads = downloadsQuery.data ?? [];

  const filtered = downloads.filter(d => {
    const q = search.toLowerCase();
    return !q || d.trackTitle.toLowerCase().includes(q) || (d.userName ?? "").toLowerCase().includes(q) || d.projectName.toLowerCase().includes(q);
  });

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Download Analytics</h1>
          <p className="text-sm text-muted-foreground">{downloads.length} total download{downloads.length !== 1 ? "s" : ""} logged</p>
        </div>

        <div className="mb-4">
          <Input
            placeholder="Search by track, user, or project…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="max-w-sm bg-card border-border"
          />
        </div>

        {downloadsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Download className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">{search ? "No results found." : "No downloads yet."}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Track</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d: any, i: number) => (
                  <tr key={d.id} className={`border-b border-border/30 hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-medium truncate max-w-[180px]">{d.trackTitle}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground truncate max-w-[140px]">{d.userName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[140px]">{d.projectName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${d.fileType === "clean_wav" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {d.fileType === "clean_wav" ? "Clean WAV" : "Watermarked"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                        <Calendar className="h-3 w-3 shrink-0" />
                        {formatDate(d.downloadedAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
