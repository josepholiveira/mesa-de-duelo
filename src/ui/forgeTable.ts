import type { FCard, FOption, FPlayer, FQuestion, FState, ForgeClient } from '../forge/client';
import { cacheGet, fetchByNames } from '../scryfall';
import { esc, pip, richText } from './cardtext';
import { colorFromCost, faceHTML } from './face';
import { createMotion } from './motion';

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
    <section class="field me" aria-label="Seu campo">
      <div class="row creatures" id="fMeCreatures"></div>
      <div class="row lands" id="fMeLands"></div>
    </section>

    <div class="avatar-slot me" id="fMeAvatar"></div>
    <div class="piles me" id="fMePiles"></div>
    <div class="hand" id="fHand"></div>

    <div class="stack-panel" id="fStack" hidden></div>
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
  let bannerTimer = 0;
  const motion = createMotion(root);
  let lastLife = new Map<number, number>();
  let lastDamage = new Map<number, number>();
  let disconnected = false;
  /** Versão do prompt em que o jogador já clicou num botão; evita clique duplo até o Forge responder. */
  let clickedGen = -1;
  /** Seleção em andamento na pergunta aberta. */
  let qState: { id: number; picked: number[]; text: string } | null = null;

  // ---------- Imagens do Scryfall, buscadas por nome ----------
  const wanted = new Set<string>();
  let fetchTimer = 0;
  function image(name: string | undefined, size: 'small' | 'normal') {
    if (!name) return undefined;
    const sc = cacheGet(name);
    if (!sc) {
      wanted.add(name);
      clearTimeout(fetchTimer);
      fetchTimer = window.setTimeout(() => {
        const names = [...wanted];
        wanted.clear();
        fetchByNames(names).then(render).catch(() => {});
      }, 150);
      return undefined;
    }
    const u = sc.pt?.image_uris ?? sc.image_uris;
    return size === 'small' ? u?.small ?? u?.normal : u?.normal ?? u?.small;
  }

  /** Nome, tipo e texto impressos em português, quando o Scryfall tem a tradução. */
  const ptOf = (name: string | undefined) => (name ? cacheGet(name)?.pt : undefined);
  const label = (c: FCard) => ptOf(c.name)?.name || c.name || 'Carta';

  function face(c: FCard, size: 'small' | 'normal') {
    if (c.faceDown || !c.name) return '<div class="face"><div class="back" style="width:100%;height:100%"></div></div>';
    return faceHTML({
      name: label(c), manaCost: c.manaCost ?? '', typeLine: ptOf(c.name)?.type_line || c.typeLine || '', power: c.power, toughness: c.toughness,
      creature: !!c.creature, color: colorFromCost(c.manaCost ?? '', !!c.land), image: image(c.name, size),
    });
  }

  // ---------- Peças ----------
  /** Destaque azul: cartas que o Forge marca como selecionáveis no prompt atual ou utilizáveis agora. */
  function usable(s: FState, id: number) {
    return s.input.selectable.includes(id) || !!s.input.actionable?.includes(id);
  }

  function combatIndex(s: FState, id: number): { attack?: number; block?: number } {
    const a = s.combat.findIndex(x => x.attacker === id);
    if (a >= 0) return { attack: a + 1 };
    const b = s.combat.findIndex(x => x.blockers.includes(id));
    return b >= 0 ? { block: b + 1 } : {};
  }

  const COUNTER_LABEL: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Lealdade', SHIELD: 'Escudo', STUN: 'Atordoar' };
  const counterLabel = (k: string) => COUNTER_LABEL[k] ?? k.charAt(0) + k.slice(1).toLowerCase();

  /** Palavras-chave que viram marcador na carta do campo. */
  const KEYWORD_LABEL: Record<string, string> = {
    FLYING: 'Voar', REACH: 'Alcance', TRAMPLE: 'Atropelar', MENACE: 'Ameaçar', FIRST_STRIKE: 'Iniciativa',
    DOUBLE_STRIKE: 'Golpe Duplo', DEATHTOUCH: 'Toque Mortífero', LIFELINK: 'Vínculo com a Vida', VIGILANCE: 'Vigilância',
    HASTE: 'Ímpeto', DEFENDER: 'Defensor', HEXPROOF: 'Resistência a Magia', SHROUD: 'Manto', WARD: 'Proteção contra Alvos',
    INDESTRUCTIBLE: 'Indestrutível', PROTECTION: 'Proteção',
  };
  const keywordsOf = (c: FCard) => (c.keywords ?? []).filter(k => KEYWORD_LABEL[k]).map(k => KEYWORD_LABEL[k]);
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
      ? `<span class="counters">${shown.map(([k, v]) => `${esc(counterLabel(k))} ×${v}`).join(' · ')}</span>` : '';
    const kws = c.creature ? keywordsOf(c) : [];
    const kwHTML = kws.length ? `<span class="kws">${kws.map(k => `<span class="kw">${esc(k)}</span>`).join('')}</span>` : '';
    const badges = [c.copyOf ? `<span class="badge copy" title="${esc(c.copyOf)} copiando ${esc(label(c))}">Cópia</span>` : '',
      c.token ? '<span class="badge token">Ficha</span>' : ''].join('');
    const aria = [label(c), c.copyOf ? `cópia feita por ${c.copyOf}` : '', c.token ? 'ficha' : '',
      kws.join(', '), loyalty !== undefined ? `lealdade ${loyalty}` : '', attached.length ? `com ${attached.map(label).join(', ')}` : ''].filter(Boolean).join(', ');
    const atts = attached.map((a, i) =>
      `<div class="att${usable(s, a.id) ? ' actionable' : ''}" data-fid="${a.id}" role="button" tabindex="0" style="--i:${i + 1}" aria-label="${esc(label(a))}, presa a ${esc(label(c))}">${face(a, 'small')}</div>`).join('');
    const style = attached.length ? ` style="--atts:${attached.length}"` : '';
    if (attached.length) slot.push('has-att');
    return `<div class="${slot.join(' ')}"${style}>${atts}<div class="${inner.join(' ')}" data-fid="${c.id}" role="button" tabindex="0" aria-label="${esc(aria)}">${face(c, 'small')}${badges}${tag}${kwHTML}${pt}${counters}</div></div>`;
  }

  /** Cartas de uma fileira, sem as auras/equipamentos (que vão desenhados junto da carta a que estão presos). */
  function fieldRow(s: FState, cards: FCard[]) {
    const atts = attachmentsOf(s);
    const byId = battlefieldById(s);
    return cards.filter(c => c.attachedTo == null || !byId.has(c.attachedTo)).map(c => bfCard(s, c, atts.get(c.id))).join('');
  }

  function landRow(s: FState, p: FPlayer) {
    const atts = attachmentsOf(s);
    const groups = new Map<string, FCard[]>();
    for (const c of p.battlefield.filter(c => c.land && !c.creature)) {
      const k = atts.has(c.id) ? `#${c.id}` : `${c.name}|${c.tapped}|${usable(s, c.id)}`;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    return [...groups.values()].map(cs => `<div class="stack">${cs.map(c => bfCard(s, c, atts.get(c.id))).join('')}</div>`).join('');
  }

  function avatar(s: FState, p: FPlayer, idx: number) {
    const cls = ['avatar', idx === 0 ? 'me' : 'opp'];
    if (s.activePlayer === p.id && !s.gameOver) cls.push('active');
    if (p.life < (lastLife.get(p.id) ?? p.life)) cls.push('hit');
    const pool = Object.entries(p.pool).flatMap(([c, n]) => Array(n).fill(pip(c))).join('');
    const art = portraits[idx];
    const offline = s.room?.players.find(rp => rp.name === p.name)?.connected === false;
    return `<div class="${cls.join(' ')}" data-pid="${p.id}" role="button" tabindex="0" aria-label="${esc(p.name)}, ${p.life} de vida${offline ? ', desconectado' : ''}">
      <div class="portrait" ${art ? `style="background-image:url('${art}')"` : ''}></div>
      <div class="life">${p.life}</div>
      <div class="pname">${esc(p.name)}</div>
      ${pool ? `<div class="pool">${pool}</div>` : ''}
      ${offline ? '<div class="offline">desconectado</div>' : ''}
    </div>`;
  }

  function piles(p: FPlayer) {
    const top = p.graveyard[p.graveyard.length - 1];
    return `<div class="pile lib" title="Grimório"><div class="back"></div><span>${p.library}</span></div>
      <div class="pile gy" data-gy="${p.id}" role="button" tabindex="0" title="Cemitério" aria-label="Ver cemitério de ${esc(p.name)} (${p.graveyard.length})">${top ? `<div class="gy-top" data-peek="${top.id}">${face(top, 'small')}</div>` : '<div class="gy-empty"></div>'}<span>${p.graveyard.length}</span></div>`;
  }

  function zoneView(s: FState) {
    const el = $('#fZone');
    const p = s.players.find(pl => pl.id === zoneOf);
    if (!p) { el.hidden = true; zoneOf = null; return; }
    const cards = [...p.graveyard].reverse();
    el.innerHTML = `<div class="question zone-view" role="dialog" aria-modal="true" aria-label="Cemitério">
      <h2>Cemitério · ${esc(p.name)} (${cards.length})</h2>
      ${cards.length ? `<div class="q-opts cards">${cards.map(c => `<div class="q-face" data-peek="${c.id}">${face(c, 'normal')}</div>`).join('')}</div>` : '<p class="q-hint">Vazio.</p>'}
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
    const waiting = clickedGen === s.input.gen;
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
    $('#fOppPiles').innerHTML = piles(opp);
    $('#fMePiles').innerHTML = piles(me);
    $('#fOppLands').innerHTML = landRow(s, opp);
    $('#fMeLands').innerHTML = landRow(s, me);
    $('#fOppCreatures').innerHTML = fieldRow(s, opp.battlefield.filter(c => !c.land || c.creature));
    $('#fMeCreatures').innerHTML = fieldRow(s, me.battlefield.filter(c => !c.land || c.creature));

    const n = me.hand.length;
    $('#fHand').innerHTML = me.hand.map((c, i) => {
      const off = i - (n - 1) / 2;
      const sel = usable(s, c.id) ? 'playable' : '';
      return `<div class="hcard ${sel}" data-fid="${c.id}" role="button" tabindex="0" aria-label="${esc(label(c))}"
        style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${face(c, 'normal')}</div>`;
    }).join('');

    const stackEl = $('#fStack');
    stackEl.innerHTML = stackPanel(s);
    stackEl.hidden = !s.stack.length;

    const group = PHASE_GROUP[s.phase ?? ''] ?? '';
    $('#fPhases').innerHTML = `<div class="turn-no">Turno ${s.turn}</div>` + PHASES.map(([k, l]) =>
      `<div class="ph ${group === k ? 'on' : ''} ${s.activePlayer === s.you ? 'mine' : 'theirs'}"><span class="dot"></span>${l}</div>`).join('');

    // Carta que o prompt cita mas que não está à vista na mesa (topo do grimório na vidência/vigilância).
    const pc = s.input.card;
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

    motion.play();

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
      for (const c of [...p.hand, ...p.battlefield, ...p.graveyard, ...p.exile]) if (c.id === id) return c;
    }
    const onStack = s.stack.find(si => si.source?.id === id)?.source;
    if (onStack) return onStack;
    return withPrompt && s.input.card?.id === id ? s.input.card : undefined;
  }

  const s0 = () => client?.state;

  function showPreview(c: FCard | undefined) {
    const el = $('#fPreview');
    if (!c || c.faceDown || !c.name) { el.hidden = true; return; }
    const text = ptOf(c.name)?.text || c.text;
    const host = c.attachedTo != null ? findCard(c.attachedTo) : undefined;
    const enchantedPlayer = s0()?.players.find(p => p.id === c.attachedToPlayer);
    const atts = (s0()?.players ?? []).flatMap(p => p.battlefield).filter(a => a.attachedTo === c.id);
    const notes = [
      c.copyOf ? `<b>${esc(c.copyOf)}</b> copiando esta carta.` : '',
      c.token ? 'Ficha.' : '',
      c.creature && keywordsOf(c).length ? `<b>${esc(keywordsOf(c).join(', '))}</b>.` : '',
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
    if (ui === 'exit') {
      if (client?.state?.gameOver || disconnected || confirm(client?.state?.room ? 'Desistir e sair da sala?' : 'Desistir desta partida?')) { client?.send({ type: 'concede' }); opts.onExit(); }
      return;
    }
    if (ui === 'rematch') { $('#fMenu').hidden = true; opts.onRematch(); return; }
    if (ui === 'zone-close' || t.id === 'fZone') { zoneOf = null; $('#fZone').hidden = true; return; }
    if (!client) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy && client.state) { zoneOf = +gy.dataset.gy!; zoneView(client.state); return; }

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
      if (gen === clickedGen) return;
      clickedGen = gen;
      client.send({ type: act, gen });
      render();
      return;
    }
    const pl = t.closest<HTMLElement>('[data-pid]');
    if (pl) { client.send({ type: 'player', id: +pl.dataset.pid! }); return; }
    const cd = t.closest<HTMLElement>('[data-fid]');
    if (cd) client.send({ type: 'card', id: +cd.dataset.fid! });
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
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-fid],[data-pid],[data-gy]');
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
