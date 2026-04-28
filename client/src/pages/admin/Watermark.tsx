import { useState, useRef } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Upload, Loader2, CheckCircle2, Mic2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function AdminWatermark() {
  const utils = trpc.useUtils();
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const configQuery = trpc.watermark.getConfig.useQuery();
  const config = configQuery.data;

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { toast.error("Please select a WAV file"); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("watermark", file);
      const res = await fetch("/api/admin/upload-watermark", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Upload failed" }));
        throw new Error(err.error || "Upload failed");
      }
      await utils.watermark.getConfig.invalidate();
      toast.success("Watermark audio updated! New tracks will use this watermark.");
      setFile(null);
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AdminLayout>
      <div className="p-8 max-w-2xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold mb-1">Watermark Configuration</h1>
          <p className="text-sm text-muted-foreground">
            Upload your custom watermark audio clip. It will be overlaid on every track at 10-second intervals to create watermarked preview files.
          </p>
        </div>

        {/* Current config */}
        <div className="p-5 rounded-xl border border-border/50 bg-card/50 mb-6">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Mic2 className="h-4 w-4 text-muted-foreground" />
            Current Watermark
          </h2>
          {configQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading…</div>
          ) : config ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-400" />
                <span className="font-medium">Watermark configured</span>
              </div>
              <p className="text-xs text-muted-foreground">Key: {config.audioKey}</p>
              <p className="text-xs text-muted-foreground">
                Updated: {new Date(config.updatedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
              {config.audioUrl && (
                <audio controls src={config.audioUrl} className="mt-2 h-8 w-full max-w-xs" />
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              No watermark configured yet. Upload one below.
            </div>
          )}
        </div>

        {/* Upload form */}
        <div className="p-5 rounded-xl border border-border/50 bg-card/50">
          <h2 className="font-semibold mb-4">Upload New Watermark</h2>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="space-y-2">
              <Label>Watermark Audio File (WAV)</Label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${file ? "border-primary/50 bg-primary/5" : "border-border hover:border-border/80"}`}
                onClick={() => fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".wav,audio/wav" className="hidden" onChange={e => setFile(e.target.files?.[0] ?? null)} />
                {file ? (
                  <div className="space-y-1">
                    <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
                    <p className="font-medium text-sm">{file.name}</p>
                    <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <div className="space-y-2 text-muted-foreground">
                    <Upload className="h-8 w-8 mx-auto opacity-40" />
                    <p className="text-sm">Click to select a WAV file</p>
                    <p className="text-xs">This should be a short audio clip (1–3 seconds recommended)</p>
                  </div>
                )}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/30 border border-border/30">
              <p className="text-xs text-muted-foreground">
                <strong>How it works:</strong> When you upload a new track, the system automatically generates a watermarked MP3 by overlaying this audio clip at every 10-second interval. The clean WAV is only available to logged-in users who download from their cart.
              </p>
            </div>

            <Button type="submit" disabled={uploading || !file} className="gap-2">
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</> : <><Upload className="h-4 w-4" />Save Watermark</>}
            </Button>
          </form>
        </div>
      </div>
    </AdminLayout>
  );
}
