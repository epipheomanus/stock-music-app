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
  mp3PreviewUrl: string | null;
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
  volume: number;
  isCollapsed: boolean;
  /** Called by GlobalPlayerBar after its container div mounts */
  initWaveSurfer: (container: HTMLDivElement) => void;
  setActiveTrack: (track: GlobalTrack) => void;
  /** Set the full queue and optionally start playing a specific track */
  setQueue: (tracks: GlobalTrack[], startIndex?: number) => void;
  clearActiveTrack: () => void;
  togglePlayPause: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  playNext: () => void;
  playPrev: () => void;
  toggleCollapsed: () => void;
}

const PlayerContext = createContext<PlayerContextType>({
  activeTrack: null,
  activeTrackId: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  isLoading: false,
  volume: 1,
  isCollapsed: false,
  initWaveSurfer: () => {},
  setActiveTrack: () => {},
  setQueue: () => {},
  clearActiveTrack: () => {},
  togglePlayPause: () => {},
  seek: () => {},
  setVolume: () => {},
  playNext: () => {},
  playPrev: () => {},
  toggleCollapsed: () => {},
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [activeTrack, setActiveTrackState] = useState<GlobalTrack | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const pendingTrackRef = useRef<GlobalTrack | null>(null);
  const currentUrlRef = useRef<string>("");
  const queueRef = useRef<GlobalTrack[]>([]);
  const queueIndexRef = useRef<number>(-1);

  const loadTrack = useCallback((track: GlobalTrack) => {
    // Use clean WAV for playback; watermarkedMp3Url is only for the Download Preview button
    const url = track.mp3PreviewUrl ?? track.wavUrl ?? "";
    if (!url) return;

    setActiveTrackState(track);
    setCurrentTime(0);
    setDuration(0);

    if (!wavesurferRef.current) {
      pendingTrackRef.current = track;
      return;
    }

    if (url === currentUrlRef.current) {
      wavesurferRef.current.playPause();
      return;
    }

    currentUrlRef.current = url;
    setIsLoading(true);
    // Seek to 0 before loading so the new track always starts from the beginning,
    // not from the timecode the previous track was paused at.
    try { wavesurferRef.current.seekTo(0); } catch { /* ignore if no audio loaded yet */ }
    wavesurferRef.current.load(url);
  }, []);

  /** Called by GlobalPlayerBar once its container div is mounted */
  const initWaveSurfer = useCallback((container: HTMLDivElement) => {
    if (wavesurferRef.current) return;

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
    ws.setVolume(volume);

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
      // Auto-advance to next track
      const nextIdx = queueIndexRef.current + 1;
      if (nextIdx < queueRef.current.length) {
        queueIndexRef.current = nextIdx;
        loadTrack(queueRef.current[nextIdx]);
      }
    });
    ws.on("error", (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("aborted") || msg.includes("abort")) return;
      console.warn("[GlobalPlayer] error:", err);
      setIsLoading(false);
    });

    if (pendingTrackRef.current) {
      // Use clean WAV for playback
      const url = pendingTrackRef.current.mp3PreviewUrl ?? pendingTrackRef.current.wavUrl ?? "";
      if (url) {
        currentUrlRef.current = url;
        ws.load(url);
      }
      pendingTrackRef.current = null;
    }
  }, [volume, loadTrack]);

  const setActiveTrack = useCallback((track: GlobalTrack) => {
    // Find in queue or append
    const idx = queueRef.current.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      queueIndexRef.current = idx;
    } else {
      queueRef.current = [...queueRef.current, track];
      queueIndexRef.current = queueRef.current.length - 1;
    }
    loadTrack(track);
  }, [loadTrack]);

  const setQueue = useCallback((tracks: GlobalTrack[], startIndex = 0) => {
    queueRef.current = tracks;
    queueIndexRef.current = startIndex;
    if (tracks[startIndex]) loadTrack(tracks[startIndex]);
  }, [loadTrack]);

  const clearActiveTrack = useCallback(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.pause();
      try { wavesurferRef.current.empty(); } catch { /* ignore */ }
    }
    currentUrlRef.current = "";
    pendingTrackRef.current = null;
    queueRef.current = [];
    queueIndexRef.current = -1;
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

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    wavesurferRef.current?.setVolume(v);
  }, []);

  const playNext = useCallback(() => {
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < queueRef.current.length) {
      queueIndexRef.current = nextIdx;
      loadTrack(queueRef.current[nextIdx]);
    }
  }, [loadTrack]);

  const playPrev = useCallback(() => {
    // If more than 3s in, restart current track; otherwise go to previous
    if (currentTime > 3 && wavesurferRef.current) {
      wavesurferRef.current.seekTo(0);
      return;
    }
    const prevIdx = queueIndexRef.current - 1;
    if (prevIdx >= 0) {
      queueIndexRef.current = prevIdx;
      loadTrack(queueRef.current[prevIdx]);
    }
  }, [currentTime, loadTrack]);

  const toggleCollapsed = useCallback(() => {
    setIsCollapsed((c) => !c);
  }, []);

  return (
    <PlayerContext.Provider
      value={{
        activeTrack,
        activeTrackId: activeTrack?.id ?? null,
        isPlaying,
        currentTime,
        duration,
        isLoading,
        volume,
        isCollapsed,
        initWaveSurfer,
        setActiveTrack,
        setQueue,
        clearActiveTrack,
        togglePlayPause,
        seek,
        setVolume,
        playNext,
        playPrev,
        toggleCollapsed,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
