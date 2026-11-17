import type { CSSProperties } from 'react';
import { GROUP_NAME, fmtM, letterOf, tier } from '../../game/format';
import { GROUP_COLOR } from '../../game/theme';
import type { Letter } from '../../game/types';

const tint = (c: string) => ({ '--c': c }) as CSSProperties;

/** The player's choice: a colour group, drawn as a flat lettered tag (never a ball). */
export function PickChip({ pick }: { pick: Letter }) {
  return (
    <span className="pick-chip" style={tint(GROUP_COLOR[pick])}>
      <i>{pick}</i>
      {GROUP_NAME[pick]}
    </span>
  );
}

/** A drawn ball: glossy ball with its number, plus the multiplier it carried. */
export function BallChip({ ball, mult }: { ball: number; mult: number }) {
  const L = letterOf(ball);
  return (
    <span className="ball-chip" style={tint(GROUP_COLOR[L])}>
      <b>{ball}</b>
      <span className="bc-l">
        {L}-{ball}
      </span>
      <span className={`m-${tier(mult)}`}>{fmtM(mult)}×</span>
    </span>
  );
}

export { tint };
