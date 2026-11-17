import { useServices } from '../../context/GameContext';
import { useGame } from '../../hooks/useGame';

const ROUNDS = [10, 25, 50, 100] as const;

/** How many rounds an auto run lasts. Only shown in Auto mode. */
export function AutoRounds() {
  const { engine, sound } = useServices();
  const rounds = useGame((s) => s.rounds);
  return (
    <div className="field" id="autoBox">
      <div className="rounds-lbl" id="roundsLbl">
        Number of rounds
      </div>
      <div className="seg seg-full rounds-seg" role="group" aria-labelledby="roundsLbl">
        {ROUNDS.map((r) => (
          <button
            key={r}
            className={rounds === r ? 'on' : undefined}
            onClick={() => {
              sound.play('click');
              engine.setRounds(r);
            }}
          >
            {r}
            <small>rounds</small>
          </button>
        ))}
      </div>
    </div>
  );
}
