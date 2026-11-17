import { useServices } from '../../context/GameContext';
import { MAX_MULTIPLIER, MULTIPLIER_TABLE } from '../../game/fair';
import { GROUP_NAME, LETTERS } from '../../game/format';
import { GROUP_RANGE } from '../../game/theme';
import { useGame } from '../../hooks/useGame';

const MIN_MULTIPLIER = Math.min(...MULTIPLIER_TABLE.map(([m]) => m));
const ODDS = MULTIPLIER_TABLE.map(([m, c]) => `${m}× (${Math.round(c * 100)}%)`).join(', ');
const COLOUR: Record<string, string> = { B: 'blue', I: 'red', N: 'grey', G: 'green', O: 'orange' };

/** The five colour groups. Each shows the multiplier range a matching ball can carry. */
export function ColourPicks() {
  const { engine, sound } = useServices();
  const pick = useGame((s) => s.pick);
  return (
    <div className="field f-target">
      <div className="picks" role="radiogroup" aria-label="Pick the next ball's group">
        {LETTERS.map((L) => {
          const [lo, hi] = GROUP_RANGE[L].split('–');
          return (
            <button
              key={L}
              className="pk"
              data-p={L}
              role="radio"
              aria-checked={pick === L}
              aria-label={`${L}, ${COLOUR[L]}, ${lo} to ${hi}, pays ${MIN_MULTIPLIER} to ${MAX_MULTIPLIER} times`}
              title={`Wins pay your bet × the ball's multiplier: ${ODDS}`}
              onClick={() => {
                sound.play('click');
                engine.setPick(L);
              }}
            >
              <b>{L}</b>
              <span className="pk-info">
                <span className="pk-name">{GROUP_NAME[L]}</span>
                <span className="pk-range">{GROUP_RANGE[L]}</span>
              </span>
              <span className="pm">
                {MIN_MULTIPLIER}–{MAX_MULTIPLIER}×
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
