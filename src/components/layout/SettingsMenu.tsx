import { useEffect, useRef, useState } from 'react';
import type { SoundConfig } from '../../audio/sound';
import { useServices } from '../../context/GameContext';

type Toggle = 'ticks' | 'count' | 'result' | 'music' | 'caller' | 'ui';
const TOGGLES: ReadonlyArray<readonly [Toggle, string]> = [
  ['ticks', 'Rolling ticks'],
  ['count', 'Countdown beeps'],
  ['result', 'Win and loss sounds'],
  ['music', 'Background music'],
  ['caller', 'Caller voice'],
  ['ui', 'Button clicks'],
];

function Switch({ id, checked, disabled, onChange }: { id: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="switch">
      <input type="checkbox" id={id} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="track-sw" aria-hidden="true" />
    </label>
  );
}

/** Gear button and popover: How to play, reset balance, sound, music and caller settings. */
export function SettingsMenu() {
  const { engine, sound, startTour } = useServices();
  const [open, setOpen] = useState(false);
  const [cfg, setCfg] = useState<SoundConfig>({ ...sound.cfg });
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const update = (patch: Partial<SoundConfig>) => {
    Object.assign(sound.cfg, patch);
    sound.save();
    setCfg({ ...sound.cfg });
  };

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest('.sound-wrap')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
    };
  }, [open]);

  // On phones the panel is a fixed sheet placed just under the gear.
  useEffect(() => {
    if (open && btn.current && pop.current) {
      pop.current.style.setProperty('--pop-top', `${Math.round(btn.current.getBoundingClientRect().bottom + 8)}px`);
    }
  }, [open]);

  const muted = !cfg.on || cfg.vol === 0;
  const vol = Math.round(cfg.vol * 100);

  return (
    <div className="sound-wrap">
      <button
        ref={btn}
        className="icon-btn"
        id="soundBtn"
        aria-label="Settings"
        aria-expanded={open}
        aria-controls="soundPop"
        title="Settings"
        onClick={() => setOpen((o) => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            fill="currentColor"
            d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6a.5.5 0 0 0 .1-.6l-2-3.5a.5.5 0 0 0-.6-.2l-2.5 1a7.4 7.4 0 0 0-1.7-1l-.4-2.6a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 0-.5.4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1a.5.5 0 0 0-.6.2l-2 3.5a.5.5 0 0 0 .1.6L4.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6a.5.5 0 0 0-.1.6l2 3.5a.5.5 0 0 0 .6.2l2.5-1c.5.4 1.1.7 1.7 1l.4 2.6a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.4l.4-2.7c.6-.3 1.2-.6 1.7-1l2.5 1a.5.5 0 0 0 .6-.2l2-3.5a.5.5 0 0 0-.1-.6zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
          />
        </svg>
      </button>
      <div ref={pop} className="pop" id="soundPop" role="dialog" aria-label="Settings" hidden={!open}>
        <div className="pop-head">Settings</div>
        <button
          className="pop-item"
          onClick={() => {
            setOpen(false);
            startTour();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="M9.3 9.2a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2.9-1.2 1.8v.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="12" cy="17.2" r="1.2" fill="currentColor" />
          </svg>
          <span>How to play</span>
          <i aria-hidden="true">›</i>
        </button>
        <button className="pop-item" onClick={() => engine.refill()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Reset balance to KES 10,000</span>
        </button>
        <div className="pop-sep" />
        <div className="pop-sub">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
            {muted ? (
              <path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            ) : (
              <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            )}
          </svg>
          Sound
        </div>
        <div className="pop-row">
          <label htmlFor="sOn">Sound on</label>
          <Switch
            id="sOn"
            checked={cfg.on}
            onChange={(v) => {
              update({ on: v });
              if (v) sound.play('click');
            }}
          />
        </div>
        <div className="pop-row col">
          <label htmlFor="sVol">
            Volume <b>{vol}%</b>
          </label>
          <input
            type="range"
            id="sVol"
            min={0}
            max={100}
            value={vol}
            disabled={!cfg.on}
            onChange={(e) => update({ vol: Number(e.target.value) / 100 })}
            onPointerUp={() => sound.play('bet')}
          />
        </div>
        {TOGGLES.map(([key, label]) => (
          <div className="pop-row" key={key}>
            <label htmlFor={`s-${key}`}>{label}</label>
            <Switch id={`s-${key}`} checked={cfg[key]} disabled={!cfg.on} onChange={(v) => update({ [key]: v })} />
          </div>
        ))}
        <button
          className="btn-ghost pop-test"
          onClick={() => {
            sound.ensure();
            sound.play('win');
            sound.call('B, thirteen.');
          }}
        >
          Play a test sound
        </button>
        <p className="pop-note">Demo money only. Balances have no cash value.</p>
      </div>
    </div>
  );
}
