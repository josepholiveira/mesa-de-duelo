/**
 * Celular e tablet pequeno jogam deitados. Onde o navegador deixa (Android), tela cheia + trava em
 * paisagem; onde não deixa (iPhone), uma tela por cima pede para girar o aparelho enquanto ele estiver em pé.
 * A tela de girar aparece só pelo CSS (.rotate-gate); aqui fica o botão e a trava.
 */

/** Mesmo critério da .rotate-gate no CSS: tela de toque com até 900px no lado menor. */
const isMobile = () => matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 900;

type LockableOrientation = ScreenOrientation & { lock?(o: 'landscape'): Promise<void> };
const orientation = () => screen.orientation as LockableOrientation | undefined;
const canLock = () => !!document.fullscreenEnabled && typeof orientation()?.lock === 'function';

/** Pede tela cheia e trava em paisagem. Precisa vir de um toque do usuário; falhas são ignoradas. */
export async function enterLandscape() {
  if (!isMobile() || !canLock()) return;
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    await orientation()!.lock!('landscape');
  } catch { /* o navegador recusou: fica a tela de girar */ }
}

/** Liga ou desliga a tela cheia; no celular, ao ligar, também trava deitado. Precisa vir de um toque. */
export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    if (isMobile() && canLock()) await orientation()!.lock!('landscape');
  } catch { /* o navegador recusou */ }
}

/** iPhone (Safari) não tem tela cheia para páginas: lá o botão nem aparece. */
export const canFullscreen = () => !!document.fullscreenEnabled;

export function mountRotateGate() {
  const el = document.createElement('div');
  el.className = 'rotate-gate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Gire o aparelho');
  el.innerHTML = `
    <svg class="rotate-phone" viewBox="0 0 64 64" aria-hidden="true">
      <rect x="20" y="8" width="24" height="44" rx="4" fill="none" stroke="currentColor" stroke-width="3"/>
      <circle cx="32" cy="46" r="2" fill="currentColor"/>
      <path d="M50 22a18 18 0 0 1 4 18" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="m56 34-2 7-6-4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <h2>Gire o aparelho</h2>
    <p>A Mesa de Duelo é jogada com a tela deitada.</p>
    ${canLock() ? '<button class="arena-btn primary" data-rotate>Jogar em tela cheia</button>' : ''}`;
  el.querySelector('[data-rotate]')?.addEventListener('click', () => void enterLandscape());
  document.body.append(el);
}
