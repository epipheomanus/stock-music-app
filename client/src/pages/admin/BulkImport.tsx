import { useState, useRef, useCallback } from "react";
import Papa from "papaparse";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import {
  Upload, FileText, X, CheckCircle2, AlertCircle,
  SkipForward, Loader2, ChevronDown, ChevronUp, Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────
type CsvRow = Record<string, string>;
interface ColumnMapping {
  title: string;
  composerName: string;
  bpm: string;
  keySignature: string;
  genres: string;
  moods: string;
  attributes: string;
  wavUrl: string;
  description: string;
  isPublished: string;
}
type ImportStatus = "success" | "skipped" | "error";
interface ImportResult {
  title: string;
  status: ImportStatus;
  trackId?: number;
  error?: string;
}

// ─── Split comma/semicolon/pipe-separated tag string ─────────────────────────
function splitTags(val: string): string[] {
  return val.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
}

// ─── Convert Dropbox share URL to direct download URL ─────────────────────────
function toDropboxDirect(url: string): string {
  if (!url.includes("dropbox.com")) return url;
  // Remove existing dl/raw params then append dl=1
  let u = url.replace(/([?&])(dl|raw)=[01]/g, "").replace(/[?&]$/, "");
  return u + (u.includes("?") ? "&dl=1" : "?dl=1");
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ImportStatus | "pending" | "running" }) {
  if (status === "pending")
    return <span className="text-xs text-muted-foreground">Queued</span>;
  if (status === "running")
    return (
      <span className="text-xs text-blue-600 flex items-center gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Importing…
      </span>
    );
  if (status === "success")
    return (
      <span className="text-xs text-emerald-600 flex items-center gap-1">
        <CheckCircle2 className="h-3 w-3" /> Imported
      </span>
    );
  if (status === "skipped")
    return (
      <span className="text-xs text-amber-600 flex items-center gap-1">
        <SkipForward className="h-3 w-3" /> Skipped (duplicate)
      </span>
    );
  return (
    <span className="text-xs text-destructive flex items-center gap-1">
      <AlertCircle className="h-3 w-3" /> Error
    </span>
  );
}

