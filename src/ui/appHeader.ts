import { mountChangelog } from './changelog';
import './appHeader.css';

export interface AppHeaderOptions {
  active: 'play' | 'decks';
  onPlay(): void;
  onDecks(): void;
}

/** Shared navigation stays in the same place throughout setup and the deck library. */
export function mountAppHeader(root: HTMLElement, options: AppHeaderOptions) {
  let disabled = false;
  root.classList.add('home-top', 'shared-shell-header');
  root.innerHTML = `<a class="home-brand" href="#" aria-label="Mesa de Duelo — início" data-app-brand><span class="brand-mark" aria-hidden="true"></span><span>Mesa de Duelo</span></a><nav aria-label="Navegação principal"><button type="button" class="home-nav${options.active === 'play' ? ' active' : ''}" ${options.active === 'play' ? 'aria-current="page"' : ''} data-app-nav="play">Jogar</button><button type="button" class="home-nav${options.active === 'decks' ? ' active' : ''}" ${options.active === 'decks' ? 'aria-current="page"' : ''} data-app-nav="decks">Meus decks</button></nav><div class="home-news"></div>`;
  mountChangelog(root.querySelector('.home-news')!);
  // Both screens stay mounted: keep disclosure IDs unique for assistive technology.
  const panel = root.querySelector<HTMLElement>('.news-panel')!;
  const disclosure = root.querySelector<HTMLButtonElement>('.news-btn')!;
  panel.id = `news-panel-${options.active}`;
  disclosure.setAttribute('aria-controls', panel.id);
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-app-nav], [data-app-brand]');
    if (!target) return;
    event.preventDefault();
    if (disabled) return;
    panel.hidden = true; disclosure.setAttribute('aria-expanded', 'false');
    if (target.dataset.appNav === 'decks') options.onDecks(); else options.onPlay();
  });
  return {
    setDisabled(value: boolean) {
      disabled = value;
      root.querySelectorAll<HTMLButtonElement>('[data-app-nav]').forEach(button => { button.disabled = value; });
      root.querySelector('[data-app-brand]')?.setAttribute('aria-disabled', String(value));
    },
  };
}
