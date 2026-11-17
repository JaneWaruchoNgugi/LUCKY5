import { useServices } from '../../context/GameContext';
import { readBet } from '../../game/engine';
import { useGame } from '../../hooks/useGame';

const QUICK = [10, 20, 50, 100, 200] as const;

/** Bet input with − / + steppers and quick amounts. */
export function BetAmount() {
  const { engine, sound } = useServices();
  const betText = useGame((s) => s.betText);
  const balance = useGame((s) => s.balance);
  const { bet } = readBet(betText, balance);
  const step = (dir: 1 | -1) => {
    sound.play('click');
    engine.stepBet(dir);
  };
  return (
    <div className="field f-bet">
      <div className="box">
        <button className="step" id="bDown" aria-label="Lower bet" onClick={() => step(-1)}>
          −
        </button>
        <span className="cur-in">KES</span>
        <input
          id="bet"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          className="center"
          aria-label="Bet amount in KES"
          value={betText}
          onChange={(e) => engine.setBetText(e.target.value)}
        />
        <button className="step" id="bUp" aria-label="Raise bet" onClick={() => step(1)}>
          +
        </button>
      </div>
      <div className="amts">
        {QUICK.map((a) => (
          <button
            key={a}
            className={bet === a ? 'on' : undefined}
            onClick={() => {
              sound.play('click');
              engine.setBet(a);
            }}
          >
            {a}
          </button>
        ))}
      </div>
    </div>
  );
}
