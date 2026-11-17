import { useEffect, useState } from 'react';
import { BET_WINDOW_MS } from '../../game/engine';
import { useGame } from '../../hooks/useGame';

const WINDOW_S = BET_WINDOW_MS / 1000;

/** Big countdown dial over the rail while bets are open. Fades out when they close. */
export function Countdown({ top, height }: { top: number; height: number }) {
  const left = useGame((s) => s.countdown);
  const [shown, setShown] = useState(left !== null);
  const [lastLeft, setLastLeft] = useState(WINDOW_S);

  useEffect(() => {
    if (left !== null) {
      setShown(true);
      setLastLeft(left);
      return;
    }
    const t = setTimeout(() => setShown(false), 250);
    return () => clearTimeout(t);
  }, [left]);

  if (!shown) return null;
  const value = left ?? lastLeft;
  const sec = Math.max(1, Math.ceil(value));
  const hot = sec <= 3;
  return (
    <div id="cdown" className={`cdown${left === null ? ' out' : ''}`} style={{ top, height }} aria-hidden="true">
      <div className="cd-dial">
        <svg viewBox="0 0 100 100">
          <circle className="cd-track" cx="50" cy="50" r="44" />
          <circle
            className={`cd-arc${hot ? ' hot' : ''}`}
            cx="50"
            cy="50"
            r="44"
            pathLength={100}
            style={{ strokeDashoffset: 100 - (value / WINDOW_S) * 100 }}
          />
        </svg>
        {/* A new key per second replays the bump animation. */}
        <span key={sec} className={`cd-num bump${hot ? ' hot' : ''}`}>
          {sec}
        </span>
      </div>
      <span className="cd-lbl">Bets close in</span>
    </div>
  );
}
