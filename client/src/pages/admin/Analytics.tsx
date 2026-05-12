import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Download, Loader2, Music, User, Calendar, FolderOpen, FileSpreadsheet, Search, X, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, useMemo } from "react";
import { toast } from "sonner";

export default function AdminAnalytics() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const downloadsQuery = trpc.downloads.adminList.useQuery();
  const downloads = downloadsQuery.data ?? [];
  const utils = trpc.useUtils();
  const deleteDownloadMutation = trpc.admin.deleteDownload.useMutation({
    onSuccess: () => {
      utils.downloads.adminList.invalidate();
      toast.success("Download record deleted.");
    },
    onError: () => toast.error("Failed to delete record."),
  });

  function applyPreset(preset: "q1" | "q2" | "q3" | "q4" | "ytd" | "last30") {
    const now = new Date();
    const year = now.getFullYear();
    if (preset === "q1") { setStartDate(`${year}-01-01`); setEndDate(`${year}-03-31`); }
    else if (preset === "q2") { setStartDate(`${year}-04-01`); setEndDate(`${year}-06-30`); }
    else if (preset === "q3") { setStartDate(`${year}-07-01`); setEndDate(`${year}-09-30`); }
    else if (preset === "q4") { setStartDate(`${year}-10-01`); setEndDate(`${year}-12-31`); }
    else if (preset === "ytd") { setStartDate(`${year}-01-01`); setEndDate(now.toISOString().split("T")[0]); }
    else if (preset === "last30") {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split("T")[0]); setEndDate(now.toISOString().split("T")[0]);
    }
  }

  function clearDates() { setStartDate(""); setEndDate(""); }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const start = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
    const end = endDate ? new Date(endDate + "T23:59:59").getTime() : null;
    return (downloads as any[]).filter((d: any) => {
      if (q && !((d.trackTitle ?? "").toLowerCase().includes(q) || (d.userName ?? "").toLowerCase().includes(q) || (d.projectName ?? "").toLowerCase().includes(q))) return false;
      const ts = new Date(d.downloadedAt).getTime();
      if (start && ts < start) return false;
      if (end && ts > end) return false;
      return true;
    });
  }, [downloads, search, startDate, endDate]);

  const hasDateFilter = startDate || endDate;

  function formatDate(d: Date | string) {
    return new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function exportToCSV() {
    if (filtered.length === 0) {
      toast.error("No data to export.");
      return;
    }

    const headers = ["Name", "Email", "Track", "Project Name", "File Type", "Date Downloaded"];
    const rows = filtered.map((d: any) => [
      d.userName ?? "",
      d.userEmail ?? "",
      d.trackTitle ?? "",
      d.projectName ?? "",
      d.fileType === "clean_wav" ? "Clean WAV" : "Watermarked MP3",
      formatDate(d.downloadedAt),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const suffix = startDate && endDate ? `_${startDate}_to_${endDate}` : startDate ? `_from_${startDate}` : endDate ? `_to_${endDate}` : `_${new Date().toISOString().split("T")[0]}`;
    a.download = `epipheo_music_downloads${suffix}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} row${filtered.length !== 1 ? "s" : ""} to CSV`);
  }

  return (
    <AdminLayout>
      <div className="p-8">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Download Analytics</h1>
            <p className="text-sm text-muted-foreground">{downloads.length} total download{downloads.length !== 1 ? "s" : ""} logged</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={exportToCSV} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Export to CSV
            {hasDateFilter && <span className="ml-1 text-xs text-primary">({filtered.length})</span>}
          </Button>
        </div>

        {/* Filters */}
        <div className="bg-muted/30 border border-border/50 rounded-xl p-4 mb-5 space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by track, user, or project…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40 text-sm" />
            </div>
            {hasDateFilter && (
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-9" onClick={clearDates}>
                <X className="h-3.5 w-3.5" /> Clear dates
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">Quick ranges:</span>
            {(["q1", "q2", "q3", "q4", "ytd", "last30"] as const).map(p => (
              <Button key={p} variant="outline" size="sm" className="h-7 text-xs px-2.5" onClick={() => applyPreset(p)}>
                {p === "q1" ? "Q1" : p === "q2" ? "Q2" : p === "q3" ? "Q3" : p === "q4" ? "Q4" : p === "ytd" ? "Year to Date" : "Last 30 Days"}
              </Button>
            ))}
          </div>
        </div>

        {(search || hasDateFilter) && (
          <p className="text-xs text-muted-foreground mb-3">Showing {filtered.length} of {downloads.length} records</p>
        )}

        {downloadsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Download className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">{search || hasDateFilter ? "No results for this filter." : "No downloads yet."}</p>
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
                  <th className="px-4 py-3 w-10"></th>
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
                        <div className="min-w-0">
                          <p className="truncate max-w-[140px]">{d.userName ?? "Unknown"}</p>
                          {d.userEmail && <p className="text-xs text-muted-foreground truncate max-w-[140px]">{d.userEmail}</p>}
                        </div>
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
                    <td className="px-4 py-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteDownloadMutation.mutate({ downloadId: d.id })}
                        disabled={deleteDownloadMutation.isPending}
                        title="Delete this record"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
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
