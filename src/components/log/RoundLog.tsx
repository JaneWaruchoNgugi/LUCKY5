import { fmt } from '../../game/format';
import { useGame } from '../../hooks/useGame';
import { BallChip, PickChip } from '../common/Chips';

/** The player's last 30 settled bets. */
export function RoundLog() {
  const bets = useGame((s) => s.bets);
  return (
    <section className="panel" aria-label="Round log">
      <h2>
        Round log <small>last 30</small>
      </h2>
      <div className="log-list" id="log">
        {bets.length === 0 ? (
          <div className="lg-empty">Your bets will show here after the first round.</div>
        ) : (
          bets.slice(0, 30).map((h) => (
            <div key={h.nonce} className={`lg-row ${h.win ? 'win' : 'lose'}`}>
              <span className="lg-rd">#{h.nonce + 1}</span>
              <span className="lg-drawn">
                <BallChip ball={h.ball} mult={h.mult} />
              </span>
              <span className="lg-pick">
                <small>Pick</small>
                <PickChip pick={h.pick} />
              </span>
              <span className="lg-bet">
                <small>Bet</small>KES {fmt(h.bet)}
              </span>
              <span className="lg-res">
                <em>{h.win ? 'WIN' : 'LOSS'}</em>
                {h.profit >= 0 ? '+' : '−'}KES {fmt(Math.abs(h.profit))}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
