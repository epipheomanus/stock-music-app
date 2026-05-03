/**
 * WaveformPlayer — per-track row component.
 *
 * Architecture:
 *  - Draws waveform from pre-computed peaks (JSON array) using canvas — INSTANT, no WAV fetch
 *  - When peaks are not available, shows an animated placeholder bar
 *  - Play button is ALWAYS immediately clickable (no loading spinner)
 *  - When user clicks Play, hands off to GlobalPlayerBar via onPlay(track)
 *  - When this track IS the active global track, mirrors progress from PlayerContext
 *  - Does NOT output audio itself — audio comes from the GlobalPlayerBar
 */
import { useEffect, useRef, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";

interface WaveformPlayerProps {
  audioUrl: string;
  trackId: number;
  /** Pre-computed waveform peaks JSON string, e.g. "[0.1,0.5,0.3,...]" */
  peaks?: string | null;
  /** Track duration in seconds (used for time display when not active) */
  durationSeconds?: number | null;
  /** Whether this track is the one currently active in the global player */
  isGloballyPlaying: boolean;
  /** Called when user wants to start playing this track */
  onPlay: (trackId: number) => void;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parse peaks JSON string into a number array, or return null on failure */
function parsePeaks(peaksJson: string | null | undefined): number[] | null {
  if (!peaksJson) return null;
  try {
    const arr = JSON.parse(peaksJson);
    if (Array.isArray(arr) && arr.length > 0) return arr as number[];
    return null;
  } catch {
    return null;
  }
}

/** Draw waveform peaks onto a canvas element */
function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  progressRatio: number
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.offsetWidth;
  const height = canvas.offsetHeight;
  if (width === 0 || height === 0) return;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const barWidth = 2;
  const barGap = 1;
  const barUnit = barWidth + barGap;
  const numBars = Math.floor(width / barUnit);
  const midY = height / 2;
  const maxBarHeight = midY * 0.9;

  // Resample peaks to fit the number of bars
  const resampledPeaks: number[] = [];
  for (let i = 0; i < numBars; i++) {
    const srcIdx = (i / numBars) * peaks.length;
    const lo = Math.floor(srcIdx);
    const hi = Math.min(Math.ceil(srcIdx), peaks.length - 1);
    const frac = srcIdx - lo;
    resampledPeaks.push((peaks[lo] ?? 0) * (1 - frac) + (peaks[hi] ?? 0) * frac);
  }

  const progressBar = Math.floor(progressRatio * numBars);

  for (let i = 0; i < numBars; i++) {
    const peak = resampledPeaks[i] ?? 0;
    const barH = Math.max(2, peak * maxBarHeight);
    const x = i * barUnit;

    // Played portion: primary color; unplayed: muted
    ctx.fillStyle = i < progressBar
      ? "oklch(0.50 0.18 264)"   // primary
      : "oklch(0.80 0.008 240)"; // muted

    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(x, midY - barH, barWidth, barH * 2, 1);
    } else {
      ctx.rect(x, midY - barH, barWidth, barH * 2);
    }
    ctx.fill();
  }
}

export default function WaveformPlayer({
  trackId,
  peaks: peaksJson,
  durationSeconds,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastProgressRef = useRef<number>(-1);

  const {
    activeTrackId,
    currentTime: globalTime,
    duration: globalDuration,
    isPlaying: globalIsPlaying,
    togglePlayPause,
  } = usePlayer();

  const isActiveGlobal = activeTrackId === trackId;
  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? globalDuration : (durationSeconds ?? 0);
  const progressRatio = displayDuration > 0 ? displayTime / displayDuration : 0;

  const peaks = parsePeaks(peaksJson);

  // Draw waveform whenever progress changes
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    if (Math.abs(progressRatio - lastProgressRef.current) < 0.001) return;
    lastProgressRef.current = progressRatio;
    drawWaveform(canvas, peaks, progressRatio);
  }, [peaks, progressRatio]);

  // Initial draw + resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !peaks) return;

    // Draw immediately
    lastProgressRef.current = -1;
    drawWaveform(canvas, peaks, progressRatio);

    // Redraw on resize
    const ro = new ResizeObserver(() => {
      lastProgressRef.current = -1;
      if (canvas && peaks) drawWaveform(canvas, peaks, progressRatio);
    });
    ro.observe(container);
    return () => ro.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peaks, compact]);

  // Redraw on progress change using rAF for smooth updates
  useEffect(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(redraw);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [redraw]);

  const handlePlayPause = useCallback(() => {
    if (isActiveGlobal) {
      togglePlayPause();
    } else {
      onPlay(trackId);
    }
  }, [isActiveGlobal, togglePlayPause, onPlay, trackId]);

  const isShowingPlaying = isActiveGlobal && globalIsPlaying;
  const height = compact ? 36 : 48;

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Play/Pause button — always immediately clickable, no spinner */}
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

      {/* Waveform canvas or animated placeholder */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 cursor-pointer relative"
        style={{ height }}
        onClick={handlePlayPause}
      >
        {peaks ? (
          <canvas
            ref={canvasRef}
            style={{ width: "100%", height: "100%", display: "block" }}
          />
        ) : (
          /* Animated placeholder bars when peaks not yet available */
          <div className="flex items-center gap-[1px] h-full w-full overflow-hidden">
            {Array.from({ length: 60 }).map((_, i) => (
              <div
                key={i}
                className="flex-1 rounded-sm bg-muted-foreground/20 animate-pulse"
                style={{
                  height: `${20 + Math.sin(i * 0.5) * 15}%`,
                  animationDelay: `${(i % 8) * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>

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
