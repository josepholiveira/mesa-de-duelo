import type { FState } from '../forge/client';

export interface HandDragIntent { id: number; gen: number; x: number; y: number }
export interface DropBounds { left: number; right: number; top: number; bottom: number }
export const DRAG_THRESHOLD = 9;

/** A drag begins only a currently legal hand or permitted exile play; Forge owns payment and targets. */
export function canDragHandCard(state: FState | null | undefined, id: number, gen: number) {
  return !!state && !!state.input.priority && state.input.ok.enabled && state.input.gen === gen && !state.gameOver && !state.question && !state.sideboarding &&
    !state.input.paying && !state.input.targeting && !state.input.suspendCast &&
    (!!state.players.find(p => p.id === state.you)?.hand.some(card => card.id === id) ||
      (!!state.playableExile?.includes(id) && state.players.some(p => p.exile.some(card => card.id === id && !card.faceDown)))) &&
    (!!state.input.actionable?.includes(id) || !!state.castable?.includes(id));
}
export function handDropAction(state: FState | null | undefined, intent: HandDragIntent, x: number, y: number, bounds: DropBounds | null) {
  if (!bounds || !canDragHandCard(state, intent.id, intent.gen) || Math.hypot(x - intent.x, y - intent.y) < DRAG_THRESHOLD ||
    x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
  return { type: 'card' as const, id: intent.id, gen: intent.gen };
}

export function attachHandDrag(root: HTMLElement, options: {
  state(): FState | null | undefined;
  beforeDrag(): void;
  play(action: { type: 'card'; id: number; gen: number }): void;
}) {
  let drag: (HandDragIntent & { pointer: number; source: HTMLElement; ghost: HTMLElement | null }) | null = null;
  let suppressUntil = 0;
  function cancel() {
    if (!drag) return;
    if (drag.ghost) suppressUntil = performance.now() + 500;
    drag.ghost?.remove(); drag.source.classList.remove('drag-source');
    try { if (root.hasPointerCapture(drag.pointer)) root.releasePointerCapture(drag.pointer); } catch { /* Pointer already released. */ }
    root.querySelector('.arena')?.classList.remove('dragging-hand');
    drag = null;
  }
  root.addEventListener('pointerdown', e => {
    const source = (e.target as HTMLElement).closest<HTMLElement>('#fHand .hcard[data-fid], #fExileShelf .exile-card[data-fid]');
    if (!source || e.button !== 0 || !e.isPrimary || !canDragHandCard(options.state(), Number(source.dataset.fid), Number(source.dataset.gen))) return;
    drag = { id: Number(source.dataset.fid), gen: Number(source.dataset.gen), x: e.clientX, y: e.clientY, pointer: e.pointerId, source, ghost: null };
  });
  root.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    if (!drag.source.isConnected || !canDragHandCard(options.state(), drag.id, drag.gen)) { cancel(); return; }
    if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < DRAG_THRESHOLD) return;
    if (!drag.ghost) {
      options.beforeDrag();
      root.setPointerCapture(e.pointerId);
      const bounds = drag.source.getBoundingClientRect();
      const ghost = document.createElement('div');
      ghost.className = 'hand-drag-ghost'; ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = `${Math.min(150, bounds.width)}px`;
      ghost.style.setProperty('--fw', `${Math.min(150, bounds.width)}px`);
      ghost.innerHTML = drag.source.querySelector('.face')?.outerHTML ?? '';
      root.querySelector('.arena')?.append(ghost);
      root.querySelector('.arena')?.classList.add('dragging-hand');
      drag.source.classList.add('drag-source'); drag.ghost = ghost;
    }
    e.preventDefault();
    drag.ghost.style.left = `${e.clientX}px`; drag.ghost.style.top = `${e.clientY}px`;
  });
  root.addEventListener('pointerup', e => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const field = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('.field');
    const action = drag.ghost ? handDropAction(options.state(), drag, e.clientX, e.clientY, field?.getBoundingClientRect() ?? null) : null;
    cancel();
    if (action) options.play(action);
  });
  root.addEventListener('pointercancel', cancel);
  root.addEventListener('lostpointercapture', cancel);
  root.addEventListener('dragstart', e => { if ((e.target as HTMLElement).closest('#fHand, #fExileShelf')) e.preventDefault(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && drag) { e.preventDefault(); cancel(); } });
  root.addEventListener('click', e => { if (performance.now() < suppressUntil) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  return { cancel, get active() { return !!drag?.ghost; } };
}
