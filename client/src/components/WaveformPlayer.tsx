/**
 * WaveformPlayer — per-track row component.
 *
 * Responsibilities:
 *  - Renders a WaveSurfer waveform for visual display
 *  - When pre-computed peaks are provided, renders instantly without fetching the audio file
 *  - Uses IntersectionObserver to lazy-initialise off-screen waveforms
 *  - When the user clicks Play, it calls onPlay(track) to hand off to the GlobalPlayerBar
 *  - When this track IS the active global track, it mirrors the global progress bar
 *  - Does NOT output audio itself — audio comes from the GlobalPlayerBar's WaveSurfer instance
 *
 * Loading strategy:
 *  - If peaks + duration are available: render immediately, no audio fetch needed
 *  - If no peaks: show play button immediately (not stuck behind loading), load audio lazily
 *    for waveform drawing. Use the <audio> element's loadedmetadata event for duration
 *    (fires quickly from the file header, unlike WaveSurfer's "ready" which needs buffering).
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
  // isReady: waveform is drawn (peaks supplied or audio loaded)
  const [isReady, setIsReady] = useState(false);
  // isWaveformLoading: waveform is actively being fetched (no peaks, audio loading)
  const [isWaveformLoading, setIsWaveformLoading] = useState(false);
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

    const hasPeaksAndDuration = !!(parsedPeaks && durationSeconds);

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
      interact: false,
      // MediaElement backend supports 24-bit/32-bit float WAV files
      backend: "MediaElement",
      ...(hasPeaksAndDuration ? { peaks: [parsedPeaks!], duration: durationSeconds! } : {}),
    });

    wavesurferRef.current = ws;
    ws.setVolume(0); // Mute — audio output is handled by GlobalPlayerBar

    if (hasPeaksAndDuration) {
      // Peaks + duration supplied — render instantly, no audio fetch needed
      setIsReady(true);
      setLocalDuration(durationSeconds!);
    } else {
      // No peaks — load audio for waveform drawing.
      // IMPORTANT: Do NOT set isLoading=true here — that would block the play button.
      // Instead, show the play button immediately and draw the waveform in the background.
      setIsWaveformLoading(true);
      ws.load(audioUrl);

      // Listen to the underlying <audio> element's loadedmetadata event for duration.
      // This fires as soon as the browser reads the file header (very fast, even for large files),
      // unlike WaveSurfer's "ready" event which requires significant buffering.
      const checkForMediaEl = setInterval(() => {
        const mediaEl = ws.getMediaElement();
        if (!mediaEl) return;
        clearInterval(checkForMediaEl);

        const onMetadata = () => {
          if (mediaEl.duration && isFinite(mediaEl.duration)) {
            setLocalDuration(mediaEl.duration);
          }
          // Mark as ready so the waveform container shows (even if still drawing)
          setIsReady(true);
          setIsWaveformLoading(false);
        };

        if (mediaEl.readyState >= 1) {
          // Metadata already available
          onMetadata();
        } else {
          mediaEl.addEventListener("loadedmetadata", onMetadata, { once: true });
        }
      }, 50);

      // Fallback: if loadedmetadata never fires (e.g. CORS or format issue),
      // clear the loading state after 8 seconds so the play button is never permanently stuck.
      const fallbackTimer = setTimeout(() => {
        setIsWaveformLoading(false);
        setIsReady(true);
        clearInterval(checkForMediaEl);
      }, 8000);

      ws.on("ready", (dur) => {
        clearTimeout(fallbackTimer);
        clearInterval(checkForMediaEl);
        setIsWaveformLoading(false);
        setIsReady(true);
        if (dur) setLocalDuration(dur);
      });

      ws.on("error", (err) => {
        clearTimeout(fallbackTimer);
        clearInterval(checkForMediaEl);
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("aborted") || msg.includes("abort")) return;
        console.warn("[WaveformPlayer] error:", err);
        setIsWaveformLoading(false);
        setIsReady(true); // Still show play button even if waveform failed to draw
      });
    }

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, compact]);

  // ── Reload when audioUrl changes (only if no peaks) ──
  useEffect(() => {
    if (!wavesurferRef.current || !audioUrl) return;
    const parsedPeaks: number[] | null = (() => {
      if (!waveformPeaks) return null;
      try { return JSON.parse(waveformPeaks); } catch { return null; }
    })();
    if (parsedPeaks && durationSeconds) return; // peaks already rendered
    setIsReady(false);
    setIsWaveformLoading(true);
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
  // Only show the spinner if the row is visible and waveform is actively loading
  // AND this is not the active track (active track has its own loading state in the player bar)
  const showSpinner = isWaveformLoading && !isActiveGlobal && !isReady;

  return (
    <div ref={wrapperRef} className="flex items-center gap-3 w-full">
      {/* Play/Pause button — never permanently disabled */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        onClick={handlePlayPause}
        aria-label={isShowingPlaying ? "Pause" : "Play"}
      >
        {showSpinner ? (
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
