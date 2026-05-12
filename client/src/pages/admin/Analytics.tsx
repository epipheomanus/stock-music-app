import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import {
  Download, Loader2, Music, User, Calendar, FolderOpen,
  FileSpreadsheet, X, Trash2, ChevronDown, Mic2, Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useMemo } from "react";
import { toast } from "sonner";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(d: Date | string) {
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

// ─── component ───────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  // ── data ──────────────────────────────────────────────────────────────────
  const downloadsQuery = trpc.downloads.adminList.useQuery();
  const downloads = (downloadsQuery.data ?? []) as any[];
  const utils = trpc.useUtils();

  const deleteDownloadMutation = trpc.admin.deleteDownload.useMutation({
    onSuccess: () => { utils.downloads.adminList.invalidate(); toast.success("Download record deleted."); },
    onError: () => toast.error("Failed to delete record."),
  });

  // ── filter state ──────────────────────────────────────────────────────────
  const [selectedUsers, setSelectedUsers]       = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks]     = useState<string[]>([]);
  const [selectedComposers, setSelectedComposers] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes]       = useState<string[]>([]);   // "clean_wav" | "watermarked"
  const [startDate, setStartDate]               = useState("");
  const [endDate, setEndDate]                   = useState("");

  // ── derived option lists ──────────────────────────────────────────────────
  const userOptions     = useMemo(() => unique(downloads.map((d: any) => d.userName ?? "Unknown")).sort(), [downloads]);
  const trackOptions    = useMemo(() => unique(downloads.map((d: any) => d.trackTitle ?? "Unknown")).sort(), [downloads]);
  const composerOptions = useMemo(() => unique(downloads.map((d: any) => d.composerName ?? "Unknown")).sort(), [downloads]);

  // ── date preset ───────────────────────────────────────────────────────────
  function applyPreset(preset: "q1" | "q2" | "q3" | "q4" | "ytd" | "last30") {
    const now = new Date();
    const y = now.getFullYear();
    if (preset === "q1")    { setStartDate(`${y}-01-01`); setEndDate(`${y}-03-31`); }
    else if (preset === "q2") { setStartDate(`${y}-04-01`); setEndDate(`${y}-06-30`); }
    else if (preset === "q3") { setStartDate(`${y}-07-01`); setEndDate(`${y}-09-30`); }
    else if (preset === "q4") { setStartDate(`${y}-10-01`); setEndDate(`${y}-12-31`); }
    else if (preset === "ytd") { setStartDate(`${y}-01-01`); setEndDate(now.toISOString().split("T")[0]); }
    else if (preset === "last30") {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split("T")[0]); setEndDate(now.toISOString().split("T")[0]);
    }
  }

  // ── filtered rows ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const start = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
    const end   = endDate   ? new Date(endDate   + "T23:59:59").getTime() : null;
    return downloads.filter((d: any) => {
      if (selectedUsers.length    && !selectedUsers.includes(d.userName ?? "Unknown"))     return false;
      if (selectedTracks.length   && !selectedTracks.includes(d.trackTitle ?? "Unknown"))  return false;
      if (selectedComposers.length && !selectedComposers.includes(d.composerName ?? "Unknown")) return false;
      if (selectedTypes.length) {
        const t = d.fileType === "clean_wav" ? "clean_wav" : "watermarked";
        if (!selectedTypes.includes(t)) return false;
      }
      const ts = new Date(d.downloadedAt).getTime();
      if (start && ts < start) return false;
      if (end   && ts > end)   return false;
      return true;
    });
  }, [downloads, selectedUsers, selectedTracks, selectedComposers, selectedTypes, startDate, endDate]);

  const hasFilters = selectedUsers.length || selectedTracks.length || selectedComposers.length ||
                     selectedTypes.length || startDate || endDate;

  function clearAll() {
    setSelectedUsers([]); setSelectedTracks([]); setSelectedComposers([]);
    setSelectedTypes([]); setStartDate(""); setEndDate("");
  }

  // ── active filter badges ──────────────────────────────────────────────────
  const activeBadges: { label: string; onRemove: () => void }[] = [
    ...selectedUsers.map(u => ({ label: `User: ${u}`, onRemove: () => setSelectedUsers(p => p.filter(x => x !== u)) })),
    ...selectedTracks.map(t => ({ label: `Track: ${t}`, onRemove: () => setSelectedTracks(p => p.filter(x => x !== t)) })),
    ...selectedComposers.map(c => ({ label: `Composer: ${c}`, onRemove: () => setSelectedComposers(p => p.filter(x => x !== c)) })),
    ...selectedTypes.map(t => ({ label: t === "clean_wav" ? "Type: Clean WAV" : "Type: Watermarked", onRemove: () => setSelectedTypes(p => p.filter(x => x !== t)) })),
    ...(startDate || endDate ? [{ label: `Date: ${startDate || "…"} → ${endDate || "…"}`, onRemove: () => { setStartDate(""); setEndDate(""); } }] : []),
  ];

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportToCSV() {
    if (filtered.length === 0) { toast.error("No data to export."); return; }
    const headers = ["Name", "Email", "Track", "Composer", "Project Name", "File Type", "Date Downloaded"];
    const rows = filtered.map((d: any) => [
      d.userName ?? "", d.userEmail ?? "", d.trackTitle ?? "",
      d.composerName ?? "", d.projectName ?? "",
      d.fileType === "clean_wav" ? "Clean WAV" : "Watermarked MP3",
      formatDate(d.downloadedAt),
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    const suffix = startDate && endDate ? `_${startDate}_to_${endDate}` : `_${new Date().toISOString().split("T")[0]}`;
    a.download = `epipheo_music_downloads${suffix}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} row${filtered.length !== 1 ? "s" : ""} to CSV`);
  }

  // ── multi-select dropdown helper ──────────────────────────────────────────
  function MultiSelect({
    label, icon, options, selected, onChange,
  }: {
    label: string; icon: React.ReactNode;
    options: string[]; selected: string[];
    onChange: (v: string[]) => void;
  }) {
    const toggle = (v: string) =>
      onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={`gap-1.5 h-8 text-xs ${selected.length ? "border-primary text-primary" : ""}`}>
            {icon}
            {label}
            {selected.length > 0 && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{selected.length}</Badge>}
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto min-w-[200px]">
          <DropdownMenuLabel className="text-xs">{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {options.map(opt => (
            <DropdownMenuCheckboxItem
              key={opt}
              checked={selected.includes(opt)}
              onCheckedChange={() => toggle(opt)}
              className="text-xs"
            >
              {opt}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ── date range dropdown ───────────────────────────────────────────────────
  function DateRangeDropdown() {
    const active = !!(startDate || endDate);
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={`gap-1.5 h-8 text-xs ${active ? "border-primary text-primary" : ""}`}>
            <Calendar className="h-3.5 w-3.5" />
            Date
            {active && <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">1</Badge>}
            <ChevronDown className="h-3 w-3 ml-0.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="p-3 w-64">
          <DropdownMenuLabel className="text-xs mb-2">Date Range</DropdownMenuLabel>
          <div className="space-y-2">
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">From</p>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground mb-1">To</p>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full text-xs border border-border rounded px-2 py-1 bg-background" />
            </div>
          </div>
          <DropdownMenuSeparator className="my-2" />
          <div className="flex flex-wrap gap-1">
            {(["q1","q2","q3","q4","ytd","last30"] as const).map(p => (
              <button key={p} onClick={() => applyPreset(p)}
                className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-muted transition-colors">
                {p === "q1" ? "Q1" : p === "q2" ? "Q2" : p === "q3" ? "Q3" : p === "q4" ? "Q4" : p === "ytd" ? "YTD" : "Last 30"}
              </button>
            ))}
          </div>
          {active && (
            <button onClick={() => { setStartDate(""); setEndDate(""); }}
              className="mt-2 text-[10px] text-muted-foreground hover:text-foreground w-full text-left">
              Clear dates
            </button>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Download Analytics</h1>
            {/* Dynamic summary: shows filtered count when filters are active */}
            <p className="text-sm text-muted-foreground">
              {hasFilters
                ? <><span className="font-semibold text-foreground">{filtered.length}</span> result{filtered.length !== 1 ? "s" : ""} <span className="text-muted-foreground/60">of {downloads.length} total</span></>
                : <><span className="font-semibold text-foreground">{downloads.length}</span> total download{downloads.length !== 1 ? "s" : ""} logged</>
              }
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={exportToCSV} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
            {hasFilters && <span className="text-xs text-primary">({filtered.length})</span>}
          </Button>
        </div>

        {/* Filter bar */}
        <div className="bg-muted/30 border border-border/50 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground mr-1">Filter by:</span>

            <MultiSelect
              label="User" icon={<User className="h-3.5 w-3.5" />}
              options={userOptions} selected={selectedUsers} onChange={setSelectedUsers}
            />
            <MultiSelect
              label="Track" icon={<Music className="h-3.5 w-3.5" />}
              options={trackOptions} selected={selectedTracks} onChange={setSelectedTracks}
            />
            <MultiSelect
              label="Composer" icon={<Mic2 className="h-3.5 w-3.5" />}
              options={composerOptions} selected={selectedComposers} onChange={setSelectedComposers}
            />
            <MultiSelect
              label="File Type" icon={<Download className="h-3.5 w-3.5" />}
              options={["clean_wav", "watermarked"]}
              selected={selectedTypes} onChange={setSelectedTypes}
            />
            <DateRangeDropdown />

            {hasFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-8 text-xs ml-auto" onClick={clearAll}>
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>

          {/* Active filter badges */}
          {activeBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeBadges.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                  {b.label}
                  <button onClick={b.onRemove} className="hover:text-primary/60 transition-colors">
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Table */}
        {downloadsQuery.isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <Download className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">{hasFilters ? "No results for the current filters." : "No downloads yet."}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Track</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Composer</th>
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
                        <span className="font-medium truncate max-w-[160px]">{d.trackTitle}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Mic2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[130px] text-muted-foreground">{d.composerName ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate max-w-[130px]">{d.userName ?? "Unknown"}</p>
                          {d.userEmail && <p className="text-xs text-muted-foreground truncate max-w-[130px]">{d.userEmail}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate max-w-[120px]">{d.projectName}</span>
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
                        variant="ghost" size="icon"
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
