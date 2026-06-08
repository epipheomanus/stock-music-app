import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
// Use bundled binaries so the app works on Railway (no system ffmpeg/ffprobe)
import ffmpegPath from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const execFileAsync = promisify(execFile);

// Resolve binary paths: prefer bundled, fall back to system PATH
const FFMPEG_BIN = (ffmpegPath as unknown as string) || "ffmpeg";
const FFPROBE_BIN = ffprobeInstaller?.path || "ffprobe";

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
  const { stdout: durationOut } = await execFileAsync(FFPROBE_BIN, [
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
    await execFileAsync(FFMPEG_BIN, [
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

  await execFileAsync(FFMPEG_BIN, [
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
 */
export async function downloadToTemp(url: string, ext: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}

/**
 * Convert a WAV buffer to 16-bit PCM WAV using ffmpeg.
 * WebAudio (used by WaveSurfer) cannot decode 24-bit WAV in many browsers,
 * so we store a 16-bit version as `wavUrl` for browser playback.
 * The original 24-bit file is preserved as `originalWavUrl` for downloads.
 *
 * @param inputPath - Path to the source WAV file on disk
 * @returns Buffer containing the 16-bit WAV
 */
export async function convert16BitWav(inputPath: string): Promise<Buffer> {
  const tmpOut = path.join(os.tmpdir(), `conv16_${Date.now()}_${Math.random().toString(36).slice(2)}.wav`);
  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y", "-i", inputPath,
      "-acodec", "pcm_s16le",
      tmpOut,
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
}

/**
 * Generate waveform peak data from a WAV file for instant canvas rendering.
 * Returns a JSON string of normalized float values (0..1) sampled at numSamples points.
 *
 * @param wavPath - Path to the WAV file on disk
 * @param numSamples - Number of peak samples to generate (default 500)
 */
export async function generateWaveformPeaks(wavPath: string, numSamples = 500): Promise<string> {
  // Use ffmpeg to extract raw PCM samples as 16-bit mono at a low sample rate
  const targetRate = numSamples * 10;
  const tmpRaw = path.join(os.tmpdir(), `peaks_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`);
  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y", "-i", wavPath,
      "-ac", "1",                    // mono
      "-ar", String(targetRate),     // target sample rate
      "-f", "s16le",                 // raw 16-bit signed little-endian
      tmpRaw,
    ]);
    const rawBuf = fs.readFileSync(tmpRaw);
    const totalSamples = rawBuf.length / 2; // 2 bytes per s16le sample
    const blockSize = Math.max(1, Math.floor(totalSamples / numSamples));
    const peaks: number[] = [];
    for (let i = 0; i < numSamples; i++) {
      const start = i * blockSize * 2;
      const end = Math.min(start + blockSize * 2, rawBuf.length);
      let max = 0;
      for (let j = start; j < end; j += 2) {
        const sample = Math.abs(rawBuf.readInt16LE(j));
        if (sample > max) max = sample;
      }
      peaks.push(parseFloat((max / 32768).toFixed(4)));
    }
    return JSON.stringify(peaks);
  } finally {
    try { fs.unlinkSync(tmpRaw); } catch { /* ignore */ }
  }
}

/**
 * Convert a WAV file (any bit depth) to a 192kbps MP3 for browser streaming.
 * Returns the MP3 as a Buffer. The caller is responsible for uploading it to storage.
 *
 * @param wavPath - Path to the source WAV file on disk
 * @returns Buffer containing the 192kbps MP3
 */
export async function generateMp3Preview(wavPath: string): Promise<Buffer> {
  const tmpMp3 = path.join(os.tmpdir(), `mp3prev_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
  try {
    await execFileAsync(FFMPEG_BIN, [
      "-y", "-i", wavPath,
      "-codec:a", "libmp3lame",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      tmpMp3,
    ]);
    return fs.readFileSync(tmpMp3);
  } finally {
    try { fs.unlinkSync(tmpMp3); } catch { /* ignore */ }
  }
}
