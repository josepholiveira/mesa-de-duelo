/**
 * Animações da mesa. As telas redesenham tudo com innerHTML, então transições CSS não têm um "antes"
 * para partir. Aqui medimos cada carta (pela chave data-uid/data-fid/data-peek) antes do desenho e,
 * depois dele, animamos a diferença: carta que muda de zona voa até o novo lugar, carta que vira gira,
 * carta nova surge da mão do oponente ou do grimório, carta que some se desfaz e a vida mostra o quanto mudou.
 */

const KEYED = '[data-uid],[data-fid],[data-peek]';
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

interface Snap {
  el: HTMLElement;
  cx: number;
  cy: number;
  w: number;
  h: number;
  tapped: boolean;
  zone: string;
  tough?: number;
  hovered: boolean;
}

export interface Motion {
  /** Mede a mesa; chame logo antes de redesenhar. */
  capture(): void;
  /** Anima a diferença entre a última medida e a mesa atual. */
  play(): void;
  /** Esquece a mesa anterior (nova partida). */
  reset(): void;
}

const keyOf = (el: HTMLElement) => el.dataset.uid ?? el.dataset.fid ?? el.dataset.peek!;
const zoneOf = (el: HTMLElement) => el.parentElement?.closest<HTMLElement>('[id]')?.id ?? '';

function reduced() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function snap(el: HTMLElement): Snap | null {
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  const t = el.querySelector('.pt b:last-child')?.textContent;
  return {
    el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: el.offsetWidth, h: el.offsetHeight,
    tapped: !!el.closest('.slot.tapped'), zone: zoneOf(el), tough: t ? +t : undefined,
    hovered: el.matches(':hover'),
  };
}

function centerOf(el: Element | null): { cx: number; cy: number; w: number } | null {
  const r = el?.getBoundingClientRect();
  return r && r.width ? { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width } : null;
}

