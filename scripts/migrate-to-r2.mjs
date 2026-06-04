/**
 * migrate-to-r2.mjs
 *
 * One-time migration: copies all track files from Manus storage (/manus-storage/...)
 * to Cloudflare R2 and updates the database URLs.
 *
 * Usage:
 *   node scripts/migrate-to-r2.mjs
 *
 * Required env vars (already set in the project):
 *   DATABASE_URL, BUILT_IN_FORGE_API_URL, BUILT_IN_FORGE_API_KEY,
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import mysql from "mysql2/promise";

// ─── Config ──────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
const FORGE_API_URL = (process.env.BUILT_IN_FORGE_API_URL ?? "").replace(/\/+$/, "");
const FORGE_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME || !R2_PUBLIC_URL) {
  console.error("❌  Missing R2 environment variables. Aborting.");
  process.exit(1);
}
if (!FORGE_API_URL || !FORGE_API_KEY) {
  console.error("❌  Missing BUILT_IN_FORGE_API_URL / BUILT_IN_FORGE_API_KEY. Aborting.");
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error("❌  Missing DATABASE_URL. Aborting.");
  process.exit(1);
}

// ─── R2 client ───────────────────────────────────────────────────────────────

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a /manus-storage/<key> URL to a presigned GET URL via Forge,
 * then download the file bytes.
 */
async function downloadFromManus(manusPath) {
  // manusPath looks like: /manus-storage/tracks/90001/wav_16bit_...wav
  const key = manusPath.replace(/^\/manus-storage\//, "");
  const presignUrl = `${FORGE_API_URL}/v1/storage/presign/get?path=${encodeURIComponent(key)}`;
  const presignResp = await fetch(presignUrl, {
    headers: { Authorization: `Bearer ${FORGE_API_KEY}` },
  });
  if (!presignResp.ok) {
    throw new Error(`Forge presign failed for "${key}": HTTP ${presignResp.status}`);
  }
  const { url: signedUrl } = await presignResp.json();
  const fileResp = await fetch(signedUrl);
  if (!fileResp.ok) {
    throw new Error(`Download failed for "${key}": HTTP ${fileResp.status}`);
  }
  const buffer = Buffer.from(await fileResp.arrayBuffer());
  return { key, buffer };
}

/**
 * Upload a buffer to R2 and return the public URL.
 */
async function uploadToR2(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return `${R2_PUBLIC_URL}/${key}`;
}

function guessContentType(key) {
  if (key.endsWith(".wav")) return "audio/wav";
  if (key.endsWith(".mp3")) return "audio/mpeg";
  if (key.endsWith(".zip")) return "application/zip";
  if (key.endsWith(".png")) return "image/png";
  if (key.endsWith(".jpg") || key.endsWith(".jpeg")) return "image/jpeg";
  if (key.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

/**
 * Migrate a single URL field. Returns the new R2 URL, or null if the field is empty.
 */
async function migrateField(manusUrl, label) {
  if (!manusUrl || manusUrl === "NULL" || !manusUrl.startsWith("/manus-storage/")) {
    return null; // already migrated or empty
  }
  const { key, buffer } = await downloadFromManus(manusUrl);
  const contentType = guessContentType(key);
  const r2Url = await uploadToR2(key, buffer, contentType);
  console.log(`    ✓ ${label}: ${key} → R2`);
  return r2Url;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const db = await mysql.createConnection(DATABASE_URL);

  console.log("🔍  Fetching tracks from database…");
  const [tracks] = await db.execute(
    `SELECT id, title, wavUrl, originalWavUrl, mp3PreviewUrl, stemsZipUrl,
            watermarkedMp3Url, coverArtUrl
     FROM tracks
     ORDER BY id`
  );

  console.log(`📦  Found ${tracks.length} tracks to process.\n`);

  let migratedFiles = 0;
  let skippedFiles = 0;
  let errorCount = 0;

  for (const track of tracks) {
    console.log(`[${track.id}] ${track.title}`);

    const fields = [
      { col: "wavUrl",            val: track.wavUrl },
      { col: "originalWavUrl",    val: track.originalWavUrl },
      { col: "mp3PreviewUrl",     val: track.mp3PreviewUrl },
      { col: "stemsZipUrl",       val: track.stemsZipUrl },
      { col: "watermarkedMp3Url", val: track.watermarkedMp3Url },
      { col: "coverArtUrl",       val: track.coverArtUrl },
    ];

    const updates = {};

    for (const { col, val } of fields) {
      if (!val || val === "NULL" || !val.startsWith("/manus-storage/")) {
        skippedFiles++;
        continue;
      }
      try {
        const newUrl = await migrateField(val, col);
        if (newUrl) {
          updates[col] = newUrl;
          migratedFiles++;
        }
      } catch (err) {
        console.error(`    ✗ ${col}: ${err.message}`);
        errorCount++;
      }
    }

    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(", ");
      const values = [...Object.values(updates), track.id];
      await db.execute(`UPDATE tracks SET ${setClauses} WHERE id = ?`, values);
      console.log(`    💾  DB updated (${Object.keys(updates).length} fields)\n`);
    } else {
      console.log(`    ⏭   No Manus URLs found — already migrated or empty\n`);
    }
  }

  // Also migrate watermark config
  console.log("🔍  Checking watermark config…");
  const [wmRows] = await db.execute("SELECT id, audioUrl FROM watermark_config WHERE audioUrl IS NOT NULL");
  for (const wm of wmRows) {
    if (wm.audioUrl && wm.audioUrl.startsWith("/manus-storage/")) {
      try {
        const newUrl = await migrateField(wm.audioUrl, "watermark audioUrl");
        if (newUrl) {
          await db.execute("UPDATE watermark_config SET audioUrl = ? WHERE id = ?", [newUrl, wm.id]);
          migratedFiles++;
          console.log(`    💾  Watermark config updated\n`);
        }
      } catch (err) {
        console.error(`    ✗ watermark config: ${err.message}`);
        errorCount++;
      }
    }
  }

  await db.end();

  console.log("─────────────────────────────────────────");
  console.log(`✅  Migration complete`);
  console.log(`   Files migrated : ${migratedFiles}`);
  console.log(`   Fields skipped : ${skippedFiles} (already R2 or empty)`);
  console.log(`   Errors         : ${errorCount}`);
  if (errorCount > 0) {
    console.log("\n⚠️  Some files failed to migrate. Re-run the script to retry them.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
