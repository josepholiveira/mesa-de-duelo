import type { FCard, FOption, FPlayer, FQuestion, FState, ForgeClient } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, pip, richText } from './cardtext';
import { colorFromCost, faceHTML } from './face';
import { createMotion } from './motion';
import { canFullscreen, toggleFullscreen } from './landscape';
import { inspectCard, showCardPreview, hideCardPreview } from './cardInspector';
import { PresentationTimeline, presentationDuration, hasLiveDecision, stateWithFrame, type PresentationEvent, type PresentationFrame } from './presentationTimeline';
import { createGameAudio } from './audio';
import { attachHandDrag } from './handDrag';
import { applyOpeningPresentation, suppressOpeningPreview } from './openingPresentation';
import type { DeckEntry } from '../decks';
import './gameplay.css';

/** Fases do Forge agrupadas nas sete etapas mostradas na lateral. */
const PHASE_GROUP: Record<string, string> = {
  UNTAP: 'untap', UPKEEP: 'upkeep', DRAW: 'draw', MAIN1: 'main1',
  COMBAT_BEGIN: 'combat', COMBAT_DECLARE_ATTACKERS: 'combat', COMBAT_DECLARE_BLOCKERS: 'combat',
  COMBAT_FIRST_STRIKE_DAMAGE: 'combat', COMBAT_DAMAGE: 'combat', COMBAT_END: 'combat',
  MAIN2: 'main2', END_OF_TURN: 'end', CLEANUP: 'end',
};
const PHASES = [
  ['untap', 'Desvirar'], ['upkeep', 'Manutenção'], ['draw', 'Compra'], ['main1', 'Principal 1'],
  ['combat', 'Combate'], ['main2', 'Principal 2'], ['end', 'Final'],
] as const;

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
  attach(client: ForgeClient, portraits: [string | undefined, string | undefined]): void;
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
      <button class="icon-btn" data-ui="menu" aria-label="Menu">☰</button>
      <button class="icon-btn" data-ui="log">Registro</button>
      <button class="icon-btn fs-btn" data-ui="fullscreen" aria-label="Tela cheia" title="Tela cheia"${canFullscreen() ? '' : ' hidden'}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path class="fs-enter" d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><path class="fs-exit" d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/></svg>
      </button>
      <button class="icon-btn" data-ui="settings" aria-expanded="false" aria-controls="fSettings">Som e ritmo</button>
      <span class="room-tag" id="fRoomTag" hidden></span><span class="series-score" id="fSeries" hidden></span>
    </div>
    <div class="menu" id="fMenu" hidden>
      <button class="btn" data-ui="rematch" id="fMenuRematch">Recomeçar partida</button>
      <button class="btn" data-ui="exit">Desistir e voltar ao início</button>
    </div>
    <section class="game-settings" id="fSettings" aria-label="Som e ritmo da partida" hidden>
      <div class="setting-line"><h2>Som e ritmo</h2><button class="icon-btn" data-ui="settings" aria-label="Fechar configurações">Fechar</button></div>
      <div class="setting-line"><label for="fMute">Efeitos sonoros</label><button class="icon-btn" id="fMute" data-ui="mute" aria-pressed="true">Desligados</button></div>
      <label for="fVolume">Volume <input id="fVolume" type="range" min="0" max="100" step="5" value="35"></label>
      <label for="fPace">Ritmo das jogadas <select id="fPace"><option value="normal">Normal</option><option value="fast">Rápido sem resposta</option></select></label>
      <p>O ritmo afeta a apresentação. Suas respostas ficam disponíveis assim que o jogo permite.</p>
    </section>
    <aside class="log-drawer" id="fLogDrawer" hidden><div class="stack-heading"><h2>Histórico da partida</h2><button class="icon-btn" data-ui="log" aria-label="Fechar histórico">Fechar</button></div><ul id="fLog"></ul></aside>

    <div class="opp-hand" id="fOppHand"></div>
    <div class="avatar-slot opp" id="fOppAvatar"></div>
    <div class="piles opp" id="fOppPiles"></div>

    <section class="field opp" aria-label="Campo do oponente">
      <div class="row lands" id="fOppLands"></div>
      <div class="row creatures" id="fOppCreatures"></div>
    </section>
    <div class="divider" aria-hidden="true"></div>
    <svg class="combat-arrows" id="fArrows" aria-hidden="true"></svg>
    <section class="field me" aria-label="Seu campo">
      <div class="row creatures" id="fMeCreatures"></div>
      <div class="row lands" id="fMeLands"></div>
    </section>

    <div class="avatar-slot me" id="fMeAvatar"></div>
    <div class="piles me" id="fMePiles"></div>
    <div class="hand" id="fHand"></div>

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
  let portraits: [string | undefined, string | undefined] = [undefined, undefined];
  let lastTurn = 0;
  let zoneOf: number | null = null;
  let zoneKind: 'gy' | 'exile' = 'gy';
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
  let stackGalleryOpen = false;
  let sideboardDraft: { id: number; main: DeckEntry[]; sideboard: DeckEntry[] } | null = null;
  let sideboardError = '';
  let sideboardBusy = false;
  const timeline = new PresentationTimeline();
  const audio = createGameAudio();
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
  const inspectButton = (c: FCard) => !c.faceDown && c.name ? `<button class="inspect-card" data-inspect="${c.id}" aria-label="Inspecionar ${esc(label(c))}">${inspectIcon}</button>` : '';

  function syncSettings() {
    const settings = audio.settings;
    const mute = $('#fMute');
    mute.textContent = settings.muted ? 'Desligados' : 'Ligados';
    mute.setAttribute('aria-pressed', String(!settings.muted));
    ($('#fVolume') as HTMLInputElement).value = String(Math.round(settings.volume * 100));
    ($('#fPace') as HTMLSelectElement).value = fast ? 'fast' : 'normal';
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
    const active = ['#fOverlay', '#fQuestion', '#fZone', '#fStackGallery'].map(id => $(id)).find(el => !el.hidden) ?? null;
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
      for (const c of p.exile) if (canUse(s, c)) out.push({ c, tag: c.plotted ? 'Tramada' : mine ? 'Exílio' : `Exílio de ${p.name}` });
    }
    return out;
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
  function drawBlockArrows(s: FState) {
    const svg = root.querySelector<SVGSVGElement>('#fArrows')!;
    const box = svg.getBoundingClientRect();
    const rectOf = (id: number) => root.querySelector(`.field [data-fid="${id}"]`)?.getBoundingClientRect();
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
    const q = (sel: string) => root.querySelector(sel)?.getBoundingClientRect();
    const targetRect = (kind: 'c' | 'p', id: number) =>
      kind === 'p' ? q(`.avatar-slot [data-pid="${id}"]`) : q(`.field [data-fid="${id}"]`) ?? q(`#fHand [data-fid="${id}"]`);
    const links: { from: DOMRect; to: DOMRect; cls: string }[] = [];
    const add = (from: DOMRect | undefined, t: { cards?: number[]; players?: number[] } | undefined, cls: string) => {
      if (!from || !t) return;
      for (const id of t.cards ?? []) { const to = targetRect('c', id); if (to) links.push({ from, to, cls }); }
      for (const id of t.players ?? []) { const to = targetRect('p', id); if (to) links.push({ from, to, cls }); }
    };
    s.stack.forEach(si => {
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

  function layoutStack() {
    const arena = root.querySelector<HTMLElement>('.arena')!;
    const panel = $('#fStack');
    arena.classList.remove('stack-tight');
    arena.style.removeProperty('--stack-active-width');
    for (const property of ['--stack-width', 'top', 'transform']) panel.style.removeProperty(property);
    if (panel.hidden) return;
    const pile = panel.querySelector<HTMLElement>('.stack-pile');
    if (!pile) return;
    const action = $('#fAction').getBoundingClientRect();
    const natural = panel.getBoundingClientRect();
    if (natural.bottom + 12 <= action.top) return;
    const arenaBox = arena.getBoundingClientRect();
    const phases = $('#fPhases').getBoundingClientRect();
    const topSafe = phases.height ? phases.bottom - arenaBox.top + 12 : 60;
    const available = Math.max(70, action.top - arenaBox.top - topSafe - 18);
    const width = Math.min(pile.getBoundingClientRect().width, available * 488 / 680);
    arena.classList.add('stack-tight');
    arena.style.setProperty('--stack-active-width', `${width}px`);
    panel.style.setProperty('--stack-width', `${width}px`);
    panel.style.top = `${action.top - arenaBox.top - width * 680 / 488 - 18}px`;
    panel.style.transform = 'none';
  }

  window.addEventListener('resize', () => {
    const s = client?.state;
    if (s?.type === 'state' && !root.hidden) { layoutStack(); const visual = stateWithFrame(s, displayFrame); drawBlockArrows(visual); drawTargetArrows(visual); }
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
    const dmg = c.damage ?? 0;
    if (dmg > (lastDamage.get(c.id) ?? 0)) inner.push('hit');
    // Ataque a um planeswalker: o atacante mostra o alvo e o planeswalker mostra quem o ataca.
    const target = ci.attack ? byId.get(s.combat[ci.attack - 1].defender ?? -1) : undefined;
    const attackers = s.combat.map((x, i) => (x.defender === c.id ? i + 1 : 0)).filter(Boolean);
    if (attackers.length) slot.push('attacked');
    let tag = '';
    if (ci.attack) tag = `<span class="tag atk">${ICON_SWORD}${ci.attack}${target ? ` ▸ ${esc(label(target).split(',')[0])}` : ''}</span>`;
    else if (ci.block) tag = `<span class="tag blk">${ICON_SHIELD}${ci.block}</span>`;
    else if (attackers.length) tag = `<span class="tag atk">Atacado ${ICON_SWORD}${attackers.join(',')}</span>`;
    else if (c.creature && c.sick && c.controller === s.activePlayer) tag = '<span class="tag zzz">zZ</span>';
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
      `<div class="att${usable(s, a.id) ? ' actionable' : ''}" data-fid="${a.id}" role="button" tabindex="0" style="--i:${i + 1}" aria-label="${esc(label(a))}, presa a ${esc(label(c))}">${face(a, 'small')}</div>`).join('');
    const style = attached.length ? ` style="--atts:${attached.length}"` : '';
    if (attached.length) slot.push('has-att');
    return `<div class="${slot.join(' ')}"${style}>${atts}<div class="${inner.join(' ')}" data-fid="${c.id}" role="button" tabindex="0" aria-label="${esc(aria)}">${face(c, 'small')}${badges}${tag}${kwHTML}${pt}${counters}</div>${inspectButton(c)}</div>`;
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
      const alone = atts.has(c.id) || c.faceDown || c.attacking || c.blocking || ci.attack || ci.block || s.combat.some(x => x.defender === c.id);
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
    if (s.input.selectablePlayers?.includes(p.id)) cls.push('selectable-player');
    // Pagando um custo: cada símbolo da sua reserva vira um botão que gasta aquela mana.
    const spend = p.id === s.you && !!s.input.paying;
    const pool = Object.entries(p.pool).flatMap(([c, n]) => Array(n).fill(spend
      ? `<button class="pool-mana" data-mana="${c}" aria-label="Usar mana ${c} da reserva">${pip(c)}</button>` : pip(c))).join('');
    const art = portraits[idx];
    const offline = s.room?.players.find(rp => rp.name === p.name)?.connected === false;
    return `<div class="${cls.join(' ')}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}, ${p.life} de vida${offline ? ', desconectado' : ''}">
      <div class="portrait" ${art ? `style="background-image:url('${art}')"` : ''}></div>
      <div class="life">${p.life}</div>
      <div class="pname">${esc(p.name)}</div>
      ${pool ? `<div class="pool${spend ? ' spend' : ''}">${pool}</div>` : ''}
      ${emblems(p)}
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

  function zoneView(s: FState) {
    const el = $('#fZone');
    const p = s.players.find(pl => pl.id === zoneOf);
    if (!p && !groupIds) { closeZone(); return; }
    const title = groupIds ? 'Cartas do grupo' : zoneKind === 'exile' ? 'Exílio' : 'Cemitério';
    const cards = groupIds ? groupIds.map(id => findCard(id)).filter((c): c is FCard => !!c) : [...(zoneKind === 'exile' ? p!.exile : p!.graveyard)].reverse();
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
  function stackPanel(s: FState) {
    const count = s.stack.length;
    const top = s.stack[0];
    if (!top) return '';
    return `<div class="stack-heading"><h2>Pilha</h2><span class="stack-count">${count}</span></div>
      <button class="stack-pile" data-ui="stack-open" data-stack="${top.id}" data-gen="${s.input.gen}" aria-haspopup="dialog" aria-expanded="${stackGalleryOpen}" aria-controls="fStackGallery" aria-label="Abrir a pilha: ${count} ${count === 1 ? 'efeito' : 'efeitos'}. ${top.source ? esc(label(top.source)) : 'O efeito do topo'} resolve primeiro.">
        ${s.stack.slice(0, 4).map((si, i) => `<div class="stack-layer ${si.controller === s.you ? 'mine' : 'theirs'}${s.input.selectableStacks?.includes(si.id) ? ' actionable' : ''}" style="--depth:${i}" ${i ? `data-stack="${si.id}"` : ''} aria-hidden="true">${stackFace(si)}</div>`).join('')}
        <span class="stack-top-label">Resolve primeiro</span>
      </button><span class="stack-open-hint">Clique para ver a pilha</span>`;
  }
  function renderStackGallery(s: FState) {
    if (!stackGalleryOpen) return;
    const boardDecision = !s.input.selectableStacks?.length && (!!s.input.paying || !!s.input.targeting || !!s.input.selectablePlayers?.length || !!s.input.selectable.length || (!s.input.priority && (s.input.ok.enabled || s.input.cancel.enabled)));
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
    const s = stateWithFrame(authoritative, displayFrame);
    const el = $('#fStack');
    const focused = focusSnapshot();
    const scrollTop = el.scrollTop;
    el.hidden = !s.stack.length;
    root.querySelector('.forge')!.classList.toggle('has-stack', !!s.stack.length);
    setHTML(el, s.stack.length ? stackPanel(s) : '');
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
    const handCount = s.players.find(p => p.id === s.you)?.hand.length ?? 0;
    const ok = s.input.opening === 'play-draw' ? { ...s.input.ok, label: 'Eu jogo' }
      : s.input.opening === 'mulligan' ? { ...s.input.ok, label: `Manter ${handCount}` } : s.input.ok;
    const cancel = s.input.opening === 'play-draw' ? { ...s.input.cancel, label: 'Oponente joga' } : s.input.cancel;
    const waiting = clickedGen === s.input.gen && Date.now() - clickedAt < CLICK_LOCK_MS;
    const b = (act: string, btn: { label: string; enabled: boolean }, kind: string) =>
      btn.label ? `<button class="arena-btn ${kind}" data-act="${act}" data-gen="${s.input.gen}" ${btn.enabled && !waiting ? '' : 'disabled'}>${esc(btn.label)}</button>` : '';
    const mine = s.activePlayer === s.you;
    if (!ok.enabled && !cancel.enabled) return `<button class="arena-btn waiting" disabled>${s.input.opening ? 'Aguardando confirmação…' : mine ? 'Aguardando o jogo…' : 'Oponente jogando…'}</button>`;
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
    const savedFocus = focusSnapshot();
    const scrollPositions = new Map([...root.querySelectorAll<HTMLElement>('.row, .hand')].map(el => [el.id, el.scrollLeft]));
    const silently = silentNext || document.hidden;
    if (ingest) {
      const beforeCurrent = timeline.current;
      timeline.ingest(s.matchId ?? s.session?.code ?? 'local', s.events ?? [], { silent: silently, cursor: s.eventCursor });
      silentNext = false;
      if (beforeCurrent && !timeline.current) { clearTimeout(presentationTimer); motion.cancelPresentation(); }
      if (silently || hasLiveDecision(s)) displayFrame = null;
      if (!timeline.current && timeline.queued) { advancePresentation(); return; }
    }
    const visual = stateWithFrame(s, displayFrame);
    const meIdx = Math.max(0, visual.players.findIndex(p => p.id === visual.you));
    const me = visual.players[meIdx];
    const opp = visual.players[1 - meIdx];
    if (!me || !opp) return;
    motion.capture();

    setHTML($('#fOppHand'), Array.from({ length: opp.handCount }, (_, i) => {
      const off = i - (opp.handCount - 1) / 2;
      return `<div class="back" style="--rot:${-off * 3}deg;--dy:${-off * off * 1.5}px"></div>`;
    }).join(''));
    setHTML($('#fOppAvatar'), avatar(visual, opp, 1));
    setHTML($('#fMeAvatar'), avatar(visual, me, 0));
    setHTML($('#fOppPiles'), piles(visual, opp));
    setHTML($('#fMePiles'), piles(visual, me));
    setHTML($('#fOppLands'), backRow(visual, opp));
    setHTML($('#fMeLands'), backRow(visual, me));
    setHTML($('#fOppCreatures'), fieldRow(visual, opp.battlefield.filter(c => !isBackRow(c))));
    setHTML($('#fMeCreatures'), fieldRow(visual, me.battlefield.filter(c => !isBackRow(c))));

    // Na ponta da mão, as cartas do cemitério e do exílio que dá para usar agora, cada uma com a etiqueta da zona.
    const extra = outsideHand(s);
    const fan = [...me.hand.map(c => ({ c, tag: '' })), ...extra];
    const n = fan.length;
    $('#fHand').classList.toggle('crowded', n > 7);
    setHTML($('#fHand'), fan.map(({ c, tag }, i) => {
      const off = i - (n - 1) / 2;
      const sel = tag || usable(s, c.id) ? 'playable' : '';
      const openingSelected = !!s.input.openingSelected?.includes(c.id);
      const openingSelection = s.input.opening === 'mulligan-bottom' ? ` aria-pressed="${openingSelected}"` : '';
      // Selo do custo acima do canto esquerdo: no leque, a carta seguinte cobre o canto direito, onde fica o custo impresso.
      const cost = !c.faceDown && c.manaCost ? `<div class="hcost" aria-hidden="true">${manaHTML(c.manaCost)}</div>` : '';
      const where = tag ? `<div class="hzone">${esc(tag)}</div>` : '';
      return `<div class="hand-slot"><div class="hcard ${sel}${tag ? ' outside' : ''}${openingSelected ? ' opening-selected' : ''}" data-fid="${c.id}" role="button" tabindex="0"${openingSelection} aria-label="${esc(label(c))}${tag ? ` (${esc(tag)})` : ''}"
        style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${face(c, 'normal')}${cost}${where}</div>${inspectButton(c)}</div>`;
    }).join(''));

    renderActivity();

    const group = PHASE_GROUP[visual.phase ?? ''] ?? '';
    // De quem é o turno: etiqueta no trilho de fases e brilho na metade da mesa do jogador ativo.
    const active = s.gameOver ? null : visual.activePlayer === me.id ? 'mine' : visual.activePlayer === opp.id ? 'theirs' : null;
    root.querySelector('.field.me')!.classList.toggle('turn', active === 'mine');
    root.querySelector('.field.opp')!.classList.toggle('turn', active === 'theirs');
    const owner = active ? `<div class="turn-owner ${active}">${active === 'mine' ? 'Seu turno' : `Turno de ${esc(opp.name)}`}</div>` : '';
    $('#fPhases').innerHTML = `<div class="turn-no">Turno ${visual.turn}</div>${owner}` + PHASES.map(([k, l]) =>
      `<div class="ph ${group === k ? 'on' : ''} ${visual.activePlayer === s.you ? 'mine' : 'theirs'}"><span class="dot"></span>${l}</div>`).join('');

    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    const pc = s.input.card ?? s.input.targeting?.card;
    const promptCard = pc && !pc.faceDown && pc.name && !findCard(pc.id, false)
      ? `<div class="prompt-card" data-peek="${pc.id}">${face(pc, 'normal')}</div>` : '';
    const opening = s.input.opening;
    const prompt = s.input.priority && !s.input.paying && !s.input.targeting ? '' : opening === 'play-draw' || opening === 'mulligan' || (opening === 'mulligan-bottom' && s.input.openingReturnCount !== undefined) ? ''
      : opening === 'mulligan-bottom' ? s.input.message.replace(/(\d+)\s+carta\(s\)/g, (_, n: string) => `${n} ${Number(n) === 1 ? 'carta' : 'cartas'}`) : s.input.message;
    setHTML($('#fAction'), `${promptCard}<div class="prompt">${richText(prompt).replace(/\n/g, '<br>')}</div><div class="btns">${buttons(s)}</div>`);
    announce(prompt || (opening === 'play-draw' ? 'Escolha quem joga primeiro.' : opening === 'mulligan' ? `Mão inicial: ${me.hand.length} cartas.` : opening === 'mulligan-bottom' ? `Cartas a devolver: ${s.input.openingReturnRemaining ?? s.input.openingReturnCount ?? 0}.` : ''));

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
      el.textContent = s.activePlayer === s.you ? 'Seu turno' : 'Turno do oponente';
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
    root.querySelectorAll<HTMLElement>('.row, .hand').forEach(el => { el.scrollLeft = scrollPositions.get(el.id) ?? 0; });
    applyOpeningPresentation(root, s);
    restoreFocus(savedFocus);
    syncModal();
    layoutStack();
    drawBlockArrows(visual);
    motion.play({ silent: silently || suppressOpeningPreview(s), semantic: !!s.events });
    drawTargetArrows(visual);
    lastDamage = new Map(s.players.flatMap(p => p.battlefield.map(c => [c.id, c.damage ?? 0] as [number, number])));
  }

  function rematchButton(s: FState) {
    const r = s.room;
    if (!r) return '<button class="arena-btn primary" data-ui="rematch">Jogar de novo</button>';
    const mine = r.players[r.seat];
    const other = r.players[1 - r.seat];
    if (!other?.connected) return '';
    if (mine?.rematch) return '<button class="arena-btn primary" disabled>Aguardando o oponente…</button>';
    return `<button class="arena-btn primary" data-ui="rematch">${other.rematch ? 'Aceitar revanche' : 'Pedir revanche'}</button>`;
  }

  function rematchNote(s: FState) {
    const other = s.room?.players[1 - s.room.seat];
    if (!other) return '';
    if (!other.connected) return `<p class="q-hint">${esc(other.name)} saiu da sala.</p>`;
    return other.rematch ? `<p class="q-hint">${esc(other.name)} quer jogar de novo.</p>` : '';
  }

  function findCard(id: number, withPrompt = true): FCard | undefined {
    const s = client?.state;
    if (!s) return undefined;
    for (const p of stateWithFrame(s, displayFrame).players) {
      for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...(p.emblems ?? [])]) if (c.id === id) return c;
    }
    const onStack = s.stack.find(si => si.source?.id === id)?.source;
    if (onStack) return onStack;
    if (!withPrompt) return undefined;
    if (s.input.card?.id === id) return s.input.card;
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
    if (stackId !== undefined && client?.state) return (el.closest('#fStackGallery') ? client.state.stack : stateWithFrame(client.state, displayFrame).stack).find(item => item.id === Number(stackId))?.source;
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

  // ---------- Eventos ----------
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    if (ui === 'stack-close' || t.id === 'fStackGallery') { closeStackGallery(); return; }
    if (ui === 'stack-open') {
      const s = client?.state;
      if (!s?.stack.length || s.question || s.gameOver || s.sideboarding || disconnected) return;
      stopPresentation(); hideCardPreview(true); stackGalleryOpen = true; renderTable(false);
      $('#fStackGallery').querySelector<HTMLElement>('.stack-gallery-card.actionable, .stack-gallery-card')?.focus({ preventScroll: true });
      return;
    }
    if (ui === 'settings') { $('#fSettings').hidden = !$('#fSettings').hidden; root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', String(!$('#fSettings').hidden)); return; }
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
    if (ui === 'menu') { $('#fMenu').hidden = !$('#fMenu').hidden; return; }
    if (ui === 'log') { $('#fLogDrawer').hidden = !$('#fLogDrawer').hidden; return; }
    if (ui === 'fullscreen') { void toggleFullscreen(); return; }
    if (ui === 'exit') {
      if (client?.state?.gameOver || disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { stopPresentation(); hideCardPreview(true); client?.send({ type: 'concede' }); opts.onExit(); }
      return;
    }
    if (ui === 'rematch') { $('#fMenu').hidden = true; opts.onRematch(); return; }
    if (ui === 'zone-close' || t.id === 'fZone') { closeZone(); return; }
    const ctr = t.closest<HTMLElement>('[data-ctr]')?.dataset.ctr ?? null;
    if (ctr || openCounter) {
      openCounter = ctr && ctr !== openCounter ? ctr : null;
      render();
      if (ctr) return; // clicar no marcador só mostra o texto, não usa a carta
    }
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { groupIds = null; zoneOf = +gy.dataset.gy!; zoneKind = gy.dataset.zone === 'exile' ? 'exile' : 'gy'; zoneView(client.state); return; }

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
      if (act === 'pass-turn' && (!client.state?.input.priority || !client.state.input.ok.enabled || client.state.question || client.state.input.paying || client.state.input.targeting || client.state.activePlayer !== client.state.you || client.state.stack.length)) return;
      const gen = Number(control.dataset.gen);
      if (gen === clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
      clickedGen = gen;
      clickedAt = Date.now();
      stopPresentation();
      client.send({ type: act, gen });
      render();
      setTimeout(() => { if (clickedGen === gen) render(); }, CLICK_LOCK_MS + 50);
      return;
    }
    if (t.closest('.emblem')) return; // fica dentro do retrato, mas não é um clique no jogador
    const mana = t.closest<HTMLElement>('[data-mana]')?.dataset.mana;
    if (mana) { const control = t.closest<HTMLElement>('[data-mana]')!; if (renderedInputIsCurrent(control)) { stopPresentation(); client.send({ type: 'mana', color: mana, gen: Number(control.dataset.gen) }); } return; }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl) { if (renderedInputIsCurrent(pl) && client.state?.input.selectablePlayers?.includes(+pl.dataset.pid!)) { stopPresentation(); client.send({ type: 'player', id: +pl.dataset.pid!, gen: Number(pl.dataset.gen) }); } return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (!cd || !renderedInputIsCurrent(cd)) return;
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
    if (t.id === 'fVolume') audio.setVolume(Number(t.value) / 100);
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
      if (stackGalleryOpen) { e.preventDefault(); closeStackGallery(); return; }
      if (zoneOf !== null || groupIds) { closeZone(); return; }
      $('#fMenu').hidden = true; $('#fSettings').hidden = true; $('#fLogDrawer').hidden = true; root.querySelector('[aria-controls="fSettings"]')?.setAttribute('aria-expanded', 'false'); hideCardPreview(true);
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
      client = c; portraits = pics; lastTurn = 0; disconnected = false; qState = null; clickedGen = -1; zoneOf = null;
      lastDamage = new Map(); groupIds = null;
      stackGalleryOpen = false; $('#fStackGallery').hidden = true;
      handDrag.cancel(); stopPresentation(); timeline.reset(); silentNext = true; hideCardPreview(true);
      sideboardDraft = null; sideboardBusy = false; sideboardError = '';
      motion.reset();
      $('#fOverlay').hidden = true;
      $('#fQuestion').hidden = true;
      $('#fZone').hidden = true;
      syncModal();
    },
    render,
    notice,
    reconnecting(attempt) {
      disconnected = true;
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
      disconnected = true;
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
