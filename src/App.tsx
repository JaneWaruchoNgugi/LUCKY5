import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Sound } from './audio/sound';
import { BetPanel } from './components/bet/BetPanel';
import { Header } from './components/layout/Header';
import { RoundLog } from './components/log/RoundLog';
import { Stage } from './components/stage/Stage';
import { Tour } from './components/tour/Tour';
import { markTourSeen, tourSeen } from './components/tour/tourSteps';
import { GameContext, type GameServices } from './context/GameContext';
import type { GameEngine } from './game/engine';
import { useShortcuts } from './hooks/useShortcuts';

function Shortcuts() {
  useShortcuts();
  return null;
}

export function App({ engine, sound }: { engine: GameEngine; sound: Sound }) {
  const [tourOpen, setTourOpen] = useState(false);
  const startTour = useCallback(() => setTourOpen(true), []);
  const endTour = useCallback(() => {
    setTourOpen(false);
    markTourSeen();
  }, []);

  // First visit: show the tour once the page has settled.
  useEffect(() => {
    if (tourSeen()) return;
    const t = setTimeout(startTour, 700);
    return () => clearTimeout(t);
  }, [startTour]);

  const services = useMemo<GameServices>(() => ({ engine, sound, startTour, tourOpen }), [engine, sound, startTour, tourOpen]);

  return (
    <GameContext.Provider value={services}>
      <Shortcuts />
      <div className="wrap">
        <Header />
        {tourOpen && <Tour onClose={endTour} />}
        <Stage />
        <div className="grid">
          <BetPanel />
          <div className="right">
            <RoundLog />
          </div>
        </div>
        <footer>
          Lucky Five is a prototype using demo KES. Balances have no cash value and cannot be deposited or
          withdrawn.
        </footer>
      </div>
    </GameContext.Provider>
  );
}
