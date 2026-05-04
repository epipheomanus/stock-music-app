/**
 * Convert the one remaining unconverted track (Loosy Goosy 1) to 16-bit WAV.
 */
import mysql from 'mysql2/promise';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';

const execFileAsync = promisify(execFile);

const FORGE_URL = process.env.BUILT_IN_FORGE_API_URL;
const FORGE_KEY = process.env.BUILT_IN_FORGE_API_KEY;

const FORGE_BASE = FORGE_URL.replace(/\/+$/, '');

async function getSignedUrl(storageKey) {
  const cleanKey = storageKey.replace(/^\/+/, '');
  const url = `${FORGE_BASE}/v1/storage/presign/get?path=${encodeURIComponent(cleanKey)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!res.ok) throw new Error(`Failed to get signed URL: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.url;
}

async function uploadFile(key, buffer, contentType) {
  // Add hash suffix like storagePut does
  const hash = Math.random().toString(36).slice(2, 10);
  const lastDot = key.lastIndexOf('.');
  const keyWithHash = lastDot === -1 ? `${key}_${hash}` : `${key.slice(0, lastDot)}_${hash}${key.slice(lastDot)}`;
  const cleanKey = keyWithHash.replace(/^\/+/, '');
  // Get presigned PUT URL
  const presignUrl = `${FORGE_BASE}/v1/storage/presign/put?path=${encodeURIComponent(cleanKey)}`;
  const presignRes = await fetch(presignUrl, { headers: { Authorization: `Bearer ${FORGE_KEY}` } });
  if (!presignRes.ok) throw new Error(`Failed to get presign URL: ${presignRes.status} ${await presignRes.text()}`);
  const { url: s3Url } = await presignRes.json();
  // PUT to S3
  const putRes = await fetch(s3Url, {
    method: 'PUT', headers: { 'Content-Type': contentType }, body: buffer,
  });
  if (!putRes.ok) throw new Error(`Failed to upload to S3: ${putRes.status}`);
  return { key: cleanKey, url: `/manus-storage/${cleanKey}` };
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [rows] = await conn.execute(
    'SELECT id, title, wavUrl, wavKey FROM tracks WHERE originalWavUrl IS NULL AND wavUrl IS NOT NULL'
  );
  console.log(`Found ${rows.length} track(s) to convert`);

  for (const track of rows) {
    console.log(`\nConverting: ${track.title} (id=${track.id})`);
    const tmpOrig = path.join(os.tmpdir(), `orig_${track.id}.wav`);
    const tmpOut = path.join(os.tmpdir(), `conv16_${track.id}.wav`);
    try {
      // 1. Get signed URL — derive actual key from wavUrl path (includes hash suffix)
      // wavUrl is like /manus-storage/tracks/wav/1234_Title_abc12345.wav
      const actualKey = track.wavUrl.replace(/^\/manus-storage\//, '');
      const signedUrl = await getSignedUrl(actualKey);
      console.log('  Downloading...');
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(tmpOrig, buf);
      console.log(`  Downloaded ${buf.length} bytes`);

      // 2. Upload original as originalWavUrl
      const origKeyBase = `tracks/wav/orig_${Date.now()}_${track.title.replace(/\s+/g, '_')}.wav`;
      const { key: origKey, url: origUrl } = await uploadFile(origKeyBase, buf, 'audio/wav');
      console.log('  Uploaded original as', origKey);

      // 3. Convert to 16-bit
      await execFileAsync('ffmpeg', ['-y', '-i', tmpOrig, '-acodec', 'pcm_s16le', tmpOut]);
      const wav16Buf = fs.readFileSync(tmpOut);
      console.log(`  Converted to 16-bit: ${wav16Buf.length} bytes`);

      // 4. Upload 16-bit version as new wavUrl
      const wav16KeyBase = `tracks/wav/${Date.now()}_${track.title.replace(/\s+/g, '_')}.wav`;
      const { key: wav16Key, url: wav16Url } = await uploadFile(wav16KeyBase, wav16Buf, 'audio/wav');
      console.log('  Uploaded 16-bit as', wav16Key);

      // 5. Update DB
      await conn.execute(
        'UPDATE tracks SET wavKey=?, wavUrl=?, originalWavKey=?, originalWavUrl=? WHERE id=?',
        [wav16Key, wav16Url, origKey, origUrl, track.id]
      );
      console.log(`  ✓ Done: ${track.title}`);
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    } finally {
      try { fs.unlinkSync(tmpOrig); } catch {}
      try { fs.unlinkSync(tmpOut); } catch {}
    }
  }

  await conn.end();
  console.log('\nAll done.');
}

main().catch(console.error);
