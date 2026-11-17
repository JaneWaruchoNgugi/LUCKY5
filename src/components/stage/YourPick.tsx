import { fmt, GROUP_NAME } from '../../game/format';
import { GROUP_COLOR } from '../../game/theme';
import { useGame } from '../../hooks/useGame';
import { tint } from '../common/Chips';

/** The player's pick, pinned to the rail while their bet is waiting or rolling. */
export function YourPick({ top }: { top: number }) {
  const bet = useGame((s) => s.live ?? s.queued);
  if (!bet) return null;
  return (
    <div className="your-pick" id="yourPick" style={{ ...tint(GROUP_COLOR[bet.pick]), top }}>
      <small>Your pick</small>
      <b>{bet.pick}</b>
      <span>
        {GROUP_NAME[bet.pick]} · KES {fmt(bet.bet)}
      </span>
    </div>
  );
}
