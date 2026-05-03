/**
 * WaveformPlayer — per-track row component.
 *
 * Responsibilities:
 *  - Renders a WaveSurfer waveform for visual display (loads audio to draw shape)
 *  - When pre-computed peaks are provided, renders instantly without fetching the audio file
 *  - Uses IntersectionObserver to lazy-initialise off-screen waveforms
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
  /** Pre-computed peaks JSON string from the server — enables instant waveform rendering */
  waveformPeaks?: string | null;
  /** Duration in seconds (used with peaks to avoid fetching audio for duration) */
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

export default function WaveformPlayer({
  audioUrl,
  trackId,
  waveformPeaks,
  durationSeconds,
  isGloballyPlaying,
  onPlay,
  compact = false,
}: WaveformPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [localDuration, setLocalDuration] = useState(durationSeconds ?? 0);
  const [isVisible, setIsVisible] = useState(false);

  // Pull live progress from global context when this is the active track
  const { activeTrackId, currentTime: globalTime, duration: globalDuration, isPlaying: globalIsPlaying, togglePlayPause } = usePlayer();
  const isActiveGlobal = activeTrackId === trackId;

  const displayTime = isActiveGlobal ? globalTime : 0;
  const displayDuration = isActiveGlobal ? globalDuration : localDuration;

  // ── Lazy-load: only initialise WaveSurfer when the row is scrolled into view ──
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setIsVisible(true); },
      { rootMargin: "200px" } // pre-load 200px before entering viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Initialize WaveSurfer once visible ──
  useEffect(() => {
    if (!isVisible || !containerRef.current) return;

    const parsedPeaks: number[] | null = (() => {
      if (!waveformPeaks) return null;
      try { return JSON.parse(waveformPeaks); } catch { return null; }
    })();

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "oklch(0.80 0.008 240)",
      progressColor: "oklch(0.50 0.18 264)",
      cursorColor: "transparent",
      cursorWidth: 0,
      height: compact ? 36 : 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: false, // clicks handled by the container div below
      // MediaElement backend supports 24-bit/32-bit float WAV files;
      // WebAudio's decodeAudioData() rejects them and leaves isLoading stuck.
      backend: "MediaElement",
      // Pre-supply peaks so WaveSurfer renders the waveform shape without
      // fetching the full audio file (the audio is only loaded on first play).
      ...(parsedPeaks && durationSeconds ? { peaks: [parsedPeaks], duration: durationSeconds } : {}),
    });

    wavesurferRef.current = ws;
    ws.setVolume(0); // Mute — audio output is handled by GlobalPlayerBar

    if (parsedPeaks && durationSeconds) {
      // Peaks supplied — render instantly without fetching audio
      setIsReady(true);
      setLocalDuration(durationSeconds);
    } else {
      // No peaks — fall back to loading the audio file for waveform drawing
      setIsLoading(true);
      ws.load(audioUrl);
    }

    ws.on("loading", () => setIsLoading(true));
    ws.on("ready", (dur) => {
      setIsLoading(false);
      setIsReady(true);
      if (dur) setLocalDuration(dur);
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
    // Re-init only when visibility or compact changes; audioUrl/peaks changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, compact]);

  // ── Reload when audioUrl changes (only if no peaks, since peaks render instantly) ──
  useEffect(() => {
    if (!wavesurferRef.current || !audioUrl) return;
    const parsedPeaks: number[] | null = (() => {
      if (!waveformPeaks) return null;
      try { return JSON.parse(waveformPeaks); } catch { return null; }
    })();
    if (parsedPeaks && durationSeconds) return; // peaks already rendered
    setIsReady(false);
    setIsLoading(true);
    wavesurferRef.current.load(audioUrl);
  }, [audioUrl, waveformPeaks, durationSeconds]);

  // ── Mirror global progress in the visual waveform ──
  useEffect(() => {
    if (!wavesurferRef.current || !isReady || !isActiveGlobal || !globalDuration) return;
    const ratio = globalTime / globalDuration;
    if (ratio >= 0 && ratio <= 1) {
      wavesurferRef.current.seekTo(ratio);
    }
  }, [isActiveGlobal, globalTime, globalDuration, isReady]);

  const handlePlayPause = useCallback(() => {
    if (isActiveGlobal) {
      togglePlayPause();
    } else {
      onPlay(trackId);
    }
  }, [isActiveGlobal, togglePlayPause, onPlay, trackId]);

  const isShowingPlaying = isActiveGlobal && globalIsPlaying;

  return (
    <div ref={wrapperRef} className="flex items-center gap-3 w-full">
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
