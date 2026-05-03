/**
 * PlayerContext — global audio playback state.
 *
 * Architecture:
 *  - Uses a single native HTML5 <audio> element (no WaveSurfer dependency)
 *  - GlobalPlayerBar renders the progress bar UI and reads state from this context
 *  - WaveformPlayer rows draw a canvas waveform from pre-computed peaks and call
 *    setActiveTrack() to hand off playback to the global audio element
 */
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  ReactNode,
} from "react";

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
  volume: number;
  isCollapsed: boolean;
  setActiveTrack: (track: GlobalTrack) => void;
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string>("");
  const queueRef = useRef<GlobalTrack[]>([]);
  const queueIndexRef = useRef<number>(-1);

  // Create the single <audio> element once on mount
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onDurationChange = () => {
      if (isFinite(audio.duration)) setDuration(audio.duration);
    };
    const onPlay = () => { setIsPlaying(true); setIsLoading(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => setIsLoading(true);
    const onCanPlay = () => setIsLoading(false);
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      const nextIdx = queueIndexRef.current + 1;
      if (nextIdx < queueRef.current.length) {
        queueIndexRef.current = nextIdx;
        loadTrackUrl(queueRef.current[nextIdx]);
      }
    };
    const onError = () => {
      setIsLoading(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("loadedmetadata", onDurationChange);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("loadedmetadata", onDurationChange);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep volume in sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  const loadTrackUrl = useCallback((track: GlobalTrack) => {
    const url = track.wavUrl ?? "";
    if (!url) return;
    const audio = audioRef.current;
    if (!audio) return;

    setActiveTrackState(track);
    setCurrentTime(0);
    setDuration(0);

    if (url === currentUrlRef.current) {
      // Same track — toggle play/pause
      if (audio.paused) {
        setIsLoading(true);
        audio.play().catch(() => setIsLoading(false));
      } else {
        audio.pause();
      }
      return;
    }

    currentUrlRef.current = url;
    setIsLoading(true);
    audio.src = url;
    audio.load();
    audio.play().catch(() => setIsLoading(false));
  }, []);

  const setActiveTrack = useCallback((track: GlobalTrack) => {
    const idx = queueRef.current.findIndex((t) => t.id === track.id);
    if (idx >= 0) {
      queueIndexRef.current = idx;
    } else {
      queueRef.current = [...queueRef.current, track];
      queueIndexRef.current = queueRef.current.length - 1;
    }
    loadTrackUrl(track);
  }, [loadTrackUrl]);

  const setQueue = useCallback((tracks: GlobalTrack[], startIndex = 0) => {
    queueRef.current = tracks;
    queueIndexRef.current = startIndex;
    if (tracks[startIndex]) loadTrackUrl(tracks[startIndex]);
  }, [loadTrackUrl]);

  const clearActiveTrack = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
    }
    currentUrlRef.current = "";
    queueRef.current = [];
    queueIndexRef.current = -1;
    setActiveTrackState(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsLoading(false);
  }, []);

  const togglePlayPause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      setIsLoading(true);
      audio.play().catch(() => setIsLoading(false));
    } else {
      audio.pause();
    }
  }, []);

  const seek = useCallback((time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  }, []);

  const playNext = useCallback(() => {
    const nextIdx = queueIndexRef.current + 1;
    if (nextIdx < queueRef.current.length) {
      queueIndexRef.current = nextIdx;
      loadTrackUrl(queueRef.current[nextIdx]);
    }
  }, [loadTrackUrl]);

  const playPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    const prevIdx = queueIndexRef.current - 1;
    if (prevIdx >= 0) {
      queueIndexRef.current = prevIdx;
      loadTrackUrl(queueRef.current[prevIdx]);
    }
  }, [loadTrackUrl]);

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
