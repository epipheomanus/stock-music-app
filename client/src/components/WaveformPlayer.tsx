/**
 * WaveformPlayer — per-track row component.
 *
 * Responsibilities:
 *  - Renders a WaveSurfer waveform for VISUAL display only, using pre-computed peaks
 *    from the database — NO audio file is downloaded or decoded in this component.
 *  - When the user clicks Play, it calls onPlay(track) to hand off to the GlobalPlayerBar
 *  - When this track IS the active global track, it mirrors the global progress bar
 *  - Does NOT output audio itself — audio comes from the GlobalPlayerBar's WaveSurfer instance
 *
 * Memory note: By using pre-computed peaks instead of loading audio, this component
 * avoids the massive RAM usage that comes from WebAudio decoding full audio files.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";

interface WaveformPlayerProps {
  /** Pre-computed waveform peaks (JSON string or number[] array from DB). Used for visual rendering only — no audio is loaded. */
  peaks?: string | number[] | null;
  /** Duration in seconds — used for time display and seek calculations */
  durationSeconds?: number | null;
  trackId: number;
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

export default function WaveformPlayer({
  peaks,
  durationSeconds,
  trackId,
  isGloballyPlaying,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Pull live progress from global context when this is the active track
  const { activeTrackId, currentTime: globalTime, duration: globalDuration, isPlaying: globalIsPlaying, togglePlayPause, seek } = usePlayer();
  const isActiveGlobal = activeTrackId === trackId;

  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? globalDuration : (durationSeconds ?? 0);
  const progressRatio = displayDuration > 0 ? displayTime / displayDuration : 0;

  // Parse peaks from string or array
  const parsedPeaks: number[] | undefined = (() => {
    if (!peaks) return undefined;
    if (Array.isArray(peaks)) return peaks;
    try { return JSON.parse(peaks); } catch { return undefined; }
  })();

  // Initialize WaveSurfer for waveform drawing only — no audio loaded
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "oklch(0.80 0.008 240)",
      progressColor: "oklch(0.84 0.14 174)",
      cursorColor: "transparent",
      cursorWidth: 0,
      height: compact ? 36 : 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false, // clicks handled by the container div below
      // Use MediaElement backend — lighter than WebAudio, no full decode into RAM
      backend: "MediaElement",
      // Duration hint so the waveform can be drawn without loading audio
      duration: durationSeconds ?? undefined,
    });

    wavesurferRef.current = ws;
    ws.setVolume(0); // Mute — audio output is handled by GlobalPlayerBar

    ws.on("ready", () => {
      setIsReady(true);
    });
    ws.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("aborted") || msg.includes("abort")) return;
      // Suppress "No audio" errors — expected when rendering from peaks only
      if (msg.includes("No audio") || msg.includes("no audio")) return;
      console.warn("[WaveformPlayer] error:", err);
    });

    // Draw waveform from pre-computed peaks immediately — no audio download needed
    if (parsedPeaks && parsedPeaks.length > 0) {
      ws.load("", [parsedPeaks], durationSeconds ?? undefined);
      setIsReady(true);
    }

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
      setIsReady(false);
    };
    // Only re-initialize if compact changes (layout change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);

  // Mirror global progress in the visual waveform
  useEffect(() => {
    if (!wavesurferRef.current || !isReady || !isActiveGlobal || !globalDuration) return;
    const ratio = globalTime / globalDuration;
    if (ratio >= 0 && ratio <= 1) {
      try { wavesurferRef.current.seekTo(ratio); } catch { /* ignore */ }
    }
  }, [isActiveGlobal, globalTime, globalDuration, isReady]);

  const handlePlayPause = useCallback(() => {
    if (isActiveGlobal) {
      // Already active — toggle play/pause on the global player
      togglePlayPause();
    } else {
      // Trigger global player to load and play this track
      onPlay(trackId);
    }
  }, [isActiveGlobal, togglePlayPause, onPlay, trackId]);

  const isShowingPlaying = isActiveGlobal && globalIsPlaying;

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

      {/* Waveform — click seeks when active, otherwise starts playback */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ minHeight: compact ? 36 : 48 }}
        onClick={(e) => {
          if (isActiveGlobal && displayDuration > 0) {
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            seek(ratio * displayDuration);
          } else {
            handlePlayPause();
          }
        }}
      />

      {/* Time display */}
      <div className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right">
        {(isReady || isActiveGlobal) && displayDuration > 0 ? (
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
