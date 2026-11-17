import { useServices } from '../../context/GameContext';
import { readBet } from '../../game/engine';
import { MAX_MULTIPLIER } from '../../game/fair';
import { fmt } from '../../game/format';
import { useGame } from '../../hooks/useGame';

/** Place bet / Start auto / Stop auto. Locked after a manual bet until its ball lands. */
export function PlayButton() {
  const { engine } = useServices();
  const s = useGame((snap) => snap);
  const { bet } = readBet(s.betText, s.balance);
  const sub = bet > 0 ? `${s.pick} · win up to KES ${fmt(bet * MAX_MULTIPLIER)}` : 'Set a bet';

  let main = 'Place bet';
  let note = sub;
  let cls = 'play';
  let disabled = false;
  const placed = s.queued ?? s.live;
  if (s.mode === 'auto') {
    if (s.autoLeft > 0) {
      main = 'Stop auto';
      note = `${s.autoLeft} round${s.autoLeft === 1 ? '' : 's'} left`;
      cls += ' stop';
    } else {
      main = 'Start auto';
      note = `${sub} · ${s.rounds} rounds`;
    }
  } else if (placed) {
    const when = s.live ? 'good luck' : s.phase === 'betting' ? 'this ball' : 'the next ball';
    main = s.live ? 'Rolling…' : 'Bet placed';
    note = `KES ${fmt(placed.bet)} on ${placed.pick} · ${when}`;
    cls += ' placed';
    disabled = true;
  }

  return (
    <button className={cls} id="play" disabled={disabled} onClick={() => engine.play()}>
      <span className="pl-main">{main}</span>
      <span className="pl-sub">{note}</span>
    </button>
  );
}
