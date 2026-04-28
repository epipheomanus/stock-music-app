/**
 * PlayerContext — global audio playback state.
 *
 * Architecture:
 *  - PlayerContext holds track state + a ref to the WaveSurfer instance
 *  - GlobalPlayerBar owns the DOM container and calls initWaveSurfer() after mount
 *  - WaveformPlayer rows are muted display-only instances; they call setActiveTrack() to
 *    hand off playback to the global bar
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import WaveSurfer from "wavesurfer.js";

export interface GlobalTrack {
  id: number;
  title: string;
  composerName: string | null;
  durationSeconds: number | null;
  coverArtUrl: string | null;
  watermarkedMp3Url: string | null;
  wavUrl: string | null;
  hasStems: boolean;
  watermarkStatus: string;
  tags: { genres: string[]; moods: string[]; attributes: string[] };
}

interface PlayerContextType {
  activeTrack: GlobalTrack | null;
  activeTrackId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  isLoading: boolean;
  /** Called by GlobalPlayerBar after its container div mounts */
  initWaveSurfer: (container: HTMLDivElement) => void;
  setActiveTrack: (track: GlobalTrack) => void;
  clearActiveTrack: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
}

const PlayerContext = createContext<PlayerContextType>({
  activeTrack: null,
  activeTrackId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isLoading: false,
  initWaveSurfer: () => {},
  setActiveTrack: () => {},
  clearActiveTrack: () => {},
  togglePlayPause: () => {},
  seek: () => {},
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrackState] = useState<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const pendingTrackRef = useRef<GlobalTrack | null>(null);
  const currentUrlRef = useRef<string>("");

  /** Called by GlobalPlayerBar once its container div is mounted */
  const initWaveSurfer = useCallback((container: HTMLDivElement) => {
    if (wavesurferRef.current) return; // already initialized

    const ws = WaveSurfer.create({
      container,
      waveColor: "oklch(0.75 0.01 240)",
      progressColor: "oklch(0.50 0.18 264)",
      cursorColor: "oklch(0.50 0.18 264)",
      cursorWidth: 2,
      height: 40,
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
      setDuration(dur);
      ws.play();
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
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("aborted") || msg.includes("abort")) return;
      console.warn("[GlobalPlayer] error:", err);
      setIsLoading(false);
    });

    // If a track was set before WaveSurfer was ready, load it now
    if (pendingTrackRef.current) {
      const url = pendingTrackRef.current.watermarkedMp3Url ?? pendingTrackRef.current.wavUrl ?? "";
      if (url) {
        currentUrlRef.current = url;
        ws.load(url);
      }
      pendingTrackRef.current = null;
    }
  }, []);

  const setActiveTrack = useCallback((track: GlobalTrack) => {
    setActiveTrackState(track);
    setCurrentTime(0);
    setDuration(0);

    const url = track.watermarkedMp3Url ?? track.wavUrl ?? "";
    if (!url) return;

    if (!wavesurferRef.current) {
      // WaveSurfer not yet initialized — queue the track
      pendingTrackRef.current = track;
      return;
    }

    if (url === currentUrlRef.current) {
      // Same track — just toggle play
      wavesurferRef.current.playPause();
      return;
    }

    currentUrlRef.current = url;
    setIsLoading(true);
    wavesurferRef.current.load(url);
  }, []);

  const clearActiveTrack = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
      try { wavesurferRef.current.empty(); } catch { /* ignore */ }
    }
    currentUrlRef.current = "";
    pendingTrackRef.current = null;
    setActiveTrackState(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, []);

  const togglePlayPause = useCallback(() => {
    wavesurferRef.current?.playPause();
  }, []);

  const seek = useCallback((time: number) => {
    if (!wavesurferRef.current || !duration) return;
    wavesurferRef.current.seekTo(time / duration);
  }, [duration]);

  return (
    <PlayerContext.Provider
      value={{
        activeTrack,
        activeTrackId: activeTrack?.id ?? null,
        isPlaying,
        currentTime,
        duration,
        isLoading,
        initWaveSurfer,
        setActiveTrack,
        clearActiveTrack,
        togglePlayPause,
        seek,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
