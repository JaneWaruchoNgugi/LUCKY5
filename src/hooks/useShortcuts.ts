import { useEffect } from 'react';
import { isLetter } from '../game/format';
import { useServices } from '../context/GameContext';

/** Keyboard: B I N G O pick a group, Space places a manual bet. */
export function useShortcuts(): void {
  const { engine, sound, tourOpen } = useServices();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element;
      if (tourOpen || t.closest('input, textarea')) return;
      const k = e.key.toUpperCase();
      if (isLetter(k)) {
        engine.setPick(k);
        sound.play('click');
        return;
      }
      if (e.code !== 'Space' || t.closest('button, summary')) return;
      e.preventDefault();
      if (engine.getSnapshot().mode === 'manual') engine.play();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [engine, sound, tourOpen]);
}
