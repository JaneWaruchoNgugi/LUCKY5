import { useEffect, useRef, useState } from 'react';
import { Rail } from '../../canvas/rail';
import { useServices } from '../../context/GameContext';
import { useGame } from '../../hooks/useGame';
import { Countdown } from './Countdown';
import { ResultBanner } from './ResultBanner';
import { YourPick } from './YourPick';

/** The canvas rail plus the overlays drawn over it: countdown, your pick and the result banner. */
export function Stage() {
  const { engine, sound } = useServices();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const railRef = useRef<Rail | null>(null);
  const [geo, setGeo] = useState(() => engine.railGeo());
  const result = useGame((s) => s.result);
  const [flash, setFlash] = useState<'won' | 'lost' | null>(null);

  // Create the rail once and hand it to the engine, which starts the round loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Only one rail per canvas, even when React runs effects twice in development.
    if (!railRef.current) {
      railRef.current = new Rail(canvas, engine.history, sound);
      engine.attachRail(railRef.current);
    }
    setGeo(engine.railGeo());
    const onResize = () => {
      engine.relayout();
      setGeo(engine.railGeo());
    };
    addEventListener('resize', onResize);
    void document.fonts?.ready.then(() => engine.redraw());
    return () => removeEventListener('resize', onResize);
  }, [engine, sound]);

  // Edge the stage green or red after a settled bet.
  useEffect(() => {
    if (!result) return;
    setFlash(result.win ? 'won' : 'lost');
    const t = setTimeout(() => setFlash(null), 3000);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <section className={`stage${flash ? ` ${flash}` : ''}`} id="stage" aria-label="Caller rail">
      <canvas
        ref={canvasRef}
        id="rail"
        role="img"
        aria-label="Bingo balls sliding under the marker, with previous results along the top"
      />
      <YourPick top={geo.hist + 10} />
      <Countdown top={geo.hist} height={geo.railH} />
      <ResultBanner />
    </section>
  );
}
