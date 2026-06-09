/**
 * Upload routes for admin track and watermark uploads.
 * These use multipart/form-data so they live outside tRPC.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import { Router, Request, Response } from "express";
import ffmpegPath from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
const execFileAsync = promisify(execFile);
const FFPROBE_BIN = ffprobeInstaller?.path || "ffprobe";
import multer from "multer";
import fs from "fs";
import path from "path";
import archiver from "archiver";
import os from "os";
import { storagePut, storageGetSignedUrl } from "./storage";
import {
  createTrack,
  updateTrack,
  replaceTrackTags,
  upsertWatermarkConfig,
  getWatermarkConfig,
} from "./db";
import { generateWatermarkedMp3, downloadToTemp, convert16BitWav, generateWaveformPeaks, generateMp3Preview } from "./watermark";
import { parse as csvParse } from "csv-parse/sync";
import unzipper from "unzipper";
import { verifyJwt } from "./_core/jwt";
import { getUserByOpenId } from "./db";
import { COOKIE_NAME } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";

// ─── Multer config (memory storage) ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
});

// ─── Auth middleware ───────────────────────────────────────────────────────────
// Uses the same cookie-based JWT verification as tRPC context (verifyJwt + getUserByOpenId)
// so local-login admins (username/password) are authenticated correctly.
async function requireAdmin(req: Request, res: Response, next: Function) {
  try {
    const cookieHeader = req.headers.cookie;
    const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
    const sessionToken = cookies[COOKIE_NAME];
    const session = await verifyJwt(sessionToken);
    if (!session?.openId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const user = await getUserByOpenId(session.openId);
    if (!user || user.role !== "admin") {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    (req as any).user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

export function registerUploadRoutes(app: any) {
  const router = Router();

  // ─── POST /api/admin/upload-track ─────────────────────────────────────────
  // Fields: title, composerName, description, bpm, isPublished, tags (JSON), wav (file), cover (file), stems (files[])
  router.post(
    "/api/admin/upload-track",
    requireAdmin,
    upload.fields([
      { name: "wav", maxCount: 1 },
      { name: "cover", maxCount: 1 },
      { name: "stems", maxCount: 200 },
    ]),
    async (req: Request, res: Response) => {
      try {
        const files = req.files as Record<string, Express.Multer.File[]>;
        const wavFiles = files?.["wav"];
        if (!wavFiles || wavFiles.length === 0) {
          res.status(400).json({ error: "WAV file is required" });
          return;
        }
        const wavFile = wavFiles[0];
        const coverFiles = files?.["cover"];
        const stemsFiles = files?.["stems"];

        const title = req.body.title?.trim();
        if (!title) {
          res.status(400).json({ error: "Title is required" });
          return;
        }

         const tags: { type: "genre" | "mood" | "attribute" | "hidden"; value: string }[] =
          req.body.tags ? JSON.parse(req.body.tags) : [];
        // 1. Write original WAV to temp for processing
        const tmpOrigPath = path.join(os.tmpdir(), `orig_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
        fs.writeFileSync(tmpOrigPath, wavFile.buffer);
        // 1a. Upload original 24-bit WAV (preserved for download)
        const origKeyBase = `tracks/wav/orig_${Date.now()}_${wavFile.originalname.replace(/\s+/g, "_")}`;
        const { key: origWavKey, url: origWavUrl } = await storagePut(origKeyBase, wavFile.buffer, "audio/wav");
        // 1b. Convert to 16-bit WAV for browser playback
        let wav16Buf: Buffer;
        try {
          wav16Buf = await convert16BitWav(tmpOrigPath);
        } catch {
          wav16Buf = wavFile.buffer; // fallback to original if conversion fails
        }
        const wavKeyBase = `tracks/wav/${Date.now()}_${wavFile.originalname.replace(/\s+/g, "_")}`;
        const { key: wavKey, url: wavUrl } = await storagePut(wavKeyBase, wav16Buf, "audio/wav");
        // 1c. Generate waveform peaks
        let waveformPeaks: string | undefined;
        try {
          waveformPeaks = await generateWaveformPeaks(tmpOrigPath, 500);
        } catch { /* not critical */ }
        // 1d. Generate 192kbps MP3 preview for fast browser streaming
        let mp3PreviewKey: string | undefined;
        let mp3PreviewUrl: string | undefined;
        try {
          const mp3Buf = await generateMp3Preview(tmpOrigPath);
          const mp3KeyBase = `tracks/mp3preview/${Date.now()}_${wavFile.originalname.replace(/\s+/g, "_").replace(/\.wav$/i, ".mp3")}`;
          const { key: pk, url: pu } = await storagePut(mp3KeyBase, mp3Buf, "audio/mpeg");
          mp3PreviewKey = pk;
          mp3PreviewUrl = pu;
        } catch (e) { console.error("[upload-track] MP3 preview generation failed:", e); }
        try { fs.unlinkSync(tmpOrigPath); } catch { /* ignore */ }
        // 2. Upload cover art if providedd
        let coverArtUrl: string | undefined;
        if (coverFiles && coverFiles.length > 0) {
          const coverFile = coverFiles[0];
          const coverKey = `tracks/covers/${Date.now()}_${coverFile.originalname.replace(/\s+/g, "_")}`;
          const { url } = await storagePut(coverKey, coverFile.buffer, coverFile.mimetype);
          coverArtUrl = url;
        }

        // 3. Handle stems — create a ZIP if multiple files
        let stemsZipUrl: string | undefined;
        let hasStems = false;
        if (stemsFiles && stemsFiles.length > 0) {
          hasStems = true;
          // Create a ZIP in memory
          const tmpZipPath = path.join(os.tmpdir(), `stems_${Date.now()}.zip`);
          await new Promise<void>((resolve, reject) => {
            const output = fs.createWriteStream(tmpZipPath);
            const archive = archiver("zip", { zlib: { level: 6 } });
            output.on("close", resolve);
            archive.on("error", reject);
            archive.pipe(output);
            for (const stemFile of stemsFiles) {
              archive.append(stemFile.buffer, { name: `stems/${stemFile.originalname}` });
            }
            // Also add the mixdown WAV into the zip
            archive.append(wavFile.buffer, { name: `${title.replace(/\s+/g, "_")}_mixdown.wav` });
            archive.finalize();
          });
          const zipBuffer = fs.readFileSync(tmpZipPath);
          const zipKey = `tracks/stems/${Date.now()}_${title.replace(/\s+/g, "_")}_stems.zip`;
          const { url } = await storagePut(zipKey, zipBuffer, "application/zip");
          stemsZipUrl = url;
          fs.unlinkSync(tmpZipPath);
        }

        // 4. Get duration via ffprobe
        let durationSeconds: number | undefined;
        try {
          const tmpDurPath = path.join(os.tmpdir(), `dur_${Date.now()}.wav`);
          fs.writeFileSync(tmpDurPath, wavFile.buffer);
          const { stdout } = await execFileAsync(FFPROBE_BIN, [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            tmpDurPath,
          ]);
          durationSeconds = Math.round(parseFloat(stdout.trim()));
          fs.unlinkSync(tmpDurPath);
        } catch {
          // Duration detection failed — not critical
        }

        // 5. Create track record
        const trackId = await createTrack({
          title,
          composerName: req.body.composerName?.trim() || undefined,
          description: req.body.description?.trim() || undefined,
          bpm: req.body.bpm ? Number(req.body.bpm) : undefined,
          keySignature: req.body.keySignature?.trim() || undefined,
          durationSeconds,
          wavKey,
          wavUrl,
          originalWavKey: origWavKey,
          originalWavUrl: origWavUrl,
          mp3PreviewKey,
          mp3PreviewUrl,
          waveformPeaks,
          coverArtUrl,
          stemsZipUrl,
          hasStems,
          isPublished: req.body.isPublished === "true",
          watermarkStatus: "pending",
        } as any);

        // 6. Save tags
        if (tags.length > 0) {
          await replaceTrackTags(trackId, tags);
        }

        // 7. Generate watermark in background (non-blocking)
        generateWatermarkInBackground(trackId, wavFile.buffer, wavFile.originalname);

        res.json({ success: true, trackId });
      } catch (err: any) {
        console.error("[upload-track]", err);
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    }
  );

  // ─── POST /api/admin/upload-watermark ─────────────────────────────────────
  router.post(
    "/api/admin/upload-watermark",
    requireAdmin,
    upload.single("watermark"),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: "Watermark file is required" });
          return;
        }
        const wmKeyBase = `watermark/${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
        // storagePut appends a random hash suffix - use the RETURNED key, not wmKeyBase
        const { key: wmKey, url: wmUrl } = await storagePut(wmKeyBase, req.file.buffer, "audio/wav");
        await upsertWatermarkConfig(wmKey, wmUrl);
        res.json({ success: true, url: wmUrl });
      } catch (err: any) {
        console.error("[upload-watermark]", err);
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    }
  );

  // ─── POST /api/admin/bulk-import ─────────────────────────────────────────
  // Accepts a ZIP containing a CSV metadata file + WAV audio files.
  // CSV columns (case-insensitive, flexible):
  //   Title*, Composer, Description, BPM, Key, Genre, Mood/Attributes, Published
  // (* required)
  // The Mood/Attributes column values are classified against the site taxonomy:
  //   - Matches mood list → tagged as "mood"
  //   - Matches attribute list → tagged as "attribute"
  //   - Matches genre list → tagged as "genre"
  //   - Unrecognized → tagged as "hidden"
  router.post(
    "/api/admin/bulk-import",
    requireAdmin,
    upload.single("zip"),
    async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: "ZIP file is required" });
        return;
      }

      // ── Taxonomy for tag classification ──
      const MOOD_TAGS = new Set([
        "angry","carefree","chill","eerie","emotional","happy","heartwarming",
        "hopeful","love","peaceful","sad","serious","silly","somber","uplifting",
      ]);
      const ATTRIBUTE_TAGS = new Set([
        "adventurous","aggressive","badass","bubbly","calming","cinematic",
        "comedic","corporate","cute","dark","digital","energetic","epic",
        "fast","fun","funky","inspirational","intense","motivational","nerdy",
        "professional","retro","romantic","sexy","technology","whimsical",
      ]);
      const GENRE_TAGS = new Set([
        "ambient","country","dance","disco","electronic","folk","funk",
        "hip hop","indie","jazz","jingle","oldies","orchestral","pop",
        "religious","rock","techno","world",
      ]);

      function classifyTag(raw: string): { type: "genre"|"mood"|"attribute"|"hidden"; value: string } {
        const lower = raw.trim().toLowerCase();
        const display = raw.trim();
        if (MOOD_TAGS.has(lower)) return { type: "mood", value: display };
        if (ATTRIBUTE_TAGS.has(lower)) return { type: "attribute", value: display };
        if (GENRE_TAGS.has(lower)) return { type: "genre", value: display };
        return { type: "hidden", value: display };
      }

      function normalizeHeader(h: string): string {
        return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
      }

      // ── Extract ZIP contents ──
      const zipBuffer = req.file.buffer;
      const wavFiles: Map<string, Buffer> = new Map();
      let csvBuffer: Buffer | null = null;

      try {
        const directory = await unzipper.Open.buffer(zipBuffer);
        for (const entry of directory.files) {
          if (entry.type === "Directory") continue;
          const name = path.basename(entry.path);
          const nameLower = name.toLowerCase();
          const buf = await entry.buffer();
          if (nameLower.endsWith(".csv")) {
            csvBuffer = buf;
          } else if (nameLower.endsWith(".wav")) {
            wavFiles.set(name.toLowerCase(), buf);
            wavFiles.set(name, buf); // also store with original case
          }
        }
      } catch (err: any) {
        res.status(400).json({ error: "Invalid ZIP file: " + err.message });
        return;
      }

      if (!csvBuffer) {
        res.status(400).json({ error: "No CSV file found in ZIP" });
        return;
      }
      if (wavFiles.size === 0) {
        res.status(400).json({ error: "No WAV files found in ZIP" });
        return;
      }

      // ── Parse CSV ──
      let rows: Record<string, string>[];
      try {
        rows = csvParse(csvBuffer, {
          columns: (headers: string[]) => headers.map(normalizeHeader),
          skip_empty_lines: true,
          trim: true,
        }) as Record<string, string>[];
      } catch (err: any) {
        res.status(400).json({ error: "CSV parse error: " + err.message });
        return;
      }

      if (rows.length === 0) {
        res.status(400).json({ error: "CSV has no data rows" });
        return;
      }

      // ── Process each row ──
      const results: { title: string; status: "ok"|"skipped"|"error"; error?: string; trackId?: number }[] = [];

      for (const row of rows) {
        const title = (row["title"] || "").trim();
        if (!title) {
          results.push({ title: "(no title)", status: "skipped", error: "Missing title" });
          continue;
        }

        // Find WAV file — try exact match then case-insensitive
        const wavFilename = (row["file"] || row["filename"] || row["wav"] || row["wavfile"] || "").trim();
        let wavBuf: Buffer | undefined;
        if (wavFilename) {
          wavBuf = wavFiles.get(wavFilename) ?? wavFiles.get(wavFilename.toLowerCase());
        }
        if (!wavBuf) {
          // Try matching by title
          const titleKey = title.toLowerCase().replace(/\s+/g, "_") + ".wav";
          wavBuf = wavFiles.get(titleKey);
        }
        if (!wavBuf) {
          // Try first WAV file that starts with the title
          for (const [k, v] of Array.from(wavFiles.entries())) {
            if (k.toLowerCase().startsWith(title.toLowerCase().slice(0, 8))) {
              wavBuf = v;
              break;
            }
          }
        }
        if (!wavBuf) {
          results.push({ title, status: "skipped", error: `No WAV file found for "${title}"` });
          continue;
        }

        try {
          // 1. Write original WAV to temp
          const tmpOrigPath = path.join(os.tmpdir(), `orig_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
          fs.writeFileSync(tmpOrigPath, wavBuf);

          // 2. Upload original 24-bit WAV
          const origKeyBase = `tracks/wav/orig_${Date.now()}_${title.replace(/\s+/g, "_")}.wav`;
          const { key: origKey, url: origUrl } = await storagePut(origKeyBase, wavBuf, "audio/wav");

          // 3. Convert to 16-bit WAV for browser playback
          let wav16Buf: Buffer;
          try {
            wav16Buf = await convert16BitWav(tmpOrigPath);
          } catch {
            // If conversion fails, use original (might still work)
            wav16Buf = wavBuf;
          }
          const wav16KeyBase = `tracks/wav/${Date.now()}_${title.replace(/\s+/g, "_")}.wav`;
          const { key: wavKey, url: wavUrl } = await storagePut(wav16KeyBase, wav16Buf, "audio/wav");

          // 4. Generate waveform peaks
          let waveformPeaks: string | undefined;
          try {
            waveformPeaks = await generateWaveformPeaks(tmpOrigPath, 500);
          } catch {
            // Peaks generation failed — not critical
          }

          // 4b. Generate 192kbps MP3 preview for fast browser streaming
          let mp3PreviewKey: string | undefined;
          let mp3PreviewUrl: string | undefined;
          try {
            const mp3Buf = await generateMp3Preview(tmpOrigPath);
            const mp3KeyBase = `tracks/mp3preview/${Date.now()}_${title.replace(/\s+/g, "_")}.mp3`;
            const { key: pk, url: pu } = await storagePut(mp3KeyBase, mp3Buf, "audio/mpeg");
            mp3PreviewKey = pk;
            mp3PreviewUrl = pu;
          } catch (e) { console.error(`[bulk-import] MP3 preview failed for "${title}":`, e); }

          // 5. Get duration
          let durationSeconds: number | undefined;
          try {
            const { stdout } = await execFileAsync(FFPROBE_BIN, [
              "-v", "error",
              "-show_entries", "format=duration",
              "-of", "default=noprint_wrappers=1:nokey=1",
              tmpOrigPath,
            ]);
            durationSeconds = Math.round(parseFloat(stdout.trim()));
          } catch { /* not critical */ }

          // 6. Parse tags
          const tags: { type: "genre"|"mood"|"attribute"|"hidden"; value: string }[] = [];

          // Genre column
          const genreRaw = row["genre"] || "";
          for (const g of genreRaw.split(/[,;|]+/).map(s => s.trim()).filter(Boolean)) {
            const lower = g.toLowerCase();
            if (GENRE_TAGS.has(lower)) tags.push({ type: "genre", value: g });
            else tags.push({ type: "hidden", value: g });
          }

          // Mood/Attributes column — classify each value
          const moodAttrRaw = row["moodattributes"] || row["mood"] || row["attributes"] || row["moodattribute"] || "";
          for (const val of moodAttrRaw.split(/[,;|]+/).map(s => s.trim()).filter(Boolean)) {
            tags.push(classifyTag(val));
          }

          // Deduplicate tags
          const seenTags = new Set<string>();
          const uniqueTags = tags.filter(t => {
            const k = `${t.type}:${t.value.toLowerCase()}`;
            if (seenTags.has(k)) return false;
            seenTags.add(k);
            return true;
          });

          // 7. Create track record
          const isPublished = ["true","yes","1","published"].includes((row["published"] || "").toLowerCase());
          const trackId = await createTrack({
            title,
            composerName: row["composer"]?.trim() || undefined,
            description: row["description"]?.trim() || undefined,
            bpm: row["bpm"] ? Number(row["bpm"]) : undefined,
            keySignature: row["key"]?.trim() || row["keysignature"]?.trim() || undefined,
            durationSeconds,
            wavKey,
            wavUrl,
            originalWavKey: origKey,
            originalWavUrl: origUrl,
            mp3PreviewKey,
            mp3PreviewUrl,
            waveformPeaks,
            isPublished,
            watermarkStatus: "pending",
          } as any);

          // 8. Save tags
          if (uniqueTags.length > 0) {
            await replaceTrackTags(trackId, uniqueTags);
          }

          // 9. Cleanup temp
          try { fs.unlinkSync(tmpOrigPath); } catch { /* ignore */ }

          // 10. Generate watermark in background (non-blocking)
          generateWatermarkInBackground(trackId, wavBuf, title + ".wav");

          results.push({ title, status: "ok", trackId });
        } catch (err: any) {
          console.error(`[bulk-import] Failed for "${title}":`, err);
          results.push({ title, status: "error", error: err.message || "Unknown error" });
        }
      }

      const ok = results.filter(r => r.status === "ok").length;
      const skipped = results.filter(r => r.status === "skipped").length;
      const errors = results.filter(r => r.status === "error").length;

      res.json({ success: true, total: rows.length, ok, skipped, errors, results });
    }
  );

  // ─── GET /api/download/cart-zip ─────────────────────────────────────────────
  // Streams all cart tracks for the authenticated user as a single ZIP archive.
  // Query params: projectName (string), trackIds (comma-separated numbers)
  router.get("/api/download/cart-zip", async (req: Request, res: Response) => {
    try {
      // Authenticate via session cookie (same mechanism as tRPC context)
      let user: any;
      try {
        const { parse: parseCookieHeader } = await import("cookie");
        const { verifyJwt } = await import("./_core/jwt");
        const { getUserByOpenId } = await import("./db");
        const { COOKIE_NAME } = await import("../shared/const");
        const cookieHeader = req.headers.cookie;
        const cookies = cookieHeader ? parseCookieHeader(cookieHeader) : {};
        const sessionToken = cookies[COOKIE_NAME];
        const session = await verifyJwt(sessionToken);
        if (!session?.openId) throw new Error("No session");
        const dbUser = await getUserByOpenId(session.openId);
        if (!dbUser) throw new Error("User not found");
        user = dbUser;
      } catch {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // Block locked accounts from downloading clean tracks
      if (user.isLocked) {
        res.status(403).json({ error: "Your account has been locked. Please contact support." });
        return;
      }

      const projectName = (req.query.projectName as string)?.trim();
      const trackIdsRaw = req.query.trackIds as string;
      if (!projectName || !trackIdsRaw) {
        res.status(400).json({ error: "projectName and trackIds are required" });
        return;
      }

      const trackIds = trackIdsRaw.split(",").map(Number).filter(n => !isNaN(n) && n > 0);
      if (trackIds.length === 0) {
        res.status(400).json({ error: "No valid trackIds provided" });
        return;
      }

      // Resolve tracks
      const { getTrackById, logDownload, clearCart } = await import("./db");
      const { storageGetSignedUrl: getSignedUrl } = await import("./storage");

      // Helper: get an absolute fetch-able URL for a storage key or URL.
      // Prefer the stored public URL when it's already absolute (fast, no API call).
      // Fall back to storageGetSignedUrl(key) only when the stored URL is a relative
      // /manus-storage/ path (web-uploaded tracks) — this requires an API round-trip.
      const resolveDownloadUrl = async (key: string | null | undefined, url: string | null | undefined): Promise<string | null> => {
        if (url && url.startsWith("http")) return url; // already a public absolute URL — use directly
        if (key) return getSignedUrl(key);              // relative path — generate signed URL
        return null;
      };

      const resolvedTracks: { title: string; url: string; filename: string }[] = [];
      for (const trackId of trackIds) {
        const track = await getTrackById(trackId);
        if (!track) continue;
        const safeTitle = track.title.replace(/[^a-zA-Z0-9 _\-]/g, "").trim();
        const hasStems = track.hasStems && (track.stemsZipKey || track.stemsZipUrl);
        if (hasStems) {
          const stemsUrl = await resolveDownloadUrl(track.stemsZipKey, track.stemsZipUrl);
          if (!stemsUrl) continue;
          resolvedTracks.push({
            title: track.title,
            url: stemsUrl,
            filename: `${safeTitle}_with_stems.zip`,
          });
        } else {
          const wavKey = track.originalWavKey ?? track.wavKey;
          const wavFallbackUrl = track.originalWavUrl ?? track.wavUrl;
          const wavUrl = await resolveDownloadUrl(wavKey, wavFallbackUrl);
          if (!wavUrl) continue;
          resolvedTracks.push({
            title: track.title,
            url: wavUrl,
            filename: `${safeTitle}.wav`,
          });
        }
        await logDownload(user.id, trackId, projectName, "clean_wav");
      }

      if (resolvedTracks.length === 0) {
        res.status(404).json({ error: "No downloadable tracks found" });
        return;
      }

      // Clear cart after logging
      await clearCart(user.id);

      // If only one track, redirect directly to the file URL (avoids proxying large files through server)
      if (resolvedTracks.length === 1) {
        const t = resolvedTracks[0];
        // Use redirect for absolute URLs — client downloads directly from R2 at full speed
        if (t.url.startsWith("http")) {
          res.redirect(302, t.url);
          return;
        }
        // Fallback: proxy for relative/signed URLs
        res.setHeader("Content-Disposition", `attachment; filename="${t.filename}"`);
        const fileResp = await fetch(t.url);
        if (!fileResp.ok) throw new Error(`Failed to fetch track: ${fileResp.status}`);
        res.setHeader("Content-Type", fileResp.headers.get("content-type") ?? "application/octet-stream");
        const cl = fileResp.headers.get("content-length");
        if (cl) res.setHeader("Content-Length", cl);
        const { Readable } = await import("stream");
        Readable.fromWeb(fileResp.body as any).pipe(res);
        return;
      }

      // Multiple tracks: stream as ZIP
      const safeProjName = projectName.replace(/[^a-zA-Z0-9 _\-]/g, "").trim() || "tracks";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${safeProjName}.zip"`);

      const archive = archiver("zip", { zlib: { level: 1 } }); // level 1 = fast, audio is already compressed
      archive.pipe(res);

      for (const t of resolvedTracks) {
        const fileResp = await fetch(t.url);
        if (!fileResp.ok) {
          console.error(`[cart-zip] Failed to fetch ${t.filename}: ${fileResp.status}`);
          continue;
        }
        const { Readable } = await import("stream");
        const nodeStream = Readable.fromWeb(fileResp.body as any);
        archive.append(nodeStream, { name: t.filename });
      }

      await archive.finalize();
    } catch (err) {
      console.error("[cart-zip] Error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to create download archive" });
      }
    }
  });

  app.use(router);
}

