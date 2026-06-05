/**
 * export-data.mjs
 * Reads all data from the current (Manus) database and writes a SQL dump
 * that can be imported into the Railway MySQL database.
 *
 * Run: node scripts/export-data.mjs
 * Output: scripts/railway-import.sql
 */

import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function escStr(val) {
  if (val === null || val === undefined) return "NULL";
  return "'" + String(val).replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n").replace(/\r/g, "\\r") + "'";
}

function escDate(val) {
  if (!val) return "NULL";
  const d = new Date(val);
  if (isNaN(d.getTime())) return "NULL";
  return "'" + d.toISOString().slice(0, 19).replace("T", " ") + "'";
}

function escBool(val) {
  if (val === null || val === undefined) return "NULL";
  return val ? "1" : "0";
}

function escInt(val) {
  if (val === null || val === undefined) return "NULL";
  return parseInt(val, 10);
}

async function main() {
  const conn = await mysql.createConnection(DATABASE_URL);
  const lines = [];

  lines.push("-- EpipheoMusic data export from Manus database");
  lines.push("-- Generated: " + new Date().toISOString());
  lines.push("-- Import this file into Railway MySQL after running pnpm db:push");
  lines.push("");
  lines.push("SET FOREIGN_KEY_CHECKS=0;");
  lines.push("");

  // ── taxonomy_tags ──────────────────────────────────────────────────────────
  console.log("Exporting taxonomy_tags...");
  const [tags] = await conn.execute("SELECT * FROM taxonomy_tags ORDER BY id");
  if (tags.length > 0) {
    lines.push("-- taxonomy_tags");
    lines.push("TRUNCATE TABLE taxonomy_tags;");
    for (const r of tags) {
      lines.push(
        `INSERT INTO taxonomy_tags (id, type, value) VALUES (${escInt(r.id)}, ${escStr(r.type)}, ${escStr(r.value)});`
      );
    }
    lines.push("");
  }
  console.log(`  → ${tags.length} taxonomy tags`);

  // ── tracks ─────────────────────────────────────────────────────────────────
  console.log("Exporting tracks...");
  const [tracks] = await conn.execute("SELECT * FROM tracks ORDER BY id");
  if (tracks.length > 0) {
    lines.push("-- tracks");
    lines.push("TRUNCATE TABLE tracks;");
    for (const r of tracks) {
      lines.push(
        `INSERT INTO tracks (id, title, composerName, description, durationSeconds, bpm, wavKey, wavUrl, originalWavKey, originalWavUrl, mp3PreviewKey, mp3PreviewUrl, stemsZipKey, stemsZipUrl, watermarkedMp3Key, watermarkedMp3Url, coverArtKey, coverArtUrl, keySignature, waveformPeaks, hasStems, watermarkStatus, isPublished, createdAt, updatedAt) VALUES (` +
        [
          escInt(r.id),
          escStr(r.title),
          escStr(r.composerName),
          escStr(r.description),
          escInt(r.durationSeconds),
          escInt(r.bpm),
          escStr(r.wavKey),
          escStr(r.wavUrl),
          escStr(r.originalWavKey),
          escStr(r.originalWavUrl),
          escStr(r.mp3PreviewKey),
          escStr(r.mp3PreviewUrl),
          escStr(r.stemsZipKey),
          escStr(r.stemsZipUrl),
          escStr(r.watermarkedMp3Key),
          escStr(r.watermarkedMp3Url),
          escStr(r.coverArtKey),
          escStr(r.coverArtUrl),
          escStr(r.keySignature),
          escStr(r.waveformPeaks),
          escBool(r.hasStems),
          escStr(r.watermarkStatus),
          escBool(r.isPublished),
          escDate(r.createdAt),
          escDate(r.updatedAt),
        ].join(", ") +
        ");"
      );
    }
    lines.push("");
  }
  console.log(`  → ${tracks.length} tracks`);

  // ── track_tags ─────────────────────────────────────────────────────────────
  console.log("Exporting track_tags...");
  const [trackTags] = await conn.execute("SELECT * FROM track_tags ORDER BY id");
  if (trackTags.length > 0) {
    lines.push("-- track_tags");
    lines.push("TRUNCATE TABLE track_tags;");
    for (const r of trackTags) {
      lines.push(
        `INSERT INTO track_tags (id, trackId, type, value) VALUES (${escInt(r.id)}, ${escInt(r.trackId)}, ${escStr(r.type)}, ${escStr(r.value)});`
      );
    }
    lines.push("");
  }
  console.log(`  → ${trackTags.length} track tags`);

  // ── watermark_config ───────────────────────────────────────────────────────
  console.log("Exporting watermark_config...");
  const [wc] = await conn.execute("SELECT * FROM watermark_config ORDER BY id");
  if (wc.length > 0) {
    lines.push("-- watermark_config");
    lines.push("TRUNCATE TABLE watermark_config;");
    for (const r of wc) {
      lines.push(
        `INSERT INTO watermark_config (id, audioKey, audioUrl, updatedAt) VALUES (${escInt(r.id)}, ${escStr(r.audioKey)}, ${escStr(r.audioUrl)}, ${escDate(r.updatedAt)});`
      );
    }
    lines.push("");
  }
  console.log(`  → ${wc.length} watermark config rows`);

  // ── users (non-admin, skip owner) ─────────────────────────────────────────
  console.log("Exporting users...");
  const [users] = await conn.execute("SELECT * FROM users ORDER BY id");
  if (users.length > 0) {
    lines.push("-- users (excluding admin account already created in Railway)");
    lines.push("-- Note: admin account alex.mckenzie@epipheo.com already exists in Railway");
    for (const r of users) {
      // Skip the admin account — it's already in Railway
      if (r.email === "alex.mckenzie@epipheo.com") continue;
      lines.push(
        `INSERT IGNORE INTO users (email, name, firstName, lastName, company, jobTitle, username, openId, passwordHash, loginMethod, role, isLocked, skipWatermarkConfirm, createdAt, updatedAt, lastSignedIn) VALUES (` +
        [
          escStr(r.email),
          escStr(r.name),
          escStr(r.firstName),
          escStr(r.lastName),
          escStr(r.company),
          escStr(r.jobTitle),
          escStr(r.username),
          escStr(r.openId || r.email),
          escStr(r.passwordHash),
          escStr(r.loginMethod || "password"),
          escStr(r.role || "user"),
          escBool(r.isLocked),
          escBool(r.skipWatermarkConfirm),
          escDate(r.createdAt),
          escDate(r.updatedAt),
          escDate(r.lastSignedIn),
        ].join(", ") +
        ");"
      );
    }
    lines.push("");
  }
  console.log(`  → ${users.length} users`);

  lines.push("SET FOREIGN_KEY_CHECKS=1;");
  lines.push("");
  lines.push("-- Import complete");

  const outPath = path.join(__dirname, "railway-import.sql");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`\nSQL dump written to: ${outPath}`);
  console.log(`Total lines: ${lines.length}`);

  await conn.end();
}

main().catch((err) => {
  console.error("Export failed:", err);
  process.exit(1);
});
