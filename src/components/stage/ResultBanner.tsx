import { GROUP_NAME, fmt, letterOf, money } from '../../game/format';
import { useGame } from '../../hooks/useGame';
import { BallChip, PickChip } from '../common/Chips';

/** Slim win/lose banner over the Previous row, or screen-reader text for the current phase. */
export function ResultBanner() {
  const result = useGame((s) => s.result);
  const announce = useGame((s) => s.announce);

  if (!result) {
    return (
      <div className="callout" id="callout" aria-live="polite">
        <span className="sr-only">{announce}</span>
      </div>
    );
  }
  const { win, pick, ball, mult, bet, payout } = result;
  const L = letterOf(ball);
  const net = money(payout - bet);
  return (
    <div className="callout" id="callout" aria-live="polite">
      <div key={result.id} className={`rcard ${win ? 'win' : 'lose'}`} role="status">
        <span className="rc-icon" aria-hidden="true">
          {win ? '✓' : '✕'}
        </span>
        <span className="rc-body">
          <span className="rc-title">{win ? 'You won' : 'You lost'}</span>
        </span>
        <span className="rc-vs" aria-label={`You picked ${GROUP_NAME[pick]}, drawn ${L}-${ball}`}>
          <span className="vs-item">
            <small>You picked</small>
            <PickChip pick={pick} />
          </span>
          <span className="vs-arrow" aria-hidden="true">
            {win ? '=' : '≠'}
          </span>
          <span className="vs-item">
            <small>Drawn</small>
            <BallChip ball={ball} mult={mult} />
          </span>
        </span>
        <span className="rc-amt">
          {win ? '+' : '−'}KES {fmt(win ? net : bet)}
        </span>
      </div>
    </div>
  );
}
