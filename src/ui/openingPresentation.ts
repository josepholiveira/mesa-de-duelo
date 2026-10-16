import type { FState } from '../forge/client';
import { hideCardPreview } from './cardInspector';
import './opening.css';

export function suppressOpeningPreview(state: FState) {
  return !state.gameOver && !!state.input.opening;
}

/** Present the engine's opening decisions in the center, without changing their actions. */
export function applyOpeningPresentation(root: HTMLElement, state: FState) {
  const arena = root.querySelector<HTMLElement>('.arena.forge');
  if (!arena) return;
  const opening = state.gameOver ? undefined : state.input.opening;
  const previous = arena.dataset.opening;
  let heading = arena.querySelector<HTMLElement>('.opening-copy');
  let shade = arena.querySelector<HTMLElement>('.opening-shade');
  if (!opening) {
    delete arena.dataset.opening;
    heading?.remove(); shade?.remove();
    return;
  }
  arena.dataset.opening = opening;
  if (opening !== previous) hideCardPreview(true);
  if (!shade) {
    shade = document.createElement('div');
    shade.className = 'opening-shade'; shade.setAttribute('aria-hidden', 'true');
    arena.append(shade);
  }
  if (!heading) {
    heading = document.createElement('div');
    heading.className = 'opening-copy';
    heading.innerHTML = '<h1></h1><p></p>';
    arena.append(heading);
  }
  const { openingStartingPlayer, openingReturnCount } = state.input;
  heading.querySelector('h1')!.textContent = opening === 'play-draw' ? 'Quem começa?'
    : opening === 'mulligan-bottom'
      ? openingReturnCount == null ? 'Escolha as cartas para devolver'
        : openingReturnCount === 1 ? 'Devolva 1 carta' : `Devolva ${openingReturnCount} cartas`
      : 'Sua mão inicial';
  heading.querySelector('p')!.textContent = opening === 'play-draw' ? 'Escolha quem joga o primeiro turno.'
    : opening === 'mulligan-bottom' ? 'As cartas escolhidas vão para o fundo do grimório.'
      : openingStartingPlayer == null ? 'Mantenha estas cartas ou tente uma nova mão.'
        : openingStartingPlayer === state.you ? 'Você joga primeiro.' : 'O oponente joga primeiro.';
}
