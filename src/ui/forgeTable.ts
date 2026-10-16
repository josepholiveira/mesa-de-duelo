import type { FCard, FOption, FPlayer, FQuestion, FState, ForgeClient } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, manaHTML, pip, richText } from './cardtext';
import { colorFromCost, faceHTML } from './face';
import { createMotion } from './motion';
import { canFullscreen, toggleFullscreen } from './landscape';

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
      <span class="room-tag" id="fRoomTag" hidden></span>
    </div>
    <div class="menu" id="fMenu" hidden>
      <button class="btn" data-ui="rematch" id="fMenuRematch">Recomeçar partida</button>
      <button class="btn" data-ui="exit">Desistir e voltar ao início</button>
    </div>
    <aside class="log-drawer" id="fLogDrawer" hidden><h2>Registro</h2><ul id="fLog"></ul></aside>

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

    <div class="stack-panel" id="fStack" hidden></div>
    <svg class="target-arrows" id="fTargets" aria-hidden="true"></svg>
    <nav class="phase-rail" id="fPhases" aria-label="Fases do turno"></nav>
    <div class="action" id="fAction" aria-live="polite"></div>
    <div class="preview" id="fPreview" hidden></div>
    <div class="banner" id="fBanner" hidden></div>
    <div class="toasts" id="fToasts" aria-live="polite"></div>
    <div class="overlay" id="fQuestion" hidden></div>
    <div class="overlay" id="fOverlay" hidden></div>
    <div class="overlay" id="fZone" hidden></div>
  </div>`;

  const $ = (sel: string) => root.querySelector(sel) as HTMLElement;
  let client: ForgeClient | null = null;
  let portraits: [string | undefined, string | undefined] = [undefined, undefined];
  let lastTurn = 0;
  let zoneOf: number | null = null;
  let zoneKind: 'gy' | 'exile' = 'gy';
  let bannerTimer = 0;
  const motion = createMotion(root);
  let lastLife = new Map<number, number>();
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
  let qState: { id: number; picked: number[]; text: string } | null = null;

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
  const canUse = (s: FState, c: FCard) => usable(s, c.id) || (!s.question && !!s.castable?.includes(c.id));

  /** Cartas de fora da mão que dá para usar agora, com a etiqueta de onde vêm; aparecem na ponta da mão. */
  function outsideHand(s: FState) {
    if (s.question || !s.castable?.length) return [];
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
    s.stack.forEach((si, i) => {
      const from = q(`#fStack li:nth-child(${i + 1}) .stack-card`) ?? (si.source ? q(`.field [data-fid="${si.source.id}"]`) : undefined);
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

  window.addEventListener('resize', () => {
    const s = client?.state;
    if (s?.type === 'state' && !root.hidden) { drawBlockArrows(s); drawTargetArrows(s); }
  });

  const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
  const counterLabel = (k: string) => COUNTER_LABEL[k] ?? KEYWORD_LABEL[k] ?? k.charAt(0) + k.slice(1).toLowerCase().replace(/_/g, ' ');

  /** Palavras-chave que viram marcador na carta do campo. */
  const KEYWORD_LABEL: Record<string, string> = {
    FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
    DOUBLE_STRIKE: 'Golpe Duplo', DEATHTOUCH: 'Toque Mortífero', LIFELINK: 'Vínculo com a Vida', VIGILANCE: 'Vigilância',
    HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência a Magia', SHROUD: 'Manto', WARD: 'Proteção contra Alvos',
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
    return `<div class="${slot.join(' ')}"${style}>${atts}<div class="${inner.join(' ')}" data-fid="${c.id}" role="button" tabindex="0" aria-label="${esc(aria)}">${face(c, 'small')}${badges}${tag}${kwHTML}${pt}${counters}</div></div>`;
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
      cs.length > 1 ? `<span class="stack-n" aria-hidden="true">×${cs.length}</span>` : ''}</div>`).join('');
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
    if (p.life < (lastLife.get(p.id) ?? p.life)) cls.push('hit');
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
    if (!p) { el.hidden = true; zoneOf = null; return; }
    const title = zoneKind === 'exile' ? 'Exílio' : 'Cemitério';
    const cards = [...(zoneKind === 'exile' ? p.exile : p.graveyard)].reverse();
    // Carta que dá para usar agora (conjurar uma tramada, flashback...) fica clicável e com o brilho azul.
    const card = (c: FCard) => canUse(s, c)
      ? `<div class="q-face actionable" data-fid="${c.id}" role="button" tabindex="0" aria-label="Usar ${esc(label(c))}">${face(c, 'normal')}</div>`
      : `<div class="q-face" data-peek="${c.id}">${face(c, 'normal')}${c.plotted ? '<div class="zone-tag">Tramada</div>' : ''}</div>`;
    el.innerHTML = `<div class="question zone-view" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title} · ${esc(p.name)} (${cards.length})</h2>
      ${cards.length ? `<div class="q-opts cards">${cards.map(card).join('')}</div>` : '<p class="q-hint">Vazio.</p>'}
      <div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div>
    </div>`;
    el.hidden = false;
  }

  function stackPanel(s: FState) {
    if (!s.stack.length) return '';
    return `<h2>Pilha</h2><ol>${s.stack.map(si => `
      <li class="${si.controller === s.you ? 'mine' : 'theirs'}">
        ${si.source ? `<div class="stack-card" data-peek="${si.source.id}">${face(si.source, 'small')}</div>` : ''}
        <p>${richText(si.text)}</p>
      </li>`).join('')}</ol>`;
  }

  function buttons(s: FState) {
    if (s.gameOver || s.question) return '';
    const { ok, cancel } = s.input;
    const waiting = clickedGen === s.input.gen && Date.now() - clickedAt < CLICK_LOCK_MS;
    const b = (act: string, btn: { label: string; enabled: boolean }, kind: string) =>
      btn.label ? `<button class="arena-btn ${kind}" data-act="${act}" ${btn.enabled && !waiting ? '' : 'disabled'}>${esc(btn.label)}</button>` : '';
    const mine = s.activePlayer === s.you;
    if (!ok.enabled && !cancel.enabled) return `<button class="arena-btn waiting" disabled>${mine ? 'Aguarde' : 'Oponente'}</button>`;
    return b('cancel', cancel, 'secondary') + b('ok', ok, 'primary');
  }

  // ---------- Perguntas ----------
  const optLabel = (o: FOption | string) => (typeof o === 'string' ? o : o.label);

  function questionHTML(q: FQuestion) {
    if (!qState || qState.id !== q.id) qState = { id: q.id, picked: [], text: q.initial ?? '' };
    const opts = q.options ?? [];
    const head = `<h2>${esc(q.title)}</h2>${q.card ? `<div class="q-card">${face(q.card, 'normal')}</div>` : ''}`;
    if (q.kind === 'confirm') {
      return `${head}<div class="q-actions">${opts.map((o, i) =>
        `<button class="arena-btn ${i === 0 ? 'primary' : 'secondary'}" data-q-confirm="${i === 0}">${esc(optLabel(o))}</button>`).join('')}</div>`;
    }
    if (q.kind === 'reveal') {
      const anyCards = opts.some(o => typeof o !== 'string' && o.card);
      return `${head}<div class="q-opts ${anyCards ? 'cards' : ''}">${opts.map(o => typeof o !== 'string' && o.card
        ? `<div class="q-face" data-peek="${o.card.id}">${face(o.card, 'normal')}</div>`
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

  function answer(extra: { indices?: number[]; value?: boolean; text?: string }) {
    const q = client?.state?.question;
    if (!q || !client) return;
    client.send({ type: 'answer', id: q.id, ...extra });
    qState = null;
    $('#fQuestion').hidden = true;
  }

  // ---------- Desenho ----------
  function render() {
    const s = client?.state;
    if (!s || s.type !== 'state') return;
    const meIdx = Math.max(0, s.players.findIndex(p => p.id === s.you));
    const me = s.players[meIdx];
    const opp = s.players[1 - meIdx];
    if (!me || !opp) return;
    motion.capture();

    $('#fOppHand').innerHTML = Array.from({ length: opp.handCount }, (_, i) => {
      const off = i - (opp.handCount - 1) / 2;
      return `<div class="back" style="--rot:${-off * 3}deg;--dy:${-off * off * 1.5}px"></div>`;
    }).join('');
    $('#fOppAvatar').innerHTML = avatar(s, opp, 1);
    $('#fMeAvatar').innerHTML = avatar(s, me, 0);
    $('#fOppPiles').innerHTML = piles(s, opp);
    $('#fMePiles').innerHTML = piles(s, me);
    $('#fOppLands').innerHTML = backRow(s, opp);
    $('#fMeLands').innerHTML = backRow(s, me);
    $('#fOppCreatures').innerHTML = fieldRow(s, opp.battlefield.filter(c => !isBackRow(c)));
    $('#fMeCreatures').innerHTML = fieldRow(s, me.battlefield.filter(c => !isBackRow(c)));

    // Na ponta da mão, as cartas do cemitério e do exílio que dá para usar agora, cada uma com a etiqueta da zona.
    const extra = outsideHand(s);
    const fan = [...me.hand.map(c => ({ c, tag: '' })), ...extra];
    const n = fan.length;
    $('#fHand').innerHTML = fan.map(({ c, tag }, i) => {
      const off = i - (n - 1) / 2;
      const sel = tag || usable(s, c.id) ? 'playable' : '';
      // Selo do custo acima do canto esquerdo: no leque, a carta seguinte cobre o canto direito, onde fica o custo impresso.
      const cost = !c.faceDown && c.manaCost ? `<div class="hcost" aria-hidden="true">${manaHTML(c.manaCost)}</div>` : '';
      const where = tag ? `<div class="hzone">${esc(tag)}</div>` : '';
      return `<div class="hcard ${sel}${tag ? ' outside' : ''}" data-fid="${c.id}" role="button" tabindex="0" aria-label="${esc(label(c))}${tag ? ` (${esc(tag)})` : ''}"
        style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${face(c, 'normal')}${cost}${where}</div>`;
    }).join('');

    const stackEl = $('#fStack');
    stackEl.innerHTML = stackPanel(s);
    stackEl.hidden = !s.stack.length;

    const group = PHASE_GROUP[s.phase ?? ''] ?? '';
    // De quem é o turno: etiqueta no trilho de fases e brilho na metade da mesa do jogador ativo.
    const active = s.gameOver ? null : s.activePlayer === me.id ? 'mine' : s.activePlayer === opp.id ? 'theirs' : null;
    root.querySelector('.field.me')!.classList.toggle('turn', active === 'mine');
    root.querySelector('.field.opp')!.classList.toggle('turn', active === 'theirs');
    const owner = active ? `<div class="turn-owner ${active}">${active === 'mine' ? 'Seu turno' : `Turno de ${esc(opp.name)}`}</div>` : '';
    $('#fPhases').innerHTML = `<div class="turn-no">Turno ${s.turn}</div>${owner}` + PHASES.map(([k, l]) =>
      `<div class="ph ${group === k ? 'on' : ''} ${s.activePlayer === s.you ? 'mine' : 'theirs'}"><span class="dot"></span>${l}</div>`).join('');

    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    const pc = s.input.card ?? s.input.targeting?.card;
    const promptCard = pc && !pc.faceDown && pc.name && !findCard(pc.id, false)
      ? `<div class="prompt-card" data-peek="${pc.id}">${face(pc, 'normal')}</div>` : '';
    $('#fAction').innerHTML = `${promptCard}<div class="prompt">${richText(s.input.message).replace(/\n/g, '<br>')}</div><div class="btns">${buttons(s)}</div>`;
    $('#fLog').innerHTML = s.log.map(l => `<li>${esc(l)}</li>`).join('');

    const qEl = $('#fQuestion');
    if (s.question && !s.gameOver) {
      qEl.innerHTML = `<div class="question${qEl.hidden ? ' enter' : ''}" role="dialog" aria-modal="true">${questionHTML(s.question)}</div>`;
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
    $('#fMenuRematch').hidden = !!s.room;

    const ov = $('#fOverlay');
    if (s.gameOver && !disconnected) {
      const won = s.winner === me.name;
      const html = `<div class="result ${won ? 'win' : s.winner ? 'lose' : 'draw'}${ov.hidden ? '' : ' still'}">
        <h2>${won ? 'Vitória' : s.winner ? 'Derrota' : 'Empate'}</h2><p>Turno ${s.turn}${s.winner ? ` · ${esc(s.winner)} venceu` : ''}</p>
        ${rematchNote(s)}
        <div class="result-btns">${rematchButton(s)}<button class="arena-btn secondary" data-ui="exit">Início</button></div>
      </div>`;
      if (ov.hidden || ov.dataset.html !== html) { ov.innerHTML = html; ov.dataset.html = html; }
      ov.hidden = false;
    } else if (!disconnected) { ov.hidden = true; ov.dataset.html = ''; }

    if (zoneOf !== null) zoneView(s);

    drawBlockArrows(s);
    motion.play();
    // Depois das animações começarem: as cartas que acabaram de entrar já estão na posição final.
    drawTargetArrows(s);

    lastLife = new Map(s.players.map(p => [p.id, p.life]));
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
    for (const p of s.players) {
      for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile, ...(p.emblems ?? [])]) if (c.id === id) return c;
    }
    const onStack = s.stack.find(si => si.source?.id === id)?.source;
    if (onStack) return onStack;
    if (!withPrompt) return undefined;
    if (s.input.card?.id === id) return s.input.card;
    for (const o of s.question?.options ?? []) if (typeof o !== 'string' && o.card?.id === id) return o.card;
    return undefined;
  }

  const s0 = () => client?.state;

  function showPreview(c: FCard | undefined) {
    const el = $('#fPreview');
    if (!c || c.faceDown || !c.name) { el.hidden = true; return; }
    if (c.emblem) {
      const src = emblemSource(c);
      el.innerHTML = `<div class="preview-card">${face({ ...c, name: src, manaCost: '', typeLine: 'Emblema', emblem: false }, 'normal')}</div>
        <div class="preview-text"><p class="preview-note"><b>${esc(emblemLabel(c))}</b></p>${c.text ? `<p>${richText(c.text).replace(/\n/g, '<br>')}</p>` : ''}</div>`;
      el.hidden = false;
      return;
    }
    const text = ptOf(c.name)?.text || c.text;
    const host = c.attachedTo != null ? findCard(c.attachedTo) : undefined;
    const enchantedPlayer = s0()?.players.find(p => p.id === c.attachedToPlayer);
    const atts = (s0()?.players ?? []).flatMap(p => p.battlefield).filter(a => a.attachedTo === c.id);
    const notes = [
      c.copyOf ? `<b>${esc(c.copyOf)}</b> copiando esta carta.` : '',
      c.token ? 'Ficha.' : '',
      c.creature && keywordsOf(c).length ? `<b>${esc(keywordsOf(c).map(k => KEYWORD_LABEL[k]).join(', '))}</b>.` : '',
      c.creature && c.basePower !== undefined && (c.power !== c.basePower || c.toughness !== c.baseToughness)
        ? `Base ${c.basePower}/${c.baseToughness}, agora ${c.power}/${c.toughness}.` : '',
      host ? `Presa a <b>${esc(label(host))}</b>.` : enchantedPlayer ? `Encantando <b>${esc(enchantedPlayer.name)}</b>.` : '',
      atts.length ? `Com ${atts.map(a => `<b>${esc(label(a))}</b>`).join(', ')}.` : '',
    ].filter(Boolean).map(n => `<p class="preview-note">${n}</p>`).join('');
    el.innerHTML = `<div class="preview-card">${face(c, 'normal')}</div>
      ${text || notes ? `<div class="preview-text">${notes}${text ? `<p>${richText(text).replace(/\n/g, '<br>')}</p>` : ''}</div>` : ''}`;
    el.hidden = false;
  }

  function notice(text: string, error = false) {
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
    if (ui === 'menu') { $('#fMenu').hidden = !$('#fMenu').hidden; return; }
    if (ui === 'log') { $('#fLogDrawer').hidden = !$('#fLogDrawer').hidden; return; }
    if (ui === 'fullscreen') { void toggleFullscreen(); return; }
    if (ui === 'exit') {
      if (client?.state?.gameOver || disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { client?.send({ type: 'concede' }); opts.onExit(); }
      return;
    }
    if (ui === 'rematch') { $('#fMenu').hidden = true; opts.onRematch(); return; }
    if (ui === 'zone-close' || t.id === 'fZone') { zoneOf = null; $('#fZone').hidden = true; return; }
    const ctr = t.closest<HTMLElement>('[data-ctr]')?.dataset.ctr ?? null;
    if (ctr || openCounter) {
      openCounter = ctr && ctr !== openCounter ? ctr : null;
      render();
      if (ctr) return; // clicar no marcador só mostra o texto, não usa a carta
    }
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { zoneOf = +gy.dataset.gy!; zoneKind = gy.dataset.zone === 'exile' ? 'exile' : 'gy'; zoneView(client.state); return; }

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
    if (act === 'ok' || act === 'cancel') {
      const gen = client.state?.input.gen ?? -1;
      if (gen === clickedGen && Date.now() - clickedAt < CLICK_LOCK_MS) return;
      clickedGen = gen;
      clickedAt = Date.now();
      client.send({ type: act, gen });
      render();
      setTimeout(() => { if (clickedGen === gen) render(); }, CLICK_LOCK_MS + 50);
      return;
    }
    if (t.closest('.emblem')) return; // fica dentro do retrato, mas não é um clique no jogador
    const mana = t.closest<HTMLElement>('[data-mana]')?.dataset.mana;
    if (mana) { client.send({ type: 'mana', color: mana }); return; }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl) { client.send({ type: 'player', id: +pl.dataset.pid! }); return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (!cd) return;
    // Usar uma carta do cemitério ou do exílio fecha a janela, para a pergunta seguinte aparecer.
    if (cd.closest('#fZone')) { zoneOf = null; $('#fZone').hidden = true; }
    client.send({ type: 'card', id: +cd.dataset.fid! });
  });
  root.addEventListener('submit', e => {
    if (!(e.target as HTMLElement).matches('[data-q-text]')) return;
    e.preventDefault();
    answer({ text: (root.querySelector('#fQInput') as HTMLInputElement).value });
  });
  root.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'fQInput' && qState) qState.text = t.value;
  });
  root.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-fid],[data-peek]');
    if (el) showPreview(findCard(+(el.dataset.fid ?? el.dataset.peek!)));
  });
  root.addEventListener('pointerout', e => {
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!to?.closest?.('[data-fid],[data-peek]')) $('#fPreview').hidden = true;
  });
  root.addEventListener('contextmenu', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-fid],[data-peek]');
    if (!el) return;
    e.preventDefault();
    showPreview(findCard(+(el.dataset.fid ?? el.dataset.peek!)));
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && zoneOf !== null) { zoneOf = null; $('#fZone').hidden = true; return; }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-mana],[data-ctr],[data-fid],[data-pid],[data-gy]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });

  return {
    attach(c, pics) {
      client = c; portraits = pics; lastTurn = 0; disconnected = false; qState = null; clickedGen = -1; zoneOf = null;
      lastLife = new Map(); lastDamage = new Map();
      motion.reset();
      $('#fOverlay').hidden = true;
      $('#fQuestion').hidden = true;
      $('#fZone').hidden = true;
    },
    render,
    notice,
    reconnecting(attempt) {
      disconnected = true;
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = `<div class="result draw still"><h2>Reconectando…</h2>
        <p>A conexão com a ponte caiu. Voltando à partida${attempt > 1 ? ` (tentativa ${attempt})` : ''}.</p>
        <div class="result-btns"><button class="arena-btn secondary" data-ui="exit">Início</button></div></div>`;
    },
    disconnected(reason) {
      disconnected = true;
      const room = !!client?.state?.session;
      const ov = $('#fOverlay');
      ov.hidden = false;
      ov.dataset.html = '';
      ov.innerHTML = `<div class="result draw"><h2>Conexão perdida</h2>
        <p>${reason ? esc(reason) : room ? 'Não consegui voltar sozinho. A partida fica guardada na ponte por alguns minutos.' : 'A ponte do Forge parou de responder.'}</p>
        <div class="result-btns"><button class="arena-btn primary" data-ui="rematch">${room ? 'Reconectar' : 'Tentar de novo'}</button><button class="arena-btn secondary" data-ui="exit">Início</button></div></div>`;
    },
  };
}
