import { useEffect, useRef, useState, useCallback } from "react";
import WaveSurfer from "wavesurfer.js";
import { Play, Pause, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface WaveformPlayerProps {
  audioUrl: string;
  trackId: number;
  isGloballyPlaying: boolean;
  onPlay: (trackId: number) => void;
  compact?: boolean;
}

function formatTime(seconds: number): string {
  if (isNaN(seconds)) return "0:00";
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!containerRef.current) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: "oklch(0.80 0.008 240)",
      progressColor: "oklch(0.50 0.18 264)",
      cursorColor: "oklch(0.50 0.18 264)",
      cursorWidth: 2,
      height: compact ? 36 : 48,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      normalize: true,
      interact: true,
      backend: "WebAudio",
    });

    wavesurferRef.current = ws;

    ws.on("loading", () => setIsLoading(true));
    ws.on("ready", (dur) => {
      setIsLoading(false);
      setIsReady(true);
      setDuration(dur);
    });
    ws.on("audioprocess", (t) => setCurrentTime(t));
    ws.on("seeking", (t) => setCurrentTime(t));
    ws.on("play", () => setIsPlaying(true));
    ws.on("pause", () => setIsPlaying(false));
    ws.on("finish", () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    ws.on("error", (err) => {
      console.error("[WaveSurfer] error:", err);
      setIsLoading(false);
    });

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [audioUrl, compact]);

  // Load audio when URL changes
  useEffect(() => {
    if (!wavesurferRef.current || !audioUrl) return;
    setIsReady(false);
    setIsLoading(true);
    wavesurferRef.current.load(audioUrl);
  }, [audioUrl]);

  // Sync global play state — pause if another track starts
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;
    if (!isGloballyPlaying && isPlaying) {
      wavesurferRef.current.pause();
    }
  }, [isGloballyPlaying, isPlaying, isReady]);

  const handlePlayPause = useCallback(() => {
    if (!wavesurferRef.current || !isReady) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      onPlay(trackId);
      wavesurferRef.current.play();
    }
  }, [isPlaying, isReady, onPlay, trackId]);

  return (
    <div className="flex items-center gap-3 w-full">
      {/* Play/Pause button */}
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-9 w-9 rounded-full bg-primary/10 hover:bg-primary/20 text-primary"
        onClick={handlePlayPause}
        disabled={isLoading}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isPlaying ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 fill-current ml-0.5" />
        )}
      </Button>

      {/* Waveform */}
      <div
        ref={containerRef}
        className="flex-1 min-w-0 cursor-pointer"
        style={{ minHeight: compact ? 36 : 48 }}
      />

      {/* Time display */}
      <div className="shrink-0 text-xs text-muted-foreground tabular-nums w-20 text-right">
        {isReady ? (
          <span>
            <span className="text-foreground">{formatTime(currentTime)}</span>
            <span className="mx-1 opacity-40">/</span>
            {formatTime(duration)}
          </span>
        ) : (
          <span className="opacity-40">—</span>
        )}
      </div>
    </div>
  );
}
