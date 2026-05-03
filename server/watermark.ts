import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/**
 * Generates a watermarked MP3 from a clean WAV file.
 * The watermark audio is overlaid at every `intervalSeconds` (default 10s).
 *
 * @param cleanWavPath  - Path to the clean WAV file on disk
 * @param watermarkPath - Path to the watermark audio file on disk
 * @param intervalSeconds - How often to insert the watermark (default: 10)
 * @returns Path to the generated watermarked MP3 (temp file — caller must clean up)
 */
export async function generateWatermarkedMp3(
  cleanWavPath: string,
  watermarkPath: string,
  intervalSeconds = 10
): Promise<string> {
  const tmpDir = os.tmpdir();
  const outPath = path.join(tmpDir, `wm_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);

  // Get duration of clean track
  const { stdout: durationOut } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    cleanWavPath,
  ]);
  const duration = parseFloat(durationOut.trim());
  if (isNaN(duration)) throw new Error("Could not determine track duration");

  // Build adelay filter for each watermark instance
  const delays: string[] = [];
  const mixInputs: string[] = ["[0:a]"];

  let t = intervalSeconds;
  let idx = 1;
  while (t < duration) {
    const delayMs = Math.round(t * 1000);
    delays.push(`[${idx}:a]adelay=${delayMs}|${delayMs}[wm${idx}]`);
    mixInputs.push(`[wm${idx}]`);
    t += intervalSeconds;
    idx++;
  }

  const numWatermarks = idx - 1;

  if (numWatermarks === 0) {
    // Track is shorter than one interval — just encode without watermark
    await execFileAsync("ffmpeg", [
      "-y", "-i", cleanWavPath,
      "-codec:a", "libmp3lame", "-qscale:a", "2",
      outPath,
    ]);
    return outPath;
  }

  // Build input args: clean track + one watermark input per insertion point
  const inputArgs: string[] = ["-i", cleanWavPath];
  for (let i = 0; i < numWatermarks; i++) {
    inputArgs.push("-i", watermarkPath);
  }

  // Build filter_complex
  const filterParts: string[] = [...delays];
  const amixInputs = mixInputs.join("");
  filterParts.push(`${amixInputs}amix=inputs=${mixInputs.length}:duration=first:dropout_transition=0[out]`);
  const filterComplex = filterParts.join(";");

  await execFileAsync("ffmpeg", [
    "-y",
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-codec:a", "libmp3lame", "-qscale:a", "2",
    outPath,
  ]);

  return outPath;
}

/**
 * Download a file from a URL to a temp path.
 * Retries up to `maxRetries` times with exponential backoff on 429 / 5xx errors.
 * Validates that the downloaded content is not an error JSON payload.
 */
export async function downloadToTemp(
  url: string,
  ext: string,
  maxRetries = 4
): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  let lastErr: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      // Exponential backoff: 1s, 2s, 4s, 8s
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      await new Promise((r) => setTimeout(r, delay));
    }
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} from storage — will retry`);
        continue; // retry
      }
      if (!res.ok) {
        throw new Error(`Failed to download file: ${res.status}`);
      }
      const contentType = res.headers.get("content-type") ?? "";
      // If the server returned JSON/HTML instead of binary audio, it's an error response
      if (contentType.includes("application/json") || contentType.includes("text/html")) {
        const body = await res.text().catch(() => "(unreadable)");
        throw new Error(`Storage returned non-binary response (${contentType}): ${body.slice(0, 200)}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) {
        throw new Error(`Downloaded file is suspiciously small (${buf.length} bytes) — likely an error response`);
      }
      fs.writeFileSync(tmpPath, buf);
      return tmpPath;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      // Only retry on transient errors
      if (attempt < maxRetries) continue;
    }
  }
  throw lastErr ?? new Error("downloadToTemp: unknown error");
}

/**
 * Generate a compact waveform peaks array from a WAV buffer.
 * Uses ffmpeg to downsample to mono at `numSamples` points, reads the raw
 * f32le values, and normalises them to [0, 1].
 *
 * Returns a JSON string like "[0.12,0.45,...]" suitable for DB storage.
 * Returns null if ffmpeg fails (non-critical — waveform will fall back to
 * fetching the full audio file).
 */
export async function generateWaveformPeaks(
  wavBuffer: Buffer,
  numSamples = 200
): Promise<string | null> {
  const tmpIn = path.join(os.tmpdir(), `peaks_in_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  const tmpOut = path.join(os.tmpdir(), `peaks_out_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
  try {
    fs.writeFileSync(tmpIn, wavBuffer);
    // Downsample to mono at exactly numSamples frames (f32le raw PCM)
    await execFileAsync("ffmpeg", [
      "-y", "-i", tmpIn,
      "-ac", "1",
      "-ar", String(numSamples),
      "-f", "f32le",
      tmpOut,
    ]);
    const raw = fs.readFileSync(tmpOut);
    const count = Math.floor(raw.byteLength / 4);
    if (count === 0) return null;
    const peaks: number[] = [];
    let maxVal = 0;
    for (let i = 0; i < count; i++) {
      const v = Math.abs(raw.readFloatLE(i * 4));
      peaks.push(v);
      if (v > maxVal) maxVal = v;
    }
    // Normalise to [0, 1] with 3 decimal places
    const normalised = maxVal > 0
      ? peaks.map(v => Math.round((v / maxVal) * 1000) / 1000)
      : peaks;
    return JSON.stringify(normalised);
  } catch {
    return null;
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}
