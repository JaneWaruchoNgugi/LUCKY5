import { byId } from './dom';
import type { Sound, SoundConfig } from './sound';

type Toggle = 'ticks' | 'count' | 'result' | 'ui';
const TOGGLES: ReadonlyArray<readonly [id: string, key: Toggle]> = [
  ['sTicks', 'ticks'],
  ['sCount', 'count'],
  ['sResult', 'result'],
  ['sUi', 'ui'],
];

/** Wire the sound settings popover in the header. Returns a function that closes it. */
export function mountSoundSettings(sound: Sound): () => void {
  const pop = byId('soundPop');
  const btn = byId<HTMLButtonElement>('soundBtn');
  const onInput = byId<HTMLInputElement>('sOn');
  const vol = byId<HTMLInputElement>('sVol');
  const cfg: SoundConfig = sound.cfg;

  const sync = () => {
    onInput.checked = cfg.on;
    vol.value = String(Math.round(cfg.vol * 100));
    byId('sVolOut').textContent = `${Math.round(cfg.vol * 100)}%`;
    vol.disabled = !cfg.on;
    for (const [id, key] of TOGGLES) {
      const input = byId<HTMLInputElement>(id);
      input.checked = cfg[key];
      input.disabled = !cfg.on;
    }
    const muted = !cfg.on || cfg.vol === 0;
    document.getElementById('sndWaves')?.toggleAttribute('hidden', muted);
    document.getElementById('sndMute')?.toggleAttribute('hidden', !muted);
  };

  const toggle = (open: boolean) => {
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggle(pop.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !(e.target as Element).closest('.sound-wrap')) toggle(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggle(false);
  });

  onInput.addEventListener('change', () => {
    cfg.on = onInput.checked;
    sound.save();
    sync();
    if (cfg.on) sound.play('click');
  });
  vol.addEventListener('input', () => {
    cfg.vol = Number(vol.value) / 100;
    sound.save();
    sync();
  });
  vol.addEventListener('change', () => sound.play('bet'));
  for (const [id, key] of TOGGLES) {
    const input = byId<HTMLInputElement>(id);
    input.addEventListener('change', () => {
      cfg[key] = input.checked;
      sound.save();
    });
  }
  byId('sTest').addEventListener('click', () => {
    sound.ensure();
    sound.play('win');
  });

  sync();
  return () => toggle(false);
}
