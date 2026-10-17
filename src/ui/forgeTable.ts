import type { FCard, FOption, FPlayer, FQuestion, FState, ForgeClient } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, pip, richText } from './cardtext';
import { colorFromCost, faceHTML } from './face';
import { createMotion } from './motion';
import { canFullscreen, toggleFullscreen } from './landscape';
import { inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { PresentationTimeline, presentationDuration, hasLiveDecision, stateWithFrame, type PresentationEvent, type PresentationFrame } from './presentationTimeline';
import { createGameAudio } from './audio';
import { AutoPassPreference } from './autoPassPreference';
import { attachHandDrag } from './handDrag';
import { exileShelfCards, canPlayExileCard, validBlockSelection, legalBlockTargets, blockPairAction, selectedForInput, canSelectExileCard, type BlockSelection } from './playContext';
import { applyOpeningPresentation, suppressOpeningPreview } from './openingPresentation';
import { cardDecision, selectionMessage } from './decisionPrompt';
import type { DeckEntry } from '../decks';
import { phaseHudHTML } from './phaseHud';
import { stackPresentation } from './stackPresentation';
import './gameplay.css';
import './phaseHud.css';
import './gameOptions.css';
import './decisionPrompt.css';
import { tablePlayers, validAttackSelection, legalAttackTargets, attackPairAction, canPlayCommander, type AttackSelection } from './commanderTable';
import './commanderTable.css';

const ICON_SWORD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H21v6.5L10 20.5l-2 .5-.5-2L18.5 8V5.5H16L5 16.5 3.5 15z" fill="currentColor"/></svg>';
const ICON_SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>';

const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`;
/** Ícone de cada tipo de marcador; os sem ícone próprio usam um disco. */
const COUNTER_ICON: Record<string, string> = {
  P1P1: svg('M12 3 3 13h5v8h8v-8h5z'),
  M1M1: svg('M12 21 3 11h5V3h8v8h5z'),
  SHIELD: ICON_SHIELD,
  STUN: svg('m12 2 2.6 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.4-.4z'),
  CHARGE: svg('M13 2 4 14h6l-1 8 9-12h-6z'),
  LORE: svg('M4 4h7a3 3 0 0 1 1 .2V20a3 3 0 0 0-1-.2H4zm16 0h-7a3 3 0 0 0-1 .2V20a3 3 0 0 1 1-.2h7z'),
  TIME: svg('M6 2h12v5l-4 5 4 5v5H6v-5l4-5-4-5zm2 2v2.3l4 5 4-5V4z'),
  OIL: svg('M12 2c3 4.5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7.5 6-12z'),
};
const COUNTER_DISC = svg('M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z');

/** Ícone de cada palavra-chave mostrada na carta do campo. */
const KEYWORD_ICON: Record<string, string> = {
  FLYING: svg('M2 12c4-1 7-4 9-9 1 4 0 8-2 10 3-1 6-1 9 1-3 0-6 1-8 3 2 0 4 1 5 3-5 1-10 0-13-8z'),
  REACH: svg('M12 2 6 9h4v13h4V9h4z'),
  TRAMPLE: svg('M3 5h4l6 7-6 7H3l6-7zm8 0h4l6 7-6 7h-4l6-7z'),
  MENACE: svg('M3 3l5 6h8l5-6-1 9a8 8 0 0 1-16 0zm6 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z'),
  FIRST_STRIKE: ICON_SWORD,
  DOUBLE_STRIKE: svg('M10 3h5v5L7 16l-2 .5.5-2L13 7V5h-2zM17 8h4v4l-7 7-2 .5.5-2L19 11V10h-1z'),
  DEATHTOUCH: svg('M12 2a8 8 0 0 0-8 8c0 3 1.5 5 3 6v4h10v-4c1.5-1 3-3 3-6a8 8 0 0 0-8-8zM8.5 9a2 2 0 1 1 0 4 2 2 0 0 1 0-4zm7 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 17h1v2h-1zm3 0h1v2h-1z'),
  LIFELINK: svg('M12 21 3.5 12.5A5 5 0 0 1 12 6a5 5 0 0 1 8.5 6.5z'),
  VIGILANCE: svg('M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'),
  HASTE: svg('M13 2 4 14h6l-1 8 9-12h-6z'),
  DEFENDER: svg('M2 5h9v4H2zm11 0h9v4h-9zM2 11h5v4H2zm7 0h6v4H9zm8 0h5v4h-5zM2 17h9v4H2zm11 0h9v4h-9z'),
  HEXPROOF: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm-3 6 3 3 3-3 1.4 1.4-3 3 3 3L15 16.8l-3-3-3 3-1.4-1.4 3-3-3-3z'),
  SHROUD: svg('M12 2a9 9 0 0 0-9 9v11l3-2 3 2 3-2 3 2 3-2 3 2V11a9 9 0 0 0-9-9z'),
  WARD: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 5 4 5-4 5-4-5z'),
  INDESTRUCTIBLE: svg('M6 3h12l4 6-10 12L2 9z'),
  PROTECTION: svg('M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5zm0 2.2 6 2.2V11c0 4-2.6 7.6-6 8.9-3.4-1.3-6-4.9-6-8.9V6.4z'),
};

export interface ForgeTableOptions {
  onExit(): void;
  onRematch(): void;
}

export interface ForgeTableView {
  attach(client: ForgeClient, portraits: (string | undefined)[]): void;
  render(): void;
  notice(text: string, error?: boolean): void;
  /** Conexão caiu e o navegador está tentando voltar sozinho. */
  reconnecting(attempt: number): void;
  /** reason substitui a explicação padrão (por exemplo, partida aberta em outra janela). */
  disconnected(reason?: string): void;
}

export function createForgeTableView(root: HTMLElement, opts: ForgeTableOptions): ForgeTableView {
  root.innerHTML = `
  <div class="arena forge">
    <div class="mat" aria-hidden="true"></div>
    <div class="topbar">
      <button class="icon-btn game-menu-trigger" data-ui="menu" aria-expanded="false" aria-controls="fMenu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg><span>Menu</span></button>
      <button class="icon-btn fs-btn" data-ui="fullscreen" aria-label="Tela cheia" title="Tela cheia"${canFullscreen() ? '' : ' hidden'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-enter" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path class="fs-exit" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>
      </button>
    </div>
    <nav class="menu game-menu" id="fMenu" aria-label="Menu da partida" hidden>
      <div class="game-menu-meta"><span class="room-tag" id="fRoomTag" hidden></span><span class="series-score" id="fSeries" hidden></span></div>
      <button class="btn" data-ui="log" aria-expanded="false" aria-controls="fLogDrawer">Registro</button>
      <button class="btn" data-ui="settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="fSettings">Opções</button>
      <div class="game-menu-divider" aria-hidden="true"></div>
      <button class="btn" data-ui="rematch" id="fMenuRematch">Recomeçar partida</button>
      <button class="btn" data-ui="exit">Desistir e voltar ao início</button>
    </nav>
    <div class="overlay game-options-overlay" id="fSettings" hidden>
      <section class="game-options" role="dialog" aria-modal="true" aria-labelledby="fSettingsTitle">
        <header class="game-options-heading"><h2 id="fSettingsTitle">Opções</h2><button class="icon-btn game-options-close" data-ui="settings-close" aria-label="Fechar opções"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header>
        <div class="game-option-row"><span id="fSoundLabel">Efeitos sonoros</span><button class="sound-switch" id="fMute" data-ui="mute" role="switch" aria-checked="false" aria-labelledby="fSoundLabel"><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fSoundState" aria-hidden="true">Desligados</span></button></div>
        <div class="game-option-volume"><div class="game-option-row"><label for="fVolume">Volume</label><output id="fVolumeValue" for="fVolume">35%</output></div><input id="fVolume" type="range" min="0" max="100" step="5" value="35" aria-valuetext="35%"></div>
        <div class="game-option-auto-pass"><div class="game-option-row"><span id="fAutoPassLabel">Passar automaticamente</span><button class="sound-switch" id="fAutoPass" data-ui="auto-pass" role="switch" aria-checked="true" aria-labelledby="fAutoPassLabel" aria-describedby="fAutoPassHint fAutoPassStatus" disabled><span class="sound-switch-track" aria-hidden="true"><span></span></span><span id="fAutoPassState" aria-hidden="true">Ativado</span></button></div><p id="fAutoPassHint">Quando não houver ações disponíveis. As jogadas continuam visíveis.</p><p id="fAutoPassStatus" role="status">Aguardando conexão com o servidor.</p></div>
        <div class="game-option-pace"><label for="fPace">Ritmo das jogadas</label><select id="fPace" aria-describedby="fPaceHint"><option value="normal">Normal</option><option value="fast">Rápido sem resposta</option></select><p id="fPaceHint">Acelere as animações quando não houver uma decisão sua. Suas respostas continuam disponíveis imediatamente.</p></div>
        <footer><button class="arena-btn secondary" data-ui="settings-close">Voltar à partida</button></footer>
      </section>
    </div>
    <aside class="log-drawer" id="fLogDrawer" hidden><div class="stack-heading"><h2>Histórico da partida</h2><button class="icon-btn" data-ui="log" aria-label="Fechar histórico">Fechar</button></div><ul id="fLog"></ul></aside>

    <div class="opp-hand" id="fOppHand"></div>
    <div class="avatar-slot opp" id="fOppAvatar"></div>
    <div class="piles opp" id="fOppPiles"></div>

    <section class="field opp" aria-label="Campo do oponente">
      <div class="row lands" id="fOppLands"></div>
      <div class="row creatures" id="fOppCreatures"></div>
    </section>
    <section class="commander-opponents" id="fOpponents" aria-label="Campos dos oponentes" hidden></section>
    <section class="own-command" id="fCommand" aria-label="Sua zona de comando" hidden></section>
    <div class="divider" aria-hidden="true"></div>
    <svg class="combat-arrows" id="fArrows" aria-hidden="true"></svg>
    <section class="field me" aria-label="Seu campo">
      <div class="row creatures" id="fMeCreatures"></div>
      <div class="row lands" id="fMeLands"></div>
    </section>

    <div class="avatar-slot me" id="fMeAvatar"></div>
    <div class="piles me" id="fMePiles"></div>
    <div class="hand" id="fHand"></div>
    <section class="exile-shelf" id="fExileShelf" aria-label="Cartas disponíveis no exílio" hidden></section>

    <aside class="stack-panel" id="fStack" aria-label="Mágicas e habilidades na pilha" hidden></aside>
    <svg class="target-arrows" id="fTargets" aria-hidden="true"></svg>
    <nav class="phase-rail" id="fPhases" aria-label="Fases do turno"></nav>
    <div class="action" id="fAction"></div><div class="sr-only" id="fAnnouncement" aria-live="polite" aria-atomic="true"></div>
    <div class="banner" id="fBanner" hidden></div>
    <div class="toasts" id="fToasts" aria-live="polite"></div>
    <div class="overlay" id="fQuestion" hidden></div>
    <div class="overlay" id="fOverlay" hidden></div>
    <div class="overlay" id="fZone" hidden></div>
    <div class="overlay stack-gallery-overlay" id="fStackGallery" hidden></div>
  </div>`;

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  let client: ForgeClient | null = null;
  let portraits: (string | undefined)[] = [undefined, undefined];
  let lastTurn = 0;
  let zoneOf: number | null = null;
  let zoneKind: 'gy' | 'exile' | 'command' | 'damage' = 'gy';
  let bannerTimer = 0;
  const motion = createMotion(root);
  let lastDamage = new Map<number, number>();
  let disconnected = false;
  /** Versão do prompt em que o jogador já clicou num botão; evita clique duplo até o Forge responder. */
  let clickedGen = -1;
  /**
   * Quando foi esse clique. Se o Forge recusar a ação (bloqueio inválido, por exemplo), o prompt não muda;
   * a ponte libera os botões depois de 1,5 s e a mesa também, senão o OK ficaria travado para sempre.
   */
  let clickedAt = 0;
  const CLICK_LOCK_MS = 1600;
  /** Marcador com o balão aberto por clique (id da carta e tipo), até clicar fora. */
  let openCounter: string | null = null;
  /** Seleção em andamento na pergunta aberta. */
  let qState: { id: number; picked: number[]; text: string; amounts: string[] } | null = null;
  let groupIds: number[] | null = null;
  let selectedBlocker: BlockSelection | null = null;
  let selectedAttacker: AttackSelection | null = null;
  let stackGalleryOpen = false;
  let stackMinimized = false;
  let sideboardDraft: { id: number; main: DeckEntry[]; sideboard: DeckEntry[] } | null = null;
  let sideboardError = '';
  let sideboardBusy = false;
  const timeline = new PresentationTimeline();
  const audio = createGameAudio();
  const autoPass = new AutoPassPreference(message => { if (client?.connected && !disconnected) client.send(message); });
  let presentationTimer = 0;
  let displayFrame: PresentationFrame | null = null;
  let silentNext = true;
  let fast = false;
  let previousAnnouncement = '';
  let returnFocus: HTMLElement | null = null;
  let currentModal: HTMLElement | null = null;
  try { fast = localStorage.getItem('mesa:pace') === 'fast'; } catch { /* Storage is optional. */ }
  const renderedContent = new WeakMap<HTMLElement, { html: string; first: ChildNode | null }>();
  const setHTML = (el: HTMLElement, html: string) => {
    const previous = renderedContent.get(el);
    if (previous?.html === html && previous.first === el.firstChild) return;
    el.innerHTML = html; renderedContent.set(el, { html, first: el.firstChild });
  };
  const inspectIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6m-3-3v6"/></svg>';
  const selectedBadge = (s: FState, c: FCard) => selectedForInput(s, c.id) ? '<span class="choice-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></span>' : '';
  const inspectButton = (c: FCard) => !c.faceDown && c.name ? `<button class="inspect-card" data-inspect="${c.id}" aria-label="Inspecionar ${esc(label(c))}">${inspectIcon}</button>` : '';

  function syncAutoPass() {
    const connected = !!client?.connected && !disconnected;
    const control = $('#fAutoPass') as HTMLButtonElement;
    control.disabled = !connected || !autoPass.supported;
    control.setAttribute('aria-checked', String(autoPass.value));
    $('#fAutoPassState').textContent = autoPass.value ? 'Ativado' : 'Desativado';
    const status = $('#fAutoPassStatus');
    status.textContent = !connected ? 'Aguardando conexão com o servidor.' : !autoPass.supported ? 'Este servidor não oferece esta opção.' : autoPass.pending !== null ? 'Aplicando…' : '';
    status.hidden = !status.textContent;
  }
  function syncSettings() {
    const settings = audio.settings;
    const mute = $('#fMute');
    $('#fSoundState').textContent = settings.muted ? 'Desligados' : 'Ligados';
    mute.setAttribute('aria-checked', String(!settings.muted));
    const volume = Math.round(settings.volume * 100);
    ($('#fVolume') as HTMLInputElement).value = String(volume);
    $('#fVolume').setAttribute('aria-valuetext', `${volume}%`);
    $('#fVolumeValue').textContent = `${volume}%`;
    ($('#fPace') as HTMLSelectElement).value = fast ? 'fast' : 'normal';
    syncAutoPass();
  }
  function setMenu(open: boolean, restore = false) {
    $('#fMenu').hidden = !open;
    const trigger = root.querySelector<HTMLElement>('[data-ui="menu"]')!;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) $('#fMenu').querySelector<HTMLElement>('button:not([hidden])')?.focus({ preventScroll: true });
    else if (restore) trigger.focus({ preventScroll: true });
  }
  function setLog(open: boolean, restore = false) {
    $('#fLogDrawer').hidden = !open;
    root.querySelector('[aria-controls="fLogDrawer"]')?.setAttribute('aria-expanded', String(open));
    if (open) { setMenu(false); $('#fLogDrawer').querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); }
    else if (restore) root.querySelector<HTMLElement>('[data-ui="menu"]')?.focus({ preventScroll: true });
  }
  function setSettings(open: boolean) {
    if (open) {
      setMenu(false, true); setLog(false); hideCardPreview(true); syncSettings();
    }
    $('#fSettings').hidden = !open;
    root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', String(open));
    syncModal();
  }
  syncSettings();
  const handDrag = attachHandDrag(root, {
    state: () => disconnected ? null : client?.state,
    beforeDrag: () => hideCardPreview(true),
    play: action => { stopPresentation(); client?.send(action); },
  });

  function focusSnapshot() {
    const el = document.activeElement as HTMLElement | null;
    if (!el || !root.contains(el)) return null;
    const keys = ['data-ui', 'data-act', 'data-inspect', 'data-fid', 'data-pid', 'data-mana', 'data-ctr', 'data-event', 'data-stack', 'data-stack-inspect', 'data-peek', 'data-q-opt', 'data-q-confirm', 'data-q-submit', 'data-q-none', 'data-q-keep', 'data-q-amount', 'data-group', 'data-sb-main', 'data-sb-side'];
    const attr = keys.find(key => el.hasAttribute(key));
    const scope = el.parentElement?.closest('[id]')?.id;
    const selector = el.id ? `#${CSS.escape(el.id)}` : attr ? `${scope ? `#${CSS.escape(scope)} ` : ''}[${attr}="${CSS.escape(el.getAttribute(attr)!)}"]` : null;
    return selector ? { selector, start: el instanceof HTMLInputElement ? el.selectionStart : null, end: el instanceof HTMLInputElement ? el.selectionEnd : null } : null;
  }
  function restoreFocus(saved: ReturnType<typeof focusSnapshot>) {
    if (!saved || (document.activeElement !== document.body && document.activeElement?.isConnected)) return;
    const next = root.querySelector<HTMLElement>(saved.selector);
    if (!next || next.closest('[hidden]') || (next as HTMLButtonElement).disabled) return;
    next.focus({ preventScroll: true });
    if (next instanceof HTMLInputElement && saved.start !== null && saved.end !== null && next.type !== 'number') next.setSelectionRange(saved.start, saved.end);
  }
  function syncModal() {
    const required = ['#fOverlay', '#fQuestion', '#fZone', '#fStackGallery'].map(id => $(id)).find(el => !el.hidden) ?? null;
    if (required && !$('#fSettings').hidden) {
      $('#fSettings').hidden = true;
      root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', 'false');
    }
    const active = required ?? (!$('#fSettings').hidden ? $('#fSettings') : null);
    const previousModal = currentModal;
    if (active !== currentModal) {
      if (!currentModal && active) returnFocus = document.activeElement as HTMLElement | null;
      currentModal = active;
    }
    root.querySelectorAll<HTMLElement>('.arena > *').forEach(el => { el.inert = !!active && el !== active; });
    if (!active && previousModal && returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    if (active && !active.contains(document.activeElement) && !document.querySelector('dialog[open]')) {
      active.querySelector<HTMLElement>('button:not(:disabled), input, [tabindex="0"]')?.focus({ preventScroll: true });
    }
  }
  function closeZone() { zoneOf = null; groupIds = null; $('#fZone').hidden = true; syncModal(); }
  function closeStackGallery() {
    stackGalleryOpen = false; $('#fStackGallery').hidden = true;
    root.querySelector('[data-ui="stack-open"]')?.setAttribute('aria-expanded', 'false');
    hideCardPreview(true); syncModal();
    const restore = () => {
      if (!currentModal && !stackGalleryOpen) (root.querySelector<HTMLElement>('[data-ui="stack-open"]') ?? root.querySelector<HTMLElement>('#fAction button:not(:disabled)') ?? root.querySelector<HTMLElement>('[data-ui="menu"]'))?.focus({ preventScroll: true });
    };
    restore();
    // A live update may replace the priority controls later in this same render.
    queueMicrotask(() => { if (document.activeElement === document.body) restore(); });
  }
  function announce(message: string) {
    if (message === previousAnnouncement) return;
    previousAnnouncement = message;
    $('#fAnnouncement').textContent = message;
  }
  function renderedInputIsCurrent(el: HTMLElement) {
    const gen = el.closest<HTMLElement>('[data-gen]')?.dataset.gen;
    return !!client?.state && gen !== undefined && Number(gen) === client.state.input.gen && !disconnected;
  }

  function advancePresentation() {
    clearTimeout(presentationTimer);
    if (document.hidden || root.hidden || disconnected) { stopPresentation(); return; }
    let entry = timeline.advance();
    const s = client?.state;
    while (entry?.audioOnly) {
      if (s) audio.play(entry.event, timeline.matchId, entry.audible, s.you);
      entry = timeline.advance();
    }
    displayFrame = s && !hasLiveDecision(s) ? entry?.event.frame ?? null : null;
    renderTable(false);
    if (!entry || !s) return;
    const duration = presentationDuration(entry.event, fast || hasLiveDecision(s));
    motion.present(entry.event, { you: s.you, html: entry.event.card ? face(entry.event.card, 'normal') : undefined,
      label: eventDescription(entry.event), duration, hideDestination: !hasLiveDecision(s) });
    audio.play(entry.event, timeline.matchId, entry.audible, s.you);
    if (entry.event.type === 'damage' && entry.event.targets?.players?.length) announce(eventDescription(entry.event));
    else if (!hasLiveDecision(s)) announce(eventDescription(entry.event));
    presentationTimer = window.setTimeout(advancePresentation, duration);
  }
  function stopPresentation() {
    clearTimeout(presentationTimer); timeline.catchUp(); displayFrame = null;
    motion.cancelPresentation(); audio.silence();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopPresentation(); silentNext = true; }
    else if (!root.hidden) render();
  });
  root.querySelectorAll<HTMLElement>('.row').forEach(row => {
    row.tabIndex = 0;
    row.setAttribute('aria-label', `${row.closest('.opp') ? 'Campo do oponente' : 'Seu campo'}: ${row.classList.contains('lands') ? 'terrenos e outros permanentes' : 'criaturas'}. Role para ver todas as cartas.`);
    row.addEventListener('scroll', () => { if (client?.state) { const visual = stateWithFrame(client.state, displayFrame); drawBlockArrows(visual); drawTargetArrows(visual); } }, { passive: true });
  });

  $('#fOpponents').addEventListener('scroll', () => { syncSeatScroll(); if (client?.state) { const visual = stateWithFrame(client.state, displayFrame); drawBlockArrows(visual); drawTargetArrows(visual); } }, true);

  // ---------- Imagens do Scryfall, buscadas por nome ----------
  const wanted = new Set<string>();
  /** Nomes já pedidos ao Scryfall: o que ele não conhece (fichas, nomes do Forge) não é pedido de novo a cada desenho. */
  const asked = new Set<string>();
  let fetchTimer = 0;
  function image(name: string | undefined, size: 'small' | 'normal') {
    if (!name) return undefined;
    const sc = cacheGet(name);
    if (!sc) {
      if (asked.has(name)) return undefined;
      asked.add(name);
      wanted.add(name);
      clearTimeout(fetchTimer);
      fetchTimer = window.setTimeout(() => {
        const names = [...wanted];
        wanted.clear();
        // Falha (sem rede, limite do Scryfall): libera os nomes para tentar de novo daqui a 30 s.
        fetchByNames(names).then(render).catch(() => setTimeout(() => names.forEach(n => asked.delete(n)), 30_000));
      }, 150);
      return undefined;
    }
    const u = sc.pt?.image_uris ?? sc.image_uris;
    return size === 'small' ? u?.small ?? u?.normal : u?.normal ?? u?.small;
  }

  /** Nome, tipo e texto impressos em português, quando o Scryfall tem a tradução. */
  const ptOf = (name: string | undefined) => (name ? cacheGet(name)?.pt : undefined);
  const label = (c: FCard) => ptOf(c.name)?.name || c.name || 'Carta';
  /** "Emblem — Kaito, Bane of Nightmares" → "Kaito, Bane of Nightmares" (o planeswalker que gerou o emblema). */
  const emblemSource = (c: FCard) => (c.name ?? '').replace(/^Emblem\s*[—–-]\s*/i, '');
  const emblemLabel = (c: FCard) => `Emblema de ${ptOf(emblemSource(c))?.name || emblemSource(c)}`;

  function face(c: FCard, size: 'small' | 'normal') {
    if (c.faceDown || !c.name) return '<div class="face"><div class="back" style="width:100%;height:100%"></div></div>';
    return faceHTML({
      name: label(c), manaCost: c.manaCost ?? '', typeLine: ptOf(c.name)?.type_line || c.typeLine || '', power: c.power, toughness: c.toughness,
      creature: !!c.creature, color: colorFromCost(c.manaCost ?? '', !!c.land), image: c.image ?? image(c.name, size),
    });
  }

  // ---------- Peças ----------
  /** Destaque azul: cartas que o Forge marca como selecionáveis no prompt atual ou utilizáveis agora. */
  function usable(s: FState, id: number) {
    return s.input.selectable.includes(id) || !!s.input.actionable?.includes(id);
  }
  /** Cemitério e exílio: além do que o Forge marca, o que a ponte diz que dá para usar agora (flashback, tramadas...). */
  const canUse = (s: FState, c: FCard) => usable(s, c.id) || (!s.question && !!s.input.priority && s.input.ok.enabled && !!s.castable?.includes(c.id));

  /** Cartas de fora da mão que dá para usar agora, com a etiqueta de onde vêm; aparecem na ponta da mão. */
  function outsideHand(s: FState) {
    if (s.question || !s.input.priority || !s.input.ok.enabled || !s.castable?.length) return [];
    const out: { c: FCard; tag: string }[] = [];
    for (const p of s.players) {
      const mine = p.id === s.you;
      for (const c of p.graveyard) if (canUse(s, c)) out.push({ c, tag: mine ? 'Cemitério' : `Cemitério de ${p.name}` });
    }
    return out;
  }

  function renderExileShelf(s: FState) {
    const cards = exileShelfCards(s);
    const shelf = $('#fExileShelf');
    const arena = root.querySelector<HTMLElement>('.forge')!;
    shelf.hidden = !cards.length;
    arena.classList.toggle('has-exile-shelf', !!cards.length);
    arena.style.setProperty('--exile-visible', String(Math.min(2, cards.length)));
    setHTML(shelf, `<span class="exile-shelf-label">Exílio</span><div class="exile-shelf-track" tabindex="0" aria-label="Cartas no exílio. Role para ver todas.">${cards.map(({ card, suspended, permission, choosing }) => {
      const playable = canPlayExileCard(s, card.id, s.input.gen);
      const selecting = canSelectExileCard(s, card.id, s.input.gen);
      const selected = selectedForInput(s, card.id);
      const time = card.counters?.TIME ?? 0;
      const status = choosing ? 'Conjurar agora' : suspended ? time > 0 ? `Suspensa · ${time}` : 'Aguardando resolução' : playable ? card.land ? 'Jogar terreno' : 'Conjurar' : 'Aguardando o momento de jogar';
      const caption = choosing ? 'Conjurar' : suspended ? time > 0 ? 'Suspensa' : 'Na pilha' : playable ? 'Jogar' : 'Aguarde';
      return `<div class="exile-slot"><div class="exile-card${playable ? ' playable' : ''}${selecting ? ' selectable' : ''}${selected ? ' choice-selected' : ''}${choosing ? ' suspend-ready' : ''}${!playable && !choosing && !selecting ? ' waiting' : ''}" data-fid="${card.id}" data-exile-card role="button" tabindex="0"${selecting ? ` aria-pressed="${selected}"` : ''} aria-label="${esc(label(card))}, exílio. ${status}${permission && suspended ? '. Também pode ser jogada pela permissão de exílio' : ''}">${face(card, 'normal')}
        ${suspended ? `<span class="exile-time" title="${time} ${time === 1 ? 'marcador de tempo' : 'marcadores de tempo'}">${COUNTER_ICON.TIME}<b>${time}</b></span>` : ''}
        <span class="exile-status" title="${esc(status)}">${caption}</span>${selectedBadge(s, card)}</div>${inspectButton(card)}</div>`;
    }).join('')}</div>`);
  }
  function layoutExileShelf() {
    const arena = root.querySelector<HTMLElement>('.forge')!;
    const hand = $('#fHand');
    hand.style.removeProperty('--shelf-hand-overlap');
    if (!arena.classList.contains('has-exile-shelf') || hand.classList.contains('crowded')) return;
    const slots = [...hand.querySelectorAll<HTMLElement>('.hand-slot')];
    if (slots.length < 2) return;
    const width = slots[0].getBoundingClientRect().width;
    const space = Math.max(width, hand.clientWidth - 24);
    const step = Math.max(14, Math.min(width * .66, (space - width) / (slots.length - 1)));
    hand.style.setProperty('--shelf-hand-overlap', `${step - width}px`);
  }

  function combatIndex(s: FState, id: number): { attack?: number; block?: number } {
    const a = s.combat.findIndex(x => x.attacker === id);
    if (a >= 0) return { attack: a + 1 };
    const b = s.combat.findIndex(x => x.blockers.includes(id));
    return b >= 0 ? { block: b + 1 } : {};
  }

  /**
   * Setas do bloqueio: de cada bloqueador até a criatura que ele bloqueia. Mede a mesa já desenhada
   * (antes das animações) e é refeita quando a janela muda de tamanho.
   */
  function arrowRect(selector: string): DOMRect | undefined {
    const el = root.querySelector<HTMLElement>(selector);
    if (!el || el.closest('[hidden]')) return undefined;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') return undefined;
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    for (let parent = el.parentElement; parent && root.contains(parent); parent = parent.parentElement) {
      const style = getComputedStyle(parent), box = parent.getBoundingClientRect();
      if ((style.overflowX !== 'visible' && (x < box.left || x > box.right)) ||
          (style.overflowY !== 'visible' && (y < box.top || y > box.bottom))) return undefined;
    }
    return rect;
  }
  function drawBlockArrows(s: FState) {
    const svg = root.querySelector<SVGSVGElement>('#fArrows')!;
    const box = svg.getBoundingClientRect();
    const rectOf = (id: number) => arrowRect(`.field [data-fid="${id}"]`);
    const paths: string[] = [];
    for (const { attacker, blockers } of s.combat) {
      const a = rectOf(attacker);
      if (!a) continue;
      blockers.forEach((id, j) => {
        const b = rectOf(id);
        if (!b) return;
        // Do centro do bloqueador ao centro do atacante, por cima das cartas: em combate as duas fileiras
        // ficam quase encostadas e uma seta só no vão entre elas não apareceria. Com vários bloqueadores
        // na mesma criatura, as pontas se espalham.
        const sx = b.left + b.width / 2 - box.left;
        const sy = b.top + b.height / 2 - box.top;
        const ex = a.left + a.width / 2 + (j - (blockers.length - 1) / 2) * a.width * 0.28 - box.left;
        const ey = a.top + a.height / 2 - box.top;
        const my = (sy + ey) / 2;
        const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} C${sx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
        paths.push(`<path class="arrow-under" d="${d}"/><path class="arrow" d="${d}" marker-end="url(#fArrowHead)"/>`);
      });
    }
    const html = paths.length ? `<defs><marker id="fArrowHead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path d="M0 0 10 5 0 10z" fill="var(--gold)" stroke="#2a1600" stroke-width="1"/></marker></defs>${paths.join('')}` : '';
    // O estado chega várias vezes no mesmo combate: só redesenha (e reanima) quando as setas mudam.
    if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
  }

  /**
   * Setas de alvo: da carta que alveja até cada carta ou jogador escolhido. Enquanto você escolhe os alvos, a seta
   * sai da carta que está sendo conjurada (azul); depois, de cada item da pilha (dourado se for seu, vermelho se
   * for do oponente).
   */
  function drawTargetArrows(s: FState) {
    const svg = root.querySelector<SVGSVGElement>('#fTargets')!;
    const box = svg.getBoundingClientRect();
    const q = arrowRect;
    const targetRect = (kind: 'c' | 'p', id: number) =>
      kind === 'p' ? q(`.avatar-slot [data-pid="${id}"]`) : q(`.field [data-fid="${id}"]`) ?? q(`#fHand [data-fid="${id}"]`);
    const links: { from: DOMRect; to: DOMRect; cls: string }[] = [];
    const add = (from: DOMRect | undefined, t: { cards?: number[]; players?: number[] } | undefined, cls: string) => {
      if (!from || !t) return;
      for (const id of t.cards ?? []) { const to = targetRect('c', id); if (to) links.push({ from, to, cls }); }
      for (const id of t.players ?? []) { const to = targetRect('p', id); if (to) links.push({ from, to, cls }); }
    };
    const stack = client?.state ? stackPresentation(client.state, timeline.current?.event).stack : s.stack;
    stack.forEach(si => {
      const from = q(`#fStack [data-stack="${si.id}"]`) ?? (si.source ? q(`.field [data-fid="${si.source.id}"]`) : undefined);
      add(from, si.targets, si.controller === s.you ? 'mine' : 'theirs');
    });
    const tg = s.input.targeting;
    if (tg && !s.gameOver) {
      const from = q(`#fAction [data-peek="${tg.source}"]`) ?? q(`#fHand [data-fid="${tg.source}"]`) ?? q(`.field [data-fid="${tg.source}"]`);
      add(from, tg, 'choosing');
    }
    const paths = links.map(({ from, to, cls }) => {
      const fx = from.left + from.width / 2 - box.left, fy = from.top + from.height / 2 - box.top;
      const ex = to.left + to.width / 2 - box.left, ey = to.top + to.height / 2 - box.top;
      // Sai da borda da carta de origem, para não cobrir a arte dela.
      const edge = Math.min(from.width / 2 / (Math.abs(ex - fx) || 1e-6), from.height / 2 / (Math.abs(ey - fy) || 1e-6), 1);
      const sx = fx + (ex - fx) * edge, sy = fy + (ey - fy) * edge;
      // Curva para o lado, para não passar reta por cima das cartas do meio e as setas da mesma origem não se sobreporem.
      const dx = ex - sx, dy = ey - sy, len = Math.hypot(dx, dy) || 1, bend = Math.min(120, len * 0.25);
      const cx = (sx + ex) / 2 - (dy / len) * bend, cy = (sy + ey) / 2 + (dx / len) * bend;
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      return `<path class="arrow-under" d="${d}"/><path class="arrow ${cls}" d="${d}" marker-end="url(#fTargetHead-${cls})"/>` +
        `<circle class="ring ${cls}" cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="${(Math.min(to.width, to.height) * 0.32).toFixed(1)}"/>`;
    });
    const head = (cls: string) => `<marker id="fTargetHead-${cls}" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
      <path class="head ${cls}" d="M0 0 10 5 0 10z" stroke="#120800" stroke-width="1"/></marker>`;
    const html = paths.length ? `<defs>${['mine', 'theirs', 'choosing'].map(head).join('')}</defs>${paths.join('')}` : '';
    if (svg.dataset.html !== html) { svg.innerHTML = html; svg.dataset.html = html; }
  }

  function layoutCardDecision() {
    const arena = root.querySelector<HTMLElement>('.arena')!;
    const action = $('#fAction');
    arena.style.removeProperty('grid-template-rows');
    action.style.removeProperty('max-height');
    if (!arena.classList.contains('has-hand-decision') || arena.classList.contains('multiplayer')) return;
    // Keep the whole choice scrollable between the phase track and the actual hand.
    const header = getComputedStyle(arena).gridTemplateRows.split(' ')[0];
    const hand = $('#fHand').getBoundingClientRect();
    const phaseBottom = $('#fPhases').getBoundingClientRect().bottom;
    action.style.maxHeight = `${Math.max(0, hand.top - 8 - phaseBottom - 12)}px`;
    const bottom = arena.getBoundingClientRect().bottom - action.getBoundingClientRect().top + 8;
    arena.style.gridTemplateRows = `${header} minmax(0, 1fr) 2px minmax(0, 1fr) ${Math.max(hand.height, bottom)}px`;
  }

  function layoutStack() {
    const arena = root.querySelector<HTMLElement>('.arena')!;
    const panel = $('#fStack');
    arena.classList.remove('stack-tight');
    arena.style.removeProperty('--stack-active-width');
    for (const property of ['--stack-width', 'top', 'transform']) panel.style.removeProperty(property);
    if (panel.hidden || panel.classList.contains('minimized')) return;
    const pile = panel.querySelector<HTMLElement>('.stack-pile');
    if (!pile) return;
    const action = $('#fAction').getBoundingClientRect();
    const natural = panel.getBoundingClientRect();
    const arenaBox = arena.getBoundingClientRect();
    const phases = $('#fPhases').getBoundingClientRect();
    const topSafe = phases.height ? phases.bottom - arenaBox.top + 12 : 60;
    const overlapsAction = natural.right > action.left - 12 && natural.left < action.right + 12;
    const bottomSafe = overlapsAction ? action.top - arenaBox.top - 18 : arenaBox.height - 18;
    if (natural.top - arenaBox.top >= topSafe && natural.bottom - arenaBox.top <= bottomSafe) return;
    if (natural.height <= bottomSafe - topSafe) {
      const top = Math.max(topSafe, Math.min(natural.top - arenaBox.top, bottomSafe - natural.height));
      panel.style.top = `${top}px`;
      panel.style.transform = 'none';
      return;
    }
    const pileBox = pile.getBoundingClientRect();
    const fanTop = Math.min(pileBox.top, ...[...pile.querySelectorAll('.stack-layer')].map(layer => layer.getBoundingClientRect().top));
    const overhang = Math.max(38, pileBox.top - fanTop);
    const available = Math.max(70, bottomSafe - topSafe - overhang);
    const width = Math.min(pile.getBoundingClientRect().width, available * 488 / 680);
    arena.classList.add('stack-tight');
    arena.style.setProperty('--stack-active-width', `${width}px`);
    panel.style.setProperty('--stack-width', `${width}px`);
    panel.style.top = `${Math.max(topSafe + overhang, bottomSafe - width * 680 / 488)}px`;
    panel.style.transform = 'none';
  }

  window.addEventListener('resize', () => {
    const s = client?.state;
    if (s?.type === 'state' && !root.hidden) { layoutExileShelf(); layoutCardDecision(); layoutStack(); syncSeatScroll(); const visual = stateWithFrame(s, displayFrame); drawBlockArrows(visual); drawTargetArrows(visual); }
  });

  const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
  const counterLabel = (k: string) => COUNTER_LABEL[k] ?? KEYWORD_LABEL[k] ?? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');

  /** Palavras-chave que viram marcador na carta do campo. */
  const KEYWORD_LABEL: Record<string, string> = {
    FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
    DOUBLE_STRIKE: 'Golpe duplo', DEATHTOUCH: 'Toque mortífero', LIFELINK: 'Vínculo com a vida', VIGILANCE: 'Vigilância',
    HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência à magia', SHROUD: 'Manto', WARD: 'Proteção contra alvos',
    INDESTRUCTIBLE: 'Indestrutível', PROTECTION: 'Proteção',
  };
  const keywordsOf = (c: FCard) => (c.keywords ?? []).filter(k => KEYWORD_LABEL[k]);
  /** Selo com ícone (e número, se houver); o nome aparece no balão ao passar o mouse ou clicar. */
  const chip = (cls: string, key: string, icon: string, name: string, n?: number) =>
    `<span class="${cls}${openCounter === key ? ' open' : ''}" data-ctr="${key}" role="button" tabindex="0" aria-label="${esc(name)}">${icon}${n !== undefined ? `<b>${n}</b>` : ''}<span class="ctr-tip">${esc(name)}</span></span>`;
  /** Classe do número de P/T: verde acima da base, vermelho abaixo. */
  const delta = (v: number, base: number | undefined) => (base === undefined || v === base ? '' : v > base ? 'up' : 'down');

  /** Cartas do campo por id, para achar o alvo de um ataque ou a carta que uma aura encanta. */
  const fieldCache = new WeakMap<FState, Map<number, FCard>>();
  function battlefieldById(s: FState) {
    let m = fieldCache.get(s);
    if (!m) fieldCache.set(s, m = new Map(s.players.flatMap(p => p.battlefield).map(c => [c.id, c] as const)));
    return m;
  }

  /** Auras e equipamentos agrupados pela carta a que estão presos (só quando ela está no campo). */
  function attachmentsOf(s: FState) {
    const byId = battlefieldById(s);
    const m = new Map<number, FCard[]>();
    for (const c of byId.values()) {
      if (c.attachedTo != null && byId.has(c.attachedTo)) m.set(c.attachedTo, [...(m.get(c.attachedTo) ?? []), c]);
    }
    return m;
  }

  function bfCard(s: FState, c: FCard, attached: FCard[] = []) {
    const ci = combatIndex(s, c.id);
    const byId = battlefieldById(s);
    const slot = ['slot'];
    if (c.creature && c.keywords?.includes('FLYING')) slot.push('has-flying');
    if (c.tapped) slot.push('tapped');
    if (c.attacking || ci.attack) slot.push('attacking');
    if (c.blocking || ci.block) slot.push('blocking');
    const inner = ['bfc'];
    if (usable(s, c.id)) inner.push('actionable');
    const selected = selectedForInput(s, c.id);
    const selectionCandidate = !!s.input.selection && (usable(s, c.id) || selected);
    if (selected) inner.push('choice-selected');
    const blockCandidate = !!s.input.blocking?.blockers.includes(c.id);
    const blockSelected = validBlockSelection(s, selectedBlocker) && selectedBlocker.blocker === c.id;
    if (blockCandidate) inner.push('block-candidate');
    if (blockSelected) inner.push('block-selected');
    if (legalBlockTargets(s, selectedBlocker).includes(c.id)) inner.push('block-target');
    const dmg = c.damage ?? 0;
    if (dmg > (lastDamage.get(c.id) ?? 0)) inner.push('hit');
    // Ataque a um planeswalker: o atacante mostra o alvo e o planeswalker mostra quem o ataca.
    const combat = ci.attack ? s.combat[ci.attack - 1] : undefined;
    const target = combat?.defenderKind !== 'player' ? byId.get(combat?.defender ?? -1) : undefined;
    const defendingPlayer = combat?.defenderKind === 'player' ? s.players.find(p => p.id === combat.defender) : undefined;
    const attackers = s.combat.map((x, i) => (x.defenderKind !== 'player' && x.defender === c.id ? i + 1 : 0)).filter(Boolean);
    if (attackers.length) slot.push('attacked');
    let tag = '';
    if (ci.attack) tag = `<span class="tag atk">${ICON_SWORD}${ci.attack}${target ? ` ▸ ${esc(label(target).split(',')[0])}` : defendingPlayer && s.players.length > 2 ? ` ▸ ${esc(defendingPlayer.name)}` : ''}</span>`;
    else if (ci.block) tag = `<span class="tag blk">${ICON_SHIELD}${ci.block}</span>`;
    else if (attackers.length) tag = `<span class="tag atk">Atacado ${ICON_SWORD}${attackers.join(',')}</span>`;
    else if (c.creature && c.sick && c.controller === s.activePlayer) tag = '<span class="tag zzz">zZ</span>';
    if (selectedAttacker?.attacker === c.id) { inner.push('attack-selected'); tag = `<span class="tag block-pending">${ICON_SWORD}Escolha o defensor</span>`; }
    if (legalAttackTargets(s, selectedAttacker).some(target => target.kind === 'card' && target.id === c.id)) inner.push('attack-target');
    if (blockSelected) tag = `<span class="tag block-pending">${ICON_SHIELD}Selecionada</span>`;
    const loyalty = c.planeswalker ? c.counters?.LOYALTY ?? 0 : undefined;
    const pt = c.creature
      ? `<span class="pt"><b class="${delta(c.power ?? 0, c.basePower)}">${c.power}</b>/<b class="${dmg > 0 ? 'down' : delta(c.toughness ?? 0, c.baseToughness)}">${(c.toughness ?? 0) - dmg}</b></span>`
      : loyalty !== undefined ? `<span class="pt loyalty" title="Lealdade"><b>${loyalty}</b></span>` : '';
    const shown = Object.entries(c.counters ?? {}).filter(([k]) => !(c.planeswalker && k === 'LOYALTY'));
    const counters = shown.length
      ? `<span class="counters">${shown.map(([k, v]) => chip('ctr', `${c.id}:${k}`, COUNTER_ICON[k] ?? KEYWORD_ICON[k] ?? COUNTER_DISC, `${counterLabel(k)} ×${v}`, v)).join('')}</span>` : '';
    const kws = c.creature ? keywordsOf(c) : [];
    const kwHTML = kws.length ? `<span class="kws">${kws.map(k => chip('ctr kw', `${c.id}:kw:${k}`, KEYWORD_ICON[k] ?? COUNTER_DISC, KEYWORD_LABEL[k])).join('')}</span>` : '';
    const badges = [c.copyOf ? `<span class="badge copy" title="${esc(c.copyOf)} copiando ${esc(label(c))}">Cópia</span>` : '',
      c.token ? '<span class="badge token">Ficha</span>' : ''].join('');
    const aria = [label(c), c.copyOf ? `cópia feita por ${c.copyOf}` : '', c.token ? 'ficha' : '',
      kws.map(k => KEYWORD_LABEL[k]).join(', '), shown.map(([k, v]) => `${counterLabel(k)} ×${v}`).join(', '), loyalty !== undefined ? `lealdade ${loyalty}` : '', attached.length ? `com ${attached.map(label).join(', ')}` : ''].filter(Boolean).join(', ');
    const atts = attached.map((a, i) =>
      `<div class="att${usable(s, a.id) ? ' actionable' : ''}${selectedForInput(s, a.id) ? ' choice-selected' : ''}" data-fid="${a.id}" role="button" tabindex="0"${s.input.selection ? ` aria-pressed="${selectedForInput(s, a.id)}"` : ''} style="--i:${i + 1}" aria-label="${esc(label(a))}, presa a ${esc(label(c))}">${face(a, 'small')}${selectedBadge(s, a)}</div>`).join('');
    const style = attached.length ? ` style="--atts:${attached.length}"` : '';
    if (attached.length) slot.push('has-att');
    return `<div class="${slot.join(' ')}"${style}>${atts}<div class="${inner.join(' ')}" data-fid="${c.id}" role="button" tabindex="0"${selectionCandidate ? ` aria-pressed="${selected}"` : blockCandidate ? ` aria-pressed="${blockSelected}"` : ''} aria-label="${esc(aria)}">${face(c, 'small')}${badges}${tag}${kwHTML}${pt}${counters}${selectedBadge(s, c)}</div>${inspectButton(c)}</div>`;
  }

  /** Cartas de uma fileira, sem as auras/equipamentos (que vão desenhados junto da carta a que estão presos). */
  function fieldRow(s: FState, cards: FCard[]) {
    const byId = battlefieldById(s);
    return stacks(s, cards.filter(c => c.attachedTo == null || !byId.has(c.attachedTo)));
  }

  /** Fileira de trás: terrenos e artefatos/encantamentos que não são criaturas (nem planeswalkers ou batalhas). */
  function isBackRow(c: FCard) {
    if (c.creature || c.planeswalker) return false;
    return !!c.land || /\b(Artifact|Enchantment)\b/i.test(c.typeLine ?? '');
  }

  /**
   * Empilha cópias iguais: mesmo nome, estado, marcadores e, nas criaturas, mesmo P/T, dano, palavras-chave
   * e enjoo. Cartas com algo preso ou envolvidas no combate ficam sozinhas.
   */
  function stacks(s: FState, cards: FCard[]) {
    const atts = attachmentsOf(s);
    const groups = new Map<string, FCard[]>();
    for (const c of cards) {
      const ctr = Object.entries(c.counters ?? {}).filter(([, v]) => v).sort().join(',');
      const ci = combatIndex(s, c.id);
      const alone = !!s.input.attacking || !!s.input.selection || (!!s.input.blocking && c.creature && c.controller === s.you) || atts.has(c.id) || c.faceDown || c.attacking || c.blocking || ci.attack || ci.block || s.combat.some(x => x.defender === c.id);
      const body = c.creature ? `|${c.power}/${c.toughness}|${c.damage ?? 0}|${[...(c.keywords ?? [])].sort()}|${!!c.sick}` : '';
      const k = alone ? `#${c.id}` : `${c.name}|${c.tapped}|${usable(s, c.id)}|${c.token}|${c.copyOf ?? ''}|${ctr}${body}`;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    return [...groups.values()].map(cs => `<div class="stack" style="--n:${cs.length}">${cs.map(c => bfCard(s, c, atts.get(c.id))).join('')}${
      cs.length > 1 ? `<button class="stack-n" data-group="${cs.map(c => c.id).join(',')}" aria-label="Ver ${cs.length} cópias de ${esc(label(cs[0]))}">×${cs.length}</button>` : ''}</div>`).join('');
  }

  function backRow(s: FState, p: FPlayer) {
    const byId = battlefieldById(s);
    const back = p.battlefield.filter(c => isBackRow(c) && (c.attachedTo == null || !byId.has(c.attachedTo)));
    const lands = stacks(s, back.filter(c => c.land));
    const others = stacks(s, back.filter(c => !c.land));
    return `${lands ? `<div class="perm-group lands-group">${lands}</div>` : ''}${others ? `<div class="perm-group others-group" aria-label="Artefatos e encantamentos">${others}</div>` : ''}`;
  }

  function avatar(s: FState, p: FPlayer, idx: number) {
    const cls = ['avatar', idx === 0 ? 'me' : 'opp'];
    if (s.activePlayer === p.id && !s.gameOver) cls.push('active');
    if (!p.eliminated && (s.input.selectablePlayers?.includes(p.id) || legalAttackTargets(s, selectedAttacker).some(target => target.kind === 'player' && target.id === p.id))) cls.push('selectable-player');
    if (p.eliminated) cls.push('eliminated');
    // Pagando um custo: cada símbolo da sua reserva vira um botão que gasta aquela mana.
    const spend = p.id === s.you && !!s.input.paying;
    const pool = Object.entries(p.pool).flatMap(([c, n]) => Array(n).fill(spend
      ? `<button class="pool-mana" data-mana="${c}" aria-label="Usar mana ${c} da reserva">${pip(c)}</button>` : pip(c))).join('');
    const art = portraits[idx];
    const offline = s.room?.players.find(rp => rp.playerId !== undefined ? rp.playerId === p.id : rp.seat !== undefined && p.seat !== undefined ? rp.seat === p.seat : rp.name === p.name)?.connected === false;
    return `<div class="${cls.join(' ')}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}, ${p.life} de vida${offline ? ', desconectado' : ''}${p.eliminated ? ', eliminado' : ''}">
      <div class="portrait" ${art ? `style="background-image:url('${art}')"` : ''}></div>
      <div class="life">${p.life}</div>
      <div class="pname">${esc(p.name)}</div>
      ${pool ? `<div class="pool${spend ? ' spend' : ''}">${pool}</div>` : ''}
      ${emblems(p)}
      ${p.eliminated ? '<span class="seat-eliminated">Eliminado</span>' : ''}
      ${offline ? '<div class="offline">desconectado</div>' : ''}
    </div>`;
  }

  function emblems(p: FPlayer) {
    const list = p.emblems ?? [];
    if (!list.length) return '';
    return `<div class="emblems">${list.map(c => {
      const art = image(emblemSource(c), 'small');
      return `<div class="emblem" data-peek="${c.id}" tabindex="0" aria-label="${esc(emblemLabel(c))}">
        <div class="emblem-art" ${art ? `style="background-image:url('${art}')"` : ''}></div></div>`;
    }).join('')}</div>`;
  }

  function piles(s: FState, p: FPlayer) {
    const top = p.graveyard[p.graveyard.length - 1];
    const gyLive = p.graveyard.some(c => canUse(s, c)) ? ' actionable' : '';
    // Exílio só aparece com cartas: é onde ficam as tramadas (plot), as de Aventura e afins, que dá para conjurar dali.
    const ex = p.exile[p.exile.length - 1];
    const exLive = p.exile.some(c => canUse(s, c)) ? ' actionable' : '';
    const exile = ex ? `<div class="pile gy exile${exLive}" data-gy="${p.id}" data-zone="exile" role="button" tabindex="0" title="Exílio" aria-label="Ver exílio de ${esc(p.name)} (${p.exile.length})"><div class="gy-top" data-peek="${ex.id}">${face(ex, 'small')}</div><span>${p.exile.length}</span></div>` : '';
    return `<div class="pile lib" title="Grimório"><div class="back"></div><span>${p.library}</span></div>
      <div class="pile gy${gyLive}" data-gy="${p.id}" data-zone="gy" role="button" tabindex="0" title="Cemitério" aria-label="Ver cemitério de ${esc(p.name)} (${p.graveyard.length})">${top ? `<div class="gy-top" data-peek="${top.id}">${face(top, 'small')}</div>` : '<div class="gy-empty"></div>'}<span>${p.graveyard.length}</span></div>${exile}`;
  }

  function commandCards(s: FState, p: FPlayer) {
    return (p.commandZone ?? []).map(c => {
      const commander = p.commanders?.find(item => item.id === c.id);
      const playable = canPlayCommander(s, c.id, s.input.gen);
      return `<div class="command-slot"><button class="command-card${playable ? ' playable' : ''}" data-fid="${c.id}" data-command-card aria-label="${playable ? 'Conjurar' : 'Inspecionar'} ${esc(label(c))}. Taxa de comandante: ${commander?.tax ?? 0} manas. Conjurado da zona de comando ${commander?.casts ?? 0} vezes.">${face(c, 'normal')}<span class="command-tax">+${commander?.tax ?? 0}</span></button>${inspectButton(c)}</div>`;
    }).join('');
  }
  function damageButton(p: FPlayer) {
    if (!p.commanderDamage?.length) return '';
    const highest = Math.max(...p.commanderDamage.map(item => item.damage));
    return `<button class="commander-damage${highest >= 15 ? ' danger' : ''}" data-gy="${p.id}" data-zone="damage" aria-label="Ver dano de comandante recebido por ${esc(p.name)}">Dano <b>${highest}/21</b></button>`;
  }
  function seatRow(id: string, kind: 'lands' | 'creatures', name: string, content: string) {
    const zone = kind === 'lands' ? 'terrenos' : 'criaturas';
    return `<div class="seat-row ${kind}-lane"><div class="row ${kind}" id="${id}" tabindex="0" aria-label="${zone} de ${esc(name)}. Role horizontalmente para ver todas as cartas.">${content}</div><button class="seat-scroll back-scroll" data-ui="row-scroll" data-scroll-row="${id}" data-scroll-direction="-1" aria-label="Ver ${zone} anteriores de ${esc(name)}" hidden>‹</button><button class="seat-scroll forward-scroll" data-ui="row-scroll" data-scroll-row="${id}" data-scroll-direction="1" aria-label="Ver mais ${zone} de ${esc(name)}" hidden>›</button></div>`;
  }
  function syncSeatScroll() {
    root.querySelectorAll<HTMLElement>('.seat-row').forEach(lane => {
      const row = lane.querySelector<HTMLElement>('.row')!;
      const overflow = row.scrollWidth - row.clientWidth > 2;
      lane.classList.toggle('scrollable', overflow);
      lane.querySelector<HTMLButtonElement>('.back-scroll')!.hidden = !overflow || row.scrollLeft < 2;
      lane.querySelector<HTMLButtonElement>('.forward-scroll')!.hidden = !overflow || row.scrollLeft + row.clientWidth >= row.scrollWidth - 2;
    });
  }
  function opponentSeat(s: FState, p: FPlayer, index: number) {
    return `<section class="table-seat${p.eliminated ? ' eliminated' : ''}${s.activePlayer === p.id ? ' current-seat' : ''}" data-seat-player="${p.id}" aria-label="Campo de ${esc(p.name)}${p.eliminated ? ', eliminado' : ''}">
      <header class="seat-heading"><div class="avatar-slot">${avatar(s, p, index + 1)}</div><span class="seat-hand" aria-label="${p.handCount} cartas na mão"><span class="back" aria-hidden="true"></span>${p.handCount}</span>${damageButton(p)}</header>
      <div class="seat-zones"><div class="piles">${piles(s, p)}</div><div class="seat-command" aria-label="Zona de comando de ${esc(p.name)}">${commandCards(s, p)}</div></div>
      <div id="fField-${p.id}" class="field opp${s.activePlayer === p.id ? ' turn' : ''}">${seatRow(`fLands-${p.id}`, 'lands', p.name, backRow(s, p))}${seatRow(`fCreatures-${p.id}`, 'creatures', p.name, fieldRow(s, p.battlefield.filter(c => !isBackRow(c))))}</div>
    </section>`;
  }
  function attackChoices(s: FState) {
    if (!validAttackSelection(s, selectedAttacker)) return '';
    return `<div class="attack-choices" aria-label="Escolher defensor">${legalAttackTargets(s, selectedAttacker).map(target => {
      const name = target.kind === 'player' ? s.players.find(p => p.id === target.id)?.name : findCard(target.id)?.name;
      return `<button class="arena-btn secondary" data-defender="${target.id}" data-defender-kind="${target.kind}" data-gen="${s.input.gen}">${esc(name ?? 'Defensor')}</button>`;
    }).join('')}<button class="icon-btn" data-ui="attack-clear">Limpar seleção</button></div>`;
  }

  function zoneView(s: FState) {
    const el = $('#fZone');
    const p = s.players.find(pl => pl.id === zoneOf);
    if (!p && !groupIds) { closeZone(); return; }
    if (zoneKind === 'damage' && p && !groupIds) {
      setHTML(el, `<section class="question commander-ledger" role="dialog" aria-modal="true" aria-label="Dano de comandante"><h2>Dano de comandante · ${esc(p.name)}</h2><p class="q-hint">Dano de combate recebido de cada comandante. O limite é 21 para cada carta.</p><ul>${(p.commanderDamage ?? []).map(item => {
        const owner = s.players.find(player => player.commanders?.some(c => c.id === item.commanderId));
        const commander = owner?.commanders?.find(c => c.id === item.commanderId);
        return `<li><span>${esc(commander?.name ?? `Comandante ${item.commanderId}`)}<small>${esc(owner?.name ?? '')}</small></span><b>${item.damage} / 21</b></li>`;
      }).join('')}</ul><div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div></section>`);
      el.hidden = false; syncModal(); return;
    }
    const title = groupIds ? 'Cartas do grupo' : zoneKind === 'command' ? 'Zona de comando' : zoneKind === 'exile' ? 'Exílio' : 'Cemitério';
    const cards = groupIds ? groupIds.map(id => findCard(id)).filter((c): c is FCard => !!c) : [...(zoneKind === 'command' ? p!.commandZone ?? [] : zoneKind === 'exile' ? p!.exile : p!.graveyard)].reverse();
    const card = (c: FCard) => `<div class="zone-card">${canUse(s, c)
      ? `<div class="q-face actionable" data-fid="${c.id}" data-gen="${s.input.gen}" role="button" tabindex="0" aria-label="Usar ${esc(label(c))}">${face(c, 'normal')}</div>`
      : `<button class="q-face" data-peek="${c.id}" aria-label="Inspecionar ${esc(label(c))}">${face(c, 'normal')}${c.plotted ? '<div class="zone-tag">Tramada</div>' : ''}</button>`}
      <button class="icon-btn" data-inspect="${c.id}">Inspecionar</button></div>`;
    setHTML(el, `<div class="question zone-view" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}${p ? ` · ${esc(p.name)}` : ''} (${cards.length})</h2>
      ${cards.length ? `<div class="q-opts cards">${cards.map(card).join('')}</div>` : '<p class="q-hint">Vazio.</p>'}
      <div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div>
    </div>`);
    el.hidden = false;
    syncModal();
  }

  function eventDescription(event: PresentationEvent) {
    const who = client?.state?.players.find(p => p.id === event.actor)?.name ?? 'Jogador';
    const name = event.card?.name ? label(event.card) : 'uma carta';
    switch (event.type) {
      case 'land-played': return `${who} jogou ${name}.`;
      case 'spell-cast': return `${who} conjurou ${name}.`;
      case 'ability-activated': return `${who} ativou uma habilidade${event.card?.name ? ` de ${name}` : ''}.`;
      case 'resolved': return `Resolução: ${event.card?.name ? name : 'efeito'}.`;
      case 'countered': return `Anulado: ${event.card?.name ? name : 'efeito'}.`;
      case 'entered': return `${name} entrou no campo.`;
      case 'left': return `${name} saiu do campo.`;
      case 'attackers': return `${who} declarou atacantes.`;
      case 'blockers': return `${who} declarou bloqueadores.`;
      case 'turn': return `Turno de ${who}.`;
      case 'damage': {
        const target = (event.targets?.players ?? []).map(id => client?.state?.players.find(p => p.id === id)?.name).filter(Boolean).join(', ');
        return target ? `${target} sofreu ${Math.abs(event.delta ?? 0)} de dano.` : `${Math.abs(event.delta ?? 0)} de dano causado.`;
      }
      case 'life-changed': return `${who}: ${event.delta && event.delta > 0 ? '+' : ''}${event.delta ?? 0} de vida.`;
      default: return event.text ?? 'O jogo avançou.';
    }
  }
  function targetsDescription(targets: PresentationEvent['targets']) {
    if (!targets) return '';
    const names = [...(targets.cards ?? []).map(id => findCard(id)).filter((c): c is FCard => !!c).map(label),
      ...(targets.players ?? []).map(id => client?.state?.players.find(p => p.id === id)?.name).filter(Boolean)];
    return names.length ? `Alvo${names.length > 1 ? 's' : ''}: ${names.join(', ')}` : '';
  }
  function stackFace(si: FState['stack'][number]) {
    return si.source ? face(si.source, 'normal') : `<div class="stack-effect-face"><span>Efeito na pilha</span><p>${richText(si.text)}</p></div>`;
  }
  function stackPanel(s: FState, replaying = false) {
    const count = s.stack.length;
    const top = s.stack[0];
    if (!top) return '';
    return `<div class="stack-heading"><h2>Pilha</h2><span class="stack-count">${count}</span>${`<button class="stack-size-toggle" data-ui="stack-size" aria-label="${stackMinimized ? 'Expandir a pilha' : 'Recolher a pilha para ver o campo'}" aria-expanded="${!stackMinimized}">${stackMinimized ? '+' : '−'}</button>`}</div>
      <button class="stack-pile" data-ui="${replaying ? 'stack-replay' : 'stack-open'}" data-stack="${top.id}" ${replaying ? 'data-stack-replay' : `data-gen="${s.input.gen}" aria-haspopup="dialog" aria-expanded="${stackGalleryOpen}" aria-controls="fStackGallery"`} aria-label="${replaying ? `Inspecionar ${top.source ? esc(label(top.source)) : 'efeito'}. Reprodução de uma jogada já processada; não está mais na pilha.` : `Abrir a pilha: ${count} ${count === 1 ? 'efeito' : 'efeitos'}. ${top.source ? esc(label(top.source)) : 'O efeito do topo'} resolve primeiro.`}">
        ${s.stack.slice(0, 4).map((si, i) => `<div class="stack-layer ${si.controller === s.you ? 'mine' : 'theirs'}${!replaying && s.input.selectableStacks?.includes(si.id) ? ' actionable' : ''}" style="--depth:${i}" ${i ? `data-stack="${si.id}"` : ''} aria-hidden="true">${stackFace(si)}</div>`).join('')}
        <span class="stack-top-label">${replaying ? 'Jogada recente' : 'Resolve primeiro'}</span>
      </button><span class="stack-open-hint">${replaying ? 'Clique para inspecionar' : 'Clique para ver a pilha'}</span>`;
  }
  function renderStackGallery(s: FState) {
    if (!stackGalleryOpen) return;
    const boardDecision = !s.input.selectableStacks?.length && (!!s.input.selection || !!s.input.blocking || !!s.input.suspendCast || !!s.input.paying || !!s.input.targeting || !!s.input.selectablePlayers?.length || !!s.input.selectable.length || (!s.input.priority && (s.input.ok.enabled || s.input.cancel.enabled)));
    if (!s.stack.length || s.question || s.gameOver || s.sideboarding || boardDecision) { closeStackGallery(); return; }
    const gallery = $('#fStackGallery');
    const track = gallery.querySelector<HTMLElement>('.stack-gallery-track');
    const scroll = { left: track?.scrollLeft ?? 0, top: track?.scrollTop ?? 0 };
    const count = s.stack.length;
    setHTML(gallery, `<section class="stack-gallery" role="dialog" aria-modal="true" aria-labelledby="fStackGalleryTitle" aria-describedby="fStackGalleryHint">
      <header class="stack-gallery-heading"><div><h2 id="fStackGalleryTitle">Pilha <span aria-live="polite">${count}</span></h2><p id="fStackGalleryHint">O primeiro efeito à esquerda resolve primeiro.</p></div><button class="icon-btn" data-ui="stack-close" aria-label="Fechar pilha">Fechar</button></header>
      <ol class="stack-gallery-track" tabindex="0" aria-label="Efeitos em ordem de resolução. Role para ver todos.">${s.stack.map((si, i) => {
        const selectable = !!s.input.selectableStacks?.includes(si.id);
        const name = si.source ? label(si.source) : 'Efeito';
        return `<li class="stack-gallery-item ${si.controller === s.you ? 'mine' : 'theirs'}" data-stack-instance="${si.id}">
          <div class="stack-gallery-order"><b>${i + 1}</b><span>${i === 0 ? 'Resolve primeiro' : `${i + 1}º na resolução`}</span></div>
          <button class="stack-gallery-card${selectable ? ' actionable' : ''}" data-stack="${si.id}" data-gen="${s.input.gen}" aria-label="${selectable ? 'Selecionar como alvo' : 'Inspecionar'}: ${esc(name)}">${stackFace(si)}</button>
          <div class="stack-gallery-owner">${esc(s.players.find(p => p.id === si.controller)?.name ?? 'Efeito')}</div>
          <div class="stack-gallery-effect" tabindex="0" aria-label="Efeito e alvos de ${esc(name)}"><p>${richText(si.text)}</p>${targetsDescription(si.targets) ? `<p class="stack-targets">${esc(targetsDescription(si.targets))}</p>` : ''}</div>
          <div class="stack-gallery-actions">${selectable ? `<button class="arena-btn primary" data-stack="${si.id}" data-gen="${s.input.gen}">Selecionar como alvo</button>` : ''}${si.source ? `<button class="icon-btn" data-stack-inspect="${si.id}" aria-label="Inspecionar ${esc(name)}">Inspecionar</button>` : ''}</div>
        </li>`;
      }).join('')}</ol>
      <p class="stack-gallery-help">Use ← e → nas cartas para percorrer a pilha. Esc fecha.</p>
    </section>`);
    gallery.hidden = false;
    const next = gallery.querySelector<HTMLElement>('.stack-gallery-track')!;
    next.scrollLeft = scroll.left; next.scrollTop = scroll.top;
  }
  function renderActivity() {
    const authoritative = client?.state;
    if (!authoritative) return;
    const presentation = stackPresentation(authoritative, timeline.current?.event);
    const s = { ...authoritative, stack: presentation.stack };
    const el = $('#fStack');
    const focused = focusSnapshot();
    const scrollTop = el.scrollTop;
    el.hidden = !s.stack.length;
    el.classList.toggle('minimized', stackMinimized);
    root.querySelector('.forge')!.classList.toggle('has-stack', !!s.stack.length);
    setHTML(el, s.stack.length ? stackPanel(s, presentation.replaying) : '');
    el.scrollTop = scrollTop;
    renderStackGallery(authoritative);
    // Optional drawer only: ordinary draws and priority changes never crowd the table.
    setHTML($('#fLog'), timeline.history.slice().reverse().map(event => `<li>${event.card?.name && !event.card.faceDown
      ? `<button class="history-inspect" data-event="${event.seq}">${esc(eventDescription(event))}</button>`
      : `<span>${esc(eventDescription(event))}</span>`}</li>`).join('') || '<li>As jogadas aparecerão aqui.</li>');
    restoreFocus(focused);
  }

  function sideboardingHTML(s: FState) {
    const sb = s.sideboarding!;
    if (!sideboardDraft || sideboardDraft.id !== sb.id) {
      sideboardDraft = { id: sb.id, main: structuredClone(sb.main), sideboard: structuredClone(sb.sideboard) };
      sideboardError = ''; sideboardBusy = false;
    }
    if (sb.ready) sideboardBusy = false;
    const draft = sideboardDraft;
    const count = (entries: DeckEntry[]) => entries.reduce((n, e) => n + e.count, 0);
    const locked = sb.ready || sideboardBusy;
    const list = (entries: DeckEntry[], main: boolean) => `<ul class="sideboard-list">${entries.map((entry, i) => `<li><span class="sb-count">${entry.count}×</span><button class="sb-name" data-sb-inspect="${esc(entry.name)}">${esc(ptOf(entry.name)?.name || entry.name)}</button><button class="sb-move" ${main ? 'data-sb-main' : 'data-sb-side'}="${i}" ${locked ? 'disabled' : ''} aria-label="Mover uma cópia de ${esc(entry.name)} para ${main ? 'o sideboard' : 'o deck principal'}">${main ? '→' : '←'}</button></li>`).join('') || '<li>Nenhuma carta.</li>'}</ul>`;
    const score = s.match ? s.match.wins.join(' × ') : '';
    return `<div class="sideboard-panel" role="dialog" aria-modal="true" aria-labelledby="fSideboardTitle"><h2 id="fSideboardTitle">Prepare o próximo jogo</h2>
      <p>Jogo ${s.match?.gameNumber ?? 1} encerrado${score ? ` · Placar: ${score}` : ''}. Troque cartas entre o deck principal e o sideboard.</p>
      <p>Você só pode usar as cartas que já trouxe para a partida. As trocas precisam manter a lista válida para o formato.</p>
      ${sideboardError ? `<p class="sideboard-error" role="alert">${esc(sideboardError)}</p>` : ''}
      <div class="sideboard-columns"><section><h3>Deck principal · ${count(draft.main)}</h3>${list(draft.main, true)}</section><section><h3>Sideboard · ${count(draft.sideboard)}</h3>${list(draft.sideboard, false)}</section></div>
      <div class="sideboard-actions"><button class="arena-btn secondary" data-ui="exit">Sair da partida</button><button class="arena-btn secondary" data-ui="next-game" ${locked ? 'disabled' : ''}>Continuar sem trocas</button><button class="arena-btn primary" data-ui="sideboard-ready" ${locked ? 'disabled' : ''}>${sb.ready ? 'Aguardando o oponente…' : sideboardBusy ? 'Verificando…' : 'Confirmar e continuar'}</button></div>
    </div>`;
  }

  function buttons(s: FState) {
    if (s.gameOver || s.question) return '';
    if (s.spectating) return '<span class="spectating-label">Você foi eliminado. Acompanhando a partida.</span>';
    if (s.input.opening === 'starting-player') {
      const choices = s.players.filter(player => s.input.selectablePlayers?.includes(player.id));
      return choices.length ? choices.map(player => `<button class="arena-btn ${player.id === s.you ? 'primary' : 'secondary'}" data-pid="${player.id}" data-gen="${s.input.gen}">${esc(player.name)}${player.id === s.you ? ' · Você' : ''}</button>`).join('') : '<button class="arena-btn waiting" disabled>Aguardando a escolha de quem começa…</button>';
    }
    const decision = cardDecision(s);
    const handCount = s.players.find(p => p.id === s.you)?.hand.length ?? 0;
    const ok = s.input.suspendCast ? { ...s.input.ok, label: 'Conjurar agora' } : s.input.blocking ? { ...s.input.ok, label: 'Confirmar bloqueios' } : s.input.attacking ? { ...s.input.ok, label: 'Confirmar atacantes' } : s.input.opening === 'play-draw' ? { ...s.input.ok, label: 'Eu jogo' }
      : s.input.opening === 'mulligan' ? { ...s.input.ok, label: `Manter ${handCount}` } : decision ? { ...s.input.ok, label: 'Confirmar seleção' } : s.input.ok;
    const cancel = s.input.suspendCast ? { ...s.input.cancel, label: 'Deixar no exílio' } : s.input.opening === 'play-draw' ? { ...s.input.cancel, label: 'Oponente joga' } : s.input.cancel;
    const waiting = clickedGen === s.input.gen && Date.now() - clickedAt < CLICK_LOCK_MS;
    const b = (act: string, btn: { label: string; enabled: boolean }, kind: string) =>
      btn.label ? `<button class="arena-btn ${kind}" data-act="${act}" data-gen="${s.input.gen}" ${btn.enabled && !waiting ? '' : 'disabled'}>${esc(btn.label)}</button>` : '';
    const mine = s.activePlayer === s.you;
    if (!ok.enabled && !cancel.enabled) return decision ? '' : `<button class="arena-btn waiting" disabled>${s.input.opening ? 'Aguardando confirmação…' : mine ? 'Aguardando o jogo…' : s.players.length > 2 ? `${s.players.find(p => p.id === s.activePlayer)?.name ?? 'Oponente'} jogando…` : 'Oponente jogando…'}</button>`;
    const endTurn = !!s.input.priority && ok.enabled && mine && !s.stack.length && !s.input.targeting && !s.input.paying;
    const undo = endTurn && /fim de turno|end turn/i.test(cancel.label) ? '' : b('cancel', cancel, 'secondary');
    const priority = s.input.priority ? { ...ok, label: 'Passar prioridade' } : ok;
    return undo + b('ok', priority, endTurn ? 'secondary' : 'primary') +
      (endTurn ? b('pass-turn', { label: 'Fim de turno', enabled: true }, 'primary') : '');
  }

  // ---------- Perguntas ----------
  const optLabel = (o: FOption | string) => (typeof o === 'string' ? o : o.label);

  function amountStatus(q: FQuestion) {
    const amounts = (q.options ?? []).map((_, i) => Number(qState?.amounts[i]));
    const validValues = amounts.every((n, i) => {
      const option = q.options![i];
      const min = typeof option === 'string' ? 0 : option.min ?? 0;
      const max = typeof option === 'string' ? q.total ?? 0 : option.max ?? q.total ?? 0;
      return /^\d+$/.test(qState?.amounts[i] ?? '') && Number.isSafeInteger(n) && n >= min && n <= max;
    });
    const remaining = (q.total ?? 0) - amounts.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
    return { amounts, valid: validValues && remaining === 0, text: !validValues ? 'Respeite os limites indicados para cada alvo.' : remaining < 0 ? `Excesso: ${-remaining}.` : `Restante: ${remaining}.` };
  }

  function questionHTML(q: FQuestion) {
    if (!qState || qState.id !== q.id) qState = { id: q.id, picked: [], text: q.initial ?? '', amounts: (q.options ?? []).map(o => String(typeof o === 'string' ? 0 : o.min ?? 0)) };
    const opts = q.options ?? [];
    const head = `<h2>${esc(q.title)}</h2>${q.card ? `<div class="q-card">${face(q.card, 'normal')}</div>` : ''}`;
    if (q.kind === 'amount') {
      const status = amountStatus(q);
      return `${head}<form data-q-amount-form><div class="q-amounts">${opts.map((o, i) => {
        const min = typeof o === 'string' ? 0 : o.min ?? 0;
        const max = typeof o === 'string' ? q.total ?? 0 : o.max ?? q.total ?? 0;
        return `<label><span>${esc(optLabel(o))}<small>De ${min} a ${max}</small></span><input data-q-amount="${i}" type="number" inputmode="numeric" min="${min}" max="${max}" step="1" value="${esc(qState!.amounts[i])}" aria-describedby="fAmountRemaining"></label>`;
      }).join('')}</div><p class="q-hint" id="fAmountRemaining" aria-live="polite">${status.text}</p><div class="q-actions"><button class="arena-btn primary" data-q-amount-submit ${status.valid ? '' : 'disabled'}>Confirmar distribuição</button></div></form>`;
    }
    if (q.kind === 'confirm') {
      return `${head}<div class="q-actions">${opts.map((o, i) =>
        `<button class="arena-btn ${i === 0 ? 'primary' : 'secondary'}" data-q-confirm="${i === 0}">${esc(optLabel(o))}</button>`).join('')}</div>`;
    }
    if (q.kind === 'reveal') {
      const anyCards = opts.some(o => typeof o !== 'string' && o.card);
      return `${head}<div class="q-opts ${anyCards ? 'cards' : ''}">${opts.map(o => typeof o !== 'string' && o.card
        ? `<div class="q-face" data-peek="${o.card.id}" role="button" tabindex="0" aria-label="Inspecionar ${esc(label(o.card))}">${face(o.card, 'normal')}</div>`
        : `<div class="q-opt"><span>${esc(optLabel(o))}</span></div>`).join('')}</div>
        <div class="q-actions"><button class="arena-btn primary" data-q-none>OK</button></div>`;
    }
    if (q.kind === 'text') {
      return `${head}<form class="q-text" data-q-text><input id="fQInput" ${q.numeric ? 'type="number"' : ''} value="${esc(qState.text)}" aria-label="Resposta">
        <button class="arena-btn primary">Confirmar</button></form>`;
    }
    const isOrder = q.kind === 'order';
    const min = isOrder ? opts.length : q.min ?? 1;
    const max = isOrder ? opts.length : q.max ?? 1;
    const single = !isOrder && max === 1;
    const anyCards = opts.some(o => typeof o !== 'string' && o.card);
    const items = opts.map((o, i) => {
      const pos = qState!.picked.indexOf(i);
      const on = pos >= 0 ? 'on' : '';
      const badge = isOrder && pos >= 0 ? `<span class="q-badge">${pos + 1}</span>` : on && !single ? '<span class="q-badge">✓</span>' : '';
      const card = typeof o !== 'string' && o.card ? `<div class="q-face">${face(o.card, 'normal')}</div>` : '';
      return `<button class="q-opt ${on} ${card ? 'has-card' : ''}" data-q-opt="${i}">${card}<span>${esc(optLabel(o))}</span>${badge}</button>`;
    }).join('');
    const n = qState.picked.length;
    const ready = n >= min && n <= max;
    const hint = isOrder ? 'Toque na ordem desejada (a primeira fica em cima).'
      : single ? '' : `Escolha ${min === max ? min : `de ${min} a ${max}`}.`;
    return `${head}${hint ? `<p class="q-hint">${hint}</p>` : ''}
      <div class="q-opts ${anyCards ? 'cards' : ''}">${items}</div>
      <div class="q-actions">
        ${(q.min ?? 1) === 0 && !isOrder ? '<button class="arena-btn secondary" data-q-none>Nenhum</button>' : ''}
        ${isOrder ? '<button class="arena-btn secondary" data-q-keep>Manter ordem</button>' : ''}
        ${!single ? `<button class="arena-btn primary" data-q-submit ${ready ? '' : 'disabled'}>Confirmar</button>` : ''}
      </div>`;
  }

  function answer(extra: { indices?: number[]; value?: boolean; text?: string; amounts?: number[] }) {
    const q = client?.state?.question;
    if (!q || !client) return;
    stopPresentation();
    client.send({ type: 'answer', id: q.id, ...extra });
    qState = null;
    $('#fQuestion').hidden = true;
  }

  // ---------- Desenho ----------
  function render() { renderTable(true); }
  function renderTable(ingest: boolean) {
    const s = client?.state;
    if (!s || s.type !== 'state') return;
    autoPass.observe(s.preferences, !!client?.connected && !disconnected); syncAutoPass();
    const savedFocus = focusSnapshot();
    const scrollPositions = new Map([...root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field')].map(el => [el.id, { left: el.scrollLeft, top: el.scrollTop }]));
    const silently = silentNext || document.hidden;
    if (ingest) {
      const beforeCurrent = timeline.current;
      timeline.ingest(s.matchId ?? s.session?.code ?? 'local', s.events ?? [], { silent: silently, cursor: s.eventCursor });
      silentNext = false;
      if (beforeCurrent && !timeline.current) { clearTimeout(presentationTimer); motion.cancelPresentation(); }
      if (silently || hasLiveDecision(s)) displayFrame = null;
      if (!timeline.current && timeline.queued) { advancePresentation(); return; }
    }
    if (!validBlockSelection(s, selectedBlocker)) selectedBlocker = null;
    const visual = stateWithFrame(s, displayFrame);
    if (!validAttackSelection(s, selectedAttacker)) selectedAttacker = null;
    const { me, opponents } = tablePlayers(visual);
    const opp = opponents[0];
    const multiplayer = visual.players.length > 2;
    const arena = root.querySelector<HTMLElement>('.arena')!;
    arena.classList.toggle('multiplayer', multiplayer);
    arena.classList.toggle('commander-game', s.config?.format === 'commander');
    arena.style.setProperty('--opponent-count', String(opponents.length));
    if (!me || !opp) return;
    if (s.input.attacking || s.input.blocking || s.input.selection) motion.cancelPresentation();
    motion.capture();

    $('#fOpponents').hidden = !multiplayer;
    setHTML($('#fOpponents'), multiplayer ? opponents.map((player, i) => opponentSeat(visual, player, i)).join('') : '');
    const command = $('#fCommand');
    command.hidden = !(me.commanders?.length);
    setHTML(command, command.hidden ? '' : `<span class="command-heading">Comando</span><div class="command-track">${commandCards(s, me)}</div>${damageButton(me)}`);
    setHTML($('#fOppHand'), multiplayer ? '' : Array.from({ length: opp.handCount }, (_, i) => {
      const off = i - (opp.handCount - 1) / 2;
      return `<div class="back" style="--rot:${-off * 3}deg;--dy:${-off * off * 1.5}px"></div>`;
    }).join(''));
    setHTML($('#fOppAvatar'), multiplayer ? '' : avatar(visual, opp, 1));
    setHTML($('#fMeAvatar'), avatar(visual, me, 0));
    setHTML($('#fOppPiles'), multiplayer ? '' : piles(visual, opp) + (opp.commanders?.length ? `<div class="duel-command">${commandCards(s, opp)}${damageButton(opp)}</div>` : ''));
    setHTML($('#fMePiles'), piles(visual, me));
    setHTML($('#fOppLands'), multiplayer ? '' : backRow(visual, opp));
    setHTML($('#fMeLands'), backRow(visual, me));
    setHTML($('#fOppCreatures'), multiplayer ? '' : fieldRow(visual, opp.battlefield.filter(c => !isBackRow(c))));
    setHTML($('#fMeCreatures'), fieldRow(visual, me.battlefield.filter(c => !isBackRow(c))));

    // Cartas do cemitério utilizáveis continuam na mão; o exílio tem seu próprio espaço.
    const extra = outsideHand(s);
    const fan = [...me.hand.map(c => ({ c, tag: '' })), ...extra];
    const n = fan.length;
    $('#fHand').classList.toggle('crowded', n > 7);
    setHTML($('#fHand'), fan.map(({ c, tag }, i) => {
      const off = i - (n - 1) / 2;
      const sel = tag || usable(s, c.id) ? 'playable' : '';
      const selected = selectedForInput(s, c.id);
      const openingSelected = !!s.input.openingSelected?.includes(c.id);
      const openingSelection = s.input.opening === 'mulligan-bottom' ? ` aria-pressed="${openingSelected}"` : s.input.selection && (usable(s, c.id) || selected) ? ` aria-pressed="${selected}"` : '';
      // Selo do custo acima do canto esquerdo: no leque, a carta seguinte cobre o canto direito, onde fica o custo impresso.
      const cost = !c.faceDown && c.manaCost ? `<div class="hcost" aria-hidden="true">${manaHTML(c.manaCost)}</div>` : '';
      const where = tag ? `<div class="hzone">${esc(tag)}</div>` : '';
      return `<div class="hand-slot"><div class="hcard ${sel}${tag ? ' outside' : ''}${openingSelected ? ' opening-selected' : ''}${selected ? ' choice-selected' : ''}" data-fid="${c.id}" role="button" tabindex="0"${openingSelection} aria-label="${esc(label(c))}${tag ? ` (${esc(tag)})` : ''}"
        style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${face(c, 'normal')}${cost}${where}${selectedBadge(s, c)}</div>${inspectButton(c)}</div>`;
    }).join(''));

    renderExileShelf(s);
    renderActivity();

    // De quem é o turno: etiqueta no trilho de fases e brilho na metade da mesa do jogador ativo.
    const active = s.gameOver ? null : visual.activePlayer === me.id ? 'mine' : visual.activePlayer === opp.id ? 'theirs' : null;
    root.querySelector('.field.me')!.classList.toggle('turn', active === 'mine');
    root.querySelector('.field.opp')!.classList.toggle('turn', active === 'theirs');
    setHTML($('#fPhases'), phaseHudHTML(visual));

    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    const pc = s.input.card ?? s.input.targeting?.card;
    const promptCard = !s.input.suspendCast && pc && !pc.faceDown && pc.name && !findCard(pc.id, false)
      ? `<div class="prompt-card" data-peek="${pc.id}">${face(pc, 'normal')}</div>` : '';
    const opening = s.input.opening;
    const prompt = s.input.attacking ? selectedAttacker ? `${label(findCard(selectedAttacker.attacker)!)}: escolha quem atacar. Escolher o defensor atual remove esse ataque.` : 'Escolha uma criatura sua e depois o jogador ou a permanente que ela vai atacar.'
      : s.input.suspendCast ? 'Suspender: conjure agora sem pagar o custo de mana ou deixe a carta no exílio.'
      : s.input.blocking ? selectedBlocker ? `${label(findCard(selectedBlocker.blocker)!)}: escolha o atacante. Se já estiver bloqueando esse atacante, o clique remove o bloqueio.` : 'Escolha uma criatura sua e depois o atacante que ela vai bloquear.'
      : s.input.priority && !s.input.paying && !s.input.targeting ? '' : opening === 'starting-player' || opening === 'play-draw' || opening === 'mulligan' || (opening === 'mulligan-bottom' && s.input.openingReturnCount !== undefined) ? ''
      : opening === 'mulligan-bottom' ? s.input.message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`) : s.input.message;
    $('#fAction').classList.toggle('suspend-choice', !!s.input.suspendCast);
    const decision = cardDecision(s);
    $('#fAction').classList.toggle('card-decision', !!decision);
    $('#fAction').classList.toggle('hand-decision', !!decision?.inHand);
    root.querySelector('.arena')!.classList.toggle('has-hand-decision', !!decision?.inHand);
    const instruction = decision ? selectionMessage(prompt) : prompt;
    const lines = instruction.split('\n');
    const heading = decision ? `<h2 class="decision-heading">${esc(lines.length > 1 ? lines.shift()! : 'Sua escolha')}</h2>` : '';
    const selectionCount = decision ? `<div class="decision-progress" role="status"><strong>${esc(decision.progress)}</strong><span>${esc(decision.instruction)}</span></div>` : '';
    setHTML($('#fAction'), `${promptCard}<div class="decision-copy">${heading}<div class="prompt">${richText(lines.join('\n')).replace(/\n/g, '<br>')}</div></div>${selectionCount}${attackChoices(s)}<div class="btns">${buttons(s)}</div>`);
    announce(instruction ? `${instruction}${decision ? ` ${decision.progress}. ${decision.instruction}` : ''}` : (opening === 'play-draw' || opening === 'starting-player' ? 'Escolha quem joga primeiro.' : opening === 'mulligan' ? `Mão inicial: ${me.hand.length} cartas.` : opening === 'mulligan-bottom' ? `Cartas a devolver: ${s.input.openingReturnRemaining ?? s.input.openingReturnCount ?? 0}.` : ''));

    const qEl = $('#fQuestion');
    if (s.question && !s.gameOver) {
      setHTML(qEl, `<div class="question" data-qid="${s.question.id}" role="dialog" aria-modal="true" aria-label="${esc(s.question.title)}">${questionHTML(s.question)}</div>`);
      qEl.hidden = false;
    } else {
      qEl.hidden = true;
      qState = null;
    }

    if (s.turn !== lastTurn && !s.gameOver && s.turn > 0) {
      lastTurn = s.turn;
      const el = $('#fBanner');
      el.textContent = s.activePlayer === s.you ? 'Seu turno' : multiplayer ? `Turno de ${s.players.find(p => p.id === s.activePlayer)?.name ?? 'outro jogador'}` : 'Turno do oponente';
      el.className = `banner ${s.activePlayer === s.you ? 'mine' : 'theirs'}`;
      el.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => { el.hidden = true; }, 1300);
    }

    $('#fRoomTag').textContent = s.room ? `Sala ${s.room.code}` : '';
    $('#fRoomTag').hidden = !s.room;
    // Em rede não dá para recomeçar no meio: a revanche só existe no fim da partida, com os dois de acordo.
    $('#fMenuRematch').hidden = !!s.room || (s.config?.matchLength === 'bo3' && !s.match?.over);
    $('#fSeries').hidden = !s.match;
    $('#fSeries').textContent = s.match ? `Jogo ${s.match.gameNumber} · ${s.match.wins.join(' × ')}` : '';

    const ov = $('#fOverlay');
    if (s.sideboarding && !disconnected && !s.match?.over) {
      setHTML(ov, sideboardingHTML(s));
      ov.hidden = false;
    } else if (s.gameOver && !disconnected) {
      const abandoned = !!s.match?.abandoned;
      const won = !abandoned && s.winner === me.name;
      const html = `<div role="dialog" aria-modal="true" aria-label="Resultado da partida" class="result ${won ? 'win' : !abandoned && s.winner ? 'lose' : 'draw'}${ov.hidden ? '' : ' still'}">
        <h2>${abandoned ? 'Partida encerrada' : won ? 'Vitória' : s.winner ? 'Derrota' : 'Empate'}</h2><p>${abandoned ? `Placar: ${s.match!.wins.join(' × ')}` : `Turno ${s.turn}${s.winner ? ` · ${esc(s.winner)} venceu` : ''}`}</p>
        ${rematchNote(s)}
        <div class="result-btns">${rematchButton(s)}<button class="arena-btn secondary" data-ui="exit">Início</button></div>
      </div>`;
      if (ov.hidden || ov.dataset.html !== html) { ov.innerHTML = html; ov.dataset.html = html; }
      ov.hidden = false;
    } else if (!disconnected) { ov.hidden = true; ov.dataset.html = ''; }

    if (zoneOf !== null || groupIds) zoneView(s);
    root.querySelectorAll<HTMLElement>('[data-fid],[data-pid],[data-mana]').forEach(el => { el.dataset.gen = String(el.closest('.field,.avatar-slot') ? visual.input.gen : s.input.gen); });
    // Covered identical copies stay reachable through the group chooser, without dozens of duplicate Tab stops.
    root.querySelectorAll<HTMLElement>('.field .stack').forEach(stack => {
      const slots = [...stack.querySelectorAll<HTMLElement>(':scope > .slot')];
      slots.slice(0, -1).forEach(slot => slot.querySelectorAll<HTMLElement>('[tabindex],.inspect-card').forEach(el => { el.tabIndex = -1; }));
    });
    root.querySelectorAll<HTMLElement>('.row, .hand, .exile-shelf-track, .table-seat > .field').forEach(el => { const position = scrollPositions.get(el.id); el.scrollLeft = position?.left ?? 0; el.scrollTop = position?.top ?? 0; });
    applyOpeningPresentation(root, s);
    restoreFocus(savedFocus);
    syncModal();
    layoutExileShelf();
    layoutCardDecision();
    layoutStack();
    syncSeatScroll();
    drawBlockArrows(visual);
    motion.play({ silent: silently || suppressOpeningPreview(s) || !!s.input.blocking || !!s.input.selection, semantic: !!s.events });
    drawTargetArrows(visual);
    lastDamage = new Map(s.players.flatMap(p => p.battlefield.map(c => [c.id, c.damage ?? 0] as [number, number])));
  }

  function rematchButton(s: FState) {
    const r = s.room;
    if (!r) return '<button class="arena-btn primary" data-ui="rematch">Jogar de novo</button>';
    const mine = r.players[r.seat];
    const others = r.players.filter((_, index) => index !== r.seat);
    if (!others.length || others.some(p => !p.connected)) return '';
    if (mine?.rematch) return `<button class="arena-btn primary" disabled>${others.length > 1 ? 'Aguardando os jogadores…' : 'Aguardando o oponente…'}</button>`;
    return `<button class="arena-btn primary" data-ui="rematch">${others.some(p => p.rematch) ? 'Aceitar revanche' : 'Pedir revanche'}</button>`;
  }

  function rematchNote(s: FState) {
    const room = s.room;
    if (!room) return '';
    return room.players.filter((_, index) => index !== room.seat).map(other => !other.connected ? `<p class="q-hint">${esc(other.name)} saiu da sala.</p>` : other.rematch ? `<p class="q-hint">${esc(other.name)} quer jogar de novo.</p>` : '').join('');
  }

  function findCard(id: number, withPrompt = true): FCard | undefined {
    const s = client?.state;
    if (!s) return undefined;
    for (const p of stateWithFrame(s, displayFrame).players) {
      for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...(p.commandZone ?? []), ...(p.emblems ?? [])]) if (c.id === id) return c;
    }
    const onStack = s.stack.find(si => si.source?.id === id)?.source;
    if (onStack) return onStack;
    if (!withPrompt) return undefined;
    if (s.input.card?.id === id) return s.input.card;
    if (s.input.suspendCast?.card.id === id) return s.input.suspendCast.card;
    for (const o of s.question?.options ?? []) if (typeof o !== 'string' && o.card?.id === id) return o.card;
    return undefined;
  }

  function showPreview(c: FCard | undefined, trigger?: HTMLElement, pinned = false) {
    if (!pinned && (stackGalleryOpen || trigger?.closest('#fStack') || (client?.state && suppressOpeningPreview(client.state)))) return;
    if (!c || c.faceDown || !c.name) { hideCardPreview(); return; }
    const source = c.emblem ? emblemSource(c) : c.name;
    const card = { ...c, name: c.emblem ? emblemLabel(c) : c.name,
      image: c.image ?? image(source, 'normal'),
      text: ptOf(c.name)?.text || c.text,
      typeLine: c.emblem ? 'Emblema' : ptOf(c.name)?.type_line || c.typeLine };
    if (pinned) inspectCard(card, trigger); else showCardPreview(card, trigger);
  }
  function cardFromElement(el: HTMLElement): FCard | undefined {
    if (el.dataset.event) return timeline.history.find(event => event.seq === Number(el.dataset.event))?.card;
    const stackId = el.dataset.stack ?? el.dataset.stackInspect;
    if (stackId !== undefined && client?.state) return (el.closest('#fStackGallery') ? client.state.stack : stackPresentation(client.state, timeline.current?.event).stack).find(item => item.id === Number(stackId))?.source;
    const id = el.dataset.inspect ?? el.dataset.fid ?? el.dataset.peek;
    return id === undefined ? undefined : findCard(Number(id));
  }

  function notice(text: string, error = false) {
    if (error && client?.state?.sideboarding) { sideboardError = text; sideboardBusy = false; render(); }
    const el = document.createElement('div');
    el.className = `toast ${error ? 'error' : ''}`;
    el.textContent = text;
    $('#fToasts').append(el);
    setTimeout(() => el.classList.add('out'), 4100);
    setTimeout(() => el.remove(), 4500);
  }

  function sendInputAction(act: 'ok' | 'cancel' | 'pass-turn', gen: number) {
    const s = client?.state;
    if (!client || !s || disconnected || gen !== s.input.gen || s.question) return;
    if (act === 'pass-turn' ? !s.input.priority || !s.input.ok.enabled || s.input.paying || s.input.targeting || s.activePlayer !== s.you || !!s.stack.length : !s.input[act].enabled) return;
    if (gen === clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
    clickedGen = gen; clickedAt = Date.now(); selectedBlocker = null;
    stopPresentation(); hideCardPreview(true);
    client.send({ type: act, gen });
    render();
    setTimeout(() => { if (clickedGen === gen) render(); }, CLICK_LOCK_MS + 50);
  }

  // ---------- Eventos ----------
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    if (ui === 'stack-size') { stackMinimized = !stackMinimized; hideCardPreview(true); renderTable(false); return; }
    if (ui === 'row-scroll') {
      const control = t.closest<HTMLElement>('[data-scroll-row]')!;
      const row = document.getElementById(control.dataset.scrollRow!);
      if (row) row.scrollBy({ left: Number(control.dataset.scrollDirection) * Math.max(60, row.clientWidth * .75), behavior: 'smooth' });
      return;
    }
    if (!t.closest('#fMenu') && ui !== 'menu') setMenu(false);
    if (ui === 'stack-close' || t.id === 'fStackGallery') { closeStackGallery(); return; }
    if (ui === 'stack-replay') {
      const pile = t.closest<HTMLElement>('[data-stack-replay]');
      if (pile) showPreview(cardFromElement(pile), pile, true);
      return;
    }
    if (ui === 'stack-open') {
      const s = client?.state;
      if (!s?.stack.length || s.question || s.gameOver || s.sideboarding || disconnected) return;
      stopPresentation(); hideCardPreview(true); stackGalleryOpen = true; renderTable(false);
      $('#fStackGallery').querySelector<HTMLElement>('.stack-gallery-card.actionable, .stack-gallery-card')?.focus({ preventScroll: true });
      return;
    }
    if (ui === 'settings') { setSettings(true); return; }
    if (ui === 'settings-close' || t.id === 'fSettings') { setSettings(false); return; }
    if (ui === 'auto-pass') { if (client?.connected && !disconnected) autoPass.change(!autoPass.value); syncAutoPass(); return; }
    if (ui === 'mute') { audio.setMuted(!audio.settings.muted); syncSettings(); return; }
    if (ui === 'sideboard-ready' || ui === 'next-game') {
      const sb = client?.state?.sideboarding;
      if (!client || !sb || sb.ready || sideboardBusy || !sideboardDraft || sb.id !== sideboardDraft.id) return;
      sideboardBusy = true; sideboardError = '';
      if (ui === 'next-game') client.send({ type: 'next-game', id: sb.id });
      else client.send({ type: 'sideboard', id: sb.id, deck: { name: 'Deck da partida', cards: sideboardDraft.main, sideboard: sideboardDraft.sideboard } });
      render(); return;
    }
    const swap = t.closest<HTMLElement>('[data-sb-main],[data-sb-side]');
    if (swap && sideboardDraft && !sideboardBusy && !client?.state?.sideboarding?.ready) {
      const fromMain = swap.hasAttribute('data-sb-main');
      const source = fromMain ? sideboardDraft.main : sideboardDraft.sideboard;
      const target = fromMain ? sideboardDraft.sideboard : sideboardDraft.main;
      const index = Number(fromMain ? swap.dataset.sbMain : swap.dataset.sbSide);
      const entry = source[index];
      if (entry) { const existing = target.find(c => c.name === entry.name); if (existing) existing.count++; else target.push({ name: entry.name, count: 1 }); if (--entry.count === 0) source.splice(index, 1); sideboardError = ''; render(); }
      return;
    }
    const sbInspect = t.closest<HTMLElement>('[data-sb-inspect]');
    if (sbInspect) { inspectCard({ name: sbInspect.dataset.sbInspect }, sbInspect); return; }
    const inspecting = t.closest<HTMLElement>('[data-inspect],[data-event],[data-stack-inspect]');
    if (inspecting) { showPreview(cardFromElement(inspecting), inspecting, true); return; }
    const stackTarget = t.closest<HTMLElement>('[data-stack]');
    if (stackTarget && client?.state) {
      const id = Number(stackTarget.dataset.stack);
      if (!renderedInputIsCurrent(stackTarget)) return;
      if (!client.state.stack.some(item => item.id === id)) return;
      if (!client.state.question && client.state.input.selectableStacks?.includes(id)) {
        stopPresentation(); client.send({ type: 'stack', id, gen: Number(stackTarget.dataset.gen) });
        if (stackGalleryOpen) closeStackGallery();
      } else showPreview(cardFromElement(stackTarget), stackTarget, true);
      return;
    }
    const grouped = t.closest<HTMLElement>('[data-group]');
    if (grouped && client?.state) { groupIds = grouped.dataset.group!.split(',').map(Number); zoneOf = null; zoneView(client.state); return; }
    const purePeek = t.closest<HTMLElement>('[data-peek]');
    if (purePeek && !purePeek.closest('[data-gy]')) { showPreview(cardFromElement(purePeek), purePeek, true); return; }
    const renderedQuestion = t.closest<HTMLElement>('[data-qid]');
    if (renderedQuestion && Number(renderedQuestion.dataset.qid) !== client?.state?.question?.id) return;
    if (ui === 'attack-clear') { selectedAttacker = null; renderTable(false); return; }
    if (ui === 'menu') { setMenu($('#fMenu').hidden); return; }
    if (ui === 'log') { setLog($('#fLogDrawer').hidden, true); return; }
    if (ui === 'fullscreen') { void toggleFullscreen(); return; }
    if (ui === 'exit') {
      if (client?.state?.gameOver || disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { stopPresentation(); hideCardPreview(true); client?.send({ type: 'concede' }); opts.onExit(); }
      return;
    }
    if (ui === 'rematch') { setMenu(false); opts.onRematch(); return; }
    if (ui === 'zone-close' || t.id === 'fZone') { closeZone(); return; }
    const ctr = t.closest<HTMLElement>('[data-ctr]')?.dataset.ctr ?? null;
    if (ctr || openCounter) {
      openCounter = ctr && ctr !== openCounter ? ctr : null;
      render();
      if (ctr) return; // clicar no marcador só mostra o texto, não usa a carta
    }
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { groupIds = null; zoneOf = +gy.dataset.gy!; zoneKind = gy.dataset.zone === 'exile' ? 'exile' : gy.dataset.zone === 'command' ? 'command' : gy.dataset.zone === 'damage' ? 'damage' : 'gy'; zoneView(client.state); return; }

    const opt = t.closest<HTMLElement>('[data-q-opt]');
    if (opt && qState) {
      const q = client.state?.question;
      if (!q) return;
      const i = +opt.dataset.qOpt!;
      const isOrder = q.kind === 'order';
      if (!isOrder && (q.max ?? 1) === 1) { answer({ indices: [i] }); return; }
      const at = qState.picked.indexOf(i);
      if (at >= 0) qState.picked.splice(at, 1);
      else if (isOrder || qState.picked.length < (q.max ?? 1)) qState.picked.push(i);
      render();
      return;
    }
    if (t.closest('[data-q-submit]') && qState) { answer({ indices: qState.picked }); return; }
    if (t.closest('[data-q-none]')) { answer({ indices: [] }); return; }
    if (t.closest('[data-q-keep]')) { answer({ indices: (client.state?.question?.options ?? []).map((_, i) => i) }); return; }
    const conf = t.closest<HTMLElement>('[data-q-confirm]');
    if (conf) { answer({ value: conf.dataset.qConfirm === 'true' }); return; }

    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'ok' || act === 'cancel' || act === 'pass-turn') {
      const control = t.closest<HTMLElement>('[data-act]')!;
      if (!renderedInputIsCurrent(control)) return;
      sendInputAction(act, Number(control.dataset.gen));
      return;
    }
    if (t.closest('.emblem')) return; // fica dentro do retrato, mas não é um clique no jogador
    const mana = t.closest<HTMLElement>('[data-mana]')?.dataset.mana;
    if (mana) { const control = t.closest<HTMLElement>('[data-mana]')!; if (renderedInputIsCurrent(control)) { stopPresentation(); client.send({ type: 'mana', color: mana, gen: Number(control.dataset.gen) }); } return; }
    const defender = t.closest<HTMLElement>('[data-defender]');
    if (defender && client.state) {
      const action = attackPairAction(client.state, selectedAttacker, { id: Number(defender.dataset.defender), kind: defender.dataset.defenderKind === 'card' ? 'card' : 'player' }, Number(defender.dataset.gen));
      if (action) { selectedAttacker = null; stopPresentation(); client.send(action); renderTable(false); }
      return;
    }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl && client.state?.input.attacking && selectedAttacker) {
      const action = attackPairAction(client.state, selectedAttacker, { id: Number(pl.dataset.pid), kind: 'player' }, Number(pl.dataset.gen));
      if (action) { selectedAttacker = null; stopPresentation(); client.send(action); renderTable(false); }
      return;
    }
    if (pl) { if (renderedInputIsCurrent(pl) && client.state?.input.selectablePlayers?.includes(+pl.dataset.pid!)) { stopPresentation(); client.send({ type: 'player', id: +pl.dataset.pid!, gen: Number(pl.dataset.gen) }); } return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (!cd || !renderedInputIsCurrent(cd)) return;
    const s = client.state!;
    const id = Number(cd.dataset.fid), gen = Number(cd.dataset.gen);
    if (s.input.attacking && cd.closest('.field')) {
      if (s.input.attacking.attackers.includes(id)) {
        const selection = { attacker: id, gen };
        const targets = legalAttackTargets(s, selection);
        if (targets.length === 1) {
          const action = attackPairAction(s, selection, targets[0], gen);
          if (action) { selectedAttacker = null; stopPresentation(); hideCardPreview(true); client.send(action); }
          return;
        }
        selectedAttacker = selectedAttacker?.attacker === id ? null : selection;
        hideCardPreview(true); renderTable(false); return;
      }
      const action = attackPairAction(s, selectedAttacker, { id, kind: 'card' }, gen);
      if (action) { selectedAttacker = null; stopPresentation(); client.send(action); renderTable(false); }
      return;
    }
    if (cd.hasAttribute('data-command-card') && !canPlayCommander(s, id, gen)) { showPreview(findCard(id), cd, true); return; }
    if (s.input.blocking && cd.closest('.field')) {
      if (s.input.blocking.blockers.includes(id)) {
        selectedBlocker = selectedBlocker?.blocker === id ? null : { blocker: id, gen };
        hideCardPreview(true); renderTable(false); return;
      }
      if (s.input.blocking.attackers.includes(id)) {
        const action = blockPairAction(s, selectedBlocker, id, gen);
        if (!action) { announce(selectedBlocker ? 'Essa criatura não pode bloquear esse atacante.' : 'Selecione primeiro uma criatura sua para bloquear.'); return; }
        selectedBlocker = null; stopPresentation(); hideCardPreview(true); client.send(action); renderTable(false); return;
      }
      return;
    }
    if (cd.hasAttribute('data-exile-card')) {
      if (s.input.suspendCast?.card.id === id) { sendInputAction('ok', gen); return; }
      if (!canPlayExileCard(s, id, gen) && !canSelectExileCard(s, id, gen)) { showPreview(findCard(id), cd, true); return; }
    }
    // Usar uma carta do cemitério ou do exílio fecha a janela, para a pergunta seguinte aparecer.
    if (cd.closest('#fZone')) closeZone();
    stopPresentation();
    client.send({ type: 'card', id: +cd.dataset.fid!, gen: Number(cd.dataset.gen) });
  });
  root.addEventListener('submit', e => {
    const form = e.target as HTMLElement;
    if (form.matches('[data-q-amount-form]')) {
      e.preventDefault();
      const q = client?.state?.question;
      if (q?.kind !== 'amount' || Number(form.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return;
      const status = amountStatus(q);
      if (status.valid) answer({ amounts: status.amounts });
      return;
    }
    if (!form.matches('[data-q-text]')) return;
    e.preventDefault();
    if (Number((e.target as HTMLElement).closest<HTMLElement>('[data-qid]')?.dataset.qid) !== client?.state?.question?.id) return;
    answer({ text: (root.querySelector('#fQInput') as HTMLInputElement).value });
  });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'fQInput' && qState) qState.text = t.value;
    if (t.hasAttribute('data-q-amount') && qState && client?.state?.question?.kind === 'amount') {
      const q = client.state.question;
      if (Number(t.closest<HTMLElement>('[data-qid]')?.dataset.qid) !== q.id) return;
      qState.amounts[Number(t.dataset.qAmount)] = t.value;
      const status = amountStatus(q);
      $('#fAmountRemaining').textContent = status.text;
      (root.querySelector('[data-q-amount-submit]') as HTMLButtonElement).disabled = !status.valid;
    }
    if (t.id === 'fVolume') { audio.setVolume(Number(t.value) / 100); syncSettings(); }
  });
  root.addEventListener('change', e => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'fPace') { fast = t.value === 'fast'; try { localStorage.setItem('mesa:pace', fast ? 'fast' : 'normal'); } catch { /* Storage is optional. */ } }
  });
  const inspectable = '[data-fid],[data-peek],[data-event],[data-stack],[data-stack-inspect],[data-inspect]';
  root.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (el && !handDrag.active) showPreview(cardFromElement(el), el);
  });
  root.addEventListener('pointerout', e => {
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('focusin', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (el && !handDrag.active) showPreview(cardFromElement(el), el);
  });
  root.addEventListener('focusout', e => {
    const to = e.relatedTarget as HTMLElement | null;
    if (!to?.closest?.(`${inspectable},.card-inspector-preview`)) hideCardPreview();
  });
  root.addEventListener('contextmenu', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>(inspectable);
    if (!el) return;
    e.preventDefault(); showPreview(cardFromElement(el), el, true);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#fSettings').hidden) { e.preventDefault(); setSettings(false); return; }
      if (!$('#fMenu').hidden) { e.preventDefault(); setMenu(false, true); return; }
      if (!$('#fLogDrawer').hidden) { e.preventDefault(); setLog(false, true); return; }
      if (selectedAttacker) { selectedAttacker = null; e.preventDefault(); renderTable(false); return; }
      if (selectedBlocker) { selectedBlocker = null; e.preventDefault(); renderTable(false); return; }
      if (stackGalleryOpen) { e.preventDefault(); closeStackGallery(); return; }
      if (zoneOf !== null || groupIds) { closeZone(); return; }
      hideCardPreview(true);
    }
    const target = e.target as HTMLElement;
    if (stackGalleryOpen && target.matches('.stack-gallery-card') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const cards = [...$('#fStackGallery').querySelectorAll<HTMLElement>('.stack-gallery-card')];
      const index = cards.indexOf(target);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1)));
      e.preventDefault(); cards[next]?.focus({ preventScroll: true }); cards[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); return;
    }
    if (e.key.toLowerCase() === 'i' && !target.matches('input,textarea,select')) {
      const el = target.closest<HTMLElement>(inspectable);
      if (el) { e.preventDefault(); showPreview(cardFromElement(el), el, true); return; }
    }
    if (e.key === 'Tab' && currentModal) {
      const focusable = [...currentModal.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select,[tabindex="0"]')].filter(el => !el.closest('[hidden]'));
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (first && e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (last && !e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    if (e.repeat) return;
    const el = target.closest<HTMLElement>('[data-mana],[data-ctr],[data-fid],[data-pid],[data-gy],[data-peek]');
    if (el && !el.matches('button') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });

  return {
    attach(c, pics) {
      autoPass.reset();
      client = c; portraits = pics; lastTurn = 0; disconnected = false; qState = null; clickedGen = -1; zoneOf = null;
      lastDamage = new Map(); groupIds = null; selectedBlocker = null; selectedAttacker = null;
      stackGalleryOpen = false; stackMinimized = false; $('#fStackGallery').hidden = true;
      handDrag.cancel(); stopPresentation(); timeline.reset(); silentNext = true; hideCardPreview(true);
      sideboardDraft = null; sideboardBusy = false; sideboardError = '';
      motion.reset();
      $('#fOverlay').hidden = true;
      $('#fQuestion').hidden = true;
      $('#fZone').hidden = true;
      syncAutoPass(); syncModal();
    },
    render,
    notice,
    reconnecting(attempt) {
      disconnected = true; autoPass.reset(); syncAutoPass();
      if (stackGalleryOpen) closeStackGallery();
      handDrag.cancel(); stopPresentation(); silentNext = true;
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Reconectando" class="result draw still"><h2>Reconectando…</h2>
        <p>A conexão com a ponte caiu. Voltando à partida${attempt > 1 ? ` (tentativa ${attempt})` : ''}.</p>
        <div class="result-btns"><button class="arena-btn secondary" data-ui="exit">Início</button></div></div>`;
      syncModal();
    },
    disconnected(reason) {
      disconnected = true; autoPass.reset(); syncAutoPass();
      if (stackGalleryOpen) closeStackGallery();
      handDrag.cancel(); stopPresentation(); silentNext = true;
      const room = !!client?.state?.session;
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = `<div role="dialog" aria-modal="true" aria-label="Conexão perdida" class="result draw"><h2>Conexão perdida</h2>
        <p>${reason ? esc(reason) : room ? 'Não consegui voltar sozinho. A partida fica guardada na ponte por alguns minutos.' : 'A ponte do Forge parou de responder.'}</p>
        <div class="result-btns"><button class="arena-btn primary" data-ui="rematch">${room ? 'Reconectar' : 'Tentar de novo'}</button><button class="arena-btn secondary" data-ui="exit">Início</button></div></div>`;
      syncModal();
    },
  };
}
