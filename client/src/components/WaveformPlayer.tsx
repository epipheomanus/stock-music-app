/**
 * WaveformPlayer — per-track row waveform component.
 *
 * Renders a waveform bar chart directly on a <canvas> element using pre-computed
 * peaks from the database. No WaveSurfer instance, no audio download, no RAM usage.
 *
 * When the user clicks Play, it hands off to the GlobalPlayerBar (via onPlay).
 * When this track IS the active global track, the canvas mirrors playback progress
 * by drawing played bars in the accent colour and unplayed bars in the muted colour.
 */
import { useEffect, useRef, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";

interface WaveformPlayerProps {
  /** Pre-computed waveform peaks (JSON string or number[] from DB). */
  peaks?: string | number[] | null;
  /** Duration in seconds — used for time display. */
  durationSeconds?: number | null;
  trackId: number;
  /** Whether this track is the one currently active in the global player. */
  isGloballyPlaying: boolean;
  /** Called when user wants to start playing this track. */
  onPlay: (trackId: number) => void;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse peaks from DB string or array, then apply perceptual sqrt scaling. */
function processPeaks(raw: string | number[] | null | undefined): number[] {
  let arr: number[] | undefined;
  if (!raw) return [];
  if (Array.isArray(raw)) arr = raw;
  else { try { arr = JSON.parse(raw); } catch { return []; } }
  if (!arr || arr.length === 0) return [];

  // Normalize: scale so the loudest peak = 1.0
  const max = Math.max(...arr);
  if (max <= 0) return arr;
  const normalized = arr.map(v => v / max);

  // Logarithmic perceptual curve — matches what WaveSurfer's WebAudio backend
  // produced visually. The key insight: sqrt(0.0001) = 0.01 (still invisible),
  // but log-based scaling maps the full 0..1 range to a visible 0..1 display range.
  //
  // Formula: log(1 + k*v) / log(1 + k)  where k controls the compression strength.
  // k=200 means even values as small as 0.001 map to ~0.27 (27% bar height).
  const k = 50;
  const logK = Math.log(1 + k);
  return normalized.map(v => Math.log(1 + k * v) / logK);
}

/** Draw the waveform bars onto the canvas. */
function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  progressRatio: number,
  isDark: boolean,
) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (w === 0 || h === 0) return;

  canvas.width = w * dpr;
  canvas.height = h * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  if (peaks.length === 0) {
    // Placeholder flat line when no peaks available
    ctx.fillStyle = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(0, h / 2 - 1, w, 2);
    return;
  }

  const barWidth = 2;
  const barGap = 1;
  const step = barWidth + barGap;
  const numBars = Math.floor(w / step);
  const playedColor = "oklch(0.84 0.14 174)";   // primary green accent
  const unplayedColor = isDark ? "rgba(255,255,255,0.20)" : "rgba(0,0,0,0.18)";

  // Downsample/upsample peaks to exactly numBars
  const resampled: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const idx = (i / numBars) * peaks.length;
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, peaks.length - 1);
    const t = idx - lo;
    resampled.push(peaks[lo] * (1 - t) + peaks[hi] * t);
  }

  const progressBar = Math.floor(progressRatio * numBars);

  for (let i = 0; i < numBars; i++) {
    const barH = Math.max(2, resampled[i] * h);
    const x = i * step;
    const y = (h - barH) / 2;
    ctx.fillStyle = i < progressBar ? playedColor : unplayedColor;
    // Rounded bar caps
    const r = Math.min(1, barWidth / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barH, r);
    ctx.fill();
  }
}

export default function WaveformPlayer({
  peaks,
  durationSeconds,
  trackId,
  isGloballyPlaying,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processedPeaks = useRef<number[]>([]);

  const {
    activeTrackId,
    currentTime: globalTime,
    duration: globalDuration,
    isPlaying: globalIsPlaying,
    togglePlayPause,
    seek,
  } = usePlayer();

  const isActiveGlobal = activeTrackId === trackId;
  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? globalDuration : (durationSeconds ?? 0);
  const progressRatio = displayDuration > 0 ? displayTime / displayDuration : 0;

  // Process peaks once on mount / when peaks prop changes
  useEffect(() => {
    processedPeaks.current = processPeaks(peaks);
  }, [peaks]);

  // Detect dark mode via CSS variable
  const isDark = useCallback(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  }, []);

  // Redraw canvas whenever progress or size changes.
  // ResizeObserver fires synchronously on first observe, so we don't need a
  // separate initial draw() call — this also handles the case where the canvas
  // starts with zero clientWidth (e.g. hidden tab, lazy-rendered row) and only
  // gets its real size after layout settles.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      drawWaveform(canvas, processedPeaks.current, progressRatio, isDark());
    };

    // Observe size changes — fires immediately on first observe with current size
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) draw();
    });
    ro.observe(canvas);

    // Also redraw when progress changes (size hasn't changed, only ratio)
    draw();

    return () => ro.disconnect();
  }, [progressRatio, isDark]);

  const handlePlayPause = useCallback(() => {
    if (isActiveGlobal) {
      togglePlayPause();
    } else {
      onPlay(trackId);
    }
  }, [isActiveGlobal, togglePlayPause, onPlay, trackId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isActiveGlobal && displayDuration > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        seek(ratio * displayDuration);
      } else {
        handlePlayPause();
      }
    },
    [isActiveGlobal, displayDuration, seek, handlePlayPause],
  );

  const isShowingPlaying = isActiveGlobal && globalIsPlaying;
  const height = compact ? 36 : 48;

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Play/Pause button */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        onClick={handlePlayPause}
        aria-label={isShowingPlaying ? "Pause" : "Play"}
      >
        {isShowingPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </Button>

      {/* Canvas waveform */}
      <canvas
        ref={canvasRef}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ height, display: "block" }}
        onClick={handleCanvasClick}
        aria-label="Waveform — click to seek"
      />

      {/* Time display */}
      <div className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right">
        {displayDuration > 0 ? (
          <span>
            <span className="text-foreground">{formatTime(displayTime)}</span>
            <span className="mx-1 opacity-40">/</span>
            {formatTime(displayDuration)}
          </span>
        ) : (
          <span className="opacity-40">—</span>
        )}
      </div>
    </div>
  );
}
