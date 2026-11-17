import { useServices } from '../../context/GameContext';
import { useGame } from '../../hooks/useGame';
import type { Mode } from '../../game/types';

const TABS: ReadonlyArray<[Mode, string, string]> = [
  ['manual', 'tabManual', 'Manual'],
  ['auto', 'tabAuto', 'Auto'],
];

/** Manual / Auto switch. The other tab is locked while a bet or auto run is in play. */
export function ModeTabs({ locked }: { locked: boolean }) {
  const { engine, sound } = useServices();
  const mode = useGame((s) => s.mode);
  return (
    <div className="tabs" role="tablist" data-mode={mode}>
      <span className="tab-ind" aria-hidden="true" />
      {TABS.map(([m, id, label]) => (
        <button
          key={m}
          role="tab"
          id={id}
          aria-selected={mode === m}
          disabled={locked && mode !== m}
          onClick={() => {
            sound.play('click');
            engine.setMode(m);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