// ─── Background watermark generation ─────────────────────────────────────────
async function generateWatermarkInBackground(
  trackId: number,
  wavBuffer: Buffer,
  originalName: string
) {
  try {
    const wmConfig = await getWatermarkConfig();
    if (!wmConfig || !wmConfig.audioUrl) {
      console.log(`[watermark] No watermark config found, skipping for track ${trackId}`);
      await updateTrack(trackId, { watermarkStatus: "error" });
      return;
    }

    await updateTrack(trackId, { watermarkStatus: "processing" });

    // Write clean WAV to temp
    const tmpWavPath = path.join(os.tmpdir(), `clean_${trackId}_${Date.now()}.wav`);
    fs.writeFileSync(tmpWavPath, wavBuffer);

    // Download watermark to temp using signed URL (relative /manus-storage/ paths won't work server-side)
    const wmAudioKey = wmConfig.audioKey;
    if (!wmAudioKey) {
      console.log(`[watermark] No audioKey in watermark config, skipping for track ${trackId}`);
      await updateTrack(trackId, { watermarkStatus: "error" });
      return;
    }
    const wmSignedUrl = await storageGetSignedUrl(wmAudioKey);
    const wmTmpPath = await downloadToTemp(wmSignedUrl, ".wav");

    // Generate watermarked MP3
    const mp3TmpPath = await generateWatermarkedMp3(tmpWavPath, wmTmpPath);

    // Upload to storage
    const mp3Buffer = fs.readFileSync(mp3TmpPath);
    const mp3KeyBase = `tracks/watermarked/${trackId}_${Date.now()}.mp3`;
    const { key: mp3Key, url: mp3Url } = await storagePut(mp3KeyBase, mp3Buffer, "audio/mpeg");

    // Update track record
    await updateTrack(trackId, {
      watermarkedMp3Key: mp3Key,
      watermarkedMp3Url: mp3Url,
      watermarkStatus: "done",
    });

    // Cleanup temp files
    fs.unlinkSync(tmpWavPath);
    fs.unlinkSync(wmTmpPath);
    fs.unlinkSync(mp3TmpPath);

    console.log(`[watermark] Done for track ${trackId}: ${mp3Url}`);
  } catch (err) {
    console.error(`[watermark] Failed for track ${trackId}:`, err);
    await updateTrack(trackId, { watermarkStatus: "error" }).catch(() => {});
  }
}
