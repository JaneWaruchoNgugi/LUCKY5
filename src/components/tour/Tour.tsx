import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useServices } from '../../context/GameContext';
import { prefersReducedMotion } from '../../lib/dom';
import { TOUR_STEPS, type Rect } from './tourSteps';

const PAD = 6;

/** Step-by-step "How to play" overlay that spotlights parts of the page. */
export function Tour({ onClose }: { onClose: () => void }) {
  const { engine, sound } = useServices();
  const [at, setAt] = useState(0);
  const hole = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[at];
  const last = at === TOUR_STEPS.length - 1;

  const place = useCallback(() => {
    const el = step && document.querySelector(step.target);
    const h = hole.current;
    const c = card.current;
    if (!step || !el || !h || !c) return;
    const b = el.getBoundingClientRect();
    let r: Rect = { top: b.top, left: b.left, width: b.width, height: b.height };
    if (step.area) r = step.area(r, engine.railGeo().hist);
    Object.assign(h.style, {
      top: `${r.top - PAD}px`,
      left: `${r.left - PAD}px`,
      width: `${r.width + PAD * 2}px`,
      height: `${r.height + PAD * 2}px`,
    });
    const cw = c.offsetWidth;
    const ch = c.offsetHeight;
    let top = r.top + r.height + 16;
    if (top + ch > innerHeight - 12) top = Math.max(12, r.top - ch - 16);
    if (top + ch > innerHeight - 12) top = innerHeight - ch - 12;
    const left = Math.min(innerWidth - cw - 16, Math.max(16, r.left + r.width / 2 - cw / 2));
    c.style.top = `${top}px`;
    c.style.left = `${left}px`;
  }, [step, engine]);

  // Scroll the target into view if needed, then place the spotlight and card.
  useLayoutEffect(() => {
    const el = step && document.querySelector(step.target);
    let t: ReturnType<typeof setTimeout> | undefined;
    if (el) {
      const r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 220) {
        const reduced = prefersReducedMotion();
        el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
        t = setTimeout(place, reduced ? 0 : 350);
      }
    }
    place();
    next.current?.focus({ preventScroll: true });
    return () => clearTimeout(t);
  }, [step, place]);

  const close = useCallback(() => {
    onClose();
    document.getElementById('soundBtn')?.focus({ preventScroll: true });
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', onKey);
    addEventListener('resize', place);
    addEventListener('scroll', place, { passive: true });
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('resize', place);
      removeEventListener('scroll', place);
    };
  }, [close, place]);

  if (!step) return null;
  return (
    <div className="tour" id="tour">
      <div className="tour-hole" ref={hole} />
      <div className="tour-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="tourTitle">
        <div className="tour-step">
          Step {at + 1} of {TOUR_STEPS.length}
        </div>
        <h3 id="tourTitle">{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-nav">
          <button className="btn-ghost" onClick={close}>
            Skip tour
          </button>
          <span className="tour-gap" />
          {at > 0 && (
            <button
              className="btn-ghost"
              onClick={() => {
                sound.play('click');
                setAt(at - 1);
              }}
            >
              Back
            </button>
          )}
          <button
            className="tour-next"
            ref={next}
            onClick={() => {
              sound.play('click');
              if (last) close();
              else setAt(at + 1);
            }}
          >
            {last ? 'Start playing' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
