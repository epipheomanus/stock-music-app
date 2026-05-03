/**
 * Bulk conversion: for every track that has a wavUrl but no originalWavUrl,
 * download the current WAV, save it as originalWavUrl (24-bit download copy),
 * convert to 16-bit PCM WAV, and update wavUrl with the 16-bit version.
 *
 * Run: node scripts/convert-all-to-16bit.mjs
 */
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import mysql from "mysql2/promise";

const execFileAsync = promisify(execFile);

// ── Storage helpers (inline, no module resolution issues) ─────────────────────
const FORGE_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

if (!FORGE_API_URL || !FORGE_API_KEY) {
  console.error("Missing BUILT_IN_FORGE_API_URL or BUILT_IN_FORGE_API_KEY");
  process.exit(1);
}

function appendHashSuffix(relKey) {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function storagePut(relKey, data, contentType = "application/octet-stream") {
  const forgeUrl = FORGE_API_URL.replace(/\/+$/, "");
  const key = appendHashSuffix(relKey.replace(/^\/+/, ""));

  // 1. Get presigned PUT URL
  const presignUrl = new URL("v1/storage/presign/put", forgeUrl + "/");
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
  });
  if (!presignResp.ok) throw new Error(`storagePut presign failed: ${presignResp.status} ${await presignResp.text()}`);
  const { url: s3Url } = await presignResp.json();

  // 2. PUT to S3
  const blob = new Blob([data], { type: contentType });
  const uploadResp = await fetch(s3Url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!uploadResp.ok) throw new Error(`storagePut S3 upload failed: ${uploadResp.status}`);
  return { key, url: `/manus-storage/${key}` };
}

async function storageGetSignedUrl(key) {
  const forgeUrl = FORGE_API_URL.replace(/\/+$/, "");
  const normKey = key.replace(/^\/+/, "");
  const getUrl = new URL("v1/storage/presign/get", forgeUrl + "/");
  getUrl.searchParams.set("path", normKey);
  const res = await fetch(getUrl, { headers: { Authorization: `Bearer ${FORGE_API_KEY}` } });
  if (!res.ok) throw new Error(`storageGetSignedUrl failed: ${res.status} ${await res.text()}`);
  const { url } = await res.json();
  return url;
}

async function downloadToTemp(url, ext) {
  const tmpPath = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

async function convert16BitWav(inputPath) {
  const tmpOut = path.join(os.tmpdir(), `conv16_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  try {
    await execFileAsync("ffmpeg", ["-y", "-i", inputPath, "-acodec", "pcm_s16le", tmpOut]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [tracks] = await conn.execute(
  "SELECT id, wavKey, wavUrl, originalWavUrl FROM tracks WHERE wavUrl IS NOT NULL AND originalWavUrl IS NULL ORDER BY id"
);

console.log(`Found ${tracks.length} tracks to convert`);

let done = 0;
let failed = 0;

for (const track of tracks) {
  const trackId = track.id;
  let cleanPath = null;
  try {
    const realWavKey = track.wavUrl.replace(/^\/manus-storage\//, "");
    const signedUrl = await storageGetSignedUrl(realWavKey);
    cleanPath = await downloadToTemp(signedUrl, ".wav");

    // Save original as originalWavUrl
    const origBuf = fs.readFileSync(cleanPath);
    const origKey = `tracks/${trackId}/original_${Date.now()}.wav`;
    const { key: ok, url: ou } = await storagePut(origKey, origBuf, "audio/wav");
    await conn.execute(
      "UPDATE tracks SET originalWavKey = ?, originalWavUrl = ? WHERE id = ?",
      [ok, ou, trackId]
    );

    // Convert to 16-bit
    const wav16Buf = await convert16BitWav(cleanPath);
    const conv16Key = `tracks/${trackId}/wav_16bit_${Date.now()}.wav`;
    const { key: convKey, url: convUrl } = await storagePut(conv16Key, wav16Buf, "audio/wav");
    await conn.execute(
      "UPDATE tracks SET wavKey = ?, wavUrl = ? WHERE id = ?",
      [convKey, convUrl, trackId]
    );

    done++;
    console.log(`[${done}/${tracks.length}] Track ${trackId} converted OK`);
  } catch (err) {
    failed++;
    console.error(`Track ${trackId} FAILED:`, err.message);
  } finally {
    if (cleanPath && fs.existsSync(cleanPath)) fs.unlinkSync(cleanPath);
  }
}

await conn.end();
console.log(`\nDone: ${done} converted, ${failed} failed`);
