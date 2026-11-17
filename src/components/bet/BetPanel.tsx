import { useGame } from '../../hooks/useGame';
import { AutoRounds } from './AutoRounds';
import { BetAmount } from './BetAmount';
import { ColourPicks } from './ColourPicks';
import { ModeTabs } from './ModeTabs';
import { PlayButton } from './PlayButton';

/** The bet controls: mode tabs, amount, colour pick, auto rounds and the play button. */
export function BetPanel() {
  const mode = useGame((s) => s.mode);
  const err = useGame((s) => s.err);
  const locked = useGame((s) => s.autoLeft > 0 || !!s.queued || !!s.live);
  return (
    <aside className="panel deck" aria-label="Bet controls">
      <ModeTabs locked={locked} />
      <BetAmount />
      <ColourPicks />
      {mode === 'auto' && <AutoRounds />}
      <p className="err" id="err" role="alert">
        {err}
      </p>
      <PlayButton />
    </aside>
  );
}
