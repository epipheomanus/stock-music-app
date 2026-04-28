import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface PlayerContextType {
  activeTrackId: number | null;
  setActiveTrack: (id: number) => void;
  clearActiveTrack: () => void;
}

const PlayerContext = createContext<PlayerContextType>({
  activeTrackId: null,
  setActiveTrack: () => {},
  clearActiveTrack: () => {},
});

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [activeTrackId, setActiveTrackId] = useState<number | null>(null);

  const setActiveTrack = useCallback((id: number) => setActiveTrackId(id), []);
  const clearActiveTrack = useCallback(() => setActiveTrackId(null), []);

  return (
    <PlayerContext.Provider value={{ activeTrackId, setActiveTrack, clearActiveTrack }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  return useContext(PlayerContext);
}
