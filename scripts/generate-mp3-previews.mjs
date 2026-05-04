/**
 * Bulk generate 192kbps MP3 preview files for all existing tracks that don't have one yet.
 * Uses the stored wavUrl (16-bit WAV) as the source for conversion.
 * Reads env from .env file and uses the Forge storage API directly.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { createConnection } from "mysql2/promise";
import { createRequire } from "module";
import crypto from "crypto";

const require = createRequire(import.meta.url);

// Env vars are injected directly by the platform — no .env file needed
const execFileAsync = promisify(execFile);

const DB_URL = process.env.DATABASE_URL;
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!DB_URL || !FORGE_API_URL || !FORGE_API_KEY) {
  console.error("Missing required env vars: DATABASE_URL, BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY");
  process.exit(1);
}

const FORGE_BASE = (FORGE_API_URL || "").replace(/\/+$/, "");

function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function getSignedUrl(key) {
  const url = new URL("v1/storage/presign/get", FORGE_BASE + "/");
  url.searchParams.set("path", key);
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${FORGE_API_KEY}` } });
  if (!res.ok) throw new Error(`signed-url failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.url;
}

async function uploadFile(relKey, buffer, contentType) {
  const key = appendHashSuffix(relKey);
  const presignUrl = new URL("v1/storage/presign/put", FORGE_BASE + "/");
  presignUrl.searchParams.set("path", key);
  const presignRes = await fetch(presignUrl.toString(), {
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
  });
  if (!presignRes.ok) throw new Error(`presign/put failed: ${presignRes.status} ${await presignRes.text()}`);
  const { url: s3Url } = await presignRes.json();

  const putRes = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: buffer,
  });
  if (!putRes.ok) throw new Error(`PUT to S3 failed: ${putRes.status}`);
  return { key, url: `/manus-storage/${key}` };
}

async function downloadFile(url, ext) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const tmpPath = path.join(os.tmpdir(), `mp3gen_${Date.now()}${ext}`);
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

async function convertToMp3(inputPath) {
  const outPath = inputPath.replace(/\.[^.]+$/, "_preview.mp3");
  await execFileAsync("ffmpeg", [
    "-y", "-i", inputPath,
    "-codec:a", "libmp3lame",
    "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    outPath,
  ]);
  return outPath;
}

async function main() {
  const conn = await createConnection(DB_URL);
  
  // Get all tracks that have a wavUrl but no mp3PreviewUrl
  // Note: MySQL column names are camelCase (Drizzle default)
  const [rows] = await conn.execute(
    "SELECT id, title, wavUrl, wavKey FROM tracks WHERE wavUrl IS NOT NULL AND mp3PreviewUrl IS NULL ORDER BY id"
  );
  
  console.log(`Found ${rows.length} tracks needing MP3 preview generation`);
  
  let success = 0;
  let failed = 0;
  
  for (let i = 0; i < rows.length; i++) {
    const track = rows[i];
    const logPrefix = `[${i + 1}/${rows.length}] Track ${track.id} "${track.title}"`;
    
    let wavPath = null;
    let mp3Path = null;
    
    try {
      // Derive the actual S3 key from wavUrl (includes hash suffix)
      const wavKey = track.wavUrl.replace(/^\/manus-storage\//, "");
      
      // Get signed URL and download
      const signedUrl = await getSignedUrl(wavKey);
      wavPath = await downloadFile(signedUrl, ".wav");
      
      // Convert to 192kbps MP3
      mp3Path = await convertToMp3(wavPath);
      
      // Upload to storage
      const mp3Buf = fs.readFileSync(mp3Path);
      const mp3RelKey = `tracks/${track.id}/mp3preview_${Date.now()}.mp3`;
      const { key: mp3Key, url: mp3Url } = await uploadFile(mp3RelKey, mp3Buf, "audio/mpeg");
      
      // Update DB (camelCase column names)
      await conn.execute(
        "UPDATE tracks SET mp3PreviewKey = ?, mp3PreviewUrl = ? WHERE id = ?",
        [mp3Key, mp3Url, track.id]
      );
      
      success++;
      console.log(`${logPrefix} ✓ (${(mp3Buf.length / 1024 / 1024).toFixed(1)}MB MP3)`);
    } catch (err) {
      failed++;
      console.error(`${logPrefix} ✗ FAILED: ${err.message}`);
    } finally {
      if (wavPath && fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      if (mp3Path && fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path);
    }
  }
  
  await conn.end();
  console.log(`\n=== DONE: ${success} succeeded, ${failed} failed out of ${rows.length} tracks ===`);
}

main().catch(console.error);
