/**
 * WaveformPlayer — per-track row component.
 *
 * Responsibilities:
 *  - Draws a canvas waveform from pre-computed peaks (instant, no audio fetch)
 *  - Falls back to an animated equaliser bar when peaks are not available
 *  - Play button is always immediately clickable — never stuck behind a spinner
 *  - When the user clicks Play, calls onPlay(trackId) to hand off to PlayerContext
 *  - When this track IS the active global track, mirrors the global progress position
 *  - Does NOT output audio itself — audio is owned by PlayerContext's <audio> element
 */
import { useEffect, useRef, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";

interface WaveformPlayerProps {
  audioUrl: string;
  trackId: number;
  /** Pre-computed peaks JSON string from the server — enables instant waveform rendering */
  waveformPeaks?: string | null;
  /** Duration in seconds */
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

/** Draw a waveform onto a canvas element from a peaks array */
function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  progress: number, // 0–1
  isActive: boolean
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const barWidth = 2;
  const barGap = 1;
  const step = barWidth + barGap;
  const numBars = Math.floor(width / step);
  const mid = height / 2;

  for (let i = 0; i < numBars; i++) {
    const peakIdx = Math.floor((i / numBars) * peaks.length);
    const amplitude = Math.abs(peaks[peakIdx] ?? 0);
    const barHeight = Math.max(2, amplitude * mid * 0.9);
    const x = i * step;
    const filled = i / numBars <= progress;

    ctx.fillStyle = filled
      ? (isActive ? "oklch(0.50 0.18 264)" : "oklch(0.55 0.15 264)")
      : "oklch(0.80 0.008 240)";
    ctx.beginPath();
    ctx.roundRect(x, mid - barHeight, barWidth, barHeight * 2, 1);
    ctx.fill();
  }
}

export default function WaveformPlayer({
  trackId,
  waveformPeaks,
  durationSeconds,
  isGloballyPlaying,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

  const {
    activeTrackId,
    currentTime: globalTime,
    duration: globalDuration,
    isPlaying: globalIsPlaying,
    togglePlayPause,
  } = usePlayer();

  const isActiveGlobal = activeTrackId === trackId;
  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? (globalDuration || durationSeconds || 0) : (durationSeconds || 0);
  const progress = displayDuration > 0 ? displayTime / displayDuration : 0;

  const parsedPeaks: number[] | null = (() => {
    if (!waveformPeaks) return null;
    try { return JSON.parse(waveformPeaks); } catch { return null; }
  })();

  // Draw / redraw the canvas whenever progress or active state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !parsedPeaks) return;

    cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => {
      drawWaveform(canvas, parsedPeaks, progress, isActiveGlobal);
    });

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [parsedPeaks, progress, isActiveGlobal]);

  // Set canvas pixel dimensions to match its CSS size on mount and resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      if (parsedPeaks) {
        drawWaveform(canvas, parsedPeaks, progress, isActiveGlobal);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle click on canvas to seek
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActiveGlobal) {
      onPlay(trackId);
      return;
    }
    // Seek to clicked position
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const { seek } = usePlayerSeekRef.current;
    seek(ratio * (globalDuration || 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActiveGlobal, onPlay, trackId, globalDuration]);

  // We need seek from context — use a ref to avoid stale closure
  const { seek } = usePlayer();
  const usePlayerSeekRef = useRef({ seek });
  useEffect(() => { usePlayerSeekRef.current = { seek }; }, [seek]);

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
    <div ref={wrapperRef} className="flex items-center gap-3 w-full">
      {/* Play/Pause button — always immediately clickable */}
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

      {/* Waveform canvas — instant from peaks, or flat bar fallback */}
      {parsedPeaks ? (
        <canvas
          ref={canvasRef}
          className="flex-1 min-w-0 cursor-pointer"
          style={{ height }}
          onClick={handleCanvasClick}
        />
      ) : (
        /* Flat animated bar fallback when no peaks available */
        <div
          className="flex-1 min-w-0 cursor-pointer flex items-center"
          style={{ height }}
          onClick={handlePlayPause}
        >
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            {isActiveGlobal ? (
              <div
                className="h-full bg-primary rounded-full transition-all duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            ) : (
              <div className="h-full bg-muted-foreground/20 rounded-full" />
            )}
          </div>
        </div>
      )}

      {/* Time display */}
      <div className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right">
        {displayDuration > 0 || isActiveGlobal ? (
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
