import { useSyncExternalStore } from 'react';
import type { Snapshot } from '../game/engine';
import { useServices } from '../context/GameContext';

/**
 * Subscribe to one slice of the game state. The component re-renders only when the
 * selected value changes, so pick primitives or slices the engine keeps by reference.
 */
export function useGame<T>(select: (s: Snapshot) => T): T {
  const { engine } = useServices();
  return useSyncExternalStore(engine.subscribe, () => select(engine.getSnapshot()));
}
