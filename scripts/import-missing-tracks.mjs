/**
 * Import missing tracks from Dropbox URLs in the CSV.
 * For each track: download WAV, store 24-bit original, convert to 16-bit,
 * generate waveform peaks, classify tags, create DB record, trigger watermark.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parse } from 'csv-parse/sync';
import mysql from 'mysql2/promise';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const FORGE_BASE = process.env.BUILT_IN_FORGE_API_URL.replace(/\/+$/, '');
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;
const APP_BASE = 'http://localhost:3000';

// ── Tag taxonomy (mirrors uploadRoutes.ts) ──
const MOOD_TAGS = new Set([
  "angry","carefree","chill","eerie","emotional","happy","heartwarming",
  "hopeful","love","peaceful","sad","serious","silly","somber","uplifting",
]);
const ATTRIBUTE_TAGS = new Set([
  "adventurous","aggressive","badass","bubbly","calming","cinematic",
  "comedic","corporate","cute","dark","digital","energetic","epic",
  "fast","fun","funky","inspirational","intense","motivational","nerdy",
  "professional","retro","romantic","sexy","technology","whimsical",
  "slow", // also treat slow as attribute
]);
const GENRE_TAGS = new Set([
  "ambient","country","dance","disco","electronic","folk","funk",
  "hip hop","indie","jazz","jingle","oldies","orchestral","pop",
  "religious","rock","techno","world","other",
]);

function classifyTag(raw) {
  const lower = raw.trim().toLowerCase();
  const display = raw.trim();
  if (MOOD_TAGS.has(lower)) return { type: "mood", value: display };
  if (ATTRIBUTE_TAGS.has(lower)) return { type: "attribute", value: display };
  if (GENRE_TAGS.has(lower)) return { type: "genre", value: display };
  return { type: "hidden", value: display };
}

// ── Storage helpers ──
async function storageUpload(key, buffer, contentType) {
  const hash = Math.random().toString(36).slice(2, 10);
  const lastDot = key.lastIndexOf('.');
  const keyWithHash = lastDot === -1 ? `${key}_${hash}` : `${key.slice(0, lastDot)}_${hash}${key.slice(lastDot)}`;
  const cleanKey = keyWithHash.replace(/^\/+/, '');
  const presignUrl = `${FORGE_BASE}/v1/storage/presign/put?path=${encodeURIComponent(cleanKey)}`;
  const presignRes = await fetch(presignUrl, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!presignRes.ok) throw new Error(`Presign failed: ${presignRes.status} ${await presignRes.text()}`);
  const { url: s3Url } = await presignRes.json();
  const putRes = await fetch(s3Url, {
    method: 'PUT', headers: { 'Content-Type': contentType }, body: buffer,
  });
  if (!putRes.ok) throw new Error(`S3 upload failed: ${putRes.status}`);
  return { key: cleanKey, url: `/manus-storage/${cleanKey}` };
}

async function generateWaveformPeaks(wavPath, numSamples = 500) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', wavPath,
  ]);
  const duration = parseFloat(stdout.trim());
  const tmpRaw = wavPath + '.raw';
  await execFileAsync('ffmpeg', [
    '-y', '-i', wavPath,
    '-f', 's16le', '-ac', '1', '-ar', '22050', tmpRaw,
  ]);
  const rawBuf = fs.readFileSync(tmpRaw);
  fs.unlinkSync(tmpRaw);
  const samples = rawBuf.length / 2;
  const blockSize = Math.floor(samples / numSamples);
  const peaks = [];
  for (let i = 0; i < numSamples; i++) {
    let max = 0;
    for (let j = 0; j < blockSize; j++) {
      const idx = (i * blockSize + j) * 2;
      if (idx + 1 < rawBuf.length) {
        const val = Math.abs(rawBuf.readInt16LE(idx));
        if (val > max) max = val;
      }
    }
    peaks.push(parseFloat((max / 32768).toFixed(4)));
  }
  return JSON.stringify(peaks);
}

// ── Main ──
const csvPath = '/home/ubuntu/upload/MusicLibrary-Bulkimportview.csv';
const raw = fs.readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');
const records = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [dbRows] = await conn.execute('SELECT title FROM tracks');
const dbTitles = new Set(dbRows.map(r => r.title.toLowerCase().trim()));

const missing = records.filter(r => {
  const title = (r['Track Name'] || '').toLowerCase().trim();
  const status = (r['Status'] || '').toLowerCase().trim();
  const url = (r['Track'] || '').trim();
  return title && !dbTitles.has(title) && status === 'complete' && url.startsWith('http');
});

console.log(`Found ${missing.length} tracks to import\n`);

let success = 0, failed = 0;
const failures = [];

for (let i = 0; i < missing.length; i++) {
  const row = missing[i];
  const title = row['Track Name'].trim();
  const dropboxUrl = row['Track'].trim().replace(/[?&]dl=0/, '') + '?dl=1';
  const composerName = row['Original Composer']?.trim() || undefined;
  const moodAttribRaw = row['Mood / Attributes'] || '';
  const genreRaw = row['Genre'] || '';

  console.log(`[${i+1}/${missing.length}] "${title}"`);

  const tmpOrig = path.join(os.tmpdir(), `import_orig_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  const tmpConv = path.join(os.tmpdir(), `import_conv_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);

  try {
    // 1. Download WAV from Dropbox
    process.stdout.write('  Downloading...');
    const dlRes = await fetch(dropboxUrl, { redirect: 'follow' });
    if (!dlRes.ok) throw new Error(`Download failed: ${dlRes.status}`);
    const wavBuf = Buffer.from(await dlRes.arrayBuffer());
    fs.writeFileSync(tmpOrig, wavBuf);
    console.log(` ${(wavBuf.length / 1024 / 1024).toFixed(1)}MB`);

    // 2. Upload original 24-bit WAV
    process.stdout.write('  Uploading original...');
    const safeTitle = title.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
    const { key: origKey, url: origUrl } = await storageUpload(
      `tracks/wav/orig_${Date.now()}_${safeTitle}.wav`, wavBuf, 'audio/wav'
    );
    console.log(' done');

    // 3. Convert to 16-bit
    process.stdout.write('  Converting to 16-bit...');
    await execFileAsync('ffmpeg', ['-y', '-i', tmpOrig, '-acodec', 'pcm_s16le', tmpConv]);
    const wav16Buf = fs.readFileSync(tmpConv);
    const { key: wavKey, url: wavUrl } = await storageUpload(
      `tracks/wav/${Date.now()}_${safeTitle}.wav`, wav16Buf, 'audio/wav'
    );
    console.log(' done');

    // 4. Get duration
    let durationSeconds;
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', tmpOrig,
      ]);
      durationSeconds = Math.round(parseFloat(stdout.trim()));
    } catch { /* not critical */ }

    // 5. Generate waveform peaks
    process.stdout.write('  Generating peaks...');
    let waveformPeaks;
    try {
      waveformPeaks = await generateWaveformPeaks(tmpOrig, 500);
    } catch (e) { console.error(' failed:', e.message); }
    if (waveformPeaks) console.log(' done');

    // 6. Classify tags
    const tags = [];
    // Genres
    genreRaw.split(',').map(g => g.trim()).filter(Boolean).forEach(g => {
      const lower = g.toLowerCase();
      if (GENRE_TAGS.has(lower)) tags.push({ type: 'genre', value: g });
      else tags.push(classifyTag(g));
    });
    // Mood/Attributes
    moodAttribRaw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => {
      tags.push(classifyTag(t));
    });
    // Deduplicate
    const seen = new Set();
    const uniqueTags = tags.filter(t => {
      const k = `${t.type}:${t.value.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // 7. Insert track into DB
    const [result] = await conn.execute(
      `INSERT INTO tracks (title, composerName, wavKey, wavUrl, originalWavKey, originalWavUrl, waveformPeaks, durationSeconds, watermarkStatus, isPublished, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, NOW(), NOW())`,
      [title, composerName || null, wavKey, wavUrl, origKey, origUrl, waveformPeaks || null, durationSeconds || null]
    );
    const trackId = result.insertId;

    // 8. Insert tags
    if (uniqueTags.length > 0) {
      const tagValues = uniqueTags.map(t => [trackId, t.type, t.value]);
      await conn.query('INSERT INTO track_tags (trackId, type, value) VALUES ?', [tagValues]);
    }

    console.log(`  ✓ Created track id=${trackId} with ${uniqueTags.length} tags`);

    // 9. Trigger watermark generation via the server API
    try {
      const wmRes = await fetch(`${APP_BASE}/api/trpc/tracks.generateWatermark`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-import': 'true' },
        body: JSON.stringify({ json: { trackId } }),
      });
      // Non-blocking — just log result
      if (wmRes.ok) console.log('  Watermark: queued');
    } catch { /* watermark can be retried from admin */ }

    success++;
  } catch (err) {
    console.error(`  ✗ FAILED: ${err.message}`);
    failures.push({ title, error: err.message });
    failed++;
  } finally {
    try { fs.unlinkSync(tmpOrig); } catch {}
    try { fs.unlinkSync(tmpConv); } catch {}
  }
}

await conn.end();

console.log(`\n=== DONE: ${success} imported, ${failed} failed ===`);
if (failures.length > 0) {
  console.log('Failures:');
  failures.forEach(f => console.log(`  - "${f.title}": ${f.error}`));
}
