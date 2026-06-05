import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import {
  Download, Loader2, Music, User, Calendar, FolderOpen,
  FileSpreadsheet, X, Trash2, ChevronDown, Mic2, Filter,
  ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useState, useMemo, useEffect } from "react";
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

// Renders truncated text with a tooltip showing the full value on hover
function TipCell({ text, maxW = "max-w-[140px]", className = "" }: { text: string; maxW?: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`truncate ${maxW} block cursor-default ${className}`}>{text || "—"}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs break-words text-xs">
        {text || "—"}
      </TooltipContent>
    </Tooltip>
  );
}

const PAGE_SIZE_KEY = "admin-downloads-page-size";

// ─── component ───────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const downloadsQuery = trpc.downloads.adminList.useQuery();
  const downloads = (downloadsQuery.data ?? []) as any[];
  const utils = trpc.useUtils();

  const deleteDownloadMutation = trpc.admin.deleteDownload.useMutation({
    onSuccess: () => {
      utils.downloads.adminList.invalidate();
      toast.success("Download record deleted.");
    },
    onError: () => toast.error("Failed to delete record."),
  });

  // confirmation dialogs
  const [confirmSingleId, setConfirmSingleId] = useState<number | null>(null);
  const [confirmBulkOpen, setConfirmBulkOpen] = useState(false);

  // checkbox selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // search
  const [searchQuery, setSearchQuery] = useState("");

  // filter state
  const [selectedUsers, setSelectedUsers]         = useState<string[]>([]);
  const [selectedTracks, setSelectedTracks]       = useState<string[]>([]);
  const [selectedComposers, setSelectedComposers] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes]         = useState<string[]>([]);
  const [startDate, setStartDate]                 = useState("");
  const [endDate, setEndDate]                     = useState("");

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    const stored = localStorage.getItem(PAGE_SIZE_KEY);
    return stored ? Number(stored) : 25;
  });

  // For anonymous downloads, show "Guest (IP)" or just "Guest" as the display name
  function displayName(d: any): string {
    if (d.userName) return d.userName;
    if (d.ipAddress) return `Guest (${d.ipAddress})`;
    return "Guest";
  }

  const userOptions     = useMemo(() => unique(downloads.map((d: any) => displayName(d))).sort(), [downloads]);
  const trackOptions    = useMemo(() => unique(downloads.map((d: any) => d.trackTitle ?? "Unknown")).sort(), [downloads]);
  const composerOptions = useMemo(() => unique(downloads.map((d: any) => d.composerName ?? "Unknown")).sort(), [downloads]);

  function applyPreset(preset: "q1" | "q2" | "q3" | "q4" | "ytd" | "last30") {
    const now = new Date();
    const y = now.getFullYear();
    if (preset === "q1")      { setStartDate(`${y}-01-01`); setEndDate(`${y}-03-31`); }
    else if (preset === "q2") { setStartDate(`${y}-04-01`); setEndDate(`${y}-06-30`); }
    else if (preset === "q3") { setStartDate(`${y}-07-01`); setEndDate(`${y}-09-30`); }
    else if (preset === "q4") { setStartDate(`${y}-10-01`); setEndDate(`${y}-12-31`); }
    else if (preset === "ytd") { setStartDate(`${y}-01-01`); setEndDate(now.toISOString().split("T")[0]); }
    else if (preset === "last30") {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().split("T")[0]); setEndDate(now.toISOString().split("T")[0]);
    }
  }

  const filtered = useMemo(() => {
    const start = startDate ? new Date(startDate + "T00:00:00").getTime() : null;
    const end   = endDate   ? new Date(endDate   + "T23:59:59").getTime() : null;
    const q = searchQuery.trim().toLowerCase();
    return downloads.filter((d: any) => {
      if (q) {
        const haystack = [
          d.trackTitle ?? "",
          d.composerName ?? "",
          d.userName ?? "",
          d.userEmail ?? "",
          d.projectName ?? "",
          d.ipAddress ?? "",
        ].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (selectedUsers.length     && !selectedUsers.includes(displayName(d)))         return false;
      if (selectedTracks.length    && !selectedTracks.includes(d.trackTitle ?? "Unknown"))      return false;
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
  }, [downloads, searchQuery, selectedUsers, selectedTracks, selectedComposers, selectedTypes, startDate, endDate]);

  // Reset to page 1 whenever filters or search change
  useEffect(() => { setPage(1); setSelectedIds(new Set()); },
    [searchQuery, selectedUsers, selectedTracks, selectedComposers, selectedTypes, startDate, endDate]);

  const hasFilters = !!(searchQuery.trim() || selectedUsers.length || selectedTracks.length || selectedComposers.length ||
                     selectedTypes.length || startDate || endDate);

  function clearAll() {
    setSearchQuery("");
    setSelectedUsers([]); setSelectedTracks([]); setSelectedComposers([]);
    setSelectedTypes([]); setStartDate(""); setEndDate("");
  }

  // pagination derived values
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageStart  = (safePage - 1) * pageSize;
  const pageEnd    = Math.min(pageStart + pageSize, filtered.length);
  const paginated  = filtered.slice(pageStart, pageEnd);

  function handlePageSizeChange(val: string) {
    const n = Number(val);
    setPageSize(n);
    setPage(1);
    localStorage.setItem(PAGE_SIZE_KEY, String(n));
  }

  // selection helpers (operate on filtered, not just current page)
  const filteredIds  = useMemo(() => filtered.map((d: any) => d.id as number), [filtered]);
  const pageIds      = useMemo(() => paginated.map((d: any) => d.id as number), [paginated]);
  const allPageSelected  = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = pageIds.some(id => selectedIds.has(id));

  function toggleSelectAllPage() {
    if (allPageSelected) {
      setSelectedIds(prev => { const n = new Set(prev); pageIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); pageIds.forEach(id => n.add(id)); return n; });
    }
  }

  function toggleSelectOne(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  const selectedCount = filteredIds.filter(id => selectedIds.has(id)).length;

  // delete handlers
  function executeSingleDelete() {
    if (confirmSingleId === null) return;
    deleteDownloadMutation.mutate({ downloadId: confirmSingleId });
    setSelectedIds(prev => { const n = new Set(prev); n.delete(confirmSingleId!); return n; });
    setConfirmSingleId(null);
  }

  function executeBulkDelete() {
    const ids = filteredIds.filter(id => selectedIds.has(id));
    ids.forEach(id => deleteDownloadMutation.mutate({ downloadId: id }));
    setSelectedIds(new Set());
    setConfirmBulkOpen(false);
    toast.success(`Deleting ${ids.length} record${ids.length !== 1 ? "s" : ""}...`);
  }

  // active filter badges
  const activeBadges: { label: string; onRemove: () => void }[] = [
    ...selectedUsers.map(u => ({ label: `User: ${u}`, onRemove: () => setSelectedUsers(p => p.filter(x => x !== u)) })),
    ...selectedTracks.map(t => ({ label: `Track: ${t}`, onRemove: () => setSelectedTracks(p => p.filter(x => x !== t)) })),
    ...selectedComposers.map(c => ({ label: `Composer: ${c}`, onRemove: () => setSelectedComposers(p => p.filter(x => x !== c)) })),
    ...selectedTypes.map(t => ({ label: t === "clean_wav" ? "Type: Clean WAV" : "Type: Watermarked", onRemove: () => setSelectedTypes(p => p.filter(x => x !== t)) })),
    ...(startDate || endDate ? [{ label: `Date: ${startDate || "..."} to ${endDate || "..."}`, onRemove: () => { setStartDate(""); setEndDate(""); } }] : []),
  ];

  function exportToCSV() {
    if (filtered.length === 0) { toast.error("No data to export."); return; }
    const headers = ["Name", "Email", "Track", "Composer", "Project Name", "File Type", "Date Downloaded"];
    const rows = filtered.map((d: any) => [
      d.userName ?? (d.ipAddress ? `Guest (${d.ipAddress})` : "Guest"),
      d.userEmail ?? "",
      d.trackTitle ?? "",
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
            <DropdownMenuCheckboxItem key={opt} checked={selected.includes(opt)} onCheckedChange={() => toggle(opt)} className="text-xs">
              {opt}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

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

  return (
    <AdminLayout>
      <div className="p-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Download Analytics</h1>
            <p className="text-sm text-muted-foreground">
              {downloads.length} total download{downloads.length !== 1 ? "s" : ""} logged
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={exportToCSV} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>
        </div>

        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by track, composer, user, email, or project…"
            className="pl-9 pr-9 h-10"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="bg-muted/30 border border-border/50 rounded-xl p-4 mb-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground mr-1">Filter by:</span>
            <MultiSelect label="User" icon={<User className="h-3.5 w-3.5" />} options={userOptions} selected={selectedUsers} onChange={setSelectedUsers} />
            <MultiSelect label="Track" icon={<Music className="h-3.5 w-3.5" />} options={trackOptions} selected={selectedTracks} onChange={setSelectedTracks} />
            <MultiSelect label="Composer" icon={<Mic2 className="h-3.5 w-3.5" />} options={composerOptions} selected={selectedComposers} onChange={setSelectedComposers} />
            <MultiSelect label="File Type" icon={<Download className="h-3.5 w-3.5" />} options={["clean_wav", "watermarked"]} selected={selectedTypes} onChange={setSelectedTypes} />
            <DateRangeDropdown />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground h-8 text-xs ml-auto" onClick={clearAll}>
                <X className="h-3 w-3" /> Clear all
              </Button>
            )}
          </div>
          {activeBadges.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {activeBadges.map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary border border-primary/20 rounded-full px-2.5 py-0.5">
                  {b.label}
                  <button onClick={b.onRemove} className="hover:text-primary/60 transition-colors"><X className="h-2.5 w-2.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results count + bulk actions bar */}
        <div className="flex items-center justify-between mb-3 min-h-[32px]">
          <p className="text-sm font-semibold text-foreground">
            {hasFilters ? (
              <>{filtered.length} result{filtered.length !== 1 ? "s" : ""}<span className="font-normal text-muted-foreground"> of {downloads.length} total</span></>
            ) : (
              <>Showing all {downloads.length} record{downloads.length !== 1 ? "s" : ""}</>
            )}
          </p>
          {selectedCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{selectedCount} selected</span>
              <Button variant="destructive" size="sm" className="gap-1.5 h-7 text-xs"
                onClick={() => setConfirmBulkOpen(true)} disabled={deleteDownloadMutation.isPending}>
                <Trash2 className="h-3.5 w-3.5" />
                Delete {selectedCount} record{selectedCount !== 1 ? "s" : ""}
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                onClick={() => setSelectedIds(new Set())}>
                Deselect all
              </Button>
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
          <>
            <div className="rounded-xl border border-border/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50 bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <Checkbox
                        checked={allPageSelected}
                        onCheckedChange={toggleSelectAllPage}
                        aria-label="Select all on this page"
                        className={somePageSelected && !allPageSelected ? "opacity-50" : ""}
                      />
                    </th>
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
                  {paginated.map((d: any, i: number) => {
                    const isSelected = selectedIds.has(d.id);
                    return (
                      <tr
                        key={d.id}
                        onClick={() => toggleSelectOne(d.id)}
                        className={`border-b border-border/30 hover:bg-muted/20 transition-colors cursor-pointer ${isSelected ? "bg-primary/5" : i % 2 === 0 ? "" : "bg-muted/5"}`}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Checkbox checked={isSelected} onCheckedChange={() => toggleSelectOne(d.id)} aria-label="Select row" />
                        </td>

                        {/* Track */}
                        <td className="px-4 py-3 max-w-[180px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <TipCell text={d.trackTitle ?? ""} maxW="max-w-[140px]" className="font-medium" />
                          </div>
                        </td>

                        {/* Composer */}
                        <td className="px-4 py-3 max-w-[150px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <Mic2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <TipCell text={d.composerName ?? ""} maxW="max-w-[110px]" className="text-muted-foreground" />
                          </div>
                        </td>

                        {/* User */}
                        <td className="px-4 py-3 max-w-[170px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className={`truncate max-w-[120px] cursor-default ${!d.userName ? "text-muted-foreground italic" : ""}`}>
                                    {d.userName ?? (d.ipAddress ? `Guest` : "Guest")}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs max-w-xs break-words">
                                  <p className="font-medium">{d.userName ?? "Guest (not signed in)"}</p>
                                  {d.userEmail && <p className="text-muted-foreground">{d.userEmail}</p>}
                                  {!d.userName && d.ipAddress && <p className="text-muted-foreground">IP: {d.ipAddress}</p>}
                                </TooltipContent>
                              </Tooltip>
                              {d.userEmail && <p className="text-xs text-muted-foreground truncate max-w-[120px]">{d.userEmail}</p>}
                              {!d.userName && d.ipAddress && <p className="text-xs text-muted-foreground truncate max-w-[120px]">IP: {d.ipAddress}</p>}
                            </div>
                          </div>
                        </td>

                        {/* Project */}
                        <td className="px-4 py-3 max-w-[150px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <TipCell text={d.projectName ?? ""} maxW="max-w-[110px]" />
                          </div>
                        </td>

                        {/* Type */}
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${d.fileType === "clean_wav" ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                            {d.fileType === "clean_wav" ? "Clean WAV" : "Watermarked"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
                            <Calendar className="h-3 w-3 shrink-0" />
                            {formatDate(d.downloadedAt)}
                          </div>
                        </td>

                        {/* Delete */}
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setConfirmSingleId(d.id)}
                            disabled={deleteDownloadMutation.isPending}
                            title="Delete this record"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination bar */}
            <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
              {/* Page size selector */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>Rows per page:</span>
                <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
                  <SelectTrigger className="h-8 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Page info + navigation */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {pageStart + 1}–{pageEnd} of {filtered.length}
                </span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>

                {/* Page number buttons — show up to 5 around current page */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
                  .reduce<(number | "...")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("...");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`ellipsis-${idx}`} className="text-xs text-muted-foreground px-1">…</span>
                    ) : (
                      <Button
                        key={item}
                        variant={safePage === item ? "default" : "outline"}
                        size="icon"
                        className="h-7 w-7 text-xs"
                        onClick={() => setPage(item as number)}
                      >
                        {item}
                      </Button>
                    )
                  )}

                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Single-delete confirmation */}
      <AlertDialog open={confirmSingleId !== null} onOpenChange={open => { if (!open) setConfirmSingleId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete download record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this download entry from the analytics log. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={executeSingleDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk-delete confirmation */}
      <AlertDialog open={confirmBulkOpen} onOpenChange={setConfirmBulkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} record{selectedCount !== 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove {selectedCount} download {selectedCount !== 1 ? "entries" : "entry"} from the analytics log. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={executeBulkDelete}>
              Delete {selectedCount} record{selectedCount !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
