import type { Game } from '../engine/game';
import { canAttack, has, isCreature, isLand, pow, tou } from '../engine/rules';
import type { Card, CardDef, Player } from '../engine/types';
import { describeCard, esc, pip } from './cardtext';
import { faceHTML } from './face';
import { createMotion } from './motion';

const PHASES = [
  ['untap', 'Desvirar'], ['upkeep', 'Manutenção'], ['draw', 'Compra'], ['main1', 'Principal 1'],
  ['combat', 'Combate'], ['main2', 'Principal 2'], ['end', 'Final'],
] as const;

const ICON_SWORD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 3H21v6.5L10 20.5l-2 .5-.5-2L18.5 8V5.5H16L5 16.5 3.5 15z" fill="currentColor"/></svg>';
const ICON_SHIELD = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>';

export interface TableOptions {
  onExit(): void;
  onRematch(): void;
}

export interface TableView {
  attach(g: Game, portraits: [string | undefined, string | undefined]): void;
  render(): void;
}

export function createTableView(root: HTMLElement, opts: TableOptions): TableView {
  root.innerHTML = `
  <div class="arena">
    <div class="mat" aria-hidden="true"></div>
    <div class="topbar">
      <button class="icon-btn" data-ui="menu" aria-label="Menu">☰</button>
      <button class="icon-btn" data-ui="log">Registro</button>
    </div>
    <div class="menu" id="menu" hidden>
      <button class="btn" data-ui="rematch">Recomeçar partida</button>
      <button class="btn" data-ui="exit">Desistir e voltar ao início</button>
    </div>
    <aside class="log-drawer" id="logDrawer" hidden><h2>Registro</h2><ul id="log"></ul></aside>

    <div class="opp-hand" id="oppHand"></div>
    <div class="avatar-slot opp" id="oppAvatar"></div>
    <div class="piles opp" id="oppPiles"></div>

    <section class="field opp" aria-label="Campo do oponente">
      <div class="row lands" id="oppLands"></div>
      <div class="row creatures" id="oppCreatures"></div>
    </section>
    <div class="divider" aria-hidden="true"></div>
    <section class="field me" aria-label="Seu campo">
      <div class="row creatures" id="meCreatures"></div>
      <div class="row lands" id="meLands"></div>
    </section>

    <div class="avatar-slot me" id="meAvatar"></div>
    <div class="piles me" id="mePiles"></div>
    <div class="hand" id="hand"></div>

    <nav class="phase-rail" id="phases" aria-label="Fases do turno"></nav>
    <div class="action" id="action" aria-live="polite"></div>
    <div class="preview" id="preview" hidden></div>
    <div class="banner" id="banner" hidden></div>
    <div class="overlay" id="overlay" hidden></div>
    <div class="overlay" id="zone" hidden></div>
  </div>`;

  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector(sel) as T;
  let g: Game;
  let portraits: [string | undefined, string | undefined] = [undefined, undefined];
  let lastTurn = 0;
  let zoneOf: number | null = null;
  let bannerTimer = 0;
  const motion = createMotion(root);

  // ---------- Peças ----------
  function face(d: CardDef, size: 'small' | 'normal') {
    const src = size === 'small' ? d.imageSmall ?? d.image : d.image ?? d.imageSmall;
    const color = d.colors.length > 1 ? 'M' : d.colors[0] ?? (d.type === 'land' ? 'L' : 'C');
    return faceHTML({
      name: d.label, manaCost: d.manaCost, typeLine: d.labelType, power: d.power, toughness: d.toughness,
      creature: d.type === 'creature', color, image: src,
    });
  }

  function actionable(c: Card): boolean {
    if (g.pending) return false;
    if (c.owner === 0) {
      if (g.mode === 'attack') return canAttack(c) || c.attacking;
      if (g.mode === 'block') return isCreature(c) && !c.tapped;
      return g.humanCanAct() && !c.tapped && c.def.produces.length > 0 && (isLand(c) || !c.sick);
    }
    return g.mode === 'block' && c.attacking;
  }

  function bfCard(c: Card) {
    const cls = ['slot'];
    if (c.tapped) cls.push('tapped');
    if (c.attacking) cls.push('attacking');
    if (c.blocking !== null) cls.push('blocking');
    const inner = ['bfc'];
    if (g.fx.has(c.uid)) inner.push('hit');
    if (g.pending && g.validTarget(c)) inner.push('targetable');
    if (g.sel === c.uid || g.pending?.targets.includes(c)) inner.push('selected');
    if (actionable(c)) inner.push('actionable');

    const atk = g.attackers();
    let tag = '';
    if (c.attacking) tag = `<span class="tag atk">${ICON_SWORD}${atk.indexOf(c) + 1}</span>`;
    else if (c.blocking !== null) tag = `<span class="tag blk">${ICON_SHIELD}${atk.findIndex(a => a.uid === c.blocking) + 1}</span>`;
    else if (isCreature(c) && c.sick && !has(c, 'haste') && c.owner === g.active) tag = '<span class="tag zzz">zZ</span>';

    let pt = '';
    if (isCreature(c)) {
      const p = pow(c), t = tou(c) - c.damage;
      const pc = c.pumpP > 0 ? 'up' : '';
      const tc = c.damage > 0 ? 'down' : c.pumpT > 0 ? 'up' : '';
      pt = `<span class="pt"><b class="${pc}">${p}</b>/<b class="${tc}">${t}</b></span>`;
    }
    return `<div class="${cls.join(' ')}"><div class="${inner.join(' ')}" data-uid="${c.uid}" role="button" tabindex="0" aria-label="${esc(c.def.label)}">${face(c.def, 'small')}${tag}${pt}</div></div>`;
  }

  /** Terrenos iguais ficam empilhados, como no Arena. */
  function landRow(p: Player) {
    const groups = new Map<string, Card[]>();
    for (const c of p.bf.filter(isLand)) {
      const k = `${c.def.name}|${c.tapped}`;
      groups.set(k, [...(groups.get(k) ?? []), c]);
    }
    return [...groups.values()].map(cs => `<div class="stack">${cs.map(bfCard).join('')}</div>`).join('');
  }

  function avatar(p: Player) {
    const cls = ['avatar', p.idx === 0 ? 'me' : 'opp'];
    if (g.pending && g.validTarget({ player: p.idx })) cls.push('targetable');
    if (g.fx.has('p' + p.idx)) cls.push('hit');
    if (g.active === p.idx && !g.over) cls.push('active');
    const art = portraits[p.idx];
    const pool = (Object.entries(p.pool) as [string, number][]).flatMap(([c, n]) => Array(n).fill(pip(c))).join('');
    return `<div class="${cls.join(' ')}" data-player="${p.idx}" role="button" tabindex="0" aria-label="${esc(p.name)}, ${p.life} de vida">
      <div class="portrait" ${art ? `style="background-image:url('${art}')"` : ''}></div>
      <div class="life">${p.life}</div>
      <div class="pname">${esc(p.name)}</div>
      ${pool ? `<div class="pool">${pool}</div>` : ''}
    </div>`;
  }

  function piles(p: Player, idx: number) {
    const top = p.gy[p.gy.length - 1];
    return `<div class="pile lib" title="Grimório"><div class="back"></div><span>${p.library.length}</span></div>
      <div class="pile gy" data-gy="${idx}" role="button" tabindex="0" title="Cemitério" aria-label="Ver cemitério (${p.gy.length})">${top ? `<div class="gy-top" data-peek="${top.uid}">${face(top.def, 'small')}</div>` : '<div class="gy-empty"></div>'}<span>${p.gy.length}</span></div>`;
  }

  function zoneView() {
    const el = $('#zone');
    const p = zoneOf === null ? undefined : g.players[zoneOf];
    if (!p) { el.hidden = true; zoneOf = null; return; }
    const cards = [...p.gy].reverse();
    el.innerHTML = `<div class="question zone-view" role="dialog" aria-modal="true" aria-label="Cemitério">
      <h2>Cemitério · ${zoneOf === 0 ? 'Você' : 'Oponente'} (${cards.length})</h2>
      ${cards.length ? `<div class="q-opts cards">${cards.map(c => `<div class="q-face" data-peek="${c.uid}">${face(c.def, 'normal')}</div>`).join('')}</div>` : '<p class="q-hint">Vazio.</p>'}
      <div class="q-actions"><button class="arena-btn secondary" data-ui="zone-close">Fechar</button></div>
    </div>`;
    el.hidden = false;
  }

  function promptText(): string {
    if (g.over) return '';
    const pd = g.pending;
    if (pd) {
      const n = pd.card.def.label;
      if (pd.spec === 'fight') return pd.targets.length ? `${n}: escolha a criatura do oponente.` : `${n}: escolha uma criatura sua para lutar.`;
      const what = pd.spec === 'any' ? 'criatura ou jogador' : pd.spec === 'player' ? 'jogador' : 'criatura';
      return `${n}: escolha um alvo (${what}).`;
    }
    if (g.mode === 'attack') return 'Escolha os atacantes.';
    if (g.mode === 'block') return 'Toque em um atacante e depois na criatura que vai bloqueá-lo.';
    if (g.mode === 'discard') return `Descarte ${g.players[0].hand.length - 7} carta(s).`;
    if (g.step === 'tricks' && !g.busy) return 'Mágicas instantâneas antes do dano?';
    if (g.busy || g.active === 1) return 'Vez do oponente…';
    if (g.phase === 'main1') return g.players[0].landPlayed ? 'Sua fase principal.' : 'Jogue um terreno.';
    if (g.phase === 'main2') return 'Segunda fase principal.';
    return '';
  }

  function buttons(): string {
    const b = (act: string, label: string, kind: 'primary' | 'secondary' = 'secondary') =>
      `<button class="arena-btn ${kind}" data-act="${act}">${label}</button>`;
    if (g.over) return '';
    if (g.pending) return g.pending.from === 'spell' ? b('cancel', 'Cancelar') : '';
    if (g.mode === 'attack') {
      const n = g.players[0].bf.filter(c => c.attacking).length;
      const all = g.players[0].bf.filter(canAttack).length;
      return (n < all ? b('attackall', 'Todos atacam') : '') + b('attack', n ? `Atacar com ${n}` : 'Sem ataques', 'primary');
    }
    if (g.mode === 'block') {
      const n = g.players[0].bf.filter(c => c.blocking !== null).length;
      return b('blocks', n ? `Confirmar ${n} bloqueio${n > 1 ? 's' : ''}` : 'Sem bloqueios', 'primary');
    }
    if (g.mode === 'discard') return '';
    if (g.step === 'tricks' && !g.busy) return b('resolve', 'Resolver', 'primary');
    if (!g.busy && g.active === 0 && g.phase === 'main1') return b('endturn', 'Encerrar turno') + b('combat', 'Combate', 'primary');
    if (!g.busy && g.active === 0 && g.phase === 'main2') return b('endturn', 'Encerrar turno', 'primary');
    return `<button class="arena-btn waiting" disabled>Oponente</button>`;
  }

  function showPreview(c: Card | undefined) {
    const el = $('#preview');
    if (!c || (c.owner === 1 && g.players[1].hand.includes(c))) { el.hidden = true; return; }
    const lines = describeCard(c.def);
    el.innerHTML = `<div class="preview-card">${face(c.def, 'normal')}</div>
      ${lines.length ? `<div class="preview-text">${lines.map(l => `<p>${esc(l).replace(/\{([WUBRGC])\}/g, (_, s) => pip(s))}</p>`).join('')}</div>` : ''}`;
    el.hidden = false;
  }

  // ---------- Desenho ----------
  function render() {
    if (!g) return;
    const [me, opp] = g.players;
    motion.capture();

    $('#oppHand').innerHTML = opp.hand.map((_, i) => {
      const off = i - (opp.hand.length - 1) / 2;
      return `<div class="back" style="--rot:${-off * 3}deg;--dy:${-off * off * 1.5}px"></div>`;
    }).join('');
    $('#oppAvatar').innerHTML = avatar(opp);
    $('#meAvatar').innerHTML = avatar(me);
    $('#oppPiles').innerHTML = piles(opp, 1);
    $('#mePiles').innerHTML = piles(me, 0);
    $('#oppLands').innerHTML = landRow(opp);
    $('#meLands').innerHTML = landRow(me);
    $('#oppCreatures').innerHTML = opp.bf.filter(isCreature).map(bfCard).join('');
    $('#meCreatures').innerHTML = me.bf.filter(isCreature).map(bfCard).join('');

    const n = me.hand.length;
    $('#hand').innerHTML = me.hand.map((c, i) => {
      const off = i - (n - 1) / 2;
      const playable = !g.pending && (g.mode === 'discard' || (g.humanCanAct() && g.canCast(me, c)));
      return `<div class="hcard ${playable ? 'playable' : ''}" data-uid="${c.uid}" role="button" tabindex="0" aria-label="${esc(c.def.label)}"
        style="--rot:${off * 2.6}deg;--dy:${off * off * 2.2}px;z-index:${i + 1}">${face(c.def, 'normal')}</div>`;
    }).join('');

    $('#phases').innerHTML = `<div class="turn-no">Turno ${g.turn}</div>` + PHASES.map(([k, l]) =>
      `<div class="ph ${g.phase === k ? 'on' : ''} ${g.active === 0 ? 'mine' : 'theirs'}"><span class="dot"></span>${l}</div>`).join('');

    $('#action').innerHTML = `<div class="prompt">${esc(promptText())}${g.hint ? `<span class="hint">${esc(g.hint)}</span>` : ''}</div>
      <div class="btns">${buttons()}</div>`;

    $('#log').innerHTML = g.log.map(l => `<li class="${l.sep ? 'sep' : l.mine ? 'mine' : ''}">${esc(l.msg)}</li>`).join('');

    if (g.turn !== lastTurn && !g.over) {
      lastTurn = g.turn;
      const el = $('#banner');
      el.textContent = g.active === 0 ? 'Seu turno' : 'Turno do oponente';
      el.className = `banner ${g.active === 0 ? 'mine' : 'theirs'}`;
      el.hidden = false;
      clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => { el.hidden = true; }, 1300);
    }

    const ov = $('#overlay');
    if (g.over) {
      if (ov.hidden) ov.innerHTML = `<div class="result ${g.over.winner === 0 ? 'win' : g.over.winner === 1 ? 'lose' : 'draw'}">
        <h2>${esc(g.over.title)}</h2><p>${esc(g.over.text)} · Turno ${g.turn}</p>
        <div class="result-btns"><button class="arena-btn primary" data-ui="rematch">Jogar de novo</button><button class="arena-btn secondary" data-ui="exit">Início</button></div>
      </div>`;
      ov.hidden = false;
    } else ov.hidden = true;

    if (zoneOf !== null) zoneView();

    motion.play();
    g.fx = new Set();
  }

  // ---------- Eventos ----------
  root.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    const ui = t.closest<HTMLElement>('[data-ui]')?.dataset.ui;
    if (ui === 'menu') { $('#menu').hidden = !$('#menu').hidden; return; }
    if (ui === 'log') { $('#logDrawer').hidden = !$('#logDrawer').hidden; return; }
    if (ui === 'exit') { if (g.over || confirm('Desistir desta partida?')) opts.onExit(); return; }
    if (ui === 'rematch') { $('#menu').hidden = true; opts.onRematch(); return; }
    if (ui === 'zone-close' || t.id === 'zone') { zoneOf = null; $('#zone').hidden = true; return; }
    if (!g) return;
    const gy = t.closest<HTMLElement>('[data-gy]');
    if (gy) { zoneOf = +gy.dataset.gy!; zoneView(); return; }
    const act = t.closest<HTMLElement>('[data-act]')?.dataset.act;
    if (act === 'attackall') {
      g.players[0].bf.filter(canAttack).forEach(c => { c.attacking = true; });
      render();
      return;
    }
    if (act) { g.act(act as Parameters<Game['act']>[0]); return; }
    const pl = t.closest<HTMLElement>('[data-player]');
    if (pl && g.pending) { g.clickPlayer(+pl.dataset.player!); return; }
    const cd = t.closest<HTMLElement>('[data-uid]');
    if (cd) g.clickCard(+cd.dataset.uid!);
  });
  root.addEventListener('pointerover', e => {
    if ((e as PointerEvent).pointerType !== 'mouse') return;
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-uid],[data-peek]');
    if (!el || !g) return;
    showPreview(g.findCard(+(el.dataset.uid ?? el.dataset.peek!))?.c);
  });
  root.addEventListener('pointerout', e => {
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!to?.closest?.('[data-uid],[data-peek]')) $('#preview').hidden = true;
  });
  root.addEventListener('contextmenu', e => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-uid],[data-peek]');
    if (!el || !g) return;
    e.preventDefault();
    showPreview(g.findCard(+(el.dataset.uid ?? el.dataset.peek!))?.c);
  });
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape' && zoneOf !== null) { zoneOf = null; $('#zone').hidden = true; return; }
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-uid],[data-player],[data-gy]');
    if (el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); el.click(); }
  });

  return {
    attach(game, pics) { g = game; portraits = pics; lastTurn = 0; zoneOf = null; $('#zone').hidden = true; motion.reset(); },
    render,
  };
}
