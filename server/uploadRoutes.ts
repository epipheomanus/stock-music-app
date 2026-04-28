/**
 * Upload routes for admin track and watermark uploads.
 * These use multipart/form-data so they live outside tRPC.
 */
import { Router, Request, Response } from "express";
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
import { generateWatermarkedMp3, downloadToTemp } from "./watermark";
import { sdk } from "./_core/sdk";

// ─── Multer config (memory storage) ─────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB per file
});

// ─── Auth middleware ─────────────────────────────────────────────────────────
async function requireAdmin(req: Request, res: Response, next: Function) {
  try {
    const user = await sdk.authenticateRequest(req);
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

        const tags: { type: "genre" | "mood" | "attribute"; value: string }[] =
          req.body.tags ? JSON.parse(req.body.tags) : [];

        // 1. Upload clean WAV to storage
        const wavKey = `tracks/wav/${Date.now()}_${wavFile.originalname.replace(/\s+/g, "_")}`;
        const { url: wavUrl } = await storagePut(wavKey, wavFile.buffer, "audio/wav");

        // 2. Upload cover art if provided
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

        // 4. Get duration via ffprobe (write wav to temp)
        let durationSeconds: number | undefined;
        try {
          const tmpWavPath = path.join(os.tmpdir(), `dur_${Date.now()}.wav`);
          fs.writeFileSync(tmpWavPath, wavFile.buffer);
          const { execFile } = await import("child_process");
          const { promisify } = await import("util");
          const execFileAsync = promisify(execFile);
          const { stdout } = await execFileAsync("ffprobe", [
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            tmpWavPath,
          ]);
          durationSeconds = Math.round(parseFloat(stdout.trim()));
          fs.unlinkSync(tmpWavPath);
        } catch {
          // Duration detection failed — not critical
        }

        // 5. Create track record
        const trackId = await createTrack({
          title,
          composerName: req.body.composerName?.trim() || undefined,
          description: req.body.description?.trim() || undefined,
          bpm: req.body.bpm ? Number(req.body.bpm) : undefined,
          durationSeconds,
          wavKey,
          wavUrl,
          coverArtUrl,
          stemsZipUrl,
          hasStems,
          isPublished: req.body.isPublished === "true",
          watermarkStatus: "pending",
        });

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
        const wmKey = `watermark/${Date.now()}_${req.file.originalname.replace(/\s+/g, "_")}`;
        const { url: wmUrl } = await storagePut(wmKey, req.file.buffer, "audio/wav");
        await upsertWatermarkConfig(wmKey, wmUrl);
        res.json({ success: true, url: wmUrl });
      } catch (err: any) {
        console.error("[upload-watermark]", err);
        res.status(500).json({ error: err.message || "Upload failed" });
      }
    }
  );

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
    const mp3Key = `tracks/watermarked/${trackId}_${Date.now()}.mp3`;
    const { url: mp3Url } = await storagePut(mp3Key, mp3Buffer, "audio/mpeg");

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
