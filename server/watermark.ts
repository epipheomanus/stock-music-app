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
 */
export async function downloadToTemp(url: string, ext: string): Promise<string> {
  const tmpPath = path.join(os.tmpdir(), `sv_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmpPath, buf);
  return tmpPath;
}
