/**
 * WaveformPlayer — per-track row component.
 *
 * Responsibilities:
 *  - Renders a WaveSurfer waveform for visual display (loads audio to draw shape)
 *  - When the user clicks Play, it calls onPlay(track) to hand off to the GlobalPlayerBar
 *  - When this track IS the active global track, it mirrors the global progress bar
 *  - Does NOT output audio itself — audio comes from the GlobalPlayerBar's WaveSurfer instance
 */
import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlayer } from "@/contexts/PlayerContext";

interface WaveformPlayerProps {
  audioUrl: string;
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
  audioUrl,
  trackId,
  isGloballyPlaying,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localDuration, setLocalDuration] = useState(0);

  // Pull live progress from global context when this is the active track
  const { activeTrackId, currentTime: globalTime, duration: globalDuration, isPlaying: globalIsPlaying, togglePlayPause } = usePlayer();
  const isActiveGlobal = activeTrackId === trackId;

  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? globalDuration : localDuration;
  const progressRatio = displayDuration > 0 ? displayTime / displayDuration : 0;

  // Initialize WaveSurfer for waveform drawing only (muted)
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
      backend: "WebAudio",
    });

    wavesurferRef.current = ws;
    ws.setVolume(0); // Mute — audio output is handled by GlobalPlayerBar

    ws.on("loading", () => setIsLoading(true));
    ws.on("ready", (dur) => {
      setIsLoading(false);
      setIsReady(true);
      setLocalDuration(dur);
    });
    ws.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("aborted") || msg.includes("abort")) return;
      console.warn("[WaveformPlayer] error:", err);
      setIsLoading(false);
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [compact]);

  // Load audio when URL changes (for waveform shape only)
  useEffect(() => {
    if (!wavesurferRef.current || !audioUrl) return;
    setIsReady(false);
    setIsLoading(true);
    wavesurferRef.current.load(audioUrl);
  }, [audioUrl]);

  // Mirror global progress in the visual waveform
  useEffect(() => {
    if (!wavesurferRef.current || !isReady || !isActiveGlobal || !globalDuration) return;
    const ratio = globalTime / globalDuration;
    if (ratio >= 0 && ratio <= 1) {
      wavesurferRef.current.seekTo(ratio);
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
        disabled={isLoading}
        aria-label={isShowingPlaying ? "Pause" : "Play"}
      >
        {isLoading && !isActiveGlobal ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isShowingPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </Button>

      {/* Waveform — visual display only */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ minHeight: compact ? 36 : 48 }}
        onClick={handlePlayPause}
      />

      {/* Time display */}
      <div className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right">
        {isReady || isActiveGlobal ? (
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