// ─── Batch size for chunked imports ──────────────────────────────────────────
const BATCH_SIZE = 10;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AdminBulkImport() {
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({
    title: "",
    composerName: "",
    bpm: "",
    keySignature: "",
    genres: "",
    moods: "",
    attributes: "",
    wavUrl: "",
    description: "",
    isPublished: "",
  });
  const [importing, setImporting] = useState(false);
  // Per-row live status during import
  const [rowStatuses, setRowStatuses] = useState<(ImportStatus | "pending" | "running")[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [showPreview, setShowPreview] = useState(true);
  const [showGuide, setShowGuide] = useState(false);

  const bulkImportMutation = trpc.tracks.bulkImport.useMutation();

  const loadFile = useCallback((file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file");
      return;
    }
    setFileName(file.name);
    setResults([]);
    setRowStatuses([]);
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data as CsvRow[];
        if (rows.length === 0) {
          toast.error("No data rows found in CSV");
          return;
        }
        const hdrs = result.meta.fields ?? Object.keys(rows[0]);
        setHeaders(hdrs);
        setCsvRows(rows);
        // Auto-detect column mapping by common names
        const autoMap = (...candidates: string[]): string => {
          for (const c of candidates) {
            const found = hdrs.find(h =>
              h.toLowerCase().includes(c.toLowerCase())
            );
            if (found) return found;
          }
          return "";
        };
        setMapping({
          title: autoMap("track name", "title", "name", "song"),
          composerName: autoMap("composer", "artist", "author", "by"),
          bpm: autoMap("bpm", "tempo", "beats"),
          keySignature: autoMap("key", "musical key", "key sig"),
          genres: autoMap("genre", "genres", "style"),
          moods: autoMap("mood", "moods", "feel", "feeling"),
          attributes: autoMap("attribute", "attributes", "tag", "tags", "descriptor"),
          wavUrl: autoMap("dropbox", "wav", "url", "link", "file", "download"),
          description: autoMap("description", "notes", "desc", "about"),
          isPublished: autoMap("published", "publish", "visible", "active"),
        });
        toast.success(`Loaded ${rows.length} rows from ${file.name}`);
      },
      error: (err) => toast.error(`CSV parse error: ${err.message}`),
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) loadFile(file);
    },
    [loadFile]
  );

  const handleImport = async () => {
    if (!mapping.title) {
      toast.error("Please map the Track Name column");
      return;
    }
    if (!mapping.wavUrl) {
      toast.error("Please map the WAV/Dropbox URL column");
      return;
    }

    const importRows = csvRows
      .map((row) => ({
        title: row[mapping.title]?.trim() ?? "",
        composerName: mapping.composerName
          ? row[mapping.composerName]?.trim() || undefined
          : undefined,
        description: mapping.description
          ? row[mapping.description]?.trim() || undefined
          : undefined,
        bpm:
          mapping.bpm && row[mapping.bpm]
            ? Number(row[mapping.bpm]) || undefined
            : undefined,
        keySignature: mapping.keySignature
          ? row[mapping.keySignature]?.trim() || undefined
          : undefined,
        genres: mapping.genres ? splitTags(row[mapping.genres] ?? "") : [],
        moods: mapping.moods ? splitTags(row[mapping.moods] ?? "") : [],
        attributes: mapping.attributes
          ? splitTags(row[mapping.attributes] ?? "")
          : [],
        hiddenTags: [] as string[],
        wavUrl: toDropboxDirect(row[mapping.wavUrl]?.trim() ?? ""),
        isPublished: mapping.isPublished
          ? !["false", "no", "0", "draft"].includes(
              (row[mapping.isPublished] ?? "").toLowerCase()
            )
          : true,
      }))
      .filter((r) => r.title && r.wavUrl);

    if (importRows.length === 0) {
      toast.error("No valid rows to import (missing title or URL)");
      return;
    }

    setImporting(true);
    setResults([]);
    // Initialise all rows as "pending"
    setRowStatuses(importRows.map(() => "pending"));

    const allResults: ImportResult[] = [];

    // Process in batches so we can update per-row status live
    for (let i = 0; i < importRows.length; i += BATCH_SIZE) {
      const batch = importRows.slice(i, i + BATCH_SIZE);
      // Mark this batch as "running"
      setRowStatuses((prev) => {
        const next = [...prev];
        for (let j = i; j < i + batch.length; j++) next[j] = "running";
        return next;
      });
      try {
        const { results: batchResults } = await bulkImportMutation.mutateAsync({
          rows: batch,
        });
        batchResults.forEach((r, j) => {
          allResults.push(r);
          setRowStatuses((prev) => {
            const next = [...prev];
            next[i + j] = r.status;
            return next;
          });
        });
      } catch (err: any) {
        // Mark entire batch as error
        batch.forEach((row, j) => {
          const errResult: ImportResult = {
            title: row.title,
            status: "error",
            error: err.message ?? "Batch failed",
          };
          allResults.push(errResult);
          setRowStatuses((prev) => {
            const next = [...prev];
            next[i + j] = "error";
            return next;
          });
        });
      }
    }

    setResults(allResults);
    utils.tracks.adminList.invalidate();
    const counts = allResults.reduce(
      (acc, r) => { acc[r.status]++; return acc; },
      { success: 0, skipped: 0, error: 0 }
    );
    toast.success(
      `Import complete: ${counts.success} imported, ${counts.skipped} skipped, ${counts.error} errors`
    );
    setImporting(false);
  };

  const successCount = results.filter((r) => r.status === "success").length;
  const skippedCount = results.filter((r) => r.status === "skipped").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return (
    <AdminLayout>
      <div className="p-8 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-1">Bulk Import from Airtable</h1>
            <p className="text-sm text-muted-foreground">
              Upload an Airtable CSV export to import multiple tracks at once.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setShowGuide((g) => !g)}
          >
            <Info className="h-3.5 w-3.5" /> How it works
          </Button>
        </div>

        {/* Guide */}
        {showGuide && (
          <div className="mb-6 p-4 rounded-xl border border-border/60 bg-muted/20 text-sm space-y-2">
            <p className="font-semibold">How to export from Airtable:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>Open your Airtable base and go to the view with your music tracks.</li>
              <li>
                Click <strong>…</strong> (More) → <strong>Download CSV</strong>.
              </li>
              <li>
                Make sure your table has columns for: Track Name, Composer, BPM,
                Key, Genre, Mood, Attributes, and a Dropbox link column.
              </li>
              <li>Upload the downloaded CSV file below and map each column.</li>
            </ol>
            <p className="font-semibold mt-3">Dropbox links:</p>
            <p className="text-muted-foreground">
              Paste the standard Dropbox share links (ending in{" "}
              <code>?dl=0</code>). SoundVault will automatically convert them to
              direct download URLs.
            </p>
            <p className="font-semibold mt-3">Tags:</p>
            <p className="text-muted-foreground">
              Genre, Mood, and Attributes columns can contain multiple values
              separated by commas, semicolons, or pipes (e.g.{" "}
              <code>Rock, Pop, Indie</code>).
            </p>
            <p className="font-semibold mt-3">Large libraries:</p>
            <p className="text-muted-foreground">
              Tracks are imported in batches of {BATCH_SIZE}. Each WAV file is
              downloaded from Dropbox and uploaded to storage. Watermark
              generation starts automatically in the background after each track
              is saved.
            </p>
          </div>
        )}

        {/* Step 1: Upload CSV */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Step 1 — Upload CSV
          </h2>
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all select-none
              ${
                dragging
                  ? "border-primary bg-primary/8 scale-[1.01]"
                  : fileName
                  ? "border-primary/50 bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/30"
              }`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadFile(f);
              }}
            />
            {fileName ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <span className="font-medium text-primary">{fileName}</span>
                <span className="text-sm text-muted-foreground">
                  ({csvRows.length} rows)
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCsvRows([]);
                    setHeaders([]);
                    setFileName("");
                    setResults([]);
                    setRowStatuses([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="text-muted-foreground">
                <Upload className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">
                  Drag & drop your Airtable CSV, or click to browse
                </p>
                <p className="text-xs mt-1 opacity-60">
                  Supports standard Airtable CSV exports
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Column Mapping */}
        {headers.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
              Step 2 — Map Columns
            </h2>
            <div className="p-4 rounded-xl border border-border/60 bg-card">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(
                  [
                    { key: "title", label: "Track Name *", required: true },
                    { key: "wavUrl", label: "Dropbox / WAV URL *", required: true },
                    { key: "composerName", label: "Composer", required: false },
                    { key: "bpm", label: "BPM", required: false },
                    { key: "keySignature", label: "Key", required: false },
                    { key: "genres", label: "Genre(s)", required: false },
                    { key: "moods", label: "Mood(s)", required: false },
                    { key: "attributes", label: "Attributes", required: false },
                    { key: "description", label: "Description", required: false },
                    { key: "isPublished", label: "Published (column)", required: false },
                  ] as { key: keyof ColumnMapping; label: string; required: boolean }[]
                ).map(({ key, label, required }) => (
                  <div key={key} className="space-y-1">
                    <Label className="text-xs">{label}</Label>
                    <select
                      value={mapping[key]}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [key]: e.target.value }))
                      }
                      className={`w-full h-8 text-xs rounded-md border px-2 bg-background ${
                        required && !mapping[key]
                          ? "border-destructive"
                          : "border-border"
                      }`}
                    >
                      <option value="">— not mapped —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Preview */}
        {csvRows.length > 0 && mapping.title && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Step 3 — Preview ({csvRows.length} rows)
              </h2>
              <button
                className="text-xs text-muted-foreground flex items-center gap-1"
                onClick={() => setShowPreview((p) => !p)}
              >
                {showPreview ? (
                  <>
                    <ChevronUp className="h-3.5 w-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3.5 w-3.5" /> Show
                  </>
                )}
              </button>
            </div>
            {showPreview && (
              <div className="rounded-xl border border-border/60 overflow-hidden">
                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Track Name</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Composer</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">BPM</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Key</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">Tags</th>
                        <th className="text-left px-3 py-2 font-medium text-muted-foreground">WAV URL</th>
                        {rowStatuses.length > 0 && (
                          <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {csvRows.slice(0, 100).map((row, i) => (
                        <tr
                          key={i}
                          className={`border-t border-border/40 hover:bg-muted/20 ${
                            rowStatuses[i] === "error"
                              ? "bg-destructive/5"
                              : rowStatuses[i] === "skipped"
                              ? "bg-amber-50/30"
                              : rowStatuses[i] === "success"
                              ? "bg-emerald-50/20"
                              : ""
                          }`}
                        >
                          <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-1.5 font-medium max-w-[160px] truncate">
                            {mapping.title ? row[mapping.title] : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[100px] truncate">
                            {mapping.composerName ? row[mapping.composerName] : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {mapping.bpm ? row[mapping.bpm] : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {mapping.keySignature ? row[mapping.keySignature] : "—"}
                          </td>
                          <td className="px-3 py-1.5 max-w-[160px]">
                            <div className="flex flex-wrap gap-0.5">
                              {[
                                ...(mapping.genres
                                  ? splitTags(row[mapping.genres] ?? "")
                                  : []
                                ).map((t) => ({ t, c: "bg-blue-100 text-blue-700" })),
                                ...(mapping.moods
                                  ? splitTags(row[mapping.moods] ?? "")
                                  : []
                                ).map((t) => ({ t, c: "bg-purple-100 text-purple-700" })),
                                ...(mapping.attributes
                                  ? splitTags(row[mapping.attributes] ?? "")
                                  : []
                                ).map((t) => ({ t, c: "bg-amber-100 text-amber-700" })),
                              ]
                                .slice(0, 5)
                                .map(({ t, c }, j) => (
                                  <span
                                    key={j}
                                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${c}`}
                                  >
                                    {t}
                                  </span>
                                ))}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[180px] truncate font-mono text-[10px]">
                            {mapping.wavUrl ? row[mapping.wavUrl] : "—"}
                          </td>
                          {rowStatuses.length > 0 && (
                            <td className="px-3 py-1.5">
                              <StatusBadge status={rowStatuses[i] ?? "pending"} />
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvRows.length > 100 && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t border-border/40">
                      Showing first 100 of {csvRows.length} rows
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Import button */}
        {csvRows.length > 0 && (
          <div className="mb-8">
            <Button
              onClick={handleImport}
              disabled={importing || !mapping.title || !mapping.wavUrl}
              className="gap-2"
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Importing{" "}
                  {csvRows.length} tracks…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Import {csvRows.length} Tracks
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Tracks with duplicate titles will be skipped. WAV files are
              downloaded from Dropbox and uploaded to storage. Watermark
              generation starts automatically in the background.
            </p>
          </div>
        )}

        {/* Results summary */}
        {results.length > 0 && (
          <div>
            <div className="flex items-center gap-4 mb-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Import Results
              </h2>
              <div className="flex items-center gap-2">
                {successCount > 0 && (
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">
                    {successCount} imported
                  </Badge>
                )}
                {skippedCount > 0 && (
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">
                    {skippedCount} skipped
                  </Badge>
                )}
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-xs">
                    {errorCount} errors
                  </Badge>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Track Name</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-muted-foreground">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t border-border/40 ${
                          r.status === "error"
                            ? "bg-destructive/5"
                            : r.status === "skipped"
                            ? "bg-amber-50/30"
                            : ""
                        }`}
                      >
                        <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-1.5 font-medium">{r.title}</td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={r.status} />
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground">
                          {r.status === "success" &&
                            `Track ID: ${r.trackId} — watermark queued`}
                          {r.status === "skipped" && r.error}
                          {r.status === "error" && (
                            <span className="text-destructive">{r.error}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
