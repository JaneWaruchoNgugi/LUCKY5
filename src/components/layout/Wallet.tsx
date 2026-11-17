import { useEffect, useState } from 'react';
import { fmt } from '../../game/format';
import { useGame } from '../../hooks/useGame';

/** Demo balance. Glows green or red after a settled bet and floats the payout beside it. */
export function Wallet() {
  const balance = useGame((s) => s.balance);
  const result = useGame((s) => s.result);
  const [flash, setFlash] = useState<{ win: boolean; text: string; id: number } | null>(null);

  useEffect(() => {
    if (!result) return;
    setFlash({ win: result.win, text: result.win ? `+${fmt(result.payout)}` : '', id: result.id });
    const t = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(t);
  }, [result]);

  return (
    <div className={`wallet${flash ? (flash.win ? ' up' : ' down') : ''}`} title="Demo balance">
      <span className="cur">KES</span> <span className="bal">{fmt(balance)}</span>
      {flash?.text && (
        <span key={flash.id} className={`wdelta ${flash.win ? 'up' : 'down'}`}>
          {flash.text}
        </span>
      )}
    </div>
  );
}