export function createMotion(root: HTMLElement): Motion {
  let cards = new Map<string, Snap>();
  let lives = new Map<string, number>();
  let primed = false;
  /** Voos em andamento; se a mesa for redesenhada no meio do voo, a carta nova também espera o pouso. */
  const flights = new Map<string, { anim: Animation; el: HTMLElement }>();

  const layer = () => root.firstElementChild as HTMLElement ?? root;

  /** Cópia da carta presa à tela, usada para voos e para cartas que saem de jogo. */
  function ghost(face: Element, s: { cx: number; cy: number; w: number; h: number }) {
    const g = document.createElement('div');
    g.className = 'fly';
    g.style.cssText = `left:${s.cx - s.w / 2}px;top:${s.cy - s.h / 2}px;width:${s.w}px;height:${s.h}px;--fw:${s.w}px`;
    g.append(face.cloneNode(true));
    layer().append(g);
    return g;
  }

  /** Voo de uma posição qualquer até a carta já desenhada; a carta real fica invisível até o pouso. */
  function fly(k: string, el: HTMLElement, to: Snap, from: { cx: number; cy: number; w: number; tapped?: boolean }, delay = 0, fade = false) {
    const face = el.querySelector('.face');
    if (!face) return;
    flights.get(k)?.anim.cancel();
    const g = ghost(face, to);
    el.style.opacity = '0';
    const r0 = from.tapped ? 90 : 0, r1 = to.tapped ? 90 : 0;
    const anim = g.animate([
      { transform: `translate(${from.cx - to.cx}px, ${from.cy - to.cy}px) scale(${from.w / to.w}) rotate(${r0}deg)`, opacity: fade ? 0 : 1 },
      { transform: `translate(${(from.cx - to.cx) * 0.35}px, ${(from.cy - to.cy) * 0.35 - 18}px) scale(${1.12}) rotate(${(r0 + r1) / 2}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(0, 0) scale(1) rotate(${r1}deg)`, opacity: 1 },
    ], { duration: 460, delay, easing: EASE, fill: 'backwards' });
    const flight = { anim, el };
    flights.set(k, flight);
    const land = () => {
      g.remove();
      flight.el.style.opacity = '';
      if (flights.get(k) === flight) flights.delete(k);
    };
    anim.onfinish = land;
    anim.oncancel = land;
  }

  /** Carta que continua na mesma zona: desliza (e gira, se virou ou desvirou). */
  function shift(el: HTMLElement, prev: Snap, now: Snap) {
    const dx = prev.cx - now.cx, dy = prev.cy - now.cy;
    const turned = prev.tapped !== now.tapped;
    if (!turned && Math.abs(dx) + Math.abs(dy) < 2) return;
    if (prev.hovered && el.classList.contains('hcard')) return;
    // A fileira (.slot) não tem transform próprio; a carta dentro dela já usa transform para centralizar e virar.
    const target = el.closest<HTMLElement>('.slot') ?? el;
    const from: Keyframe = { translate: `${dx}px ${dy}px` };
    const to: Keyframe = { translate: '0 0' };
    if (turned && target !== el) { from.rotate = now.tapped ? '-90deg' : '90deg'; to.rotate = '0deg'; }
    target.animate([from, to], { duration: turned ? 320 : 280, easing: EASE });
  }

  function pop(el: HTMLElement) {
    const target = el.closest<HTMLElement>('.slot') ?? el;
    target.animate([
      { scale: '0.4', opacity: 0, filter: 'brightness(2.2)' },
      { scale: '1.08', opacity: 1, offset: 0.6 },
      { scale: '1', filter: 'brightness(1)' },
    ], { duration: 420, easing: EASE });
  }

  /** Carta que saiu da mesa sem ir para um lugar visível (exílio, ficha destruída, cemitério coberto). */
  function vanish(s: Snap) {
    const face = s.el.querySelector('.face');
    if (!face) return;
    const g = ghost(face, s);
    if (s.tapped) g.style.rotate = '90deg';
    g.animate([
      { opacity: 1, scale: '1', filter: 'brightness(1)' },
      { opacity: 0.9, scale: '1.06', filter: 'brightness(2) saturate(0.4)', offset: 0.3 },
      { opacity: 0, scale: '0.7', filter: 'brightness(2.5) blur(3px)' },
    ], { duration: 520, easing: 'ease-in' }).onfinish = () => g.remove();
  }

  function floatNum(at: Element, delta: number, small = false) {
    const c = centerOf(at);
    if (!c) return;
    const f = document.createElement('div');
    f.className = `float-num ${delta < 0 ? 'dmg' : 'heal'} ${small ? 'small' : ''}`;
    f.textContent = delta > 0 ? `+${delta}` : String(delta);
    f.style.cssText = `left:${c.cx}px;top:${c.cy}px`;
    f.addEventListener('animationend', () => f.remove());
    layer().append(f);
  }

  function readLives() {
    const m = new Map<string, number>();
    root.querySelectorAll<HTMLElement>('.avatar').forEach(a => {
      const k = a.dataset.player ?? a.dataset.pid;
      const v = parseInt(a.querySelector('.life')?.textContent ?? '', 10);
      if (k !== undefined && !Number.isNaN(v)) m.set(k, v);
    });
    return m;
  }

  return {
    capture() {
      cards = new Map();
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const k = keyOf(el);
        if (cards.has(k)) return;
        const s = snap(el);
        if (s) cards.set(k, s);
      });
      lives = readLives();
    },

    play() {
      if (reduced()) { primed = true; return; }
      const seen = new Set<string>();
      let deal = 0;
      root.querySelectorAll<HTMLElement>(KEYED).forEach(el => {
        const k = keyOf(el);
        if (seen.has(k)) return;
        seen.add(k);
        const now = snap(el);
        if (!now) return;
        const prev = cards.get(k);
        const flying = flights.get(k);
        if (flying && prev?.zone === now.zone) { flying.el = el; el.style.opacity = '0'; return; }
        if (prev) {
          if (prev.zone === now.zone) shift(el, prev, now);
          else fly(k, el, now, prev);
          if (prev.zone === now.zone && prev.tough !== undefined && now.tough !== undefined && prev.tough !== now.tough) {
            floatNum(el, now.tough - prev.tough, true);
          }
          return;
        }
        if (now.zone.endsWith('Hand') || now.zone === 'hand') {
          // Compra: sai do grimório. Na primeira mão, as cartas chegam uma a uma.
          const lib = centerOf(root.querySelector('.piles.me .lib'));
          if (lib) { fly(k, el, now, lib, primed ? 0 : deal++ * 90); return; }
        } else if (primed && el.closest('.field.opp, .stack-panel li.theirs')) {
          const src = centerOf(root.querySelector('.opp-hand .back')) ?? centerOf(root.querySelector('.avatar-slot.opp'));
          if (src) { fly(k, el, now, { ...src, w: now.w * 0.5 }, 0, true); return; }
        }
        if (primed) pop(el);
      });

      if (primed) {
        for (const [k, s] of cards) {
          if (!seen.has(k) && !s.el.closest('.pile') && !s.zone.endsWith('Piles')) vanish(s);
        }
        const after = readLives();
        for (const [k, v] of after) {
          const before = lives.get(k);
          if (before === undefined || before === v) continue;
          const life = root.querySelector(`.avatar[data-player="${k}"] .life, .avatar[data-pid="${k}"] .life`);
          if (!life) continue;
          floatNum(life, v - before);
          life.animate([{ scale: '1' }, { scale: '1.35', color: v < before ? 'var(--red)' : 'var(--heal)' }, { scale: '1' }], { duration: 600, easing: EASE });
        }
      }
      primed = true;
    },

    reset() {
      for (const f of flights.values()) f.anim.cancel();
      cards = new Map(); lives = new Map(); primed = false;
    },
  };
}
