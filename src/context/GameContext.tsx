import { createContext, useContext } from 'react';
import type { Sound } from '../audio/sound';
import type { GameEngine } from '../game/engine';

export interface GameServices {
  engine: GameEngine;
  sound: Sound;
  /** Open the How to play tour. */
  startTour: () => void;
  /** True while the tour is open (game shortcuts are paused). */
  tourOpen: boolean;
}

export const GameContext = createContext<GameServices | null>(null);

export function useServices(): GameServices {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useServices must be used inside <GameContext.Provider>');
  return ctx;
}
